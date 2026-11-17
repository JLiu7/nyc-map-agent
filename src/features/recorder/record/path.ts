/**
 * The path drawn on the review screen (#185, step 5). The cleaning code in
 * ../clean builds a path from the step counter and pins it to location fixes.
 * A browser has no step counter, so a recording made on this page has only
 * the fixes: the ones good enough to pin to, joined in the order they came.
 *
 * A walk through a street with tall buildings gives a phone some fixes it is
 * unsure of and some it is sure of. The unsure ones are left out and the sure
 * ones are drawn (#223); only a recording with no sure fix at all has no path.
 */
import type { Recording } from "../format";
import { distM, gpsFixes, toXY, type XY } from "../clean";

/** How far off a location fix may be and still be drawn, metres. */
const PATH_MAX_ACCURACY_M = 30;

export interface WalkPath {
  /** Metres east and north of the first fix, in time order. Empty when there is nothing to draw. */
  points: XY[];
  lengthM: number;
  /** Why there is no path, in plain words; null when there is one. */
  why: string | null;
  /** The fixes left out because they were too rough, and how many the phone gave in all. */
  rough: number;
  fixes: number;
}

/** "3 of 14 fixes were too rough to use", or nothing when every fix was used. */
export function roughNote(p: WalkPath): string | null {
  if (!p.rough) return null;
  return `${p.rough} of ${p.fixes} ${p.fixes === 1 ? "fix was" : "fixes were"} too rough to use.`;
}

export function walkPath(rec: Recording): WalkPath {
  const fixes = gpsFixes(rec.gps, PATH_MAX_ACCURACY_M).sort((a, b) => a.t - b.t);
  const counts = { rough: rec.gps.length - fixes.length, fixes: rec.gps.length };
  const places = fixes.map((f) => f.at).filter((p, i, all) => i === 0 || distM(all[i - 1], p) >= 0.5);
  if (places.length < 2) {
    const why = !rec.gps.length ? "No location in this recording, so there is no path to draw."
      : !fixes.length ? "The location was too rough to draw a path."
        : "The location did not move, so there is no path to draw.";
    return { points: [], lengthM: 0, why, ...counts };
  }
  let lengthM = 0;
  for (let i = 1; i < places.length; i++) lengthM += distM(places[i - 1], places[i]);
  return { points: places.map((p) => toXY(places[0], p)), lengthM, why: null, ...counts };
}

/** The points as an SVG polyline inside a w by h box with a margin, north up, one scale both ways. */
export function fitPath(points: readonly XY[], w: number, h: number, margin: number): XY[] {
  if (!points.length) return [];
  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const k = Math.min((w - 2 * margin) / Math.max(x1 - x0, 1e-6), (h - 2 * margin) / Math.max(y1 - y0, 1e-6));
  const ox = (w - (x1 - x0) * k) / 2, oy = (h - (y1 - y0) * k) / 2;
  return points.map((p) => [Math.round((ox + (p[0] - x0) * k) * 10) / 10, Math.round((h - oy - (p[1] - y0) * k) * 10) / 10]);
}
