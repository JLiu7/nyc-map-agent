import { describe, expect, it } from "vitest";
import { BusScorer, busLegSeconds, leadOf, sample, SubwayScorer, type BusSegRow, type Score } from "./score";
import type { BusPos } from "./busObserve";

const seg = (from: string, to: string, n: number, median = 100) => ({ dir: 0, from, to, kind: "travel" as const, n, median, p80: median });

describe("leadOf", () => {
  it("puts a prediction in the 1-3, 3-6 or 6-10 minute group, and nowhere outside them", () => {
    expect([59, 60, 179, 180, 359, 360, 599, 600].map(leadOf)).toEqual([-1, 0, 0, 1, 1, 2, 2, -1]);
  });
});

describe("SubwayScorer", () => {
  const learned = { G: [seg("A", "B", 4), seg("B", "C", 9)] };
  const trip = (stops: Array<[string, number]>, at?: string, vt?: number) => ({ id: "t", route: "G", dir: 0, stops, ...(at ? { at, st: 1, vt } : {}) });

  it("scores the blended time and the feed's time against when the train stopped there", () => {
    const s = new SubwayScorer(learned, 10_000);
    expect(s.ingest([trip([["A", 1030], ["B", 1150], ["C", 1400]])], 1000)).toEqual([]);
    expect(s.ingest([trip([["B", 1155], ["C", 1400]], "B", 1158)], 1160)).toEqual([]);
    const [b] = s.ingest([trip([["C", 1405]])], 1200);
    // B was 150 s away by the feed; the train reported standing there at 1158.
    expect(b).toMatchObject({ system: "subway", route: "G", from: "A", to: "B", legs: 1, lead: 150, actual: 158, errBase: -8, learnedN: 4, truth: 1, at: 1158 });
    expect(b.errModel).toBeCloseTo(1147.75 - 1158, 5);
  });

  it("falls back to the feed's last listed arrival, and keeps the fewest samples on the way", () => {
    const s = new SubwayScorer(learned, 10_000);
    s.ingest([trip([["A", 1030], ["B", 1150], ["C", 1400], ["D", 1700]])], 1000);
    s.ingest([trip([["B", 1155], ["C", 1400], ["D", 1700]])], 1160);
    s.ingest([trip([["C", 1405], ["D", 1700]])], 1200);
    const out = s.ingest([trip([["D", 1700]])], 1420).sort((x, y) => y.lead - x.lead);
    // C was predicted twice: 400 s ahead from A (through both learned stretches), then 240 s ahead from B.
    expect(out.map((o) => [o.from, o.to, o.legs, o.lead, o.learnedN, o.truth, o.at])).toEqual([["A", "C", 2, 400, 4, 0, 1405], ["B", "C", 1, 240, 9, 0, 1405]]);
    expect(out[0].errBase).toBe(-5);
    expect(out[0].errModel).toBeCloseTo(1373.375 - 1405, 5);
    // Opened: B once, C twice, D twice (9 and 4.7 minutes ahead). D is still open.
    expect(s.finish()).toEqual({ opened: 5, resolved: 3, unresolved: 2 });
  });

  it("equals the feed when no learned time applies", () => {
    const s = new SubwayScorer({}, 10_000);
    s.ingest([trip([["A", 1030], ["B", 1150], ["C", 1500]])], 1000);
    const [b] = s.ingest([trip([["C", 1500]])], 1160);
    expect(b).toMatchObject({ to: "B", learnedN: null, errBase: 0, errModel: 0 });
  });

  it("does not score a train's own origin, where the feed lists a departure", () => {
    const s = new SubwayScorer(learned, 10_000);
    s.ingest([{ ...trip([["A", 1100], ["B", 1300]]), origin: true }], 1000);
    expect(s.tally.opened).toBe(1); // B only
  });

  it("does not open a prediction that lands in the run's last three minutes, and counts what never resolved", () => {
    const s = new SubwayScorer(learned, 1400);
    s.ingest([trip([["A", 1030], ["B", 1150], ["C", 1400]])], 1000);
    expect(s.tally.opened).toBe(1); // B (1150) lands before 1220; C (1400) does not
    expect(s.finish()).toEqual({ opened: 1, resolved: 0, unresolved: 1 });
  });

  it("drops a stop that left the feed before it was due (a skip), without a score", () => {
    const s = new SubwayScorer(learned, 10_000);
    s.ingest([trip([["A", 1030], ["B", 1150], ["C", 1400]])], 1000);
    expect(s.ingest([trip([["C", 1400]])], 1010)).toEqual([]);
  });
});

