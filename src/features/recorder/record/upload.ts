/**
 * Sending a finished walk to /api/recordings (#223, piece 4). The review
 * screen hands a recording to a tab and its Send button starts one upload;
 * nothing here runs until that button is pressed. The planning part (how the
 * video is cut, whether the limits allow it, its name) is pure so it can be
 * checked without a browser; the requests are in `send`, which takes the
 * screen's callbacks rather than reading the page.
 *
 * The routes, as the server builds them (docs/specs/RECORDER_CONTRIBUTIONS.md):
 *   POST /api/recordings            {device, json}          -> {uploadId, received, chunk}
 *   PUT  /api/recordings/<id>/part?from=<offset>  raw bytes -> {received}
 *   POST /api/recordings/<id>/finish                        -> {ok, file, bytes}
 * A refusal is {error: "<one sentence>"} with 400, 413, 429 or 503.
 */
import type { Recording } from "../format";

/** 200 MB per recording, the server's own limit. */
export const MAX_BYTES = 200_000_000;
/** Five uploads a day per device, the server's own limit. */
export const PER_DAY = 5;
/** How much video goes in one part. 5 MB keeps a part under the body limits of the usual proxies. */
export const CHUNK_BYTES = 5_000_000;

/** The byte ranges [from, to) still to send, in order, for a file of `size` when `confirmed` bytes are already stored. */
export function chunkPlan(size: number, chunk: number, confirmed = 0): [number, number][] {
  const plan: [number, number][] = [];
  // A server that claims more than the file has (a restart, a wrong number) is told to start again below the end.
  const from0 = Math.min(Math.max(Math.floor(confirmed), 0), Math.max(Math.floor(size), 0));
  const step = Math.max(1, Math.floor(chunk));
  for (let at = from0; at < size; at += step) plan.push([at, Math.min(at + step, Math.floor(size))]);
  return plan;
}

/** A size as a person says it: 200 MB, 200.3 MB, 640 kB. One decimal only where it shows a file is over a round limit. */
const bytes = (n: number): string => {
  if (n < 1_000_000) return `${Math.max(1, Math.round(n / 1_000))} kB`;
  const mb = n / 1_000_000;
  return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB`;
};

/** Null when the upload may go; otherwise one plain sentence saying why not. */
export function checkUpload(a: { bytes: number; sentToday: number }, limits: { maxBytes: number; perDay: number }): string | null {
  if (!(a.bytes >= 0)) return "This recording has no size, so it cannot be sent.";
  // The day's limit is said first: sending again today will not help whatever the file weighs.
  const tomorrow = " Save it instead and send it tomorrow.";
  if (a.sentToday >= limits.perDay) return `All ${limits.perDay} of today's recordings have been sent from this device.` + tomorrow;
  if (a.bytes > limits.maxBytes) return `This recording is ${bytes(a.bytes)}, more than the ${bytes(limits.maxBytes)} a recording may be.` + tomorrow;
  return null;
}

/**
 * The name a recording goes up under, from its own start time: walk-2026-11-14-170512.
 * A recording whose start time is not a real time still needs a name, so it falls back to the epoch.
 */
