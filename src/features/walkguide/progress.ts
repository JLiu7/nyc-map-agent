import type { Checkpoint, WrongWay } from "./walks";

/**
 * Where a rider is on a filmed walk. Below the street there is no GPS and the
 * compass drifts, so the place is never worked out freely: it is a checkpoint
 * the rider confirmed (a sign they tapped or the camera read) plus the steps
 * the phone has counted since, laid along the line to the next checkpoint.
 * Every confirmed sign puts the dot back exactly, so drift never builds up.
 * Pure: no sensors, no DOM.
 */

export interface Place {
  /** Index of the last checkpoint confirmed. */
  i: number;
  /** Steps counted since it. */
  walked: number;
}

/** The dot's place: along the line from checkpoint `i` towards the next, as far as the steps go, never past it. */
export function placeAt(walk: readonly Checkpoint[], p: Place): [number, number] {
  const a = walk[p.i];
  const b = walk[p.i + 1];
  if (!a) return walk[walk.length - 1].at;
  if (!b || a.by || a.steps <= 0) return a.at;
  return along(legPath(walk, p.i), Math.max(0, Math.min(1, p.walked / a.steps))).at;
}

/** The line from checkpoint `i` to the next, through its corners. A lone point when the next is reached by elevator or train, or there is none. */
export function legPath(walk: readonly Checkpoint[], i: number): [number, number][] {
  const a = walk[i];
  const b = walk[i + 1];
  return !a ? [] : !b || a.by ? [a.at] : [a.at, ...(a.via ?? []), b.at];
}

const metres = (a: [number, number], b: [number, number]): number =>
  Math.hypot((b[0] - a[0]) * 111_320 * Math.cos((a[1] * Math.PI) / 180), (b[1] - a[1]) * 110_540);
/** Compass bearing from `a` to `b`, degrees clockwise from north. */
const bearing = (a: [number, number], b: [number, number]): number =>
  (Math.atan2((b[0] - a[0]) * Math.cos((a[1] * Math.PI) / 180), b[1] - a[1]) * 180 / Math.PI + 360) % 360;

/** The point a share `k` (0 to 1) of the way along a line, and the bearing of the stretch it is on. */
function along(line: [number, number][], k: number): { at: [number, number]; bearing: number | null } {
  if (line.length < 2) return { at: line[0], bearing: null };
  const lens = line.slice(1).map((p, j) => metres(line[j], p));
  let left = k * lens.reduce((s, x) => s + x, 0);
  for (let j = 0; j < lens.length; j++) {
    if (left <= lens[j] || j === lens.length - 1) {
      const f = lens[j] > 0 ? Math.min(1, left / lens[j]) : 0;
      return { at: [line[j][0] + (line[j + 1][0] - line[j][0]) * f, line[j][1] + (line[j + 1][1] - line[j][1]) * f], bearing: bearing(line[j], line[j + 1]) };
    }
    left -= lens[j];
  }
  return { at: line[line.length - 1], bearing: null };
}

/**
 * Which way the rider faces, degrees clockwise from north: along the stretch of
 * line they are on. At an elevator, a train or the end it is the way they came,
 * since nothing says they turned. Null only before the first step of a walk
 * that starts at an elevator. An estimate: it is the walk's direction, not a compass.
 */
export function facingAt(walk: readonly Checkpoint[], p: Place): number | null {
  const a = walk[p.i];
  if (!a) return null;
  const line = legPath(walk, p.i);
  if (line.length > 1) return along(line, Math.max(0, Math.min(1, a.steps > 0 ? p.walked / a.steps : 0))).bearing;
  const before = p.i > 0 && walk[p.i - 1].station === a.station ? legPath(walk, p.i - 1) : [];
  return before.length > 1 ? bearing(before[before.length - 2], before[before.length - 1]) : null;
}

/**
 * One tick of a simulated trip: `n` more steps on foot, or the next checkpoint
 * once this one's steps are walked or it is an elevator or a train. `ready`
 * says the instruction for this checkpoint has been heard, so a ride or a new
 * instruction never cuts the last one off. Null when the trip is over.
 */
export function simTick(walk: readonly Checkpoint[], p: Place, n: number, ready: boolean): Place | null {
  const c = walk[p.i];
  if (!c || p.i >= walk.length - 1) return null;
  const arrived = !!c.by || p.walked >= c.steps;
  if (arrived) return ready ? { i: p.i + 1, walked: 0 } : p;
  return { i: p.i, walked: Math.min(c.steps, p.walked + n) };
}

/** Steps still to walk to the next elevator, train or the end of the walk; 0 when it is right here. */
export function stepsToNextStop(walk: readonly Checkpoint[], p: Place): number {
  let n = 0;
  for (let j = p.i; j < walk.length; j++) {
    const c = walk[j];
    if (c.by || j === walk.length - 1) break;
    n += j === p.i ? Math.max(0, c.steps - p.walked) : c.steps;
  }
  return n;
}

/** The next elevator, train or the last checkpoint, from `i` on. */
export function nextStop(walk: readonly Checkpoint[], i: number): Checkpoint {
  for (let j = i; j < walk.length; j++) if (walk[j].by) return walk[j];
  return walk[walk.length - 1];
}

/** The rider has walked the counted steps to the next checkpoint, so its sign should be in view. */
export const dueAtNext = (walk: readonly Checkpoint[], p: Place): boolean => {
  const c = walk[p.i];
  return !!c && !c.by && c.steps > 0 && p.walked >= c.steps && p.i < walk.length - 1;
};

/** The place a picked sign means: its checkpoint, or for a wrong-way sign the checkpoint to head back to. */
export function placeForSign(walk: readonly Checkpoint[], wrong: readonly WrongWay[], id: string): { place: Place; wrong: WrongWay | null } | null {
  const i = walk.findIndex((c) => c.id === id);
  if (i >= 0) return { place: { i, walked: 0 }, wrong: null };
  const w = wrong.find((x) => x.id === id);
  const back = w ? walk.findIndex((c) => c.id === w.near) : -1;
  return w && back >= 0 ? { place: { i: back, walked: 0 }, wrong: w } : null;
}

/** The signs worth offering first: those within two checkpoints of where the rider last was, then the rest in walk order. */
export function nearbyFirst<T extends { id: string }>(walk: readonly Checkpoint[], all: readonly T[], i: number): T[] {
  const rank = (id: string) => {
    const j = walk.findIndex((c) => c.id === id);
    return j < 0 ? 99 : Math.abs(j - i) <= 2 ? Math.abs(j - i) : 10 + j;
  };
  return [...all].sort((a, b) => rank(a.id) - rank(b.id));
}

/**
 * Counts steps from the phone's acceleration (gravity included, m/s²): a step
 * is a swing of the magnitude above its own slow average, at most one every
 * 300 ms. Rough by nature; a confirmed sign corrects it.
 */
interface StepState { mean: number; above: boolean; lastT: number; steps: number }
export const initialSteps = (): StepState => ({ mean: 9.81, above: false, lastT: -1, steps: 0 });
const SWING = 1.3;
const GAP_S = 0.3;

export function countStep(st: StepState, t: number, mag: number): StepState {
  const mean = st.mean + (mag - st.mean) * 0.05;
  const high = mag - mean > SWING;
  const step = high && !st.above && (st.lastT < 0 || t - st.lastT >= GAP_S);
  return { mean, above: high, lastT: step ? t : st.lastT, steps: st.steps + (step ? 1 : 0) };
}
