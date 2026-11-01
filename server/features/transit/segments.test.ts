import { beforeEach, describe, expect, it, vi } from "vitest";

const octoQuery = vi.fn<(sql: string, params: unknown[]) => Promise<{ rows: unknown[] }>>();
vi.mock("../../../api/_lib/octo", () => ({ octoQuery: (sql: string, params: unknown[]) => octoQuery(sql, params), OctoError: class extends Error {} }));
const { GET_ALL, BANDS, bandHours, scheduleDows } = await import("./segments");

const row = (route: string) => ({ route, dir: 0, from_stop: "A02N", to_stop: "A03N", kind: "travel", n: 9, median_s: 90, p80_s: 120 });

describe("/api/transit-segments/all", () => {
  beforeEach(() => { octoQuery.mockReset(); octoQuery.mockResolvedValue({ rows: [row("A"), row("G")] }); });

  it("answers every route in one query, keyed by route, with empty lists for routes without rows", async () => {
    const res = await GET_ALL(new Request("http://x/api/transit-segments/all?routes=G,A,C&dow=3&hour=8"));
    expect(res.status).toBe(200);
    expect(octoQuery).toHaveBeenCalledTimes(1);
    // Wednesday 8 am pools Monday to Friday over the morning band (7 to 9).
    expect(octoQuery.mock.calls[0][1]).toEqual([["A", "C", "G"], [1, 2, 3, 4, 5], 7, 9]);
    const body = (await res.json()) as { dow: number; hour: number; routes: Record<string, unknown[]> };
    expect(body).toMatchObject({ dow: 3, hour: 8 });
    expect(Object.keys(body.routes).sort()).toEqual(["A", "C", "G"]);
    expect(body.routes.C).toEqual([]);
    expect(body.routes.A).toEqual([{ dir: 0, from: "A02N", to: "A03N", kind: "travel", n: 9, median: 90, p80: 120 }]);
  });

  it("caches a pinned hour of the week for hours at the edge, and the current hour for 15 minutes", async () => {
    const pinned = await GET_ALL(new Request("http://x/api/transit-segments/all?routes=A&dow=1&hour=0"));
    expect(pinned.headers.get("cache-control")).toContain("s-maxage=21600");
    const now = await GET_ALL(new Request("http://x/api/transit-segments/all?routes=A"));
    expect(now.headers.get("cache-control")).toContain("s-maxage=900");
  });

  it("rejects a bad route list before querying", async () => {
    expect((await GET_ALL(new Request("http://x/api/transit-segments/all?routes=A;drop"))).status).toBe(400);
    expect((await GET_ALL(new Request("http://x/api/transit-segments/all"))).status).toBe(400);
    expect(octoQuery).not.toHaveBeenCalled();
  });
});

describe("pooling by MTA schedule and time of day (#648)", () => {
  it("shares one schedule across Monday to Friday and keeps Saturday and Sunday apart", () => {
    for (const d of [1, 2, 3, 4, 5]) expect(scheduleDows(d)).toEqual([1, 2, 3, 4, 5]);
    expect(scheduleDows(6)).toEqual([6]);
    expect(scheduleDows(7)).toEqual([7]);
  });

  it("puts every hour of the day in exactly one band, with night as its own band", () => {
    for (let h = 0; h < 24; h++) {
      const [lo, hi] = bandHours(h);
      expect(h).toBeGreaterThanOrEqual(lo);
      expect(h).toBeLessThanOrEqual(hi);
      expect(BANDS.filter(([a, b]) => h >= a && h <= b)).toHaveLength(1);
    }
    expect(bandHours(0)).toEqual([0, 4]);
    expect(bandHours(3)).toEqual([0, 4]);
    expect(bandHours(8)).toEqual([7, 9]);
    expect(bandHours(23)).toEqual([20, 23]);
  });

  it("asks for a Saturday evening pool when asked about Saturday 22:00", async () => {
    octoQuery.mockResolvedValue({ rows: [] });
    await GET_ALL(new Request("http://x/api/transit-segments/all?routes=A&dow=6&hour=22"));
    expect(octoQuery.mock.calls.at(-1)![1]).toEqual([["A"], [6], 20, 23]);
  });
});
