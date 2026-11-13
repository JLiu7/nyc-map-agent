/**
 * Where in a station someone is, narrowed down from what they tell us (#143). Below the street the
 * phone has no position worth trusting, so the helper asks: are you on the platform, a stair, in a
 * hall; have you gone down any stairs since the train; what does the nearest sign say. Each answer
 * re-weights the spots of the station's model, and the next question is the one that best splits
 * what is left. Once one spot holds most of the weight, the person is placed there and led to the
 * trip's exit from it.
 *
 * The spots lie along the station model's walks (Fulton St's: one from the downtown 4/5 platform to
 * each street exit), one every few metres, so a placed spot is somewhere a person can stand and every
 * spot has a known way out. Pure: no map, no DOM, no three.js; the caller hands in the walks, the
 * signs as words and the fare lines.
 */
import { matchSign, type ReadableSign } from "./signMatch";

export type P3 = [number, number, number];
export type PlaceWalk = { exit: [number, number]; path: P3[] };
/** A sign of the model as words: its middle (local metres; z is its height), its text and bullets. */
export type PlaceSign = { at: P3; heading: number; kind: "name" | "exit" | "trains"; text: string; bullets: string[]; words?: string };

export type SpotKind = "platform" | "stair" | "hall" | "street";
export interface Spot {
  id: number;
  at: P3;
  kind: SpotKind;
  /** Where on each walk it lies, metres from the walk's start. */
  on: Array<{ walk: number; walked: number }>;
  /** Through the fare line yet (walking out): true before it, false after, null when the walk has none. */
  paid: boolean | null;
  /** Flights of stairs down and up taken since the platform. */
  downs: number;
  ups: number;
  /** Within a few metres of a fare line. */
  gates: boolean;
  /** Signs in sight: indexes into the signs. */
  signs: number[];
  /**
   * The stretch it belongs to: one platform, one flight of stairs, or one hall or passage at one level.
   * Someone is placed to a stretch, since a long passage has nothing to tell its ends apart and the way
   * out is the same from anywhere along it.
   */
  stretch: number;
}

/** Spots every this many metres along a walk. */
const STEP_M = 4;
/** Spots from two walks this close are one. */
const SAME_M = 2.5;
const SAME_DZ = 0.8;
/** A stretch climbing this much over 3 m is a stair. */
const STAIR_DZ = 0.4;
/** A sign is in sight within this distance, and when it hangs over about the same floor. */
const SEEN_M = 14;
const SIGN_UP_M = 2.4;
const SEEN_DZ = 2.2;
/** At the fare line within this distance. */
const GATES_M = 6;
/**
 * An answer that does not fit a spot keeps this share of its weight: people misjudge where they are.
 * Someone knows whether they stand on a stair or in a passage far better than they count flights, so a
 * miscounted flight weighs less than a wrong place, and a passage stays a passage when the counts disagree.
 */
const MISFIT = 0.02;
const MISFIT_BY: Record<Exclude<Question, "sign">, number> = { where: 0.005, down: 0.08, up: 0.08, paid: MISFIT };
/** Placed: this share of the weight in one stretch. */
const PLACED = 0.75;

const lenOf = (a: P3, b: P3) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
export function walkLen(path: P3[]): number {
  let s = 0;
  for (let i = 1; i < path.length; i++) s += lenOf(path[i - 1], path[i]);
  return s;
}
/** The point `s` metres along a path. */
export function pointAt(path: P3[], s: number): P3 {
  let left = Math.max(0, s);
  for (let i = 1; i < path.length; i++) {
    const d = lenOf(path[i - 1], path[i]);
    if (left <= d || i === path.length - 1) {
      const k = d ? Math.min(1, left / d) : 0;
      const [a, b] = [path[i - 1], path[i]];
      return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
    }
    left -= d;
  }
  return path[0];
}

