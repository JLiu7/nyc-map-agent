import { describe, expect, it } from "vitest";
import { bandLabel, byPlatform, clock, directions, dowOf, grid, percent, routeTotals, schedOf, short, stationLines, stationTotals, complexes, spanLearned, hoursOf, stretches, type CoverageRow, type Segment, type StationInfo } from "./summary";

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
  it("reads a train's direction from its platform when the feed gives both ways one number", () => {
    const segs = byPlatform([seg(0, "101N", "103N", 9), seg(0, "103S", "101S", 9), seg(0, "104S", "103S", 9)]);
    expect(directions(segs)).toEqual([1, 0]);
    expect(stretches(segs, 1).map((s) => `${s.from}>${s.to}`)).toEqual(["104S>103S", "103S>101S"]);
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

describe("stations", () => {
  const t = (_line: string, dir: number, from: string, to: string, n: number, median = 90): Segment => ({ dir, from, to, kind: "travel", n, median });
  const st = (id: string, name: string, lon: number, lat = 40.75): StationInfo => ({ id, name, lon, lat, routes: [] });

  it("groups stations of one name that stand together, and keeps far ones apart", () => {
    const key = complexes([st("R16", "Times Sq-42 St", -73.9868), st("127", "Times Sq-42 St", -73.9875), st("725", "Times Sq-42 St", -73.9877), st("A27", "42 St-Port Authority", -73.9897), st("626", "86 St", -73.9558, 40.7795), st("121", "86 St", -73.9763, 40.7888)]);
    expect([key.get("127"), key.get("725"), key.get("R16")]).toEqual(["127", "127", "127"]);
    expect([key.get("A27"), key.get("626"), key.get("121")]).toEqual(["A27", "626", "121"]);
  });

  it("gives each line and direction its dwell and the stretches in and out, keeping the best-sampled", () => {
    const rows = {
      "1": [t("1", 0, "126N", "127N", 40, 86), t("1", 0, "127N", "128N", 38, 147), { dir: 0, from: "127N", to: "127N", kind: "dwell" as const, n: 30, median: 45 }, t("1", 1, "128S", "127S", 3)],
      "2": [t("2", 0, "123N", "127N", 12, 200), t("2", 0, "120N", "127N", 4, 300), t("2", 0, "200N", "201N", 9)],
    };
    const lines = stationLines(rows, (s) => s.startsWith("127"));
    expect(lines).toEqual([
      { route: "1", dir: 0, stop: "127N", prev: { stop: "126N", median: 86, n: 40 }, next: { stop: "128N", median: 147, n: 38 }, dwell: { median: 45, n: 30 } },
      { route: "1", dir: 1, stop: "127S", prev: { stop: "128S", median: 90, n: 3 } },
      { route: "2", dir: 0, stop: "127N", prev: { stop: "123N", median: 200, n: 12 } },
    ]);
  });

  it("lists stations least-learned first, with a station that has nothing at the top", () => {
    const rows = { "1": [t("1", 0, "126N", "127N", 40), t("1", 0, "127N", "128N", 3), t("1", 1, "128S", "127S", 2)] };
    const stations = ["126", "127", "128", "129"].map((id) => ({ key: id, name: `St ${id}`, routes: ["1"] }));
    const out = stationTotals(rows, stations, (s) => s.replace(/[NS]$/, ""));
    expect(out.map((s) => [s.key, s.lines, s.thin, s.samples])).toEqual([["129", 0, 0, 0], ["128", 2, 2, 5], ["126", 1, 0, 40], ["127", 2, 2, 45]]);
  });
});

describe("spanLearned", () => {
  const t = (dir: number, from: string, to: string, n: number, median: number): Segment => ({ dir, from, to, kind: "travel", n, median });
  it("adds our stretches from one timepoint to the next, and reports the thinnest", () => {
    const segs = [t(0, "1", "2", 9, 60), t(0, "2", "3", 3, 70), t(0, "3", "4", 8, 80), t(0, "2", "4", 1, 500), t(1, "4", "3", 9, 75)];
    expect(spanLearned(segs, "1", "4")).toEqual({ seconds: 210, stretches: 3, least: 3 });
    expect(spanLearned(segs, "4", "3")).toEqual({ seconds: 75, stretches: 1, least: 9 });
  });
  it("is undefined when the chain breaks or loops before the target", () => {
    expect(spanLearned([t(0, "1", "2", 9, 60), t(0, "3", "4", 9, 60)], "1", "4")).toBeUndefined();
    expect(spanLearned([t(0, "1", "2", 9, 60), t(0, "2", "1", 9, 60)], "1", "4")).toBeUndefined();
  });
  it("fills a schedule's 24 hours", () => {
    const h = hoursOf([{ sched: 1, hour: 8, segments: 60, solid: 50, enough: 44, samples: 900 }], 1);
    expect(h).toHaveLength(24);
    expect([h[8].samples, h[9].samples]).toEqual([900, 0]);
  });
});
