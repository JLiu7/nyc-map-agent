import type { HeadingRow, MotionRow, StepRow } from "../format";

/** Mean of v over the rows within `halfMs` either side of each row, by time. Rows are sorted by time. */
function movingMean(t: readonly number[], v: readonly number[], halfMs: number): number[] {
  const sum = [0];
  for (const x of v) sum.push(sum[sum.length - 1] + x);
  const out: number[] = [];
  let lo = 0, hi = 0;
  for (let i = 0; i < t.length; i++) {
    while (t[lo] < t[i] - halfMs) lo++;
    while (hi < t.length && t[hi] <= t[i] + halfMs) hi++;
    out.push((sum[hi] - sum[lo]) / (hi - lo));
  }
  return out;
}

/**
 * Steps counted from the accelerometer, for a recording with no step counter
 * (Sensor Logger on some iPhones writes no Pedometer.csv). Each step is a
 * bounce in the size of the acceleration: the slow part (gravity, a lift
 * starting) is taken off, the jitter smoothed, and a peak counts when it rises
 * `minRise` m/s² and comes at least `minGapMs` after the last one. The size is
 * used, not the direction, so the sign of gravity does not matter. Rows are
 * [t, count] like the step counter's: one at the first motion row with 0, then
 * one per step.
 */
export function stepsFromMotion(motion: readonly MotionRow[], { minRise = 0.6, minGapMs = 300 } = {}): StepRow[] {
  if (motion.length < 3) return [];
  const t = motion.map((m) => m[0]);
  const size = motion.map((m) => Math.hypot(m[1], m[2], m[3]));
  const slow = movingMean(t, size, 500);
  const s = movingMean(t, size.map((x, i) => x - slow[i]), 60);
  const peaks: number[] = [];
  for (let i = 1; i < s.length - 1; i++) {
    if (s[i] < minRise || s[i] < s[i - 1] || s[i] <= s[i + 1]) continue;
    const last = peaks[peaks.length - 1];
    if (last !== undefined && t[i] - t[last] < minGapMs) {
      if (s[i] > s[last]) peaks[peaks.length - 1] = i;
      continue;
    }
    peaks.push(i);
  }
  return [[t[0], 0], ...peaks.map((i, k): StepRow => [t[i], k + 1])];
}

/** Which way is up, in the phone's own axes, from the browser's beta and gamma (degrees). */
function upInPhone(beta: number, gamma: number): [number, number, number] {
  const b = (beta * Math.PI) / 180, g = (gamma * Math.PI) / 180;
  return [-Math.cos(b) * Math.sin(g), Math.sin(b), Math.cos(b) * Math.cos(g)];
}

/**
 * The heading rows with alpha counted from the gyroscope instead of the
 * phone's own orientation. An iPhone corrects its orientation towards north
 * once it trusts the compass, often on the way up to the street, and alpha
 * then swings by 100 degrees or more while the walker goes straight. The
 * gyroscope only measures turning, so it has no such jump.
 *
 * The turn rate about the vertical is the rotation rate along "up", and up
 * comes from the rows' own beta and gamma (the tilt, which the correction does
 * not touch). Alpha starts where the phone's own did, so the frame is the same
 * at the start; after that only the gyroscope moves it. A gap of more than half
 * a second in the motion adds no turn. Without motion the rows come back as
 * they are.
 */
export function steadyHeading(motion: readonly MotionRow[], heading: readonly HeadingRow[]): HeadingRow[] {
  if (motion.length < 2 || !heading.length) return heading.map((h) => [...h] as HeadingRow);
  const turned = [0]; // degrees anticlockwise since the first motion row
  let j = 0;
  for (let i = 1; i < motion.length; i++) {
    const [t0, , , , ax, ay, az] = motion[i - 1];
    const [t1, , , , bx, by, bz] = motion[i];
    const dt = (t1 - t0) / 1000;
    let turn = 0;
    if (dt > 0 && dt <= 0.5) {
      while (j + 1 < heading.length && Math.abs(heading[j + 1][0] - t1) <= Math.abs(heading[j][0] - t1)) j++;
      const up = upInPhone(heading[j][2], heading[j][3]);
      turn = (((ax + bx) / 2) * up[0] + ((ay + by) / 2) * up[1] + ((az + bz) / 2) * up[2]) * dt;
    }
    turned.push(turned[i - 1] + turn);
  }
  const at = (t: number): number => {
    if (t <= motion[0][0]) return 0;
    if (t >= motion[motion.length - 1][0]) return turned[turned.length - 1];
    let lo = 0, hi = motion.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (motion[mid][0] <= t) lo = mid; else hi = mid;
    }
    const u = (t - motion[lo][0]) / (motion[hi][0] - motion[lo][0] || 1);
    return turned[lo] + (turned[hi] - turned[lo]) * u;
  };
  const ref = heading.find((h) => h[0] >= motion[0][0]) ?? heading[0];
  const base = ref[1] - at(ref[0]);
  return heading.map(([t, , beta, gamma]): HeadingRow => [t, (((base + at(t)) % 360) + 360) % 360, beta, gamma]);
}
