/**
 * POST /api/stt: speech-to-text for browsers without a working built-in
 * recognizer (Brave blocks Chrome's speech service, Firefox has none). The
 * browser records one short turn and posts it here; we pass it to the speech
 * server named by STT_BASE_URL and return the text. STT_PROTOCOL says how it
 * talks: "openai" (default, any OpenAI-compatible Whisper server) or "speech"
 * (the copilot's speech server on the MacBook Pro: POST /stt?stack=&lang=,
 * STT_STACK picks the models, "multilingual" is Whisper large-v3-turbo).
 * The audio is not stored or logged. STT_API_KEY is optional, read here only and
 * never sent to the client; without STT_BASE_URL this answers 503 and the app
 * says voice isn't available. No hosted service is the default. With `lang=auto` (phones, no language
 * picked) Whisper detects the spoken language and we return it with the text.
 */
import { clientIp } from "../../lib/clientIp";
import { exportTrace, sessionFrom } from "../../lib/tracing";
import { createLimiter } from "./fair-use";

const MODEL = "whisper-1";
const sttConfig = () => ({
  key: process.env.STT_API_KEY || "",
  base: (process.env.STT_BASE_URL || "").replace(/\/$/, ""),
  model: process.env.STT_MODEL || MODEL,
  protocol: process.env.STT_PROTOCOL === "speech" ? ("speech" as const) : ("openai" as const),
  stack: process.env.STT_STACK || "multilingual",
});
/** About a minute of compressed speech; a voice turn is a few seconds. */
export const MAX_BYTES = 2_000_000;
const limiter = createLimiter({ windowMax: 120, windowMs: 3_600_000, burstMax: 12, burstMs: 60_000 });

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

/** "es-US" -> "es"; Whisper wants an ISO-639-1 code. Pure, for tests. */
export function whisperLang(tag: string | null): string | null {
  const two = (tag ?? "").trim().slice(0, 2).toLowerCase();
  return /^[a-z]{2}$/.test(two) ? two : null;
}

/** Whisper's detected language ("spanish", "es") as a two-letter code, or null. Pure, for tests. */
const WHISPER_NAMES: Record<string, string> = {
  english: "en", spanish: "es", chinese: "zh", mandarin: "zh", cantonese: "zh", russian: "ru", bengali: "bn",
  "haitian creole": "ht", haitian: "ht", french: "fr", korean: "ko", arabic: "ar", urdu: "ur", hindi: "hi",
  polish: "pl", portuguese: "pt", italian: "it", japanese: "ja", ukrainian: "uk", yiddish: "yi", vietnamese: "vi",
  nepali: "ne", marathi: "mr", punjabi: "pa", tagalog: "tl", greek: "el", persian: "fa", tibetan: "bo",
};
export function detectedLang(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  return /^[a-z]{2}$/.test(v) ? v : WHISPER_NAMES[v] ?? null;
}

/**
 * How sure Whisper was, 0-1: the mean per-token probability over its segments (exp of avg_logprob).
 * Null when it sent none. The agent reads a place back when this is low. Pure, for tests.
 */
export function whisperConfidence(segments: unknown): number | null {
  if (!Array.isArray(segments) || !segments.length) return null;
  const p = segments.map((s) => (s as { avg_logprob?: unknown }).avg_logprob);
  if (!p.every((x): x is number => typeof x === "number" && Number.isFinite(x))) return null;
  const mean = p.reduce((a, x) => a + Math.min(1, Math.exp(x)), 0) / p.length;
  return Math.round(mean * 100) / 100;
}

export async function transcribe(form: FormData, headers: Headers, fetchImpl: typeof fetch = fetch): Promise<Response> {
  const { key, base, model, protocol, stack } = sttConfig();
  if (!base) return json({ error: "stt_unavailable" }, 503);
  const audio = form.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0) return json({ error: "invalid_query", issues: ["audio: a recording is required"] }, 400);
  if (audio.size > MAX_BYTES) return json({ error: "invalid_query", issues: ["audio: too long"] }, 413);
  const limit = limiter.take(clientIp(headers));
  if (!limit.ok) return json({ error: "rate_limited" }, 429);
  const out = new FormData();
  out.set("file", audio, typeof (audio).name === "string" ? (audio).name : "speech.webm");
  out.set("model", model);
  const raw = typeof form.get("lang") === "string" ? (form.get("lang") as string) : null;
  const auto = raw === "auto";
  // verbose_json carries the language Whisper heard and its per-segment confidence.
  out.set("response_format", "verbose_json");
  const lang = auto ? null : whisperLang(raw);
  if (lang) out.set("language", lang);
  const started = Date.now();
  const span = (ok: boolean, text = "") => exportTrace({ name: "speech to text", kind: "CHAIN", start: started, end: Date.now(), error: !ok, attributes: { "llm.model_name": model, "output.value": text } }, sessionFrom(headers));
  try {
    const auth: Record<string, string> = key ? { authorization: `Bearer ${key}` } : {};
    // The speech server swaps its models in on the first call of a stack, which takes about 30 seconds.
    const r = protocol === "speech"
      ? await fetchImpl(`${base}/stt?stack=${encodeURIComponent(stack)}${lang ? `&lang=${lang}` : ""}`, { method: "POST", headers: { ...auth, "content-type": audio.type || "audio/wav" }, body: audio, signal: AbortSignal.timeout(60_000) })
      : await fetchImpl(`${base}/audio/transcriptions`, { method: "POST", headers: auth, body: out, signal: AbortSignal.timeout(20_000) });
    if (!r.ok) { span(false); return json({ error: "stt_failed" }, 502); }
    const d = (await r.json()) as { text?: string; language?: string; segments?: unknown; confidence?: unknown };
    const heard = auto ? detectedLang(d.language) : null;
    const confidence = typeof d.confidence === "number" && Number.isFinite(d.confidence) ? Math.round(d.confidence * 100) / 100 : whisperConfidence(d.segments);
    span(true, (d.text ?? "").trim());
    return json({ text: (d.text ?? "").trim(), ...(heard ? { lang: heard } : {}), ...(confidence !== null ? { confidence } : {}) });
  } catch {
    span(false);
    return json({ error: "stt_failed" }, 502);
  }
}
