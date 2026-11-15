/**
 * Tracker health (#11), read by the page at /tracker-health.
 *
 * GET /api/transit-health/coverage: how much the tracker has learned, per
 * subway line and bus route, schedule and time-of-day band, from
 * marts.transit_coverage. The scan behind it takes about 3 s on the bus table
 * (4.2 million rows), so the observer refreshes the view after each run and
 * this route only reads its few thousand rows.
 *
 * GET /api/transit-health/accuracy: how far off the tracker's predictions were,
 * from marts.transit_prediction_summary and marts.transit_prediction_thin
 * (server/features/transit/score.ts says what a prediction and its outcome are).
 *
 * GET /api/transit-health/hours: samples per single hour (see GET_HOURS).
 *
 * All answer `ready: false` until the observer's migration has run, since the
 * web app can deploy before the jobs checkout does.
 */
import { z } from "zod";
import { octoQuery } from "../../../api/_lib/octo";
import { fail, json, parseQuery } from "../../../api/_lib/http";
import { BANDS } from "./segments";

const System = z.enum(["subway", "bus"]);
const CoverageRow = z.object({
  system: System,
  route: z.string(),
  /** 1 weekday, 6 Saturday, 7 Sunday. */
  sched: z.number().int(),
  /** First hour of the time-of-day band. */
  band: z.number().int(),
  /** Stop-to-stop stretches with any sample; with enough for the app to use; with 5 or more. */
  segments: z.number().int(),
  used: z.number().int(),
  solid: z.number().int(),
  samples: z.number().int(),
});
export const CoverageResponse = z.object({
  ready: z.boolean(),
  refreshedAt: z.string().nullable(),
  bands: z.array(z.tuple([z.number().int(), z.number().int()])),
  rows: z.array(CoverageRow),
});
export type CoverageResponse = z.infer<typeof CoverageResponse>;

const Stats = { n: z.number().int(), maeModel: z.number().nullable(), maeBase: z.number().nullable(), w60Model: z.number().nullable(), w60Base: z.number().nullable() };
const AccuracyRow = z.object({
  system: System,
  dim: z.enum(["all", "route", "band", "lead", "samples"]),
  key: z.string(),
  ...Stats,
  /** The same over predictions a learned time entered, where learned and default can differ. */
  learned: z.object(Stats),
});
const ThinRow = z.object({ system: System, route: z.string(), dir: z.number().int(), from: z.string(), to: z.string(), n: z.number().int(), learnedN: z.number().int(), maeModel: z.number(), maeBase: z.number() });
const RunTotals = z.object({ system: System, runs: z.number().int(), opened: z.number().int(), resolved: z.number().int(), unresolved: z.number().int(), stored: z.number().int(), first: z.string().nullable(), last: z.string().nullable() });
/** A stop the tracker was scored at 5 or more times: the worst-predicted come first. */
const StopRow = z.object({ system: System, route: z.string(), stop: z.string(), n: z.number().int(), maeModel: z.number(), maeBase: z.number(), w60Model: z.number() });
/** Error split by the conditions at the time: `dim` is "rush", "notice", "weather" or "traffic". A list of its own, so `rows` keeps its groups. */
const ConditionRow = z.object({ system: System, dim: z.string(), key: z.string(), ...Stats, learned: z.object(Stats) });
export const AccuracyResponse = z.object({ ready: z.boolean(), rows: z.array(AccuracyRow), thin: z.array(ThinRow), runs: z.array(RunTotals), stops: z.array(StopRow), conditions: z.array(ConditionRow) });
export type AccuracyResponse = z.infer<typeof AccuracyResponse>;

const BASE_DIMS = new Set(["all", "route", "band", "lead", "samples"]);
/** The view or table is not there yet: the migration has not run. */
const missing = (err: unknown) => /does not exist|has not been populated/i.test(err instanceof Error ? err.message : String(err));
const num = (v: unknown) => (v == null ? null : Number(v));

export async function GET_COVERAGE(): Promise<Response> {
  const bands = BANDS.map(([a, b]) => [a, b] as [number, number]);
  try {
    const { rows } = await octoQuery<{ system: "subway" | "bus"; route: string; sched: number; band: number; segments: number; used: number; solid: number; samples: number; refreshed_at: string }>(
      "SELECT system, route, sched, band, segments, used, solid, samples, refreshed_at FROM marts.transit_coverage ORDER BY system, route, sched, band",
      [],
      { rowLimit: 20_000 },
    );
    const body: CoverageResponse = {
      ready: true,
      refreshedAt: rows[0] ? new Date(rows[0].refreshed_at).toISOString() : null,
      bands,
      rows: rows.map((r) => ({ system: r.system, route: r.route, sched: Number(r.sched), band: Number(r.band), segments: Number(r.segments), used: Number(r.used), solid: Number(r.solid), samples: Number(r.samples) })),
    };
    return json(body, { maxAge: 900, browserMaxAge: 300 });
  } catch (err) {
    if (missing(err)) return json({ ready: false, refreshedAt: null, bands, rows: [] } satisfies CoverageResponse, { maxAge: 60, browserMaxAge: 30 });
    return fail(err);
  }
}

type SummaryRow = { system: "subway" | "bus"; dim: string; key: string; n: number; mae_model: number | null; mae_base: number | null; w60_model: number | null; w60_base: number | null; l_n: number; l_mae_model: number | null; l_mae_base: number | null; l_w60_model: number | null; l_w60_base: number | null };

