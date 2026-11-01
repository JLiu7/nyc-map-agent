/**
 * GET /api/transit-bus-segments?route=M15[&dow=1-7&hour=0-23]: learned median
 * stop-to-stop travel seconds and stop dwell seconds for one bus route at one
 * New York hour of the week, from raw.transit_bus_segment_samples (a bounded
 * reservoir of per-run medians). dow/hour default to now. The client bus
 * estimator turns travel seconds into speeds with the route shape's stop spacing.
 */
import { z } from "zod";
import { octoQuery } from "../../../api/_lib/octo";
import { fail, json, parseQuery } from "../../../api/_lib/http";
import { bandHours, nyHourOfWeek, scheduleDows } from "./segments";

export const Query = z.object({
  route: z.string().regex(/^[A-Za-z]{1,3}\d{1,3}[A-Za-z+]{0,2}$/),
  dow: z.coerce.number().int().min(1).max(7).optional(),
  hour: z.coerce.number().int().min(0).max(23).optional(),
});

export const BusSegment = z.object({
  dir: z.number().int(),
  from: z.string(),
  to: z.string(),
  kind: z.enum(["travel", "dwell"]),
  n: z.number().int(),
  median: z.number(),
});
export const Response_ = z.object({ route: z.string(), dow: z.number().int(), hour: z.number().int(), segments: z.array(BusSegment) });
export type BusSegmentsResponse = z.infer<typeof Response_>;

export async function GET(request: Request): Promise<Response> {
  const q = parseQuery(Query, request.url);
  if (q instanceof Response) return q;
  const now = nyHourOfWeek(new Date());
  const dow = q.dow ?? now.dow, hour = q.hour ?? now.hour;
  const route = q.route.toUpperCase();
  try {
    const { rows } = await octoQuery<{ dir: number; from_stop: string; to_stop: string; kind: "travel" | "dwell"; n: number; median_s: number }>(
      // Pooled over the schedule and time-of-day band (see segments.ts): the median of every sample in the pool.
      `SELECT dir, from_stop, to_stop, kind, count(*)::int AS n,
              percentile_cont(0.5) WITHIN GROUP (ORDER BY x)::real AS median_s
       FROM raw.transit_bus_segment_samples, unnest(samples) AS x
       WHERE route = $1 AND dow = ANY($2::int[]) AND hour BETWEEN $3 AND $4
       GROUP BY dir, from_stop, to_stop, kind HAVING count(*) >= 2`,
      [route, scheduleDows(dow), ...bandHours(hour)],
      { rowLimit: 5000 },
    );
    const body: BusSegmentsResponse = {
      route, dow, hour,
      segments: rows.map((r) => ({ dir: Number(r.dir), from: r.from_stop, to: r.to_stop, kind: r.kind, n: Number(r.n), median: Number(r.median_s) })),
    };
    return json(body, { maxAge: 900, browserMaxAge: 600 });
  } catch (err) {
    return fail(err);
  }
}
