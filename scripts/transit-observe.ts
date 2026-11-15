/**
 * Polls the subway GTFS-rt feeds for a while and logs observed segment travel
 * and dwell times into Octo (raw.transit_segment_obs), then trims rows older
 * than 60 days and refreshes marts.transit_segment_hourly. With MTA_BUSTIME_KEY
 * set it also tracks bus vehicle positions in memory and, at the end of the run,
 * pushes one median per bus segment and hour of week into the bounded reservoir
 * raw.transit_bus_segment_samples (last 15 runs per key; idle keys trimmed at 60 days). Runs on the
 * VPS every 15 minutes (the nyc-transit-observe timer in server-management), not on a laptop.
 *
 * The same run scores the tracker (#11, server/features/transit/score.ts): it predicts arrivals
 * with the learned times the live site serves, compares them with what the feeds then show, and
 * stores a capped sample in raw.transit_prediction_scores (21 days), each with the conditions at the
 * time (notice active, rain or snow, traffic by the bus stop; conditions.ts). It ends by refreshing the
 * views the tracker health page reads. Scoring never stops the learning: its errors are logged.
 * Last, it imports the MTA's published bus speeds for a few routes (busSpeeds.ts), 8 a run.
 *
 *   pnpm transit:observe [minutes=13] [intervalSeconds=30]
 */
import { octoQuery } from "../api/_lib/octo";
import { loadBuses, loadTrips } from "../server/features/transit/routes";
import { BusObserver, runMedians, type BusObs } from "../server/features/transit/busObserve";
import { nyHourOfWeek } from "../server/features/transit/segments";
import { SegmentObserver, type SegmentObs } from "../server/features/transit/observe";
import { BusScorer, sample, SubwayScorer, type BusSegRow, type Score, type Tally } from "../server/features/transit/score";
import { noticeRoutes, trafficNear, wetness, type SpeedLink } from "../server/features/transit/conditions";
import type { SegmentRow } from "../src/features/transit/history";
import type { RouteGeom } from "../src/features/transit/busEstimate";
import { foldSpeeds, speedsUrl, type SocrataRow } from "../server/features/transit/busSpeeds";
import { loadEnv } from "./env";

const RETENTION_DAYS = 60;

async function write(rows: SegmentObs[]) {
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const params: unknown[] = [];
    const values = chunk.map((r) => {
      params.push(new Date(r.observedAt * 1000).toISOString(), r.system, r.route, r.dir, r.from, r.to, r.kind, r.seconds, r.tripId);
      const b = params.length - 9;
      return `(${Array.from({ length: 9 }, (_, k) => `$${b + k + 1}`).join(",")})`;
    });
    await octoQuery(
      `INSERT INTO raw.transit_segment_obs (observed_at, system, route, dir, from_stop, to_stop, kind, seconds, trip_id) VALUES ${values.join(",")} ON CONFLICT DO NOTHING`,
      params,
    );
  }
}

const BUS_SAMPLES = 15;

