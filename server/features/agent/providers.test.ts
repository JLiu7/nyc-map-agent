import { afterEach, describe, expect, it, vi } from "vitest";
import { pickProfile, routeFor, smartProviders } from "./providers";
import { byHealth, clearHealth, probe, recordHealth } from "./health";
import { fallbackFetch } from "./model-fallback";

const ENV = { SMART_DEEPSEEK_KEY: "octo_tmp_aaa", SMART_QWEN_KEY: "octo_tmp_bbb", SMART_OPENROUTER_KEY: "sk-plain", OCTO_BASE_URL: "https://octo.test/api" };

describe("smart providers", () => {
  it("lists only the providers with a key, in the chain's order", () => {
    expect(smartProviders(ENV).map((p) => p.id)).toEqual(["deepseek", "qwen", "openrouter"]);
  });

  it("lets each model be overridden", () => {
    expect(smartProviders({ ...ENV, SMART_QWEN_MODEL: "qwen3.8-flash" })[1].model).toBe("qwen3.8-flash");
  });

  it("sends a working key through Octo's relay and names the provider in x-octo-target", () => {
    const [deepseek] = smartProviders(ENV);
    expect(routeFor(deepseek, "/chat/completions", ENV)).toEqual({
      url: "https://octo.test/api/vault/proxy",
      headers: { authorization: "Bearer octo_tmp_aaa", "x-octo-target": "https://api.inferhub.dev/v1/chat/completions" },
    });
  });

  it("sends a plain key straight to the provider", () => {
    const openrouter = smartProviders(ENV)[2];
    expect(routeFor(openrouter, "/chat/completions", ENV).url).toBe("https://openrouter.ai/api/v1/chat/completions");
  });
});

describe("profile", () => {
  it("defaults to smart when a smart provider is set, and to dev when none is", () => {
    expect(pickProfile(undefined, ENV)).toBe("smart");
    expect(pickProfile(undefined, {})).toBe("dev");
  });

  it("follows the request, and AGENT_PROFILE when the request names none", () => {
    expect(pickProfile("dev", ENV)).toBe("dev");
    expect(pickProfile(undefined, { ...ENV, AGENT_PROFILE: "dev" })).toBe("dev");
  });

  it("falls back to dev when smart is asked for but nothing is set", () => {
    expect(pickProfile("smart", {})).toBe("dev");
  });
});

describe("health", () => {
  afterEach(clearHealth);

  it("puts failing providers last and keeps the rest in order", () => {
    recordHealth("deepseek", { ok: false, ms: null, checkedAt: 1, error: "HTTP 500" });
    recordHealth("qwen", { ok: true, ms: 900, checkedAt: 1, error: null });
    expect(byHealth(smartProviders(ENV)).map((p) => p.id)).toEqual(["qwen", "openrouter", "deepseek"]);
  });

  it("calls a provider healthy only when the tool call arrives", async () => {
    const [p] = smartProviders(ENV);
    const sse = (s: string) => vi.fn(() => Promise.resolve(new Response(s, { status: 200 })));
    const tool = 'data: {"choices":[{"delta":{"tool_calls":[{"function":{"name":"transit_plan","arguments":"{}"}}]}}]}\n\ndata: [DONE]\n';
    expect((await probe(p, sse(tool) as unknown as typeof fetch)).ok).toBe(true);
    const words = 'data: {"choices":[{"delta":{"content":"Take the Q"}}]}\n\ndata: [DONE]\n';
    expect(await probe(p, sse(words) as unknown as typeof fetch)).toMatchObject({ ok: false, error: "no tool call" });
    const down = vi.fn(() => Promise.resolve(new Response("", { status: 503 })));
    expect(await probe(p, down as unknown as typeof fetch)).toMatchObject({ ok: false, error: "HTTP 503" });
  });
});

describe("a chain of providers", () => {
  it("moves to the next provider when one refuses its key, with that provider's own URL and key", async () => {
    const [deepseek, qwen] = smartProviders(ENV);
    const seen: Array<{ url: string; auth: string | null; target: string | null; model: string }> = [];
    const base = vi.fn((url: string, init: RequestInit) => {
      const h = new Headers(init.headers);
      seen.push({ url, auth: h.get("authorization"), target: h.get("x-octo-target"), model: (JSON.parse(init.body as string) as { model: string }).model });
      return Promise.resolve(seen.length === 1 ? new Response('{"error":"bad key"}', { status: 401 }) : new Response("data: {}\n\n", { status: 200 }));
    });
    const steps = [deepseek, qwen].map((p) => ({ name: p.id, model: p.model, route: (path: string) => routeFor(p, path, ENV) }));
    const res = await fallbackFetch(steps, base as unknown as typeof fetch, vi.fn())("http://smart.invalid/v1/chat/completions", { method: "POST", headers: { authorization: "Bearer per-provider" }, body: JSON.stringify({ model: "x", messages: [] }) });
    expect(res.status).toBe(200);
    expect(seen).toEqual([
      { url: "https://octo.test/api/vault/proxy", auth: "Bearer octo_tmp_aaa", target: "https://api.inferhub.dev/v1/chat/completions", model: "cb/deepseek-v4.1-flash" },
      { url: "https://octo.test/api/vault/proxy", auth: "Bearer octo_tmp_bbb", target: "https://yolo-auto.com/v1/chat/completions", model: "yolo" },
    ]);
  });
});
