/**
 * Voice for browsers whose built-in recognizer is missing or blocked (Brave
 * turns Chrome's speech service off, Firefox has none): record one turn with
 * the microphone, end it after a short silence, and transcribe it on our
 * server (/api/stt). Nothing is kept: the clip is sent once and dropped.
 */
import { SESSION_ID } from "../sessionId";

const API_BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");

/** Loudness above which a frame counts as speech (RMS of -1..1 samples). Pure, for tests. */
export const SPEECH_RMS = 0.02;
/** How far above the room's background level a frame must be to count as speech. */
export const SPEECH_OVER_FLOOR = 2.5;
/** Loudness a frame needs to count as speech, given the tracked background level. Pure, for tests. */
export const speechLevel = (floor: number) => Math.max(SPEECH_RMS, floor * SPEECH_OVER_FLOOR);
/**
 * Next background-level estimate. It starts at the first frame, follows quiet
 * frames closely, and creeps up slowly during loud ones, so steady noise (a
 * platform, a train passing) is absorbed instead of counting as speech forever.
 * Pure, for tests.
 */
export function nextFloor(floor: number | null, level: number, speech: boolean): number {
  if (floor === null) return level;
  return speech ? floor + (level - floor) * 0.01 : floor * 0.9 + level * 0.1;
}
export function rms(samples: ArrayLike<number>): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) sum += samples[i] * samples[i];
  return samples.length ? Math.sqrt(sum / samples.length) : 0;
}

/**
 * When a recording should stop: after `endMs` of quiet once someone has spoken,
 * after `waitMs` if nobody spoke, or at `maxMs`. Pure, for tests.
 */
export function shouldStop(o: { now: number; started: number; lastSpeech: number | null; endMs: number; waitMs: number; maxMs: number }): "silence" | "no-speech" | "max" | null {
  if (o.now - o.started >= o.maxMs) return "max";
  if (o.lastSpeech === null) return o.now - o.started >= o.waitMs ? "no-speech" : null;
  return o.now - o.lastSpeech >= o.endMs ? "silence" : null;
}

/**
 * A phone (touch screen, small side under 600 px). Phones send voice to the
 * server: older iPhone recognizers are weak and only hear one language.
 */
export function isPhone(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(pointer: coarse)").matches && Math.min(window.screen?.width ?? 9999, window.screen?.height ?? 9999) < 600;
}

export function serverSttAvailable(): boolean {
  return typeof window !== "undefined" && typeof MediaRecorder !== "undefined" && typeof navigator.mediaDevices?.getUserMedia === "function";
}

/** Brave hides Chrome's speech service; its recognizer only ever fails with "network". */
export function isBrave(): boolean {
  return typeof navigator !== "undefined" && "brave" in navigator;
}

type StopReason = "silence" | "no-speech" | "max" | "stopped";
export interface Recording { stop: () => void; done: Promise<{ blob: Blob | null; reason: StopReason }> }

/** Start recording one voice turn. */
export async function recordTurn(endMs: number, waitMs = 6000, maxMs = 20_000): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const type = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((t) => MediaRecorder.isTypeSupported(t));
  const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const ctx = new AudioContext();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  ctx.createMediaStreamSource(stream).connect(analyser);
  const buf = new Float32Array(analyser.fftSize);
  const started = performance.now();
  let lastSpeech: number | null = null;
  let floor: number | null = null;
  let reason: StopReason = "stopped" as StopReason;
  let timer = 0;
  const finish = (why: StopReason) => {
    if (rec.state === "inactive") return;
    reason = why;
    window.clearInterval(timer);
    rec.stop();
  };
  const done = new Promise<{ blob: Blob | null; reason: StopReason }>((resolve) => {
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      void ctx.close();
      const heard = lastSpeech !== null && chunks.length > 0;
      resolve({ blob: heard ? new Blob(chunks, { type: rec.mimeType || "audio/webm" }) : null, reason });
    };
  });
  timer = window.setInterval(() => {
    analyser.getFloatTimeDomainData(buf);
    const now = performance.now();
    const level = rms(buf);
    const speech = floor !== null && level > speechLevel(floor);
    if (speech) lastSpeech = now;
    floor = nextFloor(floor, level, speech);
    const why = shouldStop({ now, started, lastSpeech, endMs, waitMs, maxMs });
    if (why) finish(why);
  }, 100);
  rec.start(250);
  return { stop: () => finish("stopped"), done };
}

export type SttOutcome = { text: string; lang?: string } | { error: "unavailable" | "failed" | "busy" };

/** Send one recording to /api/stt. `lang` null: the server detects the language and returns it. */
export async function transcribeTurn(blob: Blob, lang: string | null): Promise<SttOutcome> {
  const form = new FormData();
  form.set("audio", blob, blob.type.includes("mp4") ? "turn.m4a" : "turn.webm");
  form.set("lang", lang ?? "auto");
  try {
    const r = await fetch(`${API_BASE}/api/stt`, { method: "POST", headers: { "x-session-id": SESSION_ID }, body: form });
    if (r.status === 503) return { error: "unavailable" };
    if (r.status === 429) return { error: "busy" };
    if (!r.ok) return { error: "failed" };
    const d = (await r.json()) as { text?: string; lang?: string };
    return { text: (d.text ?? "").trim(), ...(typeof d.lang === "string" ? { lang: d.lang } : {}) };
  } catch {
    return { error: "failed" };
  }
}