export function uploadName(startedAt: number): string {
  // Not a real time (NaN, an infinity): the epoch still gives a name, and a wrong name costs nothing.
  const d = new Date(Number.isFinite(startedAt) ? startedAt : 0);
  const p = (n: number) => String(n).padStart(2, "0");
  return `walk-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** The name as a file name the server can keep: one run of letters, digits and dashes. */
export function safeName(name: string): string {
  const cut = name.replace(/[^A-Za-z0-9-]+/g, "-").replace(/-{2,}/g, "-").replace(/^-|-$/g, "").slice(0, 80);
  return cut || "walk";
}

/** What the screen's copy of the daily count says. Kept in localStorage so the next Send, or a reload, sees it. */
export interface DayCount {
  day: string;
  sent: number;
}

const dayKey = (now: number): string => new Date(now).toISOString().slice(0, 10);
const key = (device: string): string => `recorder.sent.${device}`;

/**
 * The count for today; a count left from another day is nothing. A private tab or a full store reads as
 * nothing rather than an error: the server counts too, so a phone that cannot remember is only less careful.
 */
export function readCount(storage: Pick<Storage, "getItem"> | null, device: string, now: number): DayCount {
  const day = dayKey(now);
  try {
    const saved = JSON.parse(storage?.getItem(key(device)) ?? "null") as Partial<DayCount> | null;
    // A phone's date can step back past midnight while it travels; a count for a later day is also nothing.
    return saved?.day === day && typeof saved.sent === "number" && saved.sent >= 0 ? { day, sent: saved.sent } : { day, sent: 0 };
  } catch {
    return { day, sent: 0 };
  }
}

/** Record one more upload sent today. */
export function addCount(storage: Pick<Storage, "getItem" | "setItem"> | null, device: string, now: number): DayCount {
  const next = { day: dayKey(now), sent: readCount(storage, device, now).sent + 1 };
  try {
    storage?.setItem(key(device), JSON.stringify(next));
  } catch {
    // Nothing to do about a store that refuses; the server also counts.
  }
  return next;
}

/** What a request to the server said, once read. */
interface Refused { ok: false; why: string; status: number; body: Record<string, unknown> }
type Answer = { ok: true; body: Record<string, unknown> } | Refused;

const REFUSED: Record<number, string> = {
  400: "The server could not read this recording.",
  413: "The server says this recording is too large to keep.",
  429: "Too many recordings were sent from this device today, so the server stopped it.",
  503: "The server is not taking recordings just now.",
};

/**
 * One request, read as the routes answer. A refusal carries the server's own
 * sentence when it sends one, because that says what the person can do; the
 * status's default sentence is only for a server that sent none.
 */
async function ask(url: string, init: RequestInit, signal: AbortSignal): Promise<Answer> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal });
  } catch {
    // The same "Not sent." opening as a refusal, so the screen can show either as it is.
    const why = "Not sent. " + (signal.aborted ? "Sending was stopped." : "The server could not be reached. Check the connection and press Send again.") + KEPT;
    return { ok: false, why, status: 0, body: {} };
  }
  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  if (res.ok && res.status >= 200 && res.status < 300 && typeof (body as { error?: unknown }).error !== "string") return { ok: true, body };
  const said = typeof body.error === "string" && body.error.trim() ? body.error.trim() : null;
  const reason = said ?? REFUSED[res.status] ?? `The server refused the recording (status ${res.status}).`;
  // The sentence opens with "Not sent.", so the screen can put it by the button as it is and the person knows
  // where they stand. The full stop is a full stop, not a colon: the sentence has to read as one sentence.
  return { ok: false, status: res.status, body, why: "Not sent. " + reason + KEPT };
}

const num = (x: unknown, fallback: number): number => (typeof x === "number" && Number.isFinite(x) ? x : fallback);

export interface SendProgress {
  /** 0 to 1 of the total bytes, counting the JSON. */
  done: number;
  /** "data" while the recording is going up, "video" for the parts. */
  part: "data" | "video";
}

export interface SendInput {
  recording: Recording;
  /** The recording as JSON: the first thing that goes up. */
  json: string;
  video: Blob | null;
  name: string;
  onProgress?: (p: SendProgress) => void;
  signal?: AbortSignal;
}

export type SendResult = { ok: true; file: string; bytes: number } | { ok: false; why: string };

/** Every refusal ends the same way, so the person knows nothing was lost. */
const KEPT = " The recording is still on this phone.";
/** A recording's route under /api/recordings. */
const where = (id: string, rest: string): string => `/api/recordings/${encodeURIComponent(id)}/${rest}`;

/** Three goes at a request whose answer says "try the same thing again", and a moment between them. */
const RETRIES = 3;
const PAUSE_MS = 300;
const pause = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

/** The byte count the server says it truly has, or null when it does not say. */
function truth(body: Record<string, unknown> | undefined): number | null {
  const n = body?.received;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

/**
 * Sends one recording: its JSON first, then the video in parts. When a part
 * fails, or the server answers 409 with the byte count it truly has, the next
 * attempt starts from that count, so a dropped connection costs one part and
 * not the whole video. Returns the plain reason on a refusal; the caller keeps
 * the recording on screen to send again or save.
 */
export async function send(input: SendInput): Promise<SendResult> {
  const { json, video, name } = input;
  const signal = input.signal ?? new AbortController().signal;
  const total = json.length + (video?.size ?? 0);
  const report = (confirmed: number, part: SendProgress["part"]) => input.onProgress?.({ done: total ? Math.min(1, (json.length + confirmed) / total) : 1, part });

  // The data goes first: a video with no data means nothing to the server, so it is refused there.
  const created = await ask("/api/recordings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ device: input.recording.device, name, json }),
  }, signal);
  if (!created.ok) return { ok: false, why: created.why };
  const uploadId = created.body.uploadId;
  if (typeof uploadId !== "string" || !uploadId) return { ok: false, why: "Not sent. The server did not say where to put this recording. Try again in a moment." };
  report(0, "data");

  const size = video?.size ?? 0;
  const chunk = Math.max(1, Math.floor(num(created.body.chunk, CHUNK_BYTES)));
  let confirmed = Math.min(truth(created.body) ?? 0, size);
  /** Goes at the next part, whether it failed or was answered with a count that moved nothing. */
  let tries = 0;
  report(confirmed, "video");

  while (size > 0 && confirmed < size) {
    // Always the first range still to send, from the server's own count.
    const [from, to] = chunkPlan(size, chunk, confirmed)[0];
    const put = await ask(where(uploadId, `part?from=${from}`), { method: "PUT", headers: { "content-type": video!.type || "application/octet-stream" }, body: video!.slice(from, to) }, signal);
    if (put.ok) { confirmed = Math.min(truth(put.body) ?? to, size); tries = 0; report(confirmed, "video"); continue; }
    // 409: the server already has a different amount. Believe it and carry on from there.
    // Only a 409 carries a count; any other refusal says nothing about what it holds.
    const known = put.status === 409 ? truth(put.body) : null;
    if (known !== null && known !== confirmed) { confirmed = Math.min(known, size); tries = 0; report(confirmed, "video"); continue; }
    if (++tries >= RETRIES) return { ok: false, why: put.why };
    await pause(PAUSE_MS * tries);
  }

  const done = await ask(where(uploadId, "finish"), { method: "POST" }, signal);
  if (!done.ok) return { ok: false, why: done.why };
  return { ok: true, file: typeof done.body.file === "string" ? done.body.file : "", bytes: num(done.body.bytes, json.length + confirmed) };
}