export async function GET_ACCURACY(): Promise<Response> {
  try {
    const [summary, thin, runs] = await Promise.all([
      octoQuery<SummaryRow>("SELECT * FROM marts.transit_prediction_summary ORDER BY system, dim, key", [], { rowLimit: 5000 }),
      octoQuery<{ system: "subway" | "bus"; route: string; dir: number; from_stop: string; to_stop: string; n: number; learned_n: number; mae_model: number; mae_base: number }>(
        "SELECT * FROM marts.transit_prediction_thin ORDER BY mae_model - mae_base DESC LIMIT 50",
      ),
      octoQuery<{ system: "subway" | "bus"; runs: number; opened: number; resolved: number; unresolved: number; stored: number; first: string | null; last: string | null }>(
        "SELECT system, count(*)::int AS runs, sum(opened)::int AS opened, sum(resolved)::int AS resolved, sum(unresolved)::int AS unresolved, sum(stored)::int AS stored, min(run_at) AS first, max(run_at) AS last FROM raw.transit_prediction_runs GROUP BY system ORDER BY system",
      ),
    ]);
    // The per-stop view came with a later migration: until the observer has run it, there are simply no stops.
    const stops = await octoQuery<{ system: "subway" | "bus"; route: string; to_stop: string; n: number; mae_model: number; mae_base: number; w60_model: number }>(
      "(SELECT * FROM marts.transit_prediction_stops WHERE system = 'subway' ORDER BY mae_model DESC LIMIT 40) UNION ALL (SELECT * FROM marts.transit_prediction_stops WHERE system = 'bus' ORDER BY mae_model DESC LIMIT 40)",
    ).catch((err) => { if (missing(err)) return { rows: [] }; throw err; });
    const all = summary.rows.map((r) => ({
      system: r.system, dim: r.dim, key: r.key,
      n: Number(r.n), maeModel: num(r.mae_model), maeBase: num(r.mae_base), w60Model: num(r.w60_model), w60Base: num(r.w60_base),
      learned: { n: Number(r.l_n), maeModel: num(r.l_mae_model), maeBase: num(r.l_mae_base), w60Model: num(r.l_w60_model), w60Base: num(r.l_w60_base) },
    }));
    const body: AccuracyResponse = {
      ready: true,
      stops: stops.rows.map((r) => ({ system: r.system, route: r.route, stop: r.to_stop, n: Number(r.n), maeModel: Number(r.mae_model), maeBase: Number(r.mae_base), w60Model: Number(r.w60_model) })),
      rows: all.filter((r) => BASE_DIMS.has(r.dim)) as AccuracyResponse["rows"],
      conditions: all.filter((r) => !BASE_DIMS.has(r.dim)),
      thin: thin.rows.map((r) => ({ system: r.system, route: r.route, dir: Number(r.dir), from: r.from_stop, to: r.to_stop, n: Number(r.n), learnedN: Number(r.learned_n), maeModel: Number(r.mae_model), maeBase: Number(r.mae_base) })),
      runs: runs.rows.map((r) => ({ system: r.system, runs: Number(r.runs), opened: Number(r.opened), resolved: Number(r.resolved), unresolved: Number(r.unresolved), stored: Number(r.stored), first: r.first ? new Date(r.first).toISOString() : null, last: r.last ? new Date(r.last).toISOString() : null })),
    };
    return json(body, { maxAge: 300, browserMaxAge: 120 });
  } catch (err) {
    if (missing(err)) return json({ ready: false, rows: [], thin: [], runs: [], stops: [], conditions: [] } satisfies AccuracyResponse, { maxAge: 60, browserMaxAge: 30 });
    return fail(err);
  }
}

export const HoursQuery = z.object({ system: System, route: z.string().regex(/^[A-Za-z0-9+]{1,6}$/).optional() });
const HourCell = z.object({
  /** 1 weekday, 6 Saturday, 7 Sunday. */
  sched: z.number().int(),
  hour: z.number().int(),
  /** Stop-to-stop stretches with any sample in that hour; with 5 or more; with 8 or more; and the samples. */
  segments: z.number().int(),
  solid: z.number().int(),
  enough: z.number().int(),
  samples: z.number().int(),
});
export const HoursResponse = z.object({ ready: z.boolean(), system: System, route: z.string().nullable(), cells: z.array(HourCell) });
export type HoursResponse = z.infer<typeof HoursResponse>;

/**
 * GET /api/transit-health/hours?system=subway[&route=A]: samples per single hour of each schedule,
 * for one line or route or summed over the system, from marts.transit_coverage_hourly. It shows
 * where an hour by itself has enough data and where only the band pool does.
 */
export async function GET_HOURS(request: Request): Promise<Response> {
  const q = parseQuery(HoursQuery, request.url);
  if (q instanceof Response) return q;
  const route = q.route ? q.route.toUpperCase() : null;
  try {
    const { rows } = await octoQuery<{ sched: number; hour: number; segments: number; solid: number; enough: number; samples: number }>(
      `SELECT sched, hour, sum(segments)::int AS segments, sum(solid)::int AS solid, sum(enough)::int AS enough, sum(samples)::int AS samples
       FROM marts.transit_coverage_hourly WHERE system = $1 AND ($2::text IS NULL OR route = $2) GROUP BY sched, hour ORDER BY sched, hour`,
      [q.system, route],
      { rowLimit: 200 },
    );
    const body: HoursResponse = { ready: true, system: q.system, route, cells: rows.map((r) => ({ sched: Number(r.sched), hour: Number(r.hour), segments: Number(r.segments), solid: Number(r.solid), enough: Number(r.enough), samples: Number(r.samples) })) };
    return json(body, { maxAge: 900, browserMaxAge: 300 });
  } catch (err) {
    if (missing(err)) return json({ ready: false, system: q.system, route, cells: [] } satisfies HoursResponse, { maxAge: 60, browserMaxAge: 30 });
    return fail(err);
  }
}
