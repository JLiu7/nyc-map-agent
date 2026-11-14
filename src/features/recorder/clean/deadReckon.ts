import type { HeadingRow, StepRow } from "../format";
import { lastAtOrBefore, type Timed, type XY } from "./geo";

/** A typical adult step, metres. The pin step rescales each stretch to the fixed points anyway. */
export const STEP_M = 0.7;

/**
 * Which way the phone points, compass-style (clockwise degrees), in the
 * recording's own frame. The browser's alpha turns the other way, so this is
 * 360 − alpha. That frame is wherever the phone pointed when it started, not
 * north, and the phone may be held sideways: only the turns are trusted here.
 * Null when there is no heading within two seconds.
 */
export function headingAt(heading: readonly HeadingRow[], t: number): number | null {
  const i = lastAtOrBefore(heading, t);
  const near = [heading[i], heading[i + 1]].filter((h): h is HeadingRow => !!h && Math.abs(h[0] - t) <= 2000);
  if (!near.length) return null;
  const h = near.reduce((a, b) => (Math.abs(a[0] - t) <= Math.abs(b[0] - t) ? a : b));
  return (360 - h[1]) % 360;
}

/**
 * Dead reckoning: a raw path from the step counter and the heading alone,
 * metres from where the counting starts, one point per step. Steps counted
 * between two pedometer rows are spread evenly over that time. A step with no
 * heading near it is skipped (counted as not moving), never guessed.
 */
export function deadReckon(steps: readonly StepRow[], heading: readonly HeadingRow[], stepM = STEP_M): Timed<XY>[] {
  if (!steps.length) return [];
  let x = 0, y = 0;
  const out: Timed<XY>[] = [{ t: steps[0][0], at: [0, 0] }];
  for (let i = 1; i < steps.length; i++) {
    const [t0, c0] = steps[i - 1];
    const [t1, c1] = steps[i];
    const n = c1 - c0;
    if (n <= 0) { out.push({ t: t1, at: [x, y] }); continue; }
    for (let k = 1; k <= n; k++) {
      const t = t0 + ((t1 - t0) * k) / n;
      const h = headingAt(heading, t);
      if (h !== null) {
        const r = (h * Math.PI) / 180;
        x += Math.sin(r) * stepM;
        y += Math.cos(r) * stepM;
      }
      out.push({ t, at: [x, y] });
    }
  }
  return out;
}