async function writeBus(obs: BusObs[]) {
  const rows = runMedians(obs, (at) => nyHourOfWeek(new Date(at * 1000)));
  for (let i = 0; i < rows.length; i += 400) {
    const chunk = rows.slice(i, i + 400);
    const params: unknown[] = [];
    const values = chunk.map((r) => {
      params.push(r.route, r.dir, r.from, r.to, r.kind, r.dow, r.hour, r.median);
      const b = params.length - 8;
      return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},ARRAY[$${b + 8}::real])`;
    });
    await octoQuery(
      `INSERT INTO raw.transit_bus_segment_samples AS t (route, dir, from_stop, to_stop, kind, dow, hour, samples) VALUES ${values.join(",")}
       ON CONFLICT (route, dir, from_stop, to_stop, kind, dow, hour)
       DO UPDATE SET samples = (excluded.samples || t.samples)[1:${BUS_SAMPLES}], updated_at = now()`,
      params,
    );
  }
  await octoQuery(`DELETE FROM raw.transit_bus_segment_samples WHERE updated_at < now() - interval '${RETENTION_DAYS} days'`);
  return rows.length;
}

/** Scores kept per system per run, and for how long: at most 400 x 2 x 96 runs a day x 21 days = 1.6 million rows. */
const SCORE_CAP = 400, SCORE_DAYS = 21;
/** Bus routes scored per run; the choice moves on each run, so every route comes round every few hours. */
const BUS_ROUTES_PER_RUN = 16;

/** The learned times exactly as the app's clients get them: from the live site. */
async function site<T>(path: string): Promise<T> {
  const base = (process.env.SCORE_API_BASE ?? "https://nyc.design-bakery.com").replace(/\/$/, "");
  const res = await fetch(base + path, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return (await res.json()) as T;
}

async function subwayScorer(routes: string[], runEnd: number): Promise<SubwayScorer> {
  const { dow, hour } = nyHourOfWeek(new Date());
  const list = [...new Set(routes)].filter((r) => /^[A-Za-z0-9]{1,4}$/.test(r)).sort().slice(0, 50);
  const body = await site<{ routes: Record<string, SegmentRow[]> }>(`/api/transit-segments/all?${new URLSearchParams({ routes: list.join(","), dow: String(dow), hour: String(hour) })}`);
  return new SubwayScorer(body.routes, runEnd);
}

async function busScorer(routes: string[], runEnd: number, slot: number): Promise<BusScorer> {
  const scorer = new BusScorer(runEnd);
  const all = [...new Set(routes)].filter((r) => /^[A-Za-z]{1,3}\d{1,3}[A-Za-z+]{0,2}$/.test(r)).sort();
  const start = all.length ? (slot * BUS_ROUTES_PER_RUN) % all.length : 0;
  const picked = [...all.slice(start), ...all.slice(0, start)].slice(0, BUS_ROUTES_PER_RUN);
  for (const route of picked) {
    try {
      const q = new URLSearchParams({ route });
      const [geom, segs] = await Promise.all([site<RouteGeom>(`/api/transit/bus-route?${q}`), site<{ segments: BusSegRow[] }>(`/api/transit-bus-segments?${q}`)]);
      if (geom.lines?.length) scorer.setRoute({ ...geom, route }, segs.segments);
    } catch (err) {
      console.error(`score: bus route ${route} skipped: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return scorer;
}

/**
 * What the day was like, read once at the start of the run from the live site: the notices in
 * effect, the weather (one reading, Midtown) and the DOT speed links. Each is optional: a failed
 * read leaves that condition unknown for the run's scores.
 */
type Context = { notices?: Set<string>; weather: ReturnType<typeof wetness>; links?: SpeedLink[] };
async function readContext(at: number): Promise<Context> {
  const [alerts, weather, traffic] = await Promise.all([
    site<{ alerts: Array<{ routes?: string[]; start?: number; end?: number }> }>("/api/transit/alerts").catch(logged("score: notices unknown this run")),
    site<{ kind?: string }>("/api/weather?lat=40.75&lon=-73.98").catch(logged("score: weather unknown this run")),
    site<{ features: Array<{ properties: { level: string }; geometry: { coordinates: Array<[number, number]> } }> }>("/api/traffic").catch(logged("score: traffic unknown this run")),
  ]);
  return {
    notices: alerts ? noticeRoutes(alerts.alerts ?? [], at) : undefined,
    weather: wetness(weather?.kind),
    links: traffic?.features?.filter((f) => Array.isArray(f.geometry?.coordinates)).map((f) => ({ level: f.properties.level, coords: f.geometry.coordinates })),
  };
}

async function writeScores(runAt: Date, scores: Score[], tallies: Array<[Score["system"], Tally]>, ctx: Context, busScore?: BusScorer) {
  const rows = (["subway", "bus"] as const).flatMap((system) => sample(scores.filter((s) => s.system === system), SCORE_CAP));
  for (const r of rows) {
    r.notice = ctx.notices ? ctx.notices.has(r.route) : null;
    r.weather = ctx.weather;
    const p = r.system === "bus" && ctx.links ? busScore?.stopPoint(r.route, r.to) : undefined;
    r.traffic = p && ctx.links ? trafficNear(ctx.links, p[0], p[1]) : null;
  }
  const COLS = 16;
  for (let i = 0; i < rows.length; i += 400) {
    const params: unknown[] = [];
    const values = rows.slice(i, i + 400).map((r) => {
      params.push(new Date(r.at * 1000).toISOString(), r.system, r.route, r.dir, r.from, r.to, r.legs, r.lead, r.actual, r.errModel, r.errBase, r.learnedN, r.truth, r.notice ?? null, r.weather ?? null, r.traffic ?? null);
      const b = params.length - COLS;
      return `(${Array.from({ length: COLS }, (_, k) => `$${b + k + 1}`).join(",")})`;
    });
    await octoQuery(
      `INSERT INTO raw.transit_prediction_scores (scored_at, system, route, dir, from_stop, to_stop, legs, lead_s, actual_s, err_model_s, err_base_s, learned_n, truth, notice, weather, traffic) VALUES ${values.join(",")}`,
      params,
    );
  }
  for (const [system, t] of tallies) {
    await octoQuery(
      "INSERT INTO raw.transit_prediction_runs (run_at, system, opened, resolved, unresolved, stored) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING",
      [runAt.toISOString(), system, t.opened, t.resolved, t.unresolved, rows.filter((r) => r.system === system).length],
    );
  }
  await octoQuery(`DELETE FROM raw.transit_prediction_scores WHERE scored_at < now() - interval '${SCORE_DAYS} days'`);
  await octoQuery(`DELETE FROM raw.transit_prediction_runs WHERE run_at < now() - interval '${SCORE_DAYS} days'`);
  return rows.length;
}

async function refresh(view: string) {
  await octoQuery(`REFRESH MATERIALIZED VIEW CONCURRENTLY ${view}`).catch(() => octoQuery(`REFRESH MATERIALIZED VIEW ${view}`));
}

const logged = (what: string) => (err: unknown) => {
  console.error(`${what}: ${err instanceof Error ? err.message : String(err)}`);
  return undefined;
};

/** MTA bus speeds (busSpeeds.ts): routes imported per run, and how long an import stays fresh. */
const SPEED_ROUTES_PER_RUN = 8, SPEED_FRESH_DAYS = 30;

/**
 * Imports the MTA's published timepoint speeds for a few bus routes that have none yet or whose
 * import is over 30 days old: the last three published months, about 430 rows a route. With 8
 * routes a run, every route in the feed is in within a day, and each is then left for a month.
 */
async function importBusSpeeds(routes: string[]): Promise<number> {
  const all = [...new Set(routes)].filter((r) => /^[A-Za-z]{1,3}\d{1,3}[A-Za-z+]{0,2}$/.test(r)).sort();
  const fresh = new Set((await octoQuery<{ route: string }>(`SELECT route FROM raw.mta_bus_speed_imports WHERE imported_at > now() - interval '${SPEED_FRESH_DAYS} days'`)).rows.map((r) => r.route));
  const picked = all.filter((r) => !fresh.has(r)).slice(0, SPEED_ROUTES_PER_RUN);
  // The dataset is published by month, about six weeks behind: four months back holds the last three.
  const from = new Date();
  from.setUTCMonth(from.getUTCMonth() - 4, 1);
  const since = from.toISOString().slice(0, 10);
  for (const route of picked) {
    const res = await fetch(speedsUrl(route, since), { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`bus speeds ${route}: ${res.status}`);
    const rows = foldSpeeds((await res.json()) as SocrataRow[]);
    await octoQuery("DELETE FROM raw.mta_bus_segment_speeds WHERE route = $1", [route]);
    for (let i = 0; i < rows.length; i += 400) {
      const params: unknown[] = [];
      const values = rows.slice(i, i + 400).map((r) => {
        params.push(route, r.direction, r.from, r.to, r.order, r.sched, r.hour, r.seconds, r.metres, r.trips);
        const b = params.length - 10;
        return `(${Array.from({ length: 10 }, (_, k) => `$${b + k + 1}`).join(",")})`;
      });
      await octoQuery(
        `INSERT INTO raw.mta_bus_segment_speeds (route, direction, from_stop, to_stop, stop_order, sched, hour, avg_s, distance_m, trips) VALUES ${values.join(",")} ON CONFLICT DO NOTHING`,
        params,
      );
    }
    // A route the dataset does not have is recorded with no rows, so it is not asked for again every run.
    await octoQuery(
      "INSERT INTO raw.mta_bus_speed_imports (route, imported_at, since, rows) VALUES ($1, now(), $2, $3) ON CONFLICT (route) DO UPDATE SET imported_at = now(), since = excluded.since, rows = excluded.rows",
      [route, since, rows.length],
    );
  }
  return picked.length;
}

async function main() {
  loadEnv();
  const minutes = Number(process.argv[2] ?? 13), every = Number(process.argv[3] ?? 30);
  const ext = await octoQuery<{ name: string }>("SELECT name FROM pg_available_extensions WHERE name = 'timescaledb'");
  console.log(`timescaledb available: ${ext.rows.length > 0} (rollup uses a plain materialized view either way)`);
  const obs = new SegmentObserver("subway");
  const busKey = process.env.MTA_BUSTIME_KEY;
  const busObs = new BusObserver();
  const busRows: BusObs[] = [];
  const started = new Date();
  const end = Date.now() + minutes * 60_000;
  // Learned times are read once, at the first poll, so nothing this run observes can leak into its own score.
  let subScore: SubwayScorer | undefined, busScore: BusScorer | undefined;
  let subTried = process.env.SCORE_OFF === "1", busTried = subTried;
  const scores: Score[] = [];
  let feedRoutes: string[] = [];
  const ctx: Context = subTried ? { weather: null } : await readContext(started.getTime() / 1000);
  let total = 0;
  while (Date.now() < end) {
    try {
      const { at, trips } = await loadTrips("subway");
      const rows = obs.ingest(trips, at);
      if (rows.length) await write(rows);
      total += rows.length;
      if (!subTried) {
        subTried = true;
        subScore = await subwayScorer(trips.map((t) => t.route), end / 1000).catch(logged("score: subway off this run"));
      }
      if (subScore) scores.push(...subScore.ingest(trips, at));
    } catch (err) {
      console.error(`poll failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (busKey) {
      try {
        const { buses } = await loadBuses(busKey);
        busRows.push(...busObs.ingest(buses));
        if (!busTried) {
          busTried = true;
          feedRoutes = buses.map((b) => b.route);
          busScore = await busScorer(buses.map((b) => b.route), end / 1000, Math.floor(started.getTime() / 900_000)).catch(logged("score: buses off this run"));
        }
        if (busScore) scores.push(...busScore.ingest(buses));
      } catch (err) {
        console.error(`bus poll failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    await new Promise((r) => setTimeout(r, every * 1000));
  }
  await octoQuery(`DELETE FROM raw.transit_segment_obs WHERE observed_at < now() - interval '${RETENTION_DAYS} days'`);
  await octoQuery("REFRESH MATERIALIZED VIEW CONCURRENTLY marts.transit_segment_hourly").catch(() =>
    octoQuery("REFRESH MATERIALIZED VIEW marts.transit_segment_hourly"),
  );
  console.log(`logged ${total} observations`);
  if (busKey) console.log(`bus: ${busRows.length} observations -> ${await writeBus(busRows)} segment samples`);
  try {
    const tallies: Array<[Score["system"], Tally]> = [];
    if (subScore) tallies.push(["subway", subScore.finish()]);
    if (busScore) tallies.push(["bus", busScore.finish()]);
    if (tallies.length) {
      const stored = await writeScores(started, scores, tallies, ctx, busScore);
      console.log(`score: ${tallies.map(([s, t]) => `${s} ${t.resolved} of ${t.opened} predictions resolved, ${t.unresolved} unresolved`).join("; ")}; stored ${stored}`);
    }
    for (const view of ["marts.transit_prediction_summary", "marts.transit_prediction_thin", "marts.transit_prediction_stops", "marts.transit_coverage", "marts.transit_coverage_hourly"]) await refresh(view);
  } catch (err) {
    logged("score: not stored")(err);
  }
  if (feedRoutes.length && process.env.SPEEDS_OFF !== "1") {
    await importBusSpeeds(feedRoutes).then((n) => { if (n) console.log(`bus speeds: imported ${n} routes from data.ny.gov`); }, logged("bus speeds: not imported"));
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
