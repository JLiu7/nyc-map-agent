/**
 * A station walk goes up from a phone in pieces and reaches Octo once, whole.
 *
 *   POST /api/recordings                  the recording's JSON, and how big its video is
 *   PUT  /api/recordings/{id}/part?from=  the video, one exact byte range per request
 *   POST /api/recordings/{id}/finish      hand the joined file and the JSON to Octo
 *
 * Why the phone does not send to Octo directly: Octo takes one whole file per request as base64,
 * so a 90 MB video is a ~120 MB request, and there is no resumable or partial upload. A phone in a
 * station cannot hold that connection, and a dropped one starts again from zero. Here each part is
 * answered with the byte count the server holds, so a phone that lost its signal asks where it got
 * to and carries on from there.
 *
 * What this route does not do: serve a recording back (there is no GET route, so nothing a rider
 * sends is reachable from the internet), or store a byte before the recording's own JSON has been
 * read and accepted. Uploads are anonymous, so the only name an upload ever gets is derived from
 * the recording's start time; a caller cannot suggest one.
 */
import type { Context } from "hono";
import { parseRecording, type Recording } from "../../../src/features/recorder/format";
import { isWorkingKey, octoOrigin } from "../../../api/_lib/octo";

/** The most one part may carry. A part arrives as one request, so this is also the request size cap. */
export const MAX_PART_BYTES = 16 * 1024 * 1024;
/** The part size offered at the start: small enough that one part finishes on a bad station signal. */
export const CHUNK_BYTES = 8 * 1024 * 1024;

const DEFAULT_MAX_BYTES = 200 * 1024 * 1024;
const DEFAULT_PER_DAY = 5;
const MB = 1024 * 1024;
/** A day for the daily allowance is a UTC day, so a deploy time zone cannot move it. */
const DAY_MS = 24 * 60 * 60 * 1000;
/** An upload nobody finished is dropped after a day. */
const STALE_MS = DAY_MS;
/** Uploads waiting at once, and the most one upload may ever hold. Both are stops, not limits on real use. */
const MAX_PENDING = 200;
const MAX_UPLOAD_BYTES = 400 * MB;

export interface Limits {
  maxBytes: number;
  perDay: number;
}

export interface Part {
  from: number;
  bytes: Uint8Array;
}

export interface Upload {
  id: string;
  /** The phone model string from the recording. Client-supplied: it names a sender, it is not a check. */
  device: string;
  json: Recording;
  /** The file name the JSON says its video has, when it has one. Only its extension is ever used. */
  videoName: string | null;
  /** The video size the phone reported at the start; 0 when it reported none. */
  expected: number;
  received: number;
  parts: Part[];
  createdAt: number;
}

export function limitsFromEnv(env: Record<string, string | undefined> = process.env): Limits {
  const num = (v: string | undefined, fallback: number) => {
    const n = Number(v);
    return v && Number.isFinite(n) && n > 0 ? n : fallback;
  };
  return { maxBytes: num(env.RECORDING_MAX_BYTES, DEFAULT_MAX_BYTES), perDay: num(env.RECORDING_PER_DAY, DEFAULT_PER_DAY) };
}

/**
 * There is one server process, so a module map is enough to keep a part-by-part upload together, and
 * it forgets everything on the next deploy. A phone mid-send through a deploy gets a 404 for its
 * upload id and starts again; the recording is still on the phone, so the only loss is time. A
 * database is the honest fix once this is not a demo.
 */
const uploads = new Map<string, Upload>();
/** Device to the UTC day it last finished on and how many times. Counted at finish, so a start that never completes costs nothing. */
const finished = new Map<string, { day: number; count: number }>();

const dayNumber = (at: number) => Math.floor(at / DAY_MS);

/** How many recordings this device has finished today. The device id is whatever the phone sent. */
export function sentToday(device: string, now = Date.now()): number {
  const row = finished.get(device);
  return row && row.day === dayNumber(now) ? row.count : 0;
}

export function clearUploads(): void {
  uploads.clear();
  finished.clear();
}

export const getUpload = (id: string): Upload | undefined => uploads.get(id);

function prune(now: number): void {
  for (const [id, u] of uploads) if (now - u.createdAt > STALE_MS) uploads.delete(id);
  while (uploads.size > MAX_PENDING) {
    const oldest = uploads.keys().next().value;
    if (oldest === undefined) break;
    uploads.delete(oldest);
  }
  for (const [device, row] of finished) if (row.day !== dayNumber(now)) finished.delete(device);
}

export function newUpload(u: Omit<Upload, "id" | "received" | "parts" | "createdAt">, now = Date.now()): Upload {
  prune(now);
  const upload: Upload = { ...u, id: crypto.randomUUID(), received: 0, parts: [], createdAt: now };
  uploads.set(upload.id, upload);
  return upload;
}

export function noteFinished(device: string, now = Date.now()): void {
  const day = dayNumber(now);
  const row = finished.get(device);
  finished.set(device, row && row.day === day ? { day, count: row.count + 1 } : { day, count: 1 });
}

