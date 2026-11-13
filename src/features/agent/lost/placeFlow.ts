/**
 * Pinning down where someone is inside a station (#143), one question at a time: the tap answers
 * and the sign's words narrow the spots of the station model, then the way out to the trip's exit
 * starts from the spot they point to. Pure, so it runs offline and in tests.
 */
import type { StationPlaceKit } from "@/lib/map/dollhousePreview";
import { answer, best, nextQuestion, prior, wayOut, type Answer, type Question, type Spot } from "@/lib/map/stationPlace";

/** Placed for sure at this share of the weight in one stretch; under it the place is a best guess. */
const SURE = 0.75;
/** A stretch someone said they are not in keeps this much of its weight. */
const NOT_THERE = 0.02;

export type Placed = { spot: Spot; sure: boolean; signWords: string | null };
export type Way = { backM: number; steps: string[] };

export class Placer {
  w: number[];
  asked = new Set<Question>();
  q: Question | null = null;

  constructor(readonly kit: StationPlaceKit, readonly tripWalk: number | null) {
    this.w = prior(kit.spots, tripWalk);
  }

  /** The next question, or null once placed or nothing left would tell more. */
  next(): Question | null {
    this.q = nextQuestion(this.kit.spots, this.w, this.asked);
    if (this.q) this.asked.add(this.q);
    return this.q;
  }

  tap(a: Exclude<Answer, { q: "sign" }>): void {
    this.w = answer(this.kit.spots, this.w, a, this.kit.signs).w;
  }

  /** Typed words: true when they fit a sign in the model (and narrowed the spots). */
  typed(text: string): boolean {
    const r = answer(this.kit.spots, this.w, { q: "sign", text }, this.kit.signs);
    if (!r.matched) return false;
    this.w = r.w;
    this.asked.add("sign");
    return true;
  }

  placed(): Placed {
    const b = best(this.kit.spots, this.w);
    const p = b.spot;
    // A street spot is named by its corner; elsewhere by the nearest sign that names a corner.
    let signWords: string | null = null;
    if (p.kind === "street") signWords = this.kit.corners[p.on[0].walk] ?? null;
    else {
      const d = (i: number) => Math.hypot(this.kit.signs[i].at[0] - p.at[0], this.kit.signs[i].at[1] - p.at[1]);
      const named = p.signs.filter((i) => this.kit.signs[i].words).sort((a, b2) => d(a) - d(b2));
      signWords = named.length ? this.kit.signs[named[0]].words ?? null : null;
    }
    return { spot: p, sure: b.share >= SURE, signWords };
  }

  /** The way from the placed spot to the trip's exit, or without a trip to the street exit its own walk leads to. */
  way(): Way {
    const { spot } = this.placed();
    if (this.tripWalk === null) return { backM: 0, steps: this.kit.steps(spot.on[0].walk, spot.on[0].walked) };
    const { backM, fromM } = wayOut(this.kit.walks, spot, this.tripWalk);
    return { backM: Math.round(backM), steps: this.kit.steps(this.tripWalk, fromM) };
  }

  /** They are not where it put them: that stretch drops out and the sign can be asked again. */
  notThere(): void {
    const { stretch } = best(this.kit.spots, this.w);
    const w = this.w.map((x, i) => (this.kit.spots[i].stretch === stretch ? x * NOT_THERE : x));
    const sum = w.reduce((a, b) => a + b, 0) || 1;
    this.w = w.map((x) => x / sum);
    this.asked.delete("sign");
  }
}
