import { bearing, type Segment } from "./flythrough";
import type { LngLatTuple } from "./schema";

/** How far up the road the bus first shows, metres from the stop. */
const APPROACH_M = 160;
/** The rider waits this far from the kerb side of the bus's path, metres. */
const KERB_M = 3.5;
/** Share of the wait the bus spends pulling in; it then stands at the stop. */
const PULL_IN = 0.6;
/** The rider walks to the door over this part of the wait, after the bus has stopped. */
const STEP_ON = [0.68, 0.9] as const;

const easeOut = (t: number) => 1 - (1 - t) * (1 - t);
function offset(at: LngLatTuple, deg: number, m: number): LngLatTuple {
  const r = (deg * Math.PI) / 180, k = 111_320;
  return [at[0] + (Math.sin(r) * m) / (k * Math.cos((at[1] * Math.PI) / 180)), at[1] + (Math.cos(r) * m) / k];
}

/** The way the bus leaves the stop, as a compass bearing. */
export function busHeading(seg: Segment): number {
  const [a] = seg.coords;
  const b = seg.coords.find((c) => Math.hypot(c[0] - a[0], c[1] - a[1]) > 2e-5) ?? seg.coords[seg.coords.length - 1];
  return bearing(a, b);
}

/**
 * At the stop, `wait` (0 to 1) through the bus leg's time there: the bus coming up the road and
 * slowing to the stop, the rider beside it on the kerb and then stepping to the door.
 */
export function boardingAt(seg: Segment, wait: number): { bus: LngLatTuple; rider: LngLatTuple; heading: number; aboard: boolean } {
  const stop = seg.coords[0];
  const heading = busHeading(seg);
  const pulled = easeOut(Math.min(1, wait / PULL_IN));
  const bus = offset(stop, heading, -APPROACH_M * (1 - pulled));
  const kerb = offset(stop, heading + 90, KERB_M);
  const step = Math.min(1, Math.max(0, (wait - STEP_ON[0]) / (STEP_ON[1] - STEP_ON[0])));
  const rider: LngLatTuple = [kerb[0] + (stop[0] - kerb[0]) * step, kerb[1] + (stop[1] - kerb[1]) * step];
  return { bus, rider, heading, aboard: step >= 1 };
}