/** The parts joined in the order they arrived. Each one starts exactly where the last ended. */
export function assemble(u: Upload): Uint8Array {
  const out = new Uint8Array(u.received);
  let at = 0;
  for (const p of u.parts) {
    out.set(p.bytes, at);
    at += p.bytes.byteLength;
  }
  return out;
}

/**
 * The name an upload gets at Octo, from when the recording started and nothing the caller typed.
 * Only digits, dashes and a dotted extension from a fixed set survive, so the name cannot climb out
 * of the workspace folder: there is no slash in it, no "..", and it does not start with a dot.
 * Two walks started in the same second get the same name, which is fine: Octo stores files by id.
 */
export function recordingName(startedAt: number, ext: string, label = ""): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const when = new Date(startedAt);
  const stamp = Number.isFinite(when.getTime())
    ? `${when.getUTCFullYear()}${p(when.getUTCMonth() + 1)}${p(when.getUTCDate())}-${p(when.getUTCHours())}${p(when.getUTCMinutes())}${p(when.getUTCSeconds())}`
    : "unknown";
  return `walk-${stamp}${label}.${ext}`;
}

const EXTENSIONS = new Set(["mp4", "m4v", "mov", "webm", "mkv", "3gp", "ogv"]);

/** The extension of the name the JSON gives its video, when it is one a phone records; otherwise mp4. */
export function videoExt(name: string | null): string {
  const m = name ? /\.([A-Za-z0-9]{1,5})$/.exec(name) : null;
  const ext = m ? m[1].toLowerCase() : "";
  return EXTENSIONS.has(ext) ? ext : "mp4";
}

/** Names are checked again here, so a bug elsewhere cannot turn into a route out of the folder. Only `walk-<start>-<ext>` exists. */
const SAFE_NAME = /^walk-[0-9]{8}-[0-9]{6}(-json)?\.(json|mp4|m4v|mov|webm|mkv|3gp|ogv)$/;
export const isSafeName = (name: string): boolean => SAFE_NAME.test(name) && !/[^\w.-]/.test(name) && !name.includes("..");

export interface StartBody {
  device: string;
  json: unknown;
  /** The video size the phone reports; absent when it sends the JSON alone. */
  bytes?: number;
}

export interface Refusal {
  status: number;
  /** One plain sentence, shown to the rider as written. */
  error: string;
}

/** Everything that can refuse an upload before a byte is stored. */
export function checkStart(body: StartBody, limits: Limits, now = Date.now()): Refusal | null {
  const parsed = parseRecording(body.json);
  if (!parsed.ok) {
    const first = parsed.errors[0] ?? "it could not be read.";
    return { status: 400, error: `This recording could not be read: ${first}` };
  }
  if (body.device !== parsed.recording.device) {
    return { status: 400, error: "The phone named in the request and the phone named in the recording disagree." };
  }
  const bytes = body.bytes ?? 0;
  if (bytes > limits.maxBytes) {
    return { status: 413, error: `This video is ${Math.round(bytes / MB)} MB and the most this server takes is ${Math.round(limits.maxBytes / MB)} MB.` };
  }
  if (sentToday(body.device, now) >= limits.perDay) {
    return { status: 429, error: `This phone has already sent ${limits.perDay} recordings today. It can send more tomorrow, or keep this one on the phone.` };
  }
  return null;
}

export interface FileStore {
  /** Whether this server has a key and a workspace to store in. */
  ready: boolean;
  /** One whole file, named by this code alone. */
  put(name: string, bytes: Uint8Array, mimeType: string): Promise<void>;
}

/**
 * The Octo client this feature uses. A working key (octo_tmp_…) goes through Octo's vault relay, so
 * this server never holds a real one; a plain key is for a local run and goes straight to Octo. The
 * key comes from the environment and never from a request.
 */
export function octoStore(env: Record<string, string | undefined> = process.env, f: typeof fetch = fetch): FileStore {
  const key = env.OCTO_API_KEY?.trim() ?? "";
  const workspace = env.RECORDING_OCTO_WORKSPACE?.trim() || env.OCTO_WORKSPACE_ID?.trim() || "";
  const origin = octoOrigin(env);
  const viaRelay = isWorkingKey(key);
  const target = `${origin}/api/files/upload`;
  return {
    ready: key !== "" && workspace !== "",
    async put(name, bytes, mimeType) {
      const res = await f(viaRelay ? `${origin}/api/vault/proxy` : target, {
        method: "POST",
        headers: {
          authorization: `Bearer ${key}`,
          "content-type": "application/json",
          ...(viaRelay ? { "x-octo-target": target } : {}),
        },
        body: JSON.stringify({ workspaceId: workspace, name, mimeType, data: base64(bytes), dataEncoding: "base64" }),
        signal: AbortSignal.timeout(180_000),
      });
      if (!res.ok) throw new Error(`octo files ${res.status}`);
    },
  };
}

/** Base64 of a whole file, built a block at a time: a 400 MB string built in one go would put three copies of it in memory. */
function base64(bytes: Uint8Array): string {
  let s = "";
  const block = 0x8000;
  for (let i = 0; i < bytes.length; i += block) {
    const view = bytes.subarray(i, i + block);
    s += String.fromCharCode.apply(null, Array.from(view));
  }
  return Buffer.from(s, "latin1").toString("base64");
}

