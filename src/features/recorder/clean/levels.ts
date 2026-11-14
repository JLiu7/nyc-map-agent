import type { BaroRow } from "../format";

/** An elevator (or stairs) ride found in the barometer: a lasting change of height. */
export interface Ride { t0: number; t1: number; riseM: number }

export interface Span { t0: number; t1: number; level: string; heightM: number; lowM: number; highM: number }

const median = (xs: number[]) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const quantile = (xs: number[], q: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))];
};

/**
 * Rides in a barometer trace: a rise or drop of at least `minRiseM` within
 * `withinMs`, kept only when the height stays changed (the median of the half
 * minute after differs from the half minute before by at least `minRiseM`).
 * That keeps a passing train's pressure push from counting as a ride. A change
 * within the first or last half minute is not counted: there is nothing to compare.
 */
export function findRides(baro: readonly BaroRow[], { minRiseM = 1.5, withinMs = 30_000, holdMs = 30_000, flatM = 0.15 } = {}): Ride[] {
  const rides: Ride[] = [];
  const h = (i: number) => baro[i][1];
  const t = (i: number) => baro[i][0];
  const around = (from: number, to: number) => baro.filter((b) => b[0] >= from && b[0] <= to).map((b) => b[1]);
  let i = 0;
  while (i < baro.length) {
    let j = i + 1;
    while (j < baro.length && t(j) - t(i) <= withinMs && Math.abs(h(j) - h(i)) < minRiseM) j++;
    if (j >= baro.length || t(j) - t(i) > withinMs) { i++; continue; }
    const s = Math.sign(h(j) - h(i));
    let a = i;
    while (a < j && s * (h(a + 1) - h(a)) < flatM) a++;
    let b = j;
    while (b + 1 < baro.length && s * (h(b + 1) - h(b)) > flatM) b++;
    // Both sides need a settled half minute of readings; the first and last seconds of a recording do not count.
    const full = t(a) - holdMs >= t(0) && t(b) + holdMs <= t(baro.length - 1);
    const before = median(around(t(a) - holdMs, t(a)));
    const after = median(around(t(b), t(b) + holdMs));
    if (full && s * (after - before) >= minRiseM) {
      rides.push({ t0: t(a), t1: t(b), riseM: Math.round((after - before) * 100) / 100 });
      i = b + 1;
    } else i++;
  }
  return rides;
}

/**
 * The time on each level, from the rides between them. `names` are the levels
 * in the order walked (one more than the rides). Each span's height is the
 * median barometer reading on it, with the 10th to 90th percentile as its band.
 * Null when the rides found do not match the levels named: the caller says so.
 */
export function levelSpans(baro: readonly BaroRow[], rides: readonly Ride[], names: readonly string[]): Span[] | null {
  if (!baro.length || names.length !== rides.length + 1) return null;
  const edges = [baro[0][0], ...rides.flatMap((r) => [r.t0, r.t1]), baro[baro.length - 1][0]];
  return names.map((level, k) => {
    const t0 = edges[2 * k], t1 = edges[2 * k + 1];
    const hs = baro.filter((b) => b[0] >= t0 && b[0] <= t1).map((b) => b[1]);
    return { t0, t1, level, heightM: median(hs), lowM: quantile(hs, 0.1), highM: quantile(hs, 0.9) };
  });
}

/** The level at time t, or "ride" between two levels. */
export function levelAt(spans: readonly Span[], t: number): string {
  for (const s of spans) if (t >= s.t0 && t <= s.t1) return s.level;
  if (spans.length && t < spans[0].t0) return spans[0].level;
  if (spans.length && t > spans[spans.length - 1].t1) return spans[spans.length - 1].level;
  return "ride";
}
