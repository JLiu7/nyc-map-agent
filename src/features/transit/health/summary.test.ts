import { describe, expect, it } from "vitest";
import { bandLabel, clock, directions, dowOf, grid, percent, routeTotals, schedOf, short, stretches, type CoverageRow, type Segment } from "./summary";

const row = (system: "subway" | "bus", route: string, sched: number, band: number, segments: number, solid: number, samples: number): CoverageRow => ({ system, route, sched, band, segments, used: segments, solid, samples });
const ROWS = [
  row("subway", "A", 1, 7, 100, 90, 5000), row("subway", "A", 6, 20, 117, 60, 1526),
  row("subway", "G", 1, 7, 40, 40, 900), row("subway", "10", 1, 7, 5, 0, 9), row("subway", "2", 1, 7, 5, 0, 9),
  row("bus", "M22", 6, 20, 42, 10, 136),
];
const BANDS = [[0, 4], [5, 6], [7, 9], [10, 15], [16, 19], [20, 23]] as const;

describe("routeTotals", () => {
  it("adds a line's cells over the week and sorts by samples", () => {
    const t = routeTotals(ROWS, "subway", null, "samples");
    expect(t.map((x) => x.route)).toEqual(["A", "G", "2", "10"]);
    expect(t[0]).toMatchObject({ segments: 217, solid: 150, samples: 6526 });
    expect(t[0].share).toBeCloseTo(150 / 217);
  });
  it("sorts by the share of stretches with 5 or more samples", () => {
    expect(routeTotals(ROWS, "subway", null, "coverage").map((x) => x.route)).toEqual(["G", "A", "2", "10"]);
  });
  it("keeps to one schedule and band, and to one system", () => {
    expect(routeTotals(ROWS, "subway", { sched: 6, band: 20 }, "samples")).toEqual([{ route: "A", segments: 117, used: 117, solid: 60, samples: 1526, share: 60 / 117 }]);
    expect(routeTotals(ROWS, "bus", null, "samples").map((x) => x.route)).toEqual(["M22"]);
  });
});

describe("grid", () => {
  it("has every schedule and band, with zeros where nothing was learned", () => {
    const g = grid(ROWS, "subway", BANDS);
    expect(g).toHaveLength(18);
    expect(g.find((c) => c.sched === 1 && c.band === 7)).toMatchObject({ segments: 150, solid: 130, samples: 5918 });
    expect(g.find((c) => c.sched === 7 && c.band === 0)).toMatchObject({ segments: 0, samples: 0, share: 0 });
  });
  it("narrows to one line", () => {
    const g = grid(ROWS, "subway", BANDS, "A");
    expect(g.filter((c) => c.segments > 0).map((c) => [c.sched, c.band, c.segments])).toEqual([[1, 7, 100], [6, 20, 117]]);
  });
});

describe("stretches", () => {
  const seg = (dir: number, from: string, to: string, n: number, median = 90): Segment => ({ dir, from, to, kind: "travel", n, median, p80: median + 20 });
  it("orders a subway direction by where each stretch starts along the line, either way", () => {
    const m: Record<string, number> = { A: 0, B: 500, C: 1200 };
    const segs = [seg(0, "B", "C", 9), seg(0, "A", "B", 3), seg(1, "B", "A", 9), seg(1, "C", "B", 9), { ...seg(0, "A", "A", 9), kind: "dwell" as const }];
    expect(stretches(segs, 0, (s) => m[s]).map((s) => `${s.from}${s.to}`)).toEqual(["AB", "BC"]);
    expect(stretches(segs, 1, (s) => m[s]).map((s) => `${s.from}${s.to}`)).toEqual(["CB", "BA"]);
    expect(stretches(segs, 0, (s) => m[s])[0]).toEqual({ from: "A", to: "B", n: 3, median: 90, p80: 110, thin: true });
  });
  it("chains a bus direction from the stop nothing leads to, and keeps what the chain misses", () => {
    const segs: Segment[] = [
      { dir: 0, from: "3", to: "4", kind: "travel", n: 6, median: 60 }, { dir: 0, from: "1", to: "2", kind: "travel", n: 5, median: 70 },
      { dir: 0, from: "2", to: "3", kind: "travel", n: 2, median: 80 }, { dir: 0, from: "2", to: "4", kind: "travel", n: 1, median: 150 },
    ];
    const out = stretches(segs, 0);
    expect(out.map((s) => `${s.from}-${s.to}`)).toEqual(["1-2", "2-3", "3-4", "2-4"]);
    expect(out[1]).toEqual({ from: "2", to: "3", n: 2, median: 80, thin: true });
  });
  it("lists the directions with the most stretches first", () => {
    expect(directions([seg(1, "A", "B", 3), seg(0, "A", "B", 3), seg(0, "B", "C", 3)])).toEqual([0, 1]);
  });
});

describe("labels", () => {
  it("formats times, counts, shares and bands", () => {
    expect([clock(42), clock(95), clock(600)]).toEqual(["42 s", "1:35", "10:00"]);
    expect([short(999), short(1526), short(25_432), short(11_151_259)]).toEqual(["999", "1.5k", "25k", "11.2M"]);
    expect([percent(0.678), percent(null)]).toEqual(["68%", "–"]);
    expect([bandLabel([0, 4]), bandLabel([20, 23])]).toEqual(["00–05", "20–24"]);
    expect([schedOf(3), schedOf(6), schedOf(7), dowOf(1), dowOf(6)]).toEqual([1, 6, 7, 3, 6]);
  });
});