const reply = (status: number, body: Record<string, unknown>): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

export async function POST(request: Request, env: Record<string, string | undefined> = process.env): Promise<Response> {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object" || Array.isArray(body)) return reply(400, { error: "A recording upload starts with a JSON object." });
  // Two shapes: the JSON alone, or the JSON with the phone's video size beside it.
  const json = (body.json ?? body) as unknown;
  const recorded = (json as { device?: unknown } | null)?.device;
  const device = typeof body.device === "string" ? body.device : typeof recorded === "string" ? recorded : null;
  if (device === null || device === "") return reply(400, { error: "A recording upload must say which phone it came from." });
  const bytes = body.bytes === undefined ? undefined : Number(body.bytes);
  if (bytes !== undefined && (!Number.isFinite(bytes) || bytes < 0)) return reply(400, { error: "The video size must be a number of bytes." });
  const refusal = checkStart({ device, json, bytes }, limitsFromEnv(env));
  if (refusal) return reply(refusal.status, { error: refusal.error });
  const recording = (parseRecording(json) as { ok: true; recording: Recording }).recording;
  const upload = newUpload({ device, json: recording, videoName: recording.video?.file ?? null, expected: bytes ?? 0 });
  return reply(200, { uploadId: upload.id, received: 0, chunk: CHUNK_BYTES });
}

/** The body read up to `cap` bytes; a longer one is refused instead of all of it being held. */
async function readAtMost(request: Request, cap: number): Promise<Uint8Array | null> {
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array(0);
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > cap) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.byteLength;
  }
  return bytes;
}

export async function PUT(c: Context): Promise<Response> {
  const id = c.req.param("id");
  const upload = id ? uploads.get(id) : undefined;
  // A forgotten upload (a deploy, a day gone by) says so plainly, and the phone starts again from its own file.
  if (!upload) return reply(404, { error: "This upload is no longer waiting. Start the send again; the recording is still on the phone." });
  // An empty offset is not zero: it means the phone did not say, and guessing would append at the wrong byte.
  const asked = new URL(c.req.url).searchParams.get("from");
  const from = asked === null || !/^\d{1,12}$/.test(asked) ? Number.NaN : Number(asked);
  if (!Number.isInteger(from) || from < 0) return reply(400, { error: "A part must say which byte of the video it starts at." });
  // The phone's idea of where it got to can be stale after a retry. Answer with the truth so it resumes there.
  if (from !== upload.received) return reply(409, { received: upload.received });
  const room = Math.min(MAX_PART_BYTES, Math.max(0, MAX_UPLOAD_BYTES - upload.received));
  const bytes = await readAtMost(c.req.raw, room);
  if (!bytes) {
    const most = Math.floor(room / MB);
    return reply(413, { error: most ? `One part carries at most ${most} MB.` : "This upload is as big as this server holds.", received: upload.received });
  }
  if (bytes.byteLength === 0) return reply(400, { error: "That part was empty.", received: upload.received });
  upload.parts.push({ from, bytes });
  upload.received += bytes.byteLength;
  return reply(200, { received: upload.received });
}

export async function FINISH(c: Context, env: Record<string, string | undefined> = process.env, f: typeof fetch = fetch): Promise<Response> {
  const store = octoStore(env, f);
  // Never take bytes and drop them: with nowhere to put a walk, say so before anything is accepted.
  if (!store.ready) return reply(503, { error: "no recording store" });
  const id = c.req.param("id");
  const upload = id ? uploads.get(id) : undefined;
  if (!upload) return reply(404, { error: "This upload is no longer waiting. Start the send again; the recording is still on the phone." });
  const video = assemble(upload);
  // The size the phone promised is not the size it sent: the phone is the one that knows, so say so rather than store half a walk.
  if (upload.expected > 0 && video.byteLength !== upload.expected) {
    return reply(409, { received: upload.received, error: `The video should be ${upload.expected} bytes and the parts add up to ${upload.received}.` });
  }
  const startedAt = upload.json.startedAt;
  const name = recordingName(startedAt, videoExt(upload.videoName));
  const jsonName = recordingName(startedAt, "json", "-json");
  if (!isSafeName(name) || !isSafeName(jsonName)) return reply(400, { error: "This recording cannot be named." });
  try {
    // The JSON first: the walk's own record is what makes the video worth anything (the check for #223 asks for it).
    await store.put(jsonName, new TextEncoder().encode(JSON.stringify(upload.json)), "application/json");
    await store.put(name, video, "video/mp4");
  } catch (err) {
    console.error(`[recordings] storing ${name} failed:`, err instanceof Error ? err.message : err);
    return reply(502, { error: "The recording store did not take the file. Nothing was lost; the recording is still on the phone." });
  }
  noteFinished(upload.device);
  // The parts are only memory now that the store has the file.
  uploads.delete(upload.id);
  return reply(200, { ok: true, file: name, bytes: video.byteLength });
}
