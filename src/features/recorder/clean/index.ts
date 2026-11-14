/**
 * Cleaning a recorded station walk (src/features/recorder/format.ts) into a
 * path on the map, in four pure steps:
 *
 * 1. deadReckon: steps plus heading make a raw path (metres, the phone's own frame).
 * 2. pinPath: the raw path is pinned to fixed points (good location fixes and
 *    known checkpoints such as an elevator found in the barometer).
 * 3. snapToLine: inside the station it is snapped to the walk line, unless it is far off it.
 * 4. findRides / levelSpans: the barometer gives the rides and the level at each moment.
 */
import type { Recording } from "../format";
import { deadReckon, STEP_M } from "./deadReckon";
import type { LonLat, Timed } from "./geo";
import { findRides, levelAt, levelSpans, type Ride, type Span } from "./levels";
import { chooseFixes, gpsFixes, pinPath, placeRaw, type Fix } from "./pin";
import { snapToLine, type Snapped } from "./snap";

export { deadReckon, headingAt, STEP_M } from "./deadReckon";
export { distM, pathAt, toLonLat, toXY, type LonLat, type Timed, type XY } from "./geo";
export { findRides, levelAt, levelSpans, type Ride, type Span } from "./levels";
export { chooseFixes, gpsFixes, pinPath, placeRaw, type Fix } from "./pin";
export { snapToLine, type SnapOptions, type Snapped } from "./snap";

export interface CleanOptions {
  /** Levels in the order walked, one more than the rides expected. */
  levels: readonly string[];
  /** For each ride found, where it starts and ends on the map (an elevator's place on each level). */
  rideAt: readonly { from: LonLat; to: LonLat }[];
  /** The station's walk line, in walking order, and the times inside which the path is snapped to it. */
  line: readonly LonLat[];
  /** The level of each line point (the stretch that starts there). */
  lineLevels?: readonly string[];
  snapFrom: number;
  snapTo: number;
  maxAccuracyM?: number;
}

export interface Cleaned {
  raw: Timed<LonLat>[];
  pinned: Timed<LonLat>[];
  clean: Snapped[];
  fixes: Fix[];
  rides: Ride[];
  spans: Span[] | null;
  /** What the data could not support, in plain words; empty when every step ran. */
  gaps: string[];
}

export function cleanWalk(rec: Recording, opts: CleanOptions): Cleaned {
  const gaps: string[] = [];
  const rides = findRides(rec.baro);
  const spans = levelSpans(rec.baro, rides, opts.levels);
  if (!spans) gaps.push(`The barometer shows ${rides.length} rides where ${opts.levels.length - 1} were expected, so the levels are not drawn.`);
  const checkpoints: Fix[] = spans
    ? rides.flatMap((r, k) => (opts.rideAt[k] ? [
      { t: r.t0, at: opts.rideAt[k].from, accuracyM: 5, source: "checkpoint" as const },
      { t: r.t1, at: opts.rideAt[k].to, accuracyM: 5, source: "checkpoint" as const },
    ] : []))
    : [];
  const gps = gpsFixes(rec.gps, opts.maxAccuracyM);
  if (!rec.gps.length) gaps.push("No location fixes in this recording.");
  const fixes = chooseFixes([...checkpoints, ...gps]);
  const steps = deadReckon(rec.steps, rec.heading, STEP_M);
  if (!rec.heading.length) gaps.push("No heading in this recording, so there is no raw path from steps and turns.");
  if (!steps.length || !fixes.length) {
    if (!fixes.length) gaps.push("No fixed points to pin the path to.");
    return { raw: [], pinned: [], clean: [], fixes, rides, spans, gaps };
  }
  const origin = fixes[0].at;
  const raw = placeRaw(steps, fixes, origin);
  const pinned = pinPath(steps, fixes, origin);
  const clean = snapToLine(pinned, opts.line, {
    from: opts.snapFrom,
    to: opts.snapTo,
    ...(spans && opts.lineLevels ? { lineLevels: opts.lineLevels, levelAt: (t: number) => levelAt(spans, t) } : {}),
  });
  return { raw, pinned, clean, fixes, rides, spans, gaps };
}
