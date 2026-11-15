/** Flat-earth helpers for a walk a few hundred metres long: metres east and north of an origin. */
export type LonLat = [lon: number, lat: number];
export type XY = [x: number, y: number];

const M_PER_DEG_LAT = 110_540;
const mPerDegLon = (lat: number) => 111_320 * Math.cos((lat * Math.PI) / 180);

export function toXY(origin: LonLat, p: LonLat): XY {
  return [(p[0] - origin[0]) * mPerDegLon(origin[1]), (p[1] - origin[1]) * M_PER_DEG_LAT];
}

export function toLonLat(origin: LonLat, xy: XY): LonLat {
  return [origin[0] + xy[0] / mPerDegLon(origin[1]), origin[1] + xy[1] / M_PER_DEG_LAT];
}

export const distM = (a: LonLat, b: LonLat): number => Math.hypot(...toXY(a, b));

/** Index of the last row whose time is at or before t (-1 when t is before them all). Rows are sorted by time. */
export function lastAtOrBefore(rows: readonly (readonly number[] | { t: number })[], t: number): number {
  const time = (i: number) => {
    const r = rows[i];
    return Array.isArray(r) ? (r as readonly number[])[0] : (r as { t: number }).t;
  };
  let lo = 0, hi = rows.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (time(mid) <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

/** A timed point. */
export interface Timed<P> { t: number; at: P }

/** Where a timed path is at time t, by straight lines between its points; held at either end. */
export function pathAt<P extends XY | LonLat>(path: readonly Timed<P>[], t: number): P {
  if (!path.length) throw new Error("empty path");
  const i = lastAtOrBefore(path, t);
  if (i < 0) return path[0].at;
  if (i >= path.length - 1) return path[path.length - 1].at;
  const a = path[i], b = path[i + 1];
  const u = b.t === a.t ? 1 : (t - a.t) / (b.t - a.t);
  return [a.at[0] + (b.at[0] - a.at[0]) * u, a.at[1] + (b.at[1] - a.at[1]) * u] as P;
}
