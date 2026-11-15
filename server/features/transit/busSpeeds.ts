/**
 * The MTA's published bus speeds between timepoints (data.ny.gov kufs-yh3x), set
 * beside our own learned times (#11). The dataset has, per route, direction and
 * pair of consecutive timepoints, the average travel time and trips by month,
 * day of the week and hour. Timepoints are the major stops, with the same stop
 * ids our bus rows use, so one MTA segment spans several of our stop-to-stop
 * stretches. Open NY's terms allow any lawful reuse and ask for no attribution.
 *
 * The observer imports a few routes per run into raw.mta_bus_segment_speeds
 * (`speedsUrl`, `foldSpeeds`); GET /api/transit-health/bus-speeds reads that
 * table. Nothing calls data.ny.gov when a page is viewed.
 */
import { z } from "zod";
import { octoQuery } from "../../../api/_lib/octo";
import { fail, json, parseQuery } from "../../../api/_lib/http";
import { nyHourOfWeek } from "./segments";

const DATASET = "https://data.ny.gov/resource/kufs-yh3x.json";
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MILE_M = 1609.344;

/** One route's rows since a month, already summed by direction, timepoint pair, day and hour (about 1,000 rows). */
export function speedsUrl(route: string, since: string): string {
  const q = new URLSearchParams({
    $select: "direction,stop_order,timepoint_stop_id,next_timepoint_stop_id,day_of_week,hour_of_day,sum(average_travel_time*bus_trip_count) as tt,sum(bus_trip_count) as trips,avg(road_distance) as dist",
    $where: `route_id='${route.replace(/'/g, "")}' AND timestamp >= '${since}T00:00:00'`,
    $group: "direction,stop_order,timepoint_stop_id,next_timepoint_stop_id,day_of_week,hour_of_day",
    $limit: "20000",
  });
  return `${DATASET}?${q}`;
}

export type SocrataRow = { direction?: string; stop_order?: string; timepoint_stop_id?: string; next_timepoint_stop_id?: string; day_of_week?: string; hour_of_day?: string; tt?: string; trips?: string; dist?: string };
export type SpeedRow = { direction: string; from: string; to: string; order: number; sched: number; hour: number; seconds: number; metres: number; trips: number };

/** The dataset's rows by day of the week, folded to our three schedules: travel time averaged by trips, minutes to seconds, miles to metres. */
export function foldSpeeds(rows: SocrataRow[]): SpeedRow[] {
  const out = new Map<string, SpeedRow & { tt: number }>();
  for (const r of rows) {
    const dow = DAYS.indexOf(r.day_of_week ?? "") + 1, hour = Number(r.hour_of_day), trips = Number(r.trips), tt = Number(r.tt), miles = Number(r.dist);
    if (!dow || !r.direction || !r.timepoint_stop_id || !r.next_timepoint_stop_id || !(hour >= 0 && hour <= 23) || !(trips > 0) || !(tt > 0) || !(miles > 0)) continue;
    const sched = dow <= 5 ? 1 : dow;
    const k = [r.direction, r.timepoint_stop_id, r.next_timepoint_stop_id, sched, hour].join("|");
    const cur = out.get(k);
    if (cur) { cur.tt += tt; cur.trips += trips; } else out.set(k, { direction: r.direction, from: r.timepoint_stop_id, to: r.next_timepoint_stop_id, order: Number(r.stop_order) || 0, sched, hour, seconds: 0, metres: miles * MILE_M, trips, tt });
  }
  return [...out.values()].map(({ tt, ...r }) => ({ ...r, seconds: (tt / r.trips) * 60 }));
}

export const Query = z.object({
  route: z.string().regex(/^[A-Za-z]{1,3}\d{1,3}[A-Za-z+]{0,2}$/),
  dow: z.coerce.number().int().min(1).max(7).optional(),
  hour: z.coerce.number().int().min(0).max(23).optional(),
});
const Segment = z.object({
  /** The MTA's compass letter for the direction. */
  direction: z.string(),
  order: z.number().int(),
  from: z.string(),
  to: z.string(),
  /** Average seconds between the two timepoints at this schedule and hour, and the trips behind it. */
  seconds: z.number(),
  metres: z.number(),
  trips: z.number().int(),
});
export const Response_ = z.object({ ready: z.boolean(), route: z.string(), dow: z.number().int(), hour: z.number().int(), since: z.string().nullable(), importedAt: z.string().nullable(), segments: z.array(Segment) });
export type BusSpeedsResponse = z.infer<typeof Response_>;

/** GET /api/transit-health/bus-speeds?route=M15[&dow=1-7&hour=0-23]: the imported MTA averages for one route, schedule and hour. */
export async function GET(request: Request): Promise<Response> {
  const q = parseQuery(Query, request.url);
  if (q instanceof Response) return q;
  const now = nyHourOfWeek(new Date());
  const dow = q.dow ?? now.dow, hour = q.hour ?? now.hour, route = q.route.toUpperCase();
  const empty: BusSpeedsResponse = { ready: false, route, dow, hour, since: null, importedAt: null, segments: [] };
  try {
    const [rows, imp] = await Promise.all([
      octoQuery<{ direction: string; stop_order: number; from_stop: string; to_stop: string; avg_s: number; distance_m: number; trips: number }>(
        "SELECT direction, stop_order, from_stop, to_stop, avg_s, distance_m, trips FROM raw.mta_bus_segment_speeds WHERE route = $1 AND sched = $2 AND hour = $3 ORDER BY direction, stop_order",
        [route, dow <= 5 ? 1 : dow, hour],
        { rowLimit: 500 },
      ),
      octoQuery<{ imported_at: string; since: string }>("SELECT imported_at, since FROM raw.mta_bus_speed_imports WHERE route = $1", [route]),
    ]);
    const body: BusSpeedsResponse = {
      ...empty,
      ready: imp.rows.length > 0,
      since: imp.rows[0] ? String(imp.rows[0].since).slice(0, 10) : null,
      importedAt: imp.rows[0] ? new Date(imp.rows[0].imported_at).toISOString() : null,
      segments: rows.rows.map((r) => ({ direction: r.direction, order: Number(r.stop_order), from: r.from_stop, to: r.to_stop, seconds: Number(r.avg_s), metres: Number(r.distance_m), trips: Number(r.trips) })),
    };
    return json(body, { maxAge: 3600, browserMaxAge: 600 });
  } catch (err) {
    if (/does not exist/i.test(err instanceof Error ? err.message : String(err))) return json(empty, { maxAge: 60, browserMaxAge: 30 });
    return fail(err);
  }
}
