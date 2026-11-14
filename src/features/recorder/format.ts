/**
 * The file a station walk is saved in. One JSON file per walk; see
 * docs/RECORDING_FORMAT.md for what each field means. Field names are fixed:
 * the recorder, the converter and the replay page all read them.
 */

/** [t, ax, ay, az, rx, ry, rz]: acceleration with gravity (m/s²) and rotation rate (deg/s). */
export type MotionRow = [t: number, ax: number, ay: number, az: number, rx: number, ry: number, rz: number];
/** [t, alpha, beta, gamma]: device orientation in degrees, as the browser's DeviceOrientation event reports it. */
export type HeadingRow = [t: number, alpha: number, beta: number, gamma: number];
/** [t, lat, lon, accuracyM]: a location fix and its horizontal accuracy in metres. */
export type GpsRow = [t: number, lat: number, lon: number, accuracyM: number];
/** [t, relativeAltitudeM]: height in metres relative to where the recording started. */
export type BaroRow = [t: number, relativeAltitudeM: number];
/** [t, count]: cumulative step count since the recording started. */
export type StepRow = [t: number, count: number];

export const MARK_KINDS = ["sign", "stairs", "elevator"] as const;
export type MarkKind = (typeof MARK_KINDS)[number];

export interface Mark {
  t: number;
  kind: MarkKind;
  note?: string;
}

export interface Recording {
  v: 1;
  station?: string;
  /** Epoch ms when the recording started. */
  startedAt: number;
  device: string;
  motion: MotionRow[];
  heading: HeadingRow[];
  gps: GpsRow[];
  baro: BaroRow[];
  steps: StepRow[];
  marks: Mark[];
  video?: { file: string; startedAt: number };
}

export type ParseResult = { ok: true; recording: Recording } | { ok: false; errors: string[] };

const MAX_ERRORS = 20;

const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

function checkRows(errors: string[], root: Record<string, unknown>, key: string, width: number, what: string): void {
  const rows = root[key];
  if (!Array.isArray(rows)) {
    errors.push(`"${key}" must be a list (it can be empty).`);
    return;
  }
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!Array.isArray(row) || row.length !== width || !row.every(isNum)) {
      errors.push(`"${key}" row ${i + 1} should be ${width} numbers (${what}).`);
      return; // one bad row is enough to report per list
    }
  }
}

/** Check unknown JSON against the recording format. Returns the typed value, or plain-language errors. */
export function parseRecording(json: unknown): ParseResult {
  if (!isObj(json)) return { ok: false, errors: ["The file is not a recording: expected a JSON object."] };
  const errors: string[] = [];
  if (json.v !== 1) errors.push(`"v" must be 1 (this reader only knows version 1).`);
  if (json.station !== undefined && typeof json.station !== "string") errors.push(`"station" must be text when present.`);
  if (!isNum(json.startedAt)) errors.push(`"startedAt" must be a number (epoch milliseconds).`);
  if (typeof json.device !== "string" || json.device === "") errors.push(`"device" must be non-empty text.`);
  checkRows(errors, json, "motion", 7, "time, acceleration x y z, rotation x y z");
  checkRows(errors, json, "heading", 4, "time, alpha, beta, gamma");
  checkRows(errors, json, "gps", 4, "time, latitude, longitude, accuracy in metres");
  checkRows(errors, json, "baro", 2, "time, relative altitude in metres");
  checkRows(errors, json, "steps", 2, "time, step count");

  if (!Array.isArray(json.marks)) {
    errors.push(`"marks" must be a list (it can be empty).`);
  } else {
    for (let i = 0; i < json.marks.length; i++) {
      const m: unknown = json.marks[i];
      if (!isObj(m) || !isNum(m.t) || !(MARK_KINDS as readonly unknown[]).includes(m.kind) || (m.note !== undefined && typeof m.note !== "string")) {
        errors.push(`"marks" item ${i + 1} needs a number "t", a "kind" of sign, stairs or elevator, and optional text "note".`);
        break;
      }
    }
  }

  if (json.video !== undefined && !(isObj(json.video) && typeof json.video.file === "string" && isNum(json.video.startedAt))) {
    errors.push(`"video" must have a text "file" and a numeric "startedAt" when present.`);
  }

  if (errors.length) return { ok: false, errors: errors.slice(0, MAX_ERRORS) };
  return { ok: true, recording: json as unknown as Recording };
}
