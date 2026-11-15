import { toLonLat, toXY, type LonLat, type Timed, type XY } from "./geo";

export interface Snapped extends Timed<LonLat> { snapped: boolean }

/**
 * Snaps a path onto the station's walk line (the route's checkpoints and
 * corners, in walking order). A point within `maxM` of the line moves onto it;
 * one further away stays where it was, so a real detour (a wrong exit) still
 * shows. The walker only goes forward along the line: a point may not snap
 * more than `backM` behind the last place it snapped to. Only points between
 * `from` and `to` (times) are snapped; the rest pass through. With levels
 * given, a point snaps only to the stretch of line on its own level, so a
 * platform under a mezzanine is not mistaken for it.
 */
export interface SnapOptions {
  maxM?: number;
  backM?: number;
  from?: number;
  to?: number;
  /** The level of each stretch of the line (one per line point, the stretch that starts there) and the walker's level at a time: a point only snaps to its own level. */
  lineLevels?: readonly string[];
  levelAt?: (t: number) => string;
}

export function snapToLine(path: readonly Timed<LonLat>[], line: readonly LonLat[], { maxM = 20, backM = 8, from = -Infinity, to = Infinity, lineLevels, levelAt }: SnapOptions = {}): Snapped[] {
  if (line.length < 2) return path.map((p) => ({ ...p, snapped: false }));
  const o = line[0];
  const L = line.map((p) => toXY(o, p));
  const cum = [0];
  for (let i = 1; i < L.length; i++) cum.push(cum[i - 1] + Math.hypot(L[i][0] - L[i - 1][0], L[i][1] - L[i - 1][1]));
  let along = -Infinity;
  return path.map((p) => {
    if (p.t < from || p.t > to) return { ...p, snapped: false };
    const q = toXY(o, p.at);
    const level = lineLevels && levelAt ? levelAt(p.t) : null;
    let best: { d: number; s: number; xy: XY } | null = null;
    for (let i = 0; i < L.length - 1; i++) {
      const a = L[i], b = L[i + 1];
      const ab: XY = [b[0] - a[0], b[1] - a[1]];
      const l2 = ab[0] * ab[0] + ab[1] * ab[1];
      const u = l2 ? Math.max(0, Math.min(1, ((q[0] - a[0]) * ab[0] + (q[1] - a[1]) * ab[1]) / l2)) : 0;
      const xy: XY = [a[0] + ab[0] * u, a[1] + ab[1] * u];
      const s = cum[i] + Math.sqrt(l2) * u;
      if (s < along - backM) continue;
      if (level !== null && lineLevels?.[i] !== level) continue;
      const d = Math.hypot(q[0] - xy[0], q[1] - xy[1]);
      if (!best || d < best.d) best = { d, s, xy };
    }
    if (!best || best.d > maxM) return { ...p, snapped: false };
    along = Math.max(along, best.s);
    return { t: p.t, at: toLonLat(o, best.xy), snapped: true };
  });
}