/** Every spot of the station: along each walk, merged where walks share the way. */
export function stationSpots(walks: PlaceWalk[], signs: PlaceSign[], gates: Array<{ walk: number; at: P3 }>): Spot[] {
  const spots: Spot[] = [];
  walks.forEach((w, wi) => {
    const L = walkLen(w.path);
    const z0 = w.path[0][2];
    const fare = gates.find((g) => g.walk === wi);
    const fareAt = fare ? nearestWalked(w.path, fare.at) : null;
    let downs = 0, ups = 0, onStair = false, leftPlatform = false;
    const n = Math.max(1, Math.round(L / STEP_M));
    for (let k = 0; k <= n; k++) {
      const s = (L * k) / n;
      const at = pointAt(w.path, s);
      const dz = pointAt(w.path, s + 1.5)[2] - pointAt(w.path, s - 1.5)[2];
      const stair = Math.abs(dz) > STAIR_DZ;
      if (stair && !onStair) { if (dz < 0) downs++; else ups++; }
      onStair = stair;
      if (stair || Math.abs(at[2] - z0) > 0.3) leftPlatform = true;
      const kind: SpotKind = k === n ? "street" : stair ? "stair" : !leftPlatform ? "platform" : "hall";
      const paid = fareAt === null ? null : s < fareAt;
      const nearGates = !!fare && Math.hypot(at[0] - fare.at[0], at[1] - fare.at[1]) < GATES_M && Math.abs(at[2] - fare.at[2]) < 1;
      const same = spots.find((p) => p.kind === kind && Math.hypot(p.at[0] - at[0], p.at[1] - at[1]) < SAME_M && Math.abs(p.at[2] - at[2]) < SAME_DZ);
      if (same) {
        same.on.push({ walk: wi, walked: s });
        same.gates ||= nearGates;
        if (same.paid !== paid) same.paid = same.paid ?? paid;
        continue;
      }
      spots.push({ id: spots.length, at, kind, on: [{ walk: wi, walked: s }], paid, downs, ups, gates: nearGates, signs: [], stretch: -1 });
    }
  });
  stretches(spots);
  for (const p of spots)
    p.signs = signs.flatMap((g, i) => (Math.hypot(g.at[0] - p.at[0], g.at[1] - p.at[1]) < SEEN_M && Math.abs(g.at[2] - SIGN_UP_M - p.at[2]) < SEEN_DZ ? [i] : []));
  return spots;
}

/** Joins neighbouring spots of the same kind at the same level into stretches. */
function stretches(spots: Spot[]): void {
  const up = spots.map((_, i) => i);
  const root = (i: number): number => (up[i] === i ? i : (up[i] = root(up[i])));
  for (let i = 0; i < spots.length; i++)
    for (let j = i + 1; j < spots.length; j++) {
      const [a, b] = [spots[i], spots[j]];
      if (a.kind !== b.kind || a.kind === "street") continue;
      if (Math.hypot(a.at[0] - b.at[0], a.at[1] - b.at[1]) > STEP_M * 1.6) continue;
      // A flight's spots climb as they go; a hall's stay level.
      if (Math.abs(a.at[2] - b.at[2]) > (a.kind === "stair" ? 3 : 0.6)) continue;
      up[root(i)] = root(j);
    }
  const ids = new Map<number, number>();
  for (let i = 0; i < spots.length; i++) {
    const r = root(i);
    if (!ids.has(r)) ids.set(r, ids.size);
    spots[i].stretch = ids.get(r)!;
  }
}

/** How far along a path the point nearest `at` lies. */
function nearestWalked(path: P3[], at: P3): number {
  let best = 0, bestD = Infinity, s = 0;
  for (let i = 1; i < path.length; i++) {
    const [a, b] = [path[i - 1], path[i]];
    const d = lenOf(a, b);
    for (let t = 0; t <= 1; t += 0.1) {
      const q: P3 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
      const e = lenOf(q, at);
      if (e < bestD) { bestD = e; best = s + d * t; }
    }
    s += d;
  }
  return best;
}

export type Where = "platform" | "stair" | "hall" | "gates" | "street";
export type Answer =
  | { q: "where"; a: Where }
  /** Flights down since the train: 0, 1, or 2 for two or more. */
  | { q: "down"; a: 0 | 1 | 2 }
  /** Flights up since the train: 0, 1, 2, or 3 for three or more. */
  | { q: "up"; a: 0 | 1 | 2 | 3 }
  | { q: "paid"; a: boolean }
  | { q: "sign"; text: string };
