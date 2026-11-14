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
  const k = Math.max(0, Math.min(1, p.walked / a.steps));
  return [a.at[0] + (b.at[0] - a.at[0]) * k, a.at[1] + (b.at[1] - a.at[1]) * k];
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
