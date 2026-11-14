/**
 * Friday's real walk at 14 St-Union Sq (2026-11-13, 5:04 to 5:17 pm), set up
 * for the replay: where the clock starts, how it maps onto the Walk Guide's
 * line, and the stills from the phone's own screen recording of Google Maps.
 */
import type { LonLat, Ride } from "../clean";
import type { StepRow } from "../format";
import baked from "./union-sq-line.json";

/** The replay clock's zero: the first second of the phone's screen recording (22:04:27 UTC). */
export const T0 = Date.UTC(2026, 10, 13, 22, 4, 27);
export const START_S = 10;
export const END_S = 790;

/**
 * The Walk Guide's line through the station, platform to street, corners
 * included, and the level of each point (the stretch that starts there is on
 * it). Baked from the walk guide by scripts/derive-union-sq-walk.ts.
 */
export const LINE = baked.line as LonLat[];
export const LINE_LEVELS: string[] = baked.lineLevels;

export const LEVELS = ["platform", "mezzanine", "street"] as const;
/** The two elevator rides, in order: EL219 (platform to mezzanine) and EL217 (mezzanine to 14 St & 4 Av). */
export const RIDE_AT = baked.rides as { from: LonLat; to: LonLat; name: string }[];

/**
 * Google Maps on the same phone, one still every 10 s (screen recording,
 * clock-aligned within a second). A frame showing the phone's wallet and two of
 * Control Center were left out; the still before holds instead. The banner
 * "No GPS signal · Approximate location" shows from the first frame until 10 s
 * after the street elevator.
 */
const SKIP = new Set([0, 530, 720, 730, 740]);
export const GOOGLE_STILLS: { s: number; src: string }[] = [];
for (let s = START_S; s <= END_S; s += 10) {
  if (SKIP.has(s)) continue;
  const name = `${String(Math.floor(s / 60)).padStart(2, "0")}m${String(s % 60).padStart(2, "0")}s`;
  GOOGLE_STILLS.push({ s, src: `/replay/union-sq-google-maps/at-${name}.jpg` });
}
export const GOOGLE_NO_GPS = { from: 0, to: 605 };

export function stillAt(s: number): { s: number; src: string } {
  let best = GOOGLE_STILLS[0];
  for (const g of GOOGLE_STILLS) if (g.s <= s) best = g;
  return best;
}

/** The walk's sensor rows (85 KB), fetched only when the replay opens so they stay out of the app's code. */
export const loadWalk = (): Promise<unknown> => fetch("/replay/union-sq-walk.json").then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json() as Promise<unknown>; });

/** A sign the rider meets, from the Walk Guide. */
export interface Sign { id: string; sign: string; say: string; photo: string; steps: number; at: LonLat }
export const SIGNS = baked.signs as Sign[];

/**
 * Where each sign starts in the film of the trip (public/walks/trip.mp4, from
 * its captions), and where the film's Union Sq part ends.
 */
const FILM_AT: Record<string, number> = {
  "us-platform": 55.0, "us-to-mezzanine": 64.2, "us-to-l": 68.7, "us-corridor": 75.5, "us-yellow": 80.9,
  "us-sw-turnstiles": 85.4, "us-downtown-sign": 90.9, "us-exit-arrow": 97.2, "us-mural-elevator": 104.0, "us-climate-clock": 108.5,
};
const FILM_END = 114.1;

/** The pedometer's cumulative count at replay second x, read between its rows. */
function countAt(steps: readonly StepRow[], x: number): number {
  const t = T0 + x * 1000;
  if (!steps.length) return 0;
  if (t <= steps[0][0]) return steps[0][1];
  for (let i = 1; i < steps.length; i++) {
    const [t0, c0] = steps[i - 1], [t1, c1] = steps[i];
    if (t <= t1) return c0 + ((c1 - c0) * (t - t0)) / Math.max(1, t1 - t0);
  }
  return steps[steps.length - 1][1];
}

/** The replay second when the cumulative count first reaches n (between a and b). */
function timeAtCount(steps: readonly StepRow[], n: number, a: number, b: number): number {
  let lo = a, hi = b;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (countAt(steps, mid) < n) lo = mid; else hi = mid;
  }
  return hi;
}

/**
 * When the rider reaches each sign, in replay seconds. The elevator signs are
 * the barometer's rides; the mezzanine signs in between are placed by the
 * pedometer, at the share of the steps the Walk Guide counts between them.
 */
export function signTimes(steps: readonly StepRow[], rides: readonly Ride[]): number[] {
  const r1 = rides[0], r2 = rides[1];
  const a1 = r1 ? (r1.t0 - T0) / 1000 : 278, b1 = r1 ? (r1.t1 - T0) / 1000 : 286;
  const a2 = r2 ? (r2.t0 - T0) / 1000 : 577, b2 = r2 ? (r2.t1 - T0) / 1000 : 586;
  const k1 = SIGNS.findIndex((x) => x.id === "us-to-l"), k2 = SIGNS.findIndex((x) => x.id === "us-mural-elevator");
  const total = SIGNS.slice(k1, k2).reduce((n, x) => n + x.steps, 0) || 1;
  const c0 = countAt(steps, b1), walked = countAt(steps, a2) - c0;
  return SIGNS.map((x, k) => {
    if (k === 0) return START_S;
    if (x.id === "us-to-mezzanine") return a1;
    if (k === k1) return b1;
    if (k === k2) return a2;
    if (x.id === "us-climate-clock") return b2;
    if (k > k1 && k < k2) {
      const before = SIGNS.slice(k1, k).reduce((n, y) => n + y.steps, 0);
      return walked > 0 ? timeAtCount(steps, c0 + (before / total) * walked, b1, a2) : b1 + ((a2 - b1) * before) / total;
    }
    return START_S;
  });
}

/** The sign the rider last passed at replay second s. */
export function signAt(times: readonly number[], s: number): number {
  let k = 0;
  for (let i = 0; i < times.length; i++) if (times[i] <= s) k = i;
  return k;
}

/** The film's time at replay second s, and how fast the film runs there per replay second. */
export function filmAt(times: readonly number[], s: number): { at: number; rate: number } {
  const pts = SIGNS.map((x, k) => [times[k], FILM_AT[x.id] ?? 0] as const).concat([[END_S, FILM_END]]);
  for (let i = 0; i < pts.length - 1; i++) {
    const [s0, f0] = pts[i], [s1, f1] = pts[i + 1];
    if (s <= s1 || i === pts.length - 2) {
      const rate = s1 > s0 ? (f1 - f0) / (s1 - s0) : 0;
      const at = f0 + rate * Math.max(0, Math.min(s1, s) - s0);
      return { at, rate };
    }
  }
  return { at: FILM_END, rate: 0 };
}
