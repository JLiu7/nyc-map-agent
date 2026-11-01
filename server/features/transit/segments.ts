/**
 * GET /api/transit-segments?route=G[&dow=1-7&hour=0-23]: historical median and
 * p80 segment travel / station dwell seconds for one subway route at one
 * New York hour of the week, from marts.transit_segment_hourly. dow/hour
 * default to now. The live interpolator blends these with realtime ETAs.
 *
 * GET /api/transit-segments/all?routes=A,C,E&dow=&hour=: the same rows for many
 * routes in one query and one response (the map asks for every line it draws).
 * With an explicit dow and hour the answer only changes when the marts refresh,
 * so it is cached for hours at the edge.
 */
import { z } from "zod";
import { octoQuery } from "../../../api/_lib/octo";
import { fail, json, parseQuery } from "../../../api/_lib/http";

export const Query = z.object({
  route: z.string().regex(/^[A-Za-z0-9]{1,4}$/),
  dow: z.coerce.number().int().min(1).max(7).optional(),
  hour: z.coerce.number().int().min(0).max(23).optional(),
});

export const Segment = z.object({
  dir: z.number().int(),
  from: z.string(),
  to: z.string(),
  kind: z.enum(["travel", "dwell"]),
  n: z.number().int(),
  median: z.number(),
  p80: z.number(),
});
export const Response_ = z.object({ route: z.string(), dow: z.number().int(), hour: z.number().int(), segments: z.array(Segment) });
export type SegmentsResponse = z.infer<typeof Response_>;

/** ISO weekday (1 = Monday) and hour in New York. */
export function nyHourOfWeek(d: Date): { dow: number; hour: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", hour: "numeric", hourCycle: "h23" }).formatToParts(d);
  const wd = parts.find((p) => p.type === "weekday")!.value;
  return { dow: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(wd) + 1, hour: Number(parts.find((p) => p.type === "hour")!.value) };
}

/**
 * The MTA runs three schedules: Weekday (Monday to Friday), Saturday and Sunday (checked in its GTFS
 * calendars, 2026-11-01). Learned times are pooled over the schedule and a time-of-day band, not kept
 * per day of the week, so each pool collects several times the samples (#648). Night is a band inside
 * each schedule (fewer trains and routes), not a fourth schedule. Holidays use the Sunday schedule;
 * not handled here.
 */
export const BANDS = [[0, 4], [5, 6], [7, 9], [10, 15], [16, 19], [20, 23]] as const;
/** The days of the week that share this day's schedule (ISO: 1 = Monday). */
export const scheduleDows = (dow: number): number[] => (dow <= 5 ? [1, 2, 3, 4, 5] : [dow]);
/** The first and last hour of the time-of-day band this hour is in. */
export function bandHours(hour: number): [number, number] {
  const [lo, hi] = BANDS.find(([a, b]) => hour >= a && hour <= b) ?? BANDS[BANDS.length - 1];
  return [lo, hi];
}
/** Pooled over a schedule and band: counts add, medians and 80th percentiles are averaged by count (an approximation). */
const POOLED = `SUM(n)::int AS n, (SUM(median_s * n) / SUM(n))::real AS median_s, (SUM(p80_s * n) / SUM(n))::real AS p80_s`;

export async function GET(request: Request): Promise<Response> {
  const q = parseQuery(Query, request.url);
  if (q instanceof Response) return q;
  const now = nyHourOfWeek(new Date());
  const dow = q.dow ?? now.dow, hour = q.hour ?? now.hour;
  try {
    const { rows } = await octoQuery<{ dir: number; from_stop: string; to_stop: string; kind: "travel" | "dwell"; n: number; median_s: number; p80_s: number }>(
      `SELECT dir, from_stop, to_stop, kind, ${POOLED} FROM marts.transit_segment_hourly
       WHERE system = 'subway' AND route = $1 AND dow = ANY($2::int[]) AND hour BETWEEN $3 AND $4
       GROUP BY dir, from_stop, to_stop, kind HAVING SUM(n) >= 3`,
      [q.route, scheduleDows(dow), ...bandHours(hour)],
      { rowLimit: 5000 },
    );
    const body: SegmentsResponse = {
      route: q.route,
      dow,
      hour,
      segments: rows.map((r) => ({ dir: Number(r.dir), from: r.from_stop, to: r.to_stop, kind: r.kind, n: Number(r.n), median: Number(r.median_s), p80: Number(r.p80_s) })),
    };
    return json(body, { maxAge: 900, browserMaxAge: 600 });
  } catch (err) {
    return fail(err);
  }
}

export const AllQuery = z.object({
  routes: z.string().max(200).regex(/^[A-Za-z0-9]{1,4}(,[A-Za-z0-9]{1,4}){0,49}$/, "comma-separated route ids (at most 50)"),
  dow: z.coerce.number().int().min(1).max(7).optional(),
  hour: z.coerce.number().int().min(0).max(23).optional(),
});
export const AllResponse = z.object({ dow: z.number().int(), hour: z.number().int(), routes: z.record(z.string(), z.array(Segment)) });
export type AllSegmentsResponse = z.infer<typeof AllResponse>;

export async function GET_ALL(request: Request): Promise<Response> {
  const q = parseQuery(AllQuery, request.url);
  if (q instanceof Response) return q;
  const routes = [...new Set(q.routes.split(","))].sort();
  const now = nyHourOfWeek(new Date());
  const pinned = q.dow != null && q.hour != null;
  const dow = q.dow ?? now.dow, hour = q.hour ?? now.hour;
  try {
    const { rows } = await octoQuery<{ route: string; dir: number; from_stop: string; to_stop: string; kind: "travel" | "dwell"; n: number; median_s: number; p80_s: number }>(
      `SELECT route, dir, from_stop, to_stop, kind, ${POOLED} FROM marts.transit_segment_hourly
       WHERE system = 'subway' AND route = ANY($1::text[]) AND dow = ANY($2::int[]) AND hour BETWEEN $3 AND $4
       GROUP BY route, dir, from_stop, to_stop, kind HAVING SUM(n) >= 3`,
      [routes, scheduleDows(dow), ...bandHours(hour)],
      { rowLimit: 50_000 },
    );
    const body: AllSegmentsResponse = { dow, hour, routes: Object.fromEntries(routes.map((r) => [r, []])) };
    for (const r of rows) {
      (body.routes[r.route] ??= []).push({ dir: Number(r.dir), from: r.from_stop, to: r.to_stop, kind: r.kind, n: Number(r.n), median: Number(r.median_s), p80: Number(r.p80_s) });
    }
    // A pinned hour of the week only changes when the marts refresh (nightly).
    return json(body, pinned ? { maxAge: 6 * 3600, browserMaxAge: 3600 } : { maxAge: 900, browserMaxAge: 600 });
  } catch (err) {
    return fail(err);
  }
}
