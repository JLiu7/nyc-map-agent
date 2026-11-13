import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { planSigns, walkPlaces, type DollhouseModel } from "./three/dollhouse";
import { answer, answersFor, best, nextQuestion, prior, signsFromPlans, stationSpots, wayOut, type Answer, type PlaceSign, type Question, type Spot } from "./stationPlace";

// Fulton St, the station with the detailed model: 13 walks from the downtown 4/5 platform to every street exit.
const model = JSON.parse(readFileSync("public/transit/fulton-model.json", "utf8")) as DollhouseModel;
const STREETS = ["Broadway", "Nassau", "William", "John", "Dey", "Church", "Cortlandt", "Maiden", "Liberty", "Pearl", "Gold", "Ann", "Beekman"];
const corner = (i: number) => `Fulton St & ${STREETS[i]} St`;
const signs = signsFromPlans(model.walks.flatMap((w, i) => planSigns(model, w, corner(i))));
const gates = model.walks.flatMap((w, i) => { const g = walkPlaces(w.path).gates; return g ? [{ walk: i, at: g.at }] : []; });
const spots = stationSpots(model.walks, signs, gates);

/** What someone standing at `p` would answer. */
function truth(p: Spot, q: Question): Answer | null {
  if (q === "where") return { q, a: p.gates ? "gates" : p.kind };
  if (q === "down") return { q, a: Math.min(p.downs, 2) as 0 | 1 | 2 };
  if (q === "up") return { q, a: Math.min(p.ups, 3) as 0 | 1 | 2 | 3 };
  if (q === "paid") return p.paid === null ? null : { q, a: p.paid };
  // The nearest sign's words, the way someone would type them.
  // The nearest sign that names something (an Exit sign's corner, else the lines), as the question asks.
  const d = (a: PlaceSign) => Math.hypot(a.at[0] - p.at[0], a.at[1] - p.at[1]);
  const seen = p.signs.map((i) => signs[i]).sort((a, b) => Number(!b.words) - Number(!a.words) || d(a) - d(b));
  const s: PlaceSign | undefined = seen[0];
  return s ? { q, text: s.words ? `Exit ${s.words}` : `${s.text} ${s.bullets.join(" ")}` } : null;
}

function play(p: Spot, tripWalk: number | null, max = 6) {
  let w = prior(spots, tripWalk);
  const asked = new Set<Question>();
  let n = 0;
  for (; n < max; n++) {
    const q = nextQuestion(spots, w, asked);
    if (!q) break;
    asked.add(q);
    const a = truth(p, q);
    if (a) w = answer(spots, w, a, signs).w;
  }
  const b = best(spots, w);
  return { questions: n, spot: b.spot, share: b.share, right: b.stretch === p.stretch };
}

describe("placing someone in Fulton St from their answers", () => {
  it("lays spots along every walk, with platform, stairs, halls and the street", () => {
    expect(spots.length).toBeGreaterThan(100);
    const kinds = new Set(spots.map((p) => p.kind));
    for (const k of ["platform", "stair", "hall", "street"]) expect(kinds).toContain(k);
    expect(signs.some((s) => s.words === "Fulton St & Broadway St")).toBe(true);
  });

  it("starts with a tap question, and offers only answers that fit some spot", () => {
    const w = prior(spots, null);
    expect(["where", "down", "up"]).toContain(nextQuestion(spots, w, new Set()));
    expect(answersFor("where", spots, w).map((a) => a.a)).toEqual(expect.arrayContaining(["platform", "stair", "hall", "street"]));
  });

  it("places most spots in the right stretch (platform, flight or passage) in six answers or fewer", () => {
    const runs = spots.map((p) => play(p, null));
    const near = runs.filter((r) => r.right).length / runs.length;
    expect(near).toBeGreaterThan(0.6);
  });

  it("knowing the trip's exit, places someone on its walk better", () => {
    const trip = 0;
    const onTrip = spots.filter((p) => p.on.some((o) => o.walk === trip));
    const near = onTrip.map((p) => play(p, trip)).filter((r) => r.right).length / onTrip.length;
    expect(near).toBeGreaterThan(0.85);
  });

  it("a passage stays a passage when the flight count disagrees", () => {
    // Live on 2026-11-13: passage, one flight up, then no flights down (every passage here is one down
    // from the 4/5 platform). The count was wrong, the place was not; it guessed a stairway.
    let w = prior(spots, null);
    for (const a of [{ q: "where", a: "hall" }, { q: "up", a: 1 }, { q: "down", a: 0 }] as const) w = answer(spots, w, a, signs).w;
    expect(best(spots, w).spot.kind).toBe("hall");
  });

  it("an Exit sign's corner pins the stair it hangs by", () => {
    const w = answer(spots, prior(spots, null), { q: "sign", text: "Exit Fulton St & William St" }, signs);
    expect(w.matched).toBe(true);
    const b = best(spots, w.w);
    expect(b.spot.on.some((o) => o.walk === 2)).toBe(true);
  });

  it("words that fit no sign change nothing", () => {
    const w0 = prior(spots, null);
    const r = answer(spots, w0, { q: "sign", text: "pizza" }, signs);
    expect(r.matched).toBe(false);
    expect(r.w).toBe(w0);
  });

  it("from a spot off the trip's walk, goes back to where the walks meet", () => {
    const trip = 0;
    const off = spots.find((p) => p.kind === "street" && !p.on.some((o) => o.walk === trip))!;
    const way = wayOut(model.walks, off, trip);
    expect(way.backM).toBeGreaterThan(5);
    const on = spots.find((p) => p.kind === "hall" && p.on.some((o) => o.walk === trip))!;
    expect(wayOut(model.walks, on, trip).backM).toBe(0);
  });
});