export type Question = "where" | "down" | "up" | "paid" | "sign";

/** Weights before any answer: the trip's walk and the platform the walks start from are likelier. */
export function prior(spots: Spot[], tripWalk: number | null): number[] {
  const w = spots.map((p) => (p.on.some((o) => o.walk === tripWalk) ? 3 : 1) * (p.kind === "platform" ? 1.5 : 1));
  return norm(w);
}

function norm(w: number[]): number[] {
  const t = w.reduce((a, b) => a + b, 0);
  return t > 0 ? w.map((x) => x / t) : w.map(() => 1 / w.length);
}

/** Whether a spot fits an answer. Null: the answer says nothing about it. */
function fits(p: Spot, a: Exclude<Answer, { q: "sign" }>): boolean | null {
  if (a.q === "where") return a.a === "gates" ? p.gates : p.kind === a.a;
  // Someone mid-flight may count it or not: a stair spot fits the count before it and after it.
  if (a.q === "down") return Math.min(p.downs, 2) === a.a || (p.kind === "stair" && Math.min(p.downs - 1, 2) === a.a);
  if (a.q === "up") return Math.min(p.ups, 3) === a.a || (p.kind === "stair" && Math.min(p.ups - 1, 3) === a.a);
  return p.paid === null ? null : p.paid === a.a;
}

function asReadable(s: PlaceSign): ReadableSign {
  return { kind: s.kind, x: s.at[0], y: s.at[1], z: s.at[2], angle: s.heading, back: false, name: s.text, routes: s.bullets.map((b) => ({ short: b })), words: s.words };
}

/** The signs the words fit, or null when they fit none well enough. */
export function signsFitting(text: string, signs: PlaceSign[]): number[] | null {
  const readable = signs.map(asReadable);
  const m = matchSign(text, readable);
  if (!m) return null;
  return m.same.map((s) => readable.indexOf(s));
}

/**
 * The weights after an answer. A sign's words that fit no sign leave them as they were
 * (`matched` false), so the caller can hand the words to the agent instead.
 */
export function answer(spots: Spot[], w: number[], a: Answer, signs: PlaceSign[]): { w: number[]; matched: boolean } {
  if (a.q === "sign") {
    const hit = signsFitting(a.text, signs);
    if (!hit) return { w, matched: false };
    const set = new Set(hit);
    return { w: norm(w.map((x, i) => x * (spots[i].signs.some((s) => set.has(s)) ? 1 : MISFIT))), matched: true };
  }
  return { w: norm(w.map((x, i) => { const f = fits(spots[i], a); return f === null ? x : x * (f ? 1 : MISFIT_BY[a.q]); })), matched: true };
}

/** The heaviest stretch, its share of the weight, and its heaviest spot. */
export function best(spots: Spot[], w: number[]): { stretch: number; share: number; spot: Spot } {
  const by = new Map<number, number>();
  spots.forEach((p, i) => by.set(p.stretch, (by.get(p.stretch) ?? 0) + w[i]));
  let stretch = spots[0].stretch, share = -1;
  for (const [k, v] of by) if (v > share) { stretch = k; share = v; }
  let i = -1;
  spots.forEach((p, k) => { if (p.stretch === stretch && (i < 0 || w[k] > w[i])) i = k; });
  return { stretch, share, spot: spots[i] };
}

export const placed = (spots: Spot[], w: number[]) => best(spots, w).share >= PLACED;

const ANSWERS: Record<Exclude<Question, "sign">, Array<Exclude<Answer, { q: "sign" }>>> = {
  where: (["platform", "stair", "hall", "gates", "street"] as Where[]).map((a) => ({ q: "where", a })),
  down: ([0, 1, 2] as const).map((a) => ({ q: "down", a })),
  up: ([0, 1, 2, 3] as const).map((a) => ({ q: "up", a })),
  paid: [{ q: "paid", a: true }, { q: "paid", a: false }],
};

