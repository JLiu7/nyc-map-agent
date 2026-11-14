import type { GpsRow, HeadingRow, Mark, MarkKind, MotionRow, Recording } from "../format";

/**
 * The rows of one recorded segment, gathered while the camera films. Every
 * time is the phone's clock (epoch ms), as the recording format asks. A
 * reading with a missing number is dropped, never padded: the format's
 * checker wants whole rows, and a made-up zero would read as a real value.
 */
export interface Session {
  startedAt: number;
  motion: MotionRow[];
  heading: HeadingRow[];
  gps: GpsRow[];
  marks: Mark[];
}

type Num = number | null | undefined;
const ok = (n: Num): n is number => typeof n === "number" && Number.isFinite(n);

export const newSession = (startedAt: number): Session => ({ startedAt, motion: [], heading: [], gps: [], marks: [] });

/** A DeviceMotion reading: acceleration with gravity, and rotation rate about the phone's x (beta), y (gamma) and z (alpha) axes. */
export function addMotion(s: Session, t: number, acc: { x: Num; y: Num; z: Num } | null, rot: { alpha: Num; beta: Num; gamma: Num } | null): void {
  if (!acc || !rot) return;
  if (ok(acc.x) && ok(acc.y) && ok(acc.z) && ok(rot.beta) && ok(rot.gamma) && ok(rot.alpha)) s.motion.push([t, acc.x, acc.y, acc.z, rot.beta, rot.gamma, rot.alpha]);
}

/** A DeviceOrientation reading, as the browser gives it. */
export function addHeading(s: Session, t: number, alpha: Num, beta: Num, gamma: Num): void {
  if (ok(alpha) && ok(beta) && ok(gamma)) s.heading.push([t, alpha, beta, gamma]);
}

export function addGps(s: Session, t: number, lat: Num, lon: Num, accuracyM: Num): void {
  if (ok(lat) && ok(lon) && ok(accuracyM)) s.gps.push([t, lat, lon, accuracyM]);
}

export function addMark(s: Session, t: number, kind: MarkKind): void {
  s.marks.push({ t, kind });
}

/** The saved file. A browser has no barometer or step counter, so those lists stay empty. */
export function toRecording(s: Session, o: { device: string; video?: { file: string; startedAt: number } }): Recording {
  return { v: 1, startedAt: s.startedAt, device: o.device || "unknown", motion: s.motion, heading: s.heading, gps: s.gps, baro: [], steps: [], marks: s.marks, ...(o.video ? { video: o.video } : {}) };
}

/** walk-20261114-131500: the phone's local date and time at the start. */
export function fileBase(startedAt: number): string {
  const d = new Date(startedAt);
  const p = (n: number) => String(n).padStart(2, "0");
  return `walk-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** The video type this browser can record, most widely playable first; "" lets the browser choose. */
export function pickMime(supported: (m: string) => boolean): string {
  return ["video/mp4", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find(supported) ?? "";
}

export const extFor = (mime: string): string => (mime.includes("mp4") ? "mp4" : "webm");

/** 0:07, 12:30. */
export function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
