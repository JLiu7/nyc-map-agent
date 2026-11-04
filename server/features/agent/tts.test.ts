import { describe, expect, it, vi } from "vitest";
import { speak, ttsConfig, ttsLang, warmVoice } from "./tts";

const ENV = { STT_PROTOCOL: "speech", STT_BASE_URL: "http://voice.test:18799", STT_STACK: "multilingual" } as unknown as NodeJS.ProcessEnv;
const post = (body: unknown) => new Request("http://app/api/tts", { method: "POST", body: JSON.stringify(body), headers: { "x-forwarded-for": "9.9.9.9" } });

describe("POST /api/tts", () => {
  it("uses the speech server that speech-to-text already names", () => {
    expect(ttsConfig(ENV)).toEqual({ base: "http://voice.test:18799", stack: "multilingual" });
    expect(ttsConfig({} as NodeJS.ProcessEnv).base).toBe("");
  });

  it("maps language tags to the four Kokoro languages", () => {
    expect([ttsLang("es-US"), ttsLang("fr"), ttsLang("ru"), ttsLang(undefined)]).toEqual(["es", "fr", null, "en"]);
  });

  it("streams the voice server's audio through with its sample rate", async () => {
    const f = vi.fn(() => Promise.resolve(new Response(new Uint8Array([1, 2, 3, 4]), { headers: { "x-sample-rate": "24000" } })));
    const res = await speak(post({ text: "Take the 4 train.", lang: "en" }), f as unknown as typeof fetch, ENV);
    expect(res.status).toBe(200);
    expect(res.headers.get("x-sample-rate")).toBe("24000");
    expect(res.headers.get("content-type")).toBe("audio/L16");
    expect(f).toHaveBeenCalledWith("http://voice.test:18799/tts", expect.objectContaining({ body: JSON.stringify({ text: "Take the 4 train.", stack: "multilingual", lang: "en" }) }));
  });

  it("answers 503 with no server, 400 for no text, 415 for Russian, 502 when the server fails", async () => {
    expect((await speak(post({ text: "hi" }), fetch, {} as NodeJS.ProcessEnv)).status).toBe(503);
    expect((await speak(post({ text: "  " }), fetch, ENV)).status).toBe(400);
    expect((await speak(post({ text: "Привет", lang: "ru" }), fetch, ENV)).status).toBe(415);
    const down = vi.fn(() => Promise.resolve(new Response("", { status: 500 })));
    expect((await speak(post({ text: "hi", lang: "en" }), down as unknown as typeof fetch, ENV)).status).toBe(502);
  });
});

describe("keeping the voice warm", () => {
  it("asks the speech server to load our stack, and says whether it answered", async () => {
    const ok = vi.fn(() => Promise.resolve(new Response("{}", { status: 200 })));
    expect(await warmVoice(ok as unknown as typeof fetch, ENV)).toBe(true);
    expect(ok).toHaveBeenCalledWith("http://voice.test:18799/load?stack=multilingual", expect.objectContaining({ method: "POST" }));
    const bad = vi.fn(() => Promise.resolve(new Response("", { status: 500 })));
    expect(await warmVoice(bad as unknown as typeof fetch, ENV)).toBe(false);
    const down = vi.fn(() => Promise.reject(new Error("refused")));
    expect(await warmVoice(down as unknown as typeof fetch, ENV)).toBe(false);
  });

  it("does nothing with no speech server set", async () => {
    const f = vi.fn();
    expect(await warmVoice(f as unknown as typeof fetch, {} as NodeJS.ProcessEnv)).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });
});
