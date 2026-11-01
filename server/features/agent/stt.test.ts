import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_BYTES, detectedLang, transcribe, whisperConfidence, whisperLang } from "./stt";

const form = (bytes: number, lang?: string) => {
  const f = new FormData();
  f.set("audio", new Blob([new Uint8Array(bytes)], { type: "audio/webm" }), "turn.webm");
  if (lang) f.set("lang", lang);
  return f;
};

describe("server speech-to-text", () => {
  afterEach(() => { vi.unstubAllEnvs(); });

  it("is unavailable without a server address, so the app can say voice is off", async () => {
    vi.stubEnv("STT_BASE_URL", ""); vi.stubEnv("STT_API_KEY", "");
    expect((await transcribe(form(10), new Headers())).status).toBe(503);
  });

  it("rejects empty and over-long recordings", async () => {
    vi.stubEnv("STT_BASE_URL", "http://stt.test/v1");
    expect((await transcribe(new FormData(), new Headers())).status).toBe(400);
    expect((await transcribe(form(MAX_BYTES + 1), new Headers())).status).toBe(413);
  });

  it("sends the clip to Whisper with the language and returns the text", async () => {
    vi.stubEnv("STT_BASE_URL", "http://stt.test/v1");
    let sent: FormData | null = null;
    const fake = ((_url: string, init: RequestInit) => { sent = init.body as FormData; return Promise.resolve(Response.json({ text: " Where is the nearest restroom? " })); }) as unknown as typeof fetch;
    const r = await transcribe(form(100, "es-US"), new Headers({ "cf-connecting-ip": "203.0.113.7" }), fake);
    expect(await r.json()).toEqual({ text: "Where is the nearest restroom?" });
    expect(sent!.get("language")).toBe("es");
    expect(sent!.get("model")).toBe("whisper-1");
  });

  it("talks to the copilot speech server on the Pro: raw clip, stack and language in the address, no key needed", async () => {
    vi.stubEnv("STT_BASE_URL", "http://pro.test:18799"); vi.stubEnv("STT_PROTOCOL", "speech");
    let seen: { url: string; init: RequestInit } | null = null;
    const fake = ((url: string, init: RequestInit) => { seen = { url, init }; return Promise.resolve(Response.json({ text: "¿Dónde está el baño?", language: "es", confidence: 0.912 })); }) as unknown as typeof fetch;
    const r = await transcribe(form(100, "auto"), new Headers({ "cf-connecting-ip": "203.0.113.20" }), fake);
    expect(await r.json()).toEqual({ text: "¿Dónde está el baño?", lang: "es", confidence: 0.91 });
    expect(seen!.url).toBe("http://pro.test:18799/stt?stack=multilingual");
    expect(seen!.init.body).toBeInstanceOf(Blob);
    expect((seen!.init.headers as Record<string, string>).authorization).toBeUndefined();
    const picked = await transcribe(form(100, "es-US"), new Headers({ "cf-connecting-ip": "203.0.113.21" }), fake);
    expect(picked.status).toBe(200);
    expect(seen!.url).toBe("http://pro.test:18799/stt?stack=multilingual&lang=es");
  });

  it("with lang=auto lets Whisper detect the language and returns it", async () => {
    vi.stubEnv("STT_BASE_URL", "http://stt.test/v1");
    let sent: FormData | null = null;
    const fake = ((_url: string, init: RequestInit) => { sent = init.body as FormData; return Promise.resolve(Response.json({ text: "¿Dónde está el baño?", language: "Spanish" })); }) as unknown as typeof fetch;
    const r = await transcribe(form(100, "auto"), new Headers({ "cf-connecting-ip": "203.0.113.8" }), fake);
    expect(await r.json()).toEqual({ text: "¿Dónde está el baño?", lang: "es" });
    expect(sent!.get("language")).toBeNull();
    expect(sent!.get("response_format")).toBe("verbose_json");
  });

  it("returns how sure Whisper was, so the agent can read a place back", async () => {
    vi.stubEnv("STT_BASE_URL", "http://stt.test/v1");
    let sent: FormData | null = null;
    const segments = [{ avg_logprob: Math.log(0.5) }, { avg_logprob: Math.log(0.7) }];
    const fake = ((_url: string, init: RequestInit) => { sent = init.body as FormData; return Promise.resolve(Response.json({ text: "how do I get to Bedford", segments })); }) as unknown as typeof fetch;
    const r = await transcribe(form(100, "en-US"), new Headers({ "cf-connecting-ip": "203.0.113.9" }), fake);
    expect(await r.json()).toEqual({ text: "how do I get to Bedford", confidence: 0.6 });
    expect(sent!.get("response_format")).toBe("verbose_json");
  });

  it("reads confidence as 0-1 from Whisper's segments, or none", () => {
    expect(whisperConfidence([{ avg_logprob: 0 }])).toBe(1);
    expect(whisperConfidence([{ avg_logprob: -10 }])).toBe(0);
    expect(whisperConfidence([])).toBeNull();
    expect(whisperConfidence(undefined)).toBeNull();
    expect(whisperConfidence([{ avg_logprob: "x" }])).toBeNull();
  });

  it("reads Whisper's language as a name or a code", () => {
    expect(detectedLang("bengali")).toBe("bn");
    expect(detectedLang("Haitian Creole")).toBe("ht");
    expect(detectedLang("nepali")).toBe("ne");
    expect(detectedLang("ko")).toBe("ko");
    expect(detectedLang("klingon")).toBeNull();
    expect(detectedLang(undefined)).toBeNull();
  });

  it("maps a browser language to Whisper's two-letter code", () => {
    expect(whisperLang("zh-CN")).toBe("zh");
    expect(whisperLang("")).toBeNull();
  });
});
