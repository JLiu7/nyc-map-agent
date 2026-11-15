import { beforeEach, describe, expect, it, vi } from "vitest";

const octoQuery = vi.fn<(sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>>();
vi.mock("../../../api/_lib/octo", () => ({ octoQuery: (sql: string, params?: unknown[]) => octoQuery(sql, params), OctoError: class extends Error {} }));
const { foldSpeeds, speedsUrl, GET, Response_ } = await import("./busSpeeds");

const row = (day: string, hour: number, tt: number, trips: number) => ({ direction: "S", stop_order: "5", timepoint_stop_id: "405516", next_timepoint_stop_id: "405472", day_of_week: day, hour_of_day: String(hour), tt: String(tt), trips: String(trips), dist: "4.901" });

describe("the MTA bus speeds import", () => {
  it("asks for one route since a month, grouped by direction, timepoint pair, day and hour", () => {
    const u = new URL(speedsUrl("M15+", "2026-08-01"));
    expect(u.origin + u.pathname).toBe("https://data.ny.gov/resource/kufs-yh3x.json");
    expect(u.searchParams.get("$where")).toBe("route_id='M15+' AND timestamp >= '2026-08-01T00:00:00'");
    expect(u.searchParams.get("$group")).toContain("day_of_week,hour_of_day");
  });

  it("folds weekdays into one schedule, weighting by trips, and keeps Saturday and Sunday apart", () => {
    // Friday: 85 trips summing 3636.65 minutes; Monday: 15 trips summing 363.35. Together 100 trips, 40 minutes each.
    const out = foldSpeeds([row("Friday", 18, 3636.65, 85), row("Monday", 18, 363.35, 15), row("Sunday", 18, 3730.45, 101), row("Friday", 18, 0, 0), { day_of_week: "Funday" }]);
    expect(out).toHaveLength(2);
    const weekday = out.find((r) => r.sched === 1)!;
    expect(weekday).toMatchObject({ direction: "S", from: "405516", to: "405472", order: 5, hour: 18, trips: 100 });
    expect(weekday.seconds).toBeCloseTo(2400, 5);
    expect(weekday.metres).toBeCloseTo(7887.4, 1);
    expect(out.find((r) => r.sched === 7)!.seconds).toBeCloseTo((3730.45 / 101) * 60, 5);
  });
});

describe("/api/transit-health/bus-speeds", () => {
  beforeEach(() => { octoQuery.mockReset(); });

  it("returns a route's imported segments for the schedule and hour asked for", async () => {
    octoQuery.mockImplementation((sql) => Promise.resolve({ rows: sql.includes("mta_bus_speed_imports") ? [{ imported_at: "2026-11-15T06:00:00Z", since: "2026-08-01" }] : [{ direction: "S", stop_order: 5, from_stop: "405516", to_stop: "405472", avg_s: 2400, distance_m: 7887.4, trips: 100 }] }));
    const body = Response_.parse(await (await GET(new Request("http://x/api/transit-health/bus-speeds?route=m15%2B&dow=6&hour=18"))).json());
    expect(body).toMatchObject({ ready: true, route: "M15+", dow: 6, hour: 18, since: "2026-08-01", segments: [{ direction: "S", order: 5, from: "405516", to: "405472", seconds: 2400, trips: 100 }] });
    expect(octoQuery.mock.calls.find(([sql]) => sql.includes("mta_bus_segment_speeds"))![1]).toEqual(["M15+", 6, 18]);
  });

  it("says not ready for a route not imported yet, and before the table exists", async () => {
    octoQuery.mockResolvedValue({ rows: [] });
    expect(Response_.parse(await (await GET(new Request("http://x/api/transit-health/bus-speeds?route=M22"))).json())).toMatchObject({ ready: false, segments: [] });
    octoQuery.mockRejectedValue(new Error('relation "raw.mta_bus_segment_speeds" does not exist'));
    expect(Response_.parse(await (await GET(new Request("http://x/api/transit-health/bus-speeds?route=M22"))).json())).toMatchObject({ ready: false });
    expect((await GET(new Request("http://x/api/transit-health/bus-speeds?route=../x"))).status).toBe(400);
  });
});