/** Spread of the weight over stretches, in bits: what is left to find out. */
function unsure(spots: Spot[], w: number[]): number {
  const cells = new Map<number, number>();
  spots.forEach((p, i) => cells.set(p.stretch, (cells.get(p.stretch) ?? 0) + w[i]));
  let h = 0;
  for (const c of cells.values()) if (c > 0) h -= c * Math.log2(c);
  return h;
}

/**
 * The question to ask next: the tap question whose answers best split what is left, among those not
 * asked yet; the sign's words when none would tell much. Null once placed, or once nothing left to ask
 * would tell more.
 */
export function nextQuestion(spots: Spot[], w: number[], asked: ReadonlySet<Question>): Question | null {
  if (placed(spots, w)) return null;
  const now = unsure(spots, w);
  let bestQ: Question | null = null, gain = 0;
  for (const q of ["where", "down", "up", "paid"] as const) {
    if (asked.has(q)) continue;
    let after = 0;
    for (const a of ANSWERS[q]) {
      const share = spots.reduce((s, p, i) => s + (fits(p, a) === false ? 0 : w[i]), 0);
      if (share <= 0) continue;
      after += share * unsure(spots, answer(spots, w, a, []).w);
    }
    if (now - after > gain) { gain = now - after; bestQ = q; }
  }
  // A sign tells the most once taps tell little; asked once, the taps left get their turn, then nothing.
  if (gain > 0.25 || asked.has("sign")) return gain > 0.02 ? bestQ : null;
  return "sign";
}

/** The tap answers that still fit some spot, for the question's buttons. */
export function answersFor(q: Exclude<Question, "sign">, spots: Spot[], w: number[]): Array<Exclude<Answer, { q: "sign" }>> {
  return ANSWERS[q].filter((a) => spots.some((p, i) => w[i] > 1e-4 && fits(p, a) === true));
}

/**
 * The way from a spot to the trip's exit: how far back to walk first (when the spot is off the trip's
 * walk, back to where the two walks part), then where along the trip's walk to pick it up.
 */
export function wayOut(walks: PlaceWalk[], spot: Spot, tripWalk: number): { backM: number; fromM: number } {
  const on = spot.on.find((o) => o.walk === tripWalk);
  if (on) return { backM: 0, fromM: on.walked };
  // Back along the spot's own walk to the nearest place it touches the trip's walk (a shared hall or
  // stair, at worst the platform both start on), then on along the trip's walk from there.
  const mine = spot.on[0];
  const a = walks[mine.walk].path, b = walks[tripWalk].path;
  for (let s = mine.walked; s >= 0; s -= 1) {
    const p = pointAt(a, s);
    const t = nearestWalked(b, p);
    if (lenOf(pointAt(b, t), p) < SAME_M) return { backM: mine.walked - s, fromM: t };
  }
  return { backM: mine.walked, fromM: 0 };
}

/** A sign as the station model plans it (`planSigns`): two lines of text, bullets or an arrow. */
export type PlannedSign = {
  at: P3;
  heading: number;
  lines: [{ text?: string; arrow?: string; bullets?: Array<[string, string]> }, { text?: string; arrow?: string; bullets?: Array<[string, string]> } | null];
};

/** The model's planned signs as words. */
export function signsFromPlans(plans: PlannedSign[]): PlaceSign[] {
  const out: PlaceSign[] = [];
  for (const g of plans) {
    const [a, b] = g.lines;
    const bullets = [...(a.bullets ?? []), ...(b?.bullets ?? [])].map(([r]) => r);
    const exit = /exit/i.test(a.text ?? "");
    const words = exit && b?.text ? b.text : undefined;
    const text = [a.text, exit ? null : b?.text].filter(Boolean).join(" ");
    // Walks that share a stretch each plan its signs with their own exit's corner: a real Exit sign
    // there lists them all, so each wording stays, once per place.
    if (out.some((o) => lenOf(o.at, g.at) < 0.5 && o.text === text && o.words === words && o.bullets.join() === bullets.join())) continue;
    out.push({ at: g.at, heading: g.heading, kind: exit ? "exit" : bullets.length ? "name" : "trains", text, bullets, ...(words ? { words } : {}) });
  }
  return out;
}
