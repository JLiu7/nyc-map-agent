import type { GpsRow } from "../format";
import { pathAt, toLonLat, toXY, type LonLat, type Timed, type XY } from "./geo";

/** A place the walker is known to have been at a time: a location fix, or a checkpoint such as an elevator. */
export interface Fix { t: number; at: LonLat; accuracyM: number; source: "gps" | "checkpoint" }

/** Location fixes good enough to pin to (the phone's own accuracy estimate, metres). */
export function gpsFixes(gps: readonly GpsRow[], maxAccuracyM = 20): Fix[] {
  return gps.filter((g) => g[3] > 0 && g[3] <= maxAccuracyM).map((g) => ({ t: g[0], at: [g[2], g[1]], accuracyM: g[3], source: "gps" }));
}

/**
 * The fixes to pin to, in time order. Checkpoints always stay; a location fix
 * is dropped when it comes within `minGapMs` of one already kept, so a cloud
 * of nearby fixes cannot fold the path into knots.
 */
export function chooseFixes(fixes: readonly Fix[], minGapMs = 20_000): Fix[] {
  const kept = fixes.filter((f) => f.source === "checkpoint");
  const gps = fixes.filter((f) => f.source === "gps").sort((a, b) => a.accuracyM - b.accuracyM || a.t - b.t);
  for (const f of gps) if (kept.every((k) => Math.abs(k.t - f.t) >= minGapMs)) kept.push(f);
  return kept.sort((a, b) => a.t - b.t);
}

const sub = (a: XY, b: XY): XY => [a[0] - b[0], a[1] - b[1]];
const add = (a: XY, b: XY): XY => [a[0] + b[0], a[1] + b[1]];
/** Complex multiplication: turn and stretch v by z. */
const mul = (z: XY, v: XY): XY => [z[0] * v[0] - z[1] * v[1], z[0] * v[1] + z[1] * v[0]];
const div = (a: XY, b: XY): XY => {
  const d = b[0] * b[0] + b[1] * b[1];
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
};
const len = (v: XY) => Math.hypot(v[0], v[1]);

/**
 * Pins a raw path to fixed points. Between two fixes the raw stretch is turned
 * and stretched so it starts on the first and ends on the second (the turns
 * and the shape in between come from the steps). When either stretch is too
 * short to give a direction, or the stretch would be wild, the gap is closed by
 * sliding instead. Before the first fix and after the last, the path is moved,
 * not turned. Returns places, one per raw point and one per fix.
 */
export function pinPath(raw: readonly Timed<XY>[], fixes: readonly Fix[], origin: LonLat, { minM = 3, maxStretch = 4 } = {}): Timed<LonLat>[] {
  if (!raw.length) return [];
  if (!fixes.length) return raw.map((p) => ({ t: p.t, at: toLonLat(origin, p.at) }));
  const F = fixes.map((f) => ({ t: f.t, xy: toXY(origin, f.at) }));
  const R = F.map((f) => pathAt(raw, f.t));
  const times = [...new Set([...raw.map((p) => p.t), ...F.map((f) => f.t)])].sort((a, b) => a - b);
  return times.map((t) => {
    const p = pathAt(raw, t);
    let k = -1;
    while (k + 1 < F.length && F[k + 1].t <= t) k++;
    let q: XY;
    if (k < 0) q = add(p, sub(F[0].xy, R[0]));
    else if (k >= F.length - 1) q = add(p, sub(F[F.length - 1].xy, R[F.length - 1]));
    else {
      const d = sub(R[k + 1], R[k]);
      const D = sub(F[k + 1].xy, F[k].xy);
      const stretch = len(d) > 0 ? len(D) / len(d) : Infinity;
      if (len(d) >= minM && len(D) >= minM && stretch <= maxStretch && stretch >= 1 / maxStretch) {
        q = add(F[k].xy, mul(div(D, d), sub(p, R[k])));
      } else {
        const u = F[k + 1].t === F[k].t ? 1 : (t - F[k].t) / (F[k + 1].t - F[k].t);
        const o0 = sub(F[k].xy, R[k]), o1 = sub(F[k + 1].xy, R[k + 1]);
        q = add(p, [o0[0] + (o1[0] - o0[0]) * u, o0[1] + (o1[1] - o0[1]) * u]);
      }
    }
    return { t, at: toLonLat(origin, q) };
  });
}

/**
 * The raw path put on the map for comparison: started at the first fix and
 * turned once, by the single angle that best lines it up with the fixes, so
 * the room sees the steps and turns as measured, drift and all.
 */
export function placeRaw(raw: readonly Timed<XY>[], fixes: readonly Fix[], origin: LonLat): Timed<LonLat>[] {
  if (!raw.length || !fixes.length) return raw.map((p) => ({ t: p.t, at: toLonLat(origin, p.at) }));
  const f0 = toXY(origin, fixes[0].at);
  const r0 = pathAt(raw, fixes[0].t);
  let dot = 0, cross = 0;
  for (const f of fixes.slice(1)) {
    const a = sub(pathAt(raw, f.t), r0), b = sub(toXY(origin, f.at), f0);
    dot += a[0] * b[0] + a[1] * b[1];
    cross += a[0] * b[1] - a[1] * b[0];
  }
  const th = Math.atan2(cross, dot);
  const z: XY = [Math.cos(th), Math.sin(th)];
  return raw.map((p) => ({ t: p.t, at: toLonLat(origin, add(f0, mul(z, sub(p.at, r0)))) }));
}
