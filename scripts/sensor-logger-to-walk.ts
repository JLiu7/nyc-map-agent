/**
 * Turns a Sensor Logger (iPhone app) export into one station-walk recording
 * (src/features/recorder/format.ts).
 *
 *   pnpm walk:from-sensor-logger <export folder or .zip> <out.json> [--station "Fulton St"]
 *
 * What it reads, by file (columns checked against a real iPhone 11 export,
 * Sensor Logger 1.68.1; every `time` is epoch nanoseconds):
 *   AccelerometerUncalibrated.csv  x,y,z in g with gravity   -> motion ax,ay,az (m/s², ×9.80665)
 *   Gyroscope.csv                  x,y,z in rad/s            -> motion rx,ry,rz (deg/s)
 *   Orientation.csv                qx,qy,qz,qw               -> heading alpha,beta,gamma (deg)
 *   Location.csv                   latitude,longitude,horizontalAccuracy -> gps (absent when GPS was off)
 *   Barometer.csv                  relativeAltitude (m)      -> baro
 *   Pedometer.csv                  steps (cumulative)        -> steps
 *   Metadata.csv                   recording epoch time (ms), device name
 * The calibrated Accelerometer.csv is not used: it is not the raw reading
 * (its magnitude is ~2 m/s² while walking, not ~9.8). Annotation.csv has no
 * rows in any recording seen so far, so marks stay empty (the script warns if
 * a file has rows).
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseRecording, type Recording } from "../src/features/recorder/format";

const G = 9.80665;
const RAD = 180 / Math.PI;

type Table = { header: string[]; rows: number[][]; raw: string[][] };

/** Reads a Sensor Logger CSV: a header line, then plain comma-separated values with no quoting. */
export function readCsv(text: string): Table {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  const header = (lines.shift() ?? "").split(",");
  const raw = lines.map((l) => l.split(","));
  return { header, raw, rows: raw.map((r) => r.map(Number)) };
}

function column(t: Table, name: string, file: string): number {
  const i = t.header.indexOf(name);
  if (i < 0) throw new Error(`${file}: expected a column named "${name}", found: ${t.header.join(", ")}`);
  return i;
}

const nsToMs = (ns: number): number => Math.round(ns / 1e6);
const r = (x: number, places: number): number => {
  const k = 10 ** places;
  return Math.round(x * k) / k + 0; // + 0 turns -0 into 0
};

/**
 * Orientation quaternion → the browser's alpha/beta/gamma (Z-X'-Y'' angles in degrees,
 * alpha 0..360, beta -180..180, gamma -90..90). The reference frame is whatever the phone
 * picked when recording began, so alpha is not tied to magnetic north.
 */
export function quatToAlphaBetaGamma(x: number, y: number, z: number, w: number): [number, number, number] {
  const r01 = 2 * (x * y - z * w);
  const r11 = 1 - 2 * (x * x + z * z);
  const r20 = 2 * (x * z - y * w);
  const r21 = 2 * (y * z + x * w);
  const r22 = 1 - 2 * (x * x + y * y);
  let alpha = Math.atan2(-r01, r11) * RAD;
  let beta = Math.asin(Math.max(-1, Math.min(1, r21))) * RAD;
  let gamma = Math.atan2(-r20, r22) * RAD;
  if (gamma > 90 || gamma < -90) {
    // The same pose has a second solution; the browser reports the one with gamma in -90..90.
    beta = beta >= 0 ? 180 - beta : -180 - beta;
    gamma = gamma > 0 ? gamma - 180 : gamma + 180;
    alpha += 180;
  }
  alpha = ((alpha % 360) + 360) % 360;
  return [alpha, beta, gamma];
}

export interface Options {
  station?: string;
}

