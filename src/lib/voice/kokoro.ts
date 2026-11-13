/**
 * The answer read aloud by Kokoro through POST /api/tts (#37), instead of the browser's own voice.
 * The server streams 16-bit mono PCM; each piece is queued on a Web Audio clock as it arrives, so
 * speech starts at the first sound. Before any sound has played, a failure calls `onFail` and the
 * caller speaks with the browser voice instead; a server that failed is not asked again for a minute.
 * A `keep` line (the trip preview's steps, #132) is marked for the offline worker (public/sw.js), which
 * saves its sound and plays it back from the phone when the same line is asked for again.
 */

/** The app's languages Kokoro has a voice for (the server's TTS_LANGS). */
const LANGS = new Set(["en", "es", "fr", "zh"]);
const OTHER_SCRIPT = /[ऀ-ॿঀ-৿؀-ۿ가-힯Ѐ-ӿ]/;
const RETRY_AFTER_MS = 60_000;
let downUntil = 0;

/** The Kokoro language to say `text` in, or null when the browser voice should (another script, or a language Kokoro lacks). Pure. */
export function kokoroLang(text: string, lang?: string | null): string | null {
  if (OTHER_SCRIPT.test(text)) return null;
  if (/[一-鿿]/.test(text)) return "zh";
  const base = (lang || (typeof navigator === "undefined" ? "en" : navigator.language) || "en").slice(0, 2).toLowerCase();
  return LANGS.has(base) ? base : null;
}

export const kokoroUp = (now = Date.now()): boolean => now >= downUntil && typeof AudioContext !== "undefined";

/** 16-bit little-endian mono PCM → floats in [-1, 1]. An odd trailing byte is ignored. Pure. */
export function pcm16ToFloat(b: Uint8Array): Float32Array {
  const n = b.length >> 1;
  const out = new Float32Array(n);
  const dv = new DataView(b.buffer, b.byteOffset, n * 2);
  for (let i = 0; i < n; i++) out[i] = dv.getInt16(i * 2, true) / 32768;
  return out;
}

/** Speaks `text`; returns cancel. `onEnd` fires once (after the last sound, on cancel, or on a failure after sound began). `onFail` fires instead if nothing played. */
export function speakKokoro(text: string, lang: string, onEnd: () => void, onFail: () => void, keep = false): () => void {
  const ctrl = new AbortController();
  const sources: AudioBufferSourceNode[] = [];
  let ctx: AudioContext | null = null;
  let done = false;
  let heard = false;
  const close = () => { try { void ctx?.close(); } catch { /* already closed */ } };
  const finish = () => {
    if (done) return;
    done = true;
    ctrl.abort();
    close();
    onEnd();
  };
  const fail = () => {
    if (done) return;
    if (heard) return finish();
    done = true;
    downUntil = Date.now() + RETRY_AFTER_MS;
    ctrl.abort();
    close();
    onFail();
  };
  void (async () => {
    try {
      const base = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");
      const res = await fetch(`${base}/api/tts`, { method: "POST", headers: { "content-type": "application/json", ...(keep ? { "x-keep": "1" } : {}) }, body: JSON.stringify({ text, lang }), signal: ctrl.signal });
      // A 415 or 429 says this text can't be read now, not that the server is down: the browser voice takes it.
      if (!res.ok || !res.body) {
        if (res.status === 415 || res.status === 429) { done = true; onFail(); return; }
        return fail();
      }
      const rate = Number(res.headers.get("x-sample-rate")) || 24000;
      ctx = new AudioContext();
      await ctx.resume().catch(() => undefined);
      const reader = res.body.getReader();
      let next = 0;
      let carry: Uint8Array = new Uint8Array(0);
      for (;;) {
        const { done: end, value } = await reader.read();
        if (done) return;
        if (value) {
          const joined = new Uint8Array(carry.length + value.length);
          joined.set(carry);
          joined.set(value, carry.length);
          const even = joined.length - (joined.length % 2);
          carry = joined.slice(even);
          const f = pcm16ToFloat(joined.subarray(0, even));
          if (f.length && ctx) {
            const buf = ctx.createBuffer(1, f.length, rate);
            buf.getChannelData(0).set(f);
            const src = ctx.createBufferSource();
            src.buffer = buf;
            src.connect(ctx.destination);
            const at = Math.max(next, ctx.currentTime + 0.05);
            src.start(at);
            next = at + buf.duration;
            sources.push(src);
            heard = true;
          }
        }
        if (end) break;
      }
      const last = sources.at(-1);
      if (!last) return fail();
      last.onended = finish;
    } catch {
      fail();
    }
  })();
  return () => {
    for (const s of sources) { try { s.stop(); } catch { /* not started */ } }
    finish();
  };
}