describe("busLegSeconds", () => {
  it("is the client's leg: default speed and dwell, or the learned time blended 0.7 to 0.3", () => {
    // Pinned: if busEstimate.ts changes its speeds, acceleration or blend, this must be looked at again.
    expect(busLegSeconds("M15", 300)).toBeCloseTo(78.89, 2);
    expect(busLegSeconds("M15", 300, 60)).toBeCloseTo(63.65, 2);
    expect(busLegSeconds("M15", 300, 60, 30)).toBeGreaterThan(busLegSeconds("M15", 300, 60));
  });
});

describe("BusScorer", () => {
  const LAT = 40.7, STEP = 300 / 111_320;
  const stops = Array.from({ length: 10 }, (_, i) => ({ id: `MTA_${i + 1}`, lon: -74, lat: LAT + i * STEP }));
  const geom = { route: "M15", lines: [stops.map((s) => [s.lon, s.lat] as [number, number])], stops };
  const segs: BusSegRow[] = stops.slice(1).map((_, i) => ({ dir: 0, from: String(i + 1), to: String(i + 2), kind: "travel", n: i === 2 ? 3 : 8, median: 60 }));
  /** A bus at 5 m/s reporting every 30 s: it passes a stop every minute. */
  const run = (scorer: BusScorer, until: number): Score[] => {
    const out: Score[] = [];
    for (let t = 0; t <= until; t += 30) {
      const m = 5 * t, next = Math.floor(m / 300 + 1e-9) + 2;
      const b: BusPos = { id: "bus", route: "M15", dir: 0, lon: -74, lat: LAT + m / 111_320, next: next <= 10 ? String(next) : null, t };
      out.push(...scorer.ingest([b]));
    }
    return out;
  };

  it("predicts when the bus leaves later stops and scores it when it does", () => {
    const scorer = new BusScorer(100_000);
    scorer.setRoute(geom, segs);
    const out = run(scorer, 500);
    // Leaving stop 3 at t=105 (the first departure with a known previous one), stop 4 is one leg ahead.
    const first = out.find((o) => o.from === "3" && o.to === "4")!;
    expect(first).toMatchObject({ system: "bus", route: "M15", legs: 1, truth: 2, at: 165, actual: 60, learnedN: 3 });
    expect(first.lead).toBeCloseTo(78.89, 2);
    expect(first.errBase).toBeCloseTo(18.89, 2);
    expect(first.errModel).toBeCloseTo(3.65, 2);
    // Three legs ahead is the 3-6 minute group; its fewest samples are still stop 3's three.
    const far = out.find((o) => o.from === "3" && o.to === "6")!;
    expect(far).toMatchObject({ legs: 3, actual: 180, learnedN: 3 });
    expect(leadOf(far.lead)).toBe(1);
    expect(Math.abs(far.errModel)).toBeLessThan(Math.abs(far.errBase));
  });

  it("only predicts stops this direction serves, and counts predictions the run never saw resolved", () => {
    const scorer = new BusScorer(100_000);
    scorer.setRoute(geom, segs.filter((s) => s.to !== "4" && s.from !== "4"));
    const out = run(scorer, 240);
    expect(out.some((o) => o.to === "4")).toBe(false);
    const t = scorer.finish();
    expect(t.unresolved).toBeGreaterThan(0);
    expect(t.opened).toBe(t.resolved + t.unresolved);
  });

  it("ignores routes it was not given", () => {
    expect(new BusScorer(1000).ingest([{ id: "x", route: "B41", dir: 0, lon: -74, lat: 40.7, next: "1", t: 0 }])).toEqual([]);
  });
});

describe("sample", () => {
  it("keeps everything under the cap and exactly the cap above it", () => {
    expect(sample([1, 2, 3], 5)).toEqual([1, 2, 3]);
    const picked = sample(Array.from({ length: 100 }, (_, i) => i), 10, () => 0.5);
    expect(new Set(picked).size).toBe(10);
  });
});