/** `files` maps a CSV file name (e.g. "Gyroscope.csv") to its text. Missing optional files give empty lists. */
export function convert(files: Record<string, string>, opts: Options = {}): { recording: Recording; warnings: string[] } {
  const warnings: string[] = [];
  const need = (name: string): Table => {
    const text = files[name];
    if (text === undefined) throw new Error(`${name} is missing from the export.`);
    return readCsv(text);
  };
  const opt = (name: string): Table | undefined => (files[name] === undefined ? undefined : readCsv(files[name]));

  const meta = need("Metadata.csv");
  const mi = (n: string) => column(meta, n, "Metadata.csv");
  const startedAt = meta.rows[0]?.[mi("recording epoch time")];
  const device = meta.raw[0]?.[mi("device name")];
  if (!Number.isFinite(startedAt) || !device) throw new Error("Metadata.csv has no recording epoch time or device name.");

  // Motion: gyroscope sets the timeline; gravity-inclusive acceleration is matched to the nearest time.
  const gyro = need("Gyroscope.csv");
  const acc = need("AccelerometerUncalibrated.csv");
  const [gt, gx, gy, gz] = ["time", "x", "y", "z"].map((n) => column(gyro, n, "Gyroscope.csv"));
  const [at, ax, ay, az] = ["time", "x", "y", "z"].map((n) => column(acc, n, "AccelerometerUncalibrated.csv"));
  const motion: Recording["motion"] = [];
  let j = 0;
  let unmatched = 0;
  for (const g of gyro.rows) {
    while (j + 1 < acc.rows.length && Math.abs(acc.rows[j + 1][at] - g[gt]) <= Math.abs(acc.rows[j][at] - g[gt])) j++;
    const a = acc.rows[j];
    if (!a || Math.abs(a[at] - g[gt]) > 20e6) {
      unmatched++;
      continue;
    }
    motion.push([nsToMs(g[gt]), r(a[ax] * G, 3), r(a[ay] * G, 3), r(a[az] * G, 3), r(g[gx] * RAD, 3), r(g[gy] * RAD, 3), r(g[gz] * RAD, 3)]);
  }
  if (unmatched) warnings.push(`${unmatched} gyroscope rows had no acceleration reading within 20 ms and were dropped.`);

  const ori = need("Orientation.csv");
  const [ot, qx, qy, qz, qw] = ["time", "qx", "qy", "qz", "qw"].map((n) => column(ori, n, "Orientation.csv"));
  const heading: Recording["heading"] = ori.rows.map((o) => {
    const [al, be, ga] = quatToAlphaBetaGamma(o[qx], o[qy], o[qz], o[qw]);
    return [nsToMs(o[ot]), r(al, 2), r(be, 2), r(ga, 2)];
  });

  const loc = opt("Location.csv");
  let gps: Recording["gps"] = [];
  if (loc) {
    const [t, la, lo, ac] = ["time", "latitude", "longitude", "horizontalAccuracy"].map((n) => column(loc, n, "Location.csv"));
    gps = loc.rows.map((x) => [nsToMs(x[t]), x[la], x[lo], r(x[ac], 1)]);
  } else {
    warnings.push("No Location.csv: GPS was off, so gps is empty.");
  }

  const bar = opt("Barometer.csv");
  let baro: Recording["baro"] = [];
  if (bar) {
    const [t, h] = ["time", "relativeAltitude"].map((n) => column(bar, n, "Barometer.csv"));
    baro = bar.rows.map((x) => [nsToMs(x[t]), r(x[h], 3)]);
  }

  const ped = opt("Pedometer.csv");
  let steps: Recording["steps"] = [];
  if (ped) {
    const [t, s] = ["time", "steps"].map((n) => column(ped, n, "Pedometer.csv"));
    steps = ped.rows.map((x) => [nsToMs(x[t]), x[s]]);
  }

  const ann = opt("Annotation.csv");
  if (ann && ann.rows.length) warnings.push(`Annotation.csv has ${ann.rows.length} rows; annotations are not converted to marks.`);

  const recording: Recording = { v: 1, ...(opts.station ? { station: opts.station } : {}), startedAt, device, motion, heading, gps, baro, steps, marks: [] };
  const check = parseRecording(recording);
  if (!check.ok) throw new Error(`The converted recording failed validation:\n- ${check.errors.join("\n- ")}`);
  return { recording, warnings };
}

const NAMES = ["Metadata", "Gyroscope", "AccelerometerUncalibrated", "Orientation", "Location", "Barometer", "Pedometer", "Annotation"].map((n) => `${n}.csv`);

function readExport(input: string): { files: Record<string, string>; cleanup: () => void } {
  let dir = input;
  let tmp: string | undefined;
  if (statSync(input).isFile()) {
    tmp = mkdtempSync(join(tmpdir(), "sensor-logger-"));
    execFileSync("unzip", ["-q", "-o", input, ...NAMES, "-d", tmp], { stdio: ["ignore", "ignore", "ignore"] });
    dir = tmp;
  }
  const files: Record<string, string> = {};
  for (const n of NAMES) if (existsSync(join(dir, n))) files[n] = readFileSync(join(dir, n), "utf8");
  return { files, cleanup: () => tmp && rmSync(tmp, { recursive: true, force: true }) };
}

function span(rows: readonly (readonly number[])[]): string {
  if (!rows.length) return "empty";
  return `${rows.length} rows, ${new Date(rows[0][0]).toISOString()} to ${new Date(rows[rows.length - 1][0]).toISOString()}`;
}

function main(argv: string[]): void {
  const si = argv.indexOf("--station");
  const station = si >= 0 ? argv[si + 1] : undefined;
  const [input, output] = argv.filter((a, i) => !a.startsWith("--") && (si < 0 || i !== si + 1));
  if (!input || !output) {
    console.error('Usage: pnpm walk:from-sensor-logger <export folder or .zip> <out.json> [--station "Fulton St"]');
    process.exit(2);
  }
  const { files, cleanup } = readExport(input);
  try {
    const { recording, warnings } = convert(files, { station });
    writeFileSync(output, JSON.stringify(recording));
    for (const w of warnings) console.warn(`warning: ${w}`);
    console.log(`${output}: ${recording.device}, started ${new Date(recording.startedAt).toISOString()}`);
    for (const k of ["motion", "heading", "gps", "baro", "steps"] as const) console.log(`  ${k}: ${span(recording[k])}`);
  } finally {
    cleanup();
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) main(process.argv.slice(2));
