import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const octoQuery = vi.fn<(sql: string) => Promise<{ rows: unknown[] }>>();
vi.mock("../../../api/_lib/octo", () => ({ octoQuery: (sql: string) => octoQuery(sql), OctoError: class extends Error {} }));
const { GET_COVERAGE, GET_ACCURACY, CoverageResponse, AccuracyResponse } = await import("./health");
const { BANDS } = await import("./segments");

describe("/api/transit-health/coverage", () => {
  beforeEach(() => { octoQuery.mockReset(); });

  it("returns the view's rows with the bands the server pools over", async () => {
    octoQuery.mockResolvedValue({ rows: [{ system: "bus", route: "M22", sched: 6, band: 20, segments: 42, used: 30, solid: 10, samples: 136, refreshed_at: "2026-11-15T02:00:00Z" }] });
    const res = await GET_COVERAGE();
    const body = CoverageResponse.parse(await res.json());
    expect(body).toMatchObject({ ready: true, refreshedAt: "2026-11-15T02:00:00.000Z", rows: [{ system: "bus", route: "M22", sched: 6, band: 20, segments: 42, used: 30, solid: 10, samples: 136 }] });
    expect(body.bands).toEqual(BANDS.map(([a, b]) => [a, b]));
    expect(res.headers.get("cache-control")).toContain("s-maxage=900");
  });

  it("says it is not ready, instead of failing, before the migration has run", async () => {
    octoQuery.mockRejectedValue(new Error('Octo query failed (400): relation "marts.transit_coverage" does not exist'));
    const res = await GET_COVERAGE();
    expect(res.status).toBe(200);
    expect(CoverageResponse.parse(await res.json())).toMatchObject({ ready: false, rows: [] });
  });

  it("still fails on a real upstream error", async () => {
    octoQuery.mockRejectedValue(new Error("Octo query failed (503)"));
    expect((await GET_COVERAGE()).status).toBe(502);
  });
});

describe("/api/transit-health/accuracy", () => {
  beforeEach(() => { octoQuery.mockReset(); });

  it("returns error by group, the thin stretches and the run totals", async () => {
    octoQuery.mockImplementation((sql) => Promise.resolve({
      rows: sql.includes("transit_prediction_summary")
        ? [{ system: "subway", dim: "lead", key: "3-6", n: 40, mae_model: 22, mae_base: 25, w60_model: 0.9, w60_base: 0.85, l_n: 30, l_mae_model: 21, l_mae_base: 26, l_w60_model: 0.9, l_w60_base: 0.8 },
           { system: "bus", dim: "all", key: "", n: 3, mae_model: 50, mae_base: 50, w60_model: 0.6, w60_base: 0.6, l_n: 0, l_mae_model: null, l_mae_base: null, l_w60_model: null, l_w60_base: null }]
        : sql.includes("transit_prediction_thin")
          ? [{ system: "subway", route: "A", dir: 0, from_stop: "A02N", to_stop: "A03N", n: 4, learned_n: 3, mae_model: 40, mae_base: 20 }]
          : [{ system: "subway", runs: 2, opened: 100, resolved: 90, unresolved: 10, stored: 90, first: "2026-11-15T02:00:00Z", last: "2026-11-15T02:15:00Z" }],
    }));
    const body = AccuracyResponse.parse(await (await GET_ACCURACY()).json());
    expect(body.ready).toBe(true);
    expect(body.rows[0]).toMatchObject({ system: "subway", dim: "lead", key: "3-6", n: 40, maeModel: 22, maeBase: 25, learned: { n: 30, maeModel: 21, maeBase: 26 } });
    expect(body.rows[1].learned).toMatchObject({ n: 0, maeModel: null });
    expect(body.thin).toEqual([{ system: "subway", route: "A", dir: 0, from: "A02N", to: "A03N", n: 4, learnedN: 3, maeModel: 40, maeBase: 20 }]);
    expect(body.runs[0]).toMatchObject({ runs: 2, opened: 100, unresolved: 10 });
  });

  it("says it is not ready before the migration has run", async () => {
    octoQuery.mockRejectedValue(new Error('relation "marts.transit_prediction_summary" does not exist'));
    expect(AccuracyResponse.parse(await (await GET_ACCURACY()).json())).toEqual({ ready: false, rows: [], thin: [], runs: [] });
  });
});

describe("the tracker health migration", () => {
  it("groups hours into the same bands as segments.ts", () => {
    const sql = readFileSync("db/migrations/20261114230000_tracker_health.sql", "utf8");
    const expected = "CASE " + BANDS.slice(0, -1).map(([a, b]) => `WHEN hour <= ${b} THEN ${a}`).join(" ") + ` ELSE ${BANDS[BANDS.length - 1][0]} END`;
    expect(sql.split(expected).length - 1).toBe(2);
    expect(sql).toContain(expected.replaceAll("hour", "h"));
  });
});
