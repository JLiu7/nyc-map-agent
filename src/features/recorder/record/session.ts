/**
 * Collecting a recording in the browser: the phone's motion, orientation and
 * location events become rows of the station walk format (../format.ts,
 * docs/RECORDING_FORMAT.md), each stamped with Date.now() as it arrives.
 * Pure, so the rows and the saved file can be checked without a phone.
 */
import { parseRecording, type GpsRow, type HeadingRow, type MarkKind, type MotionRow, type Recording } from "../format";

type Xyz = { x: number | null; y: number | null; z: number | null } | null | undefined;
type Abg = { alpha: number | null; beta: number | null; gamma: number | null } | null | undefined;

/** The parts of a DeviceMotionEvent the recording keeps. */
export interface MotionLike {
  accelerationIncludingGravity?: Xyz;
  rotationRate?: Abg;
}

/** The parts of a GeolocationCoordinates the recording keeps. */
export interface CoordsLike {
  latitude: number;
  longitude: number;
  accuracy: number;
}

const round = (x: number, places: number) => {
  const k = 10 ** places;
  return Math.round(x * k) / k;
};
const num = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

/**
 * One motion row: acceleration with gravity (m/s²) and rotation rate (deg/s).
 * The browser's rotation rate names its axes by angle: beta turns about x,
 * gamma about y, alpha about z, so rx, ry, rz are beta, gamma, alpha (the same
 * axes as the Sensor Logger converter's gyroscope x, y, z). A laptop sends
 * empty events, and a row with any value missing is dropped, never filled in.
 */
export function motionRow(t: number, e: MotionLike): MotionRow | null {
  const a = e.accelerationIncludingGravity;
  const r = e.rotationRate;
  if (!a || !r) return null;
  const v = [a.x, a.y, a.z, r.beta, r.gamma, r.alpha];
  if (!v.every(num)) return null;
  return [t, ...v.map((x) => round(x, 3))] as MotionRow;
}

/** One heading row: the browser's DeviceOrientation angles as they come, in degrees. */
export function headingRow(t: number, e: Abg): HeadingRow | null {
  if (!e || !num(e.alpha) || !num(e.beta) || !num(e.gamma)) return null;
  return [t, round(e.alpha, 2), round(e.beta, 2), round(e.gamma, 2)];
}

/** One location row: latitude, longitude and how far off it may be, in metres. */
export function gpsRow(t: number, c: CoordsLike): GpsRow | null {
  if (!num(c.latitude) || !num(c.longitude) || !num(c.accuracy)) return null;
  return [t, round(c.latitude, 7), round(c.longitude, 7), round(c.accuracy, 1)];
}

export interface Counts {
  motion: number;
  heading: number;
  gps: number;
  marks: number;
}

export interface Collector {
  readonly recording: Recording;
  motion(t: number, e: MotionLike): void;
  heading(t: number, e: Abg): void;
  gps(t: number, c: CoordsLike): void;
  mark(t: number, kind: MarkKind): void;
  counts(): Counts;
  /** The finished recording, with the video's file name and start time when there is one. */
  finish(video?: { file: string; startedAt: number }): Recording;
}

/**
 * A new recording. A browser has no barometer or step counter, so `baro` and
 * `steps` stay empty; the file holds only what the phone measured.
 */
export function createCollector(startedAt: number, device: string): Collector {
  const rec: Recording = { v: 1, startedAt, device: device || "Unknown browser", motion: [], heading: [], gps: [], baro: [], steps: [], marks: [] };
  return {
    recording: rec,
    motion(t, e) {
      const row = motionRow(t, e);
      if (row) rec.motion.push(row);
    },
    heading(t, e) {
      const row = headingRow(t, e);
      if (row) rec.heading.push(row);
    },
    gps(t, c) {
      const row = gpsRow(t, c);
      if (row) rec.gps.push(row);
    },
    mark(t, kind) {
      rec.marks.push({ t, kind });
    },
    counts: () => ({ motion: rec.motion.length, heading: rec.heading.length, gps: rec.gps.length, marks: rec.marks.length }),
    finish(video) {
      return video ? { ...rec, video } : { ...rec };
    },
  };
}

/** A short device name from the browser's user agent ("iPhone", "Android (Pixel 8)", "Windows"). */
export function deviceName(ua: string): string {
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  const android = /Android[^;)]*;\s*([^;)]+?)(?:\s+Build|\))/.exec(ua);
  if (android) return `Android (${android[1].trim()})`;
  if (/Android/.test(ua)) return "Android";
  if (/Macintosh/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows";
  if (/Linux/.test(ua)) return "Linux";
  return "Unknown browser";
}

const pad = (n: number) => String(n).padStart(2, "0");

/** The saved files' shared name, from the start time in local time: walk-2026-11-14-170512. */
export function fileStem(startedAt: number): string {
  const d = new Date(startedAt);
  return `walk-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

/** The video's file extension for the type MediaRecorder chose (an iPhone records mp4, Chrome webm). */
export function videoExt(mime: string): "mp4" | "webm" {
  return /mp4/i.test(mime) ? "mp4" : "webm";
}

/** The picture the recorder keeps: 720p, the size it asks the camera for. */
export const RECORD_SIZE = { width: 1280, height: 720 };

/**
 * How many bits a second this picture needs: 1.2 Mbit/s at 720p, about 90 MB for a
 * ten-minute walk. Left to itself the browser picks several times as much (phones
 * often 4 to 8 Mbit/s at this size), so a walk turns into about 450 MB of detail a
 * sign, a stair or a corridor never needed. Pure, so the figure is checked without
 * a phone.
 */
export function videoBitrate(width: number, height: number): number {
  return Math.max(4e5, Math.round((width * height * 1.2e6) / 921600));
}

/**
 * What to hand MediaRecorder: the first type this browser can record (none, to let
 * it choose) and the rate above.
 */
export function recorderOptions(isSupported: (type: string) => boolean): MediaRecorderOptions {
  const mimeType = ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find(isSupported) ?? "";
  return { videoBitsPerSecond: videoBitrate(RECORD_SIZE.width, RECORD_SIZE.height), ...(mimeType && { mimeType }) };
}

/**
 * True when the camera opened bigger than the recorder keeps, which some phones do
 * whatever size was asked for (a 4K camera hands over 3840 px). That picture is
 * drawn down to RECORD_SIZE before it is recorded. Pure.
 */
export function oversize(w: number, h: number): boolean {
  return w > RECORD_SIZE.width || h > RECORD_SIZE.height;
}

/** The recording as the JSON file Save downloads. Throws if it would not pass the format's checker. */
export function recordingJson(rec: Recording): string {
  const checked = parseRecording(JSON.parse(JSON.stringify(rec)));
  if (!checked.ok) throw new Error(`The recording does not match the format: ${checked.errors.join(" ")}`);
  return JSON.stringify(rec);
}

/** Minutes and seconds since the start, for the timer and the marks list: 0:07, 12:30. */
export function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${pad(s % 60)}`;
}
