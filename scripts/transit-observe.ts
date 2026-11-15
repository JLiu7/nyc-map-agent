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
 * stores a capped sample in raw.transit_prediction_scores (21 days). It ends by refreshing the
 * views the tracker health page reads. Scoring never stops the learning: its errors are logged.
 *
 *   pnpm transit:observe [minutes=13] [intervalSeconds=30]
 */
import { octoQuery } from "../api/_lib/octo";
import { loadBuses, loadTrips } from "../server/features/transit/routes";
import { BusObserver, runMedians, type BusObs } from "../server/features/transit/busObserve";
import { nyHourOfWeek } from "../server/features/transit/segments";
import { SegmentObserver, type SegmentObs } from "../server/features/transit/observe";
import { BusScorer, sample, SubwayScorer, type BusSegRow, type Score, type Tally } from "../server/features/transit/score";
import type { SegmentRow } from "../src/features/transit/history";
import type { RouteGeom } from "../src/features/transit/busEstimate";
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

async function writeScores(runAt: Date, scores: Score[], tallies: Array<[Score["system"], Tally]>) {
  const rows = (["subway", "bus"] as const).flatMap((system) => sample(scores.filter((s) => s.system === system), SCORE_CAP));
  for (let i = 0; i < rows.length; i += 400) {
    const params: unknown[] = [];
    const values = rows.slice(i, i + 400).map((r) => {
      params.push(new Date(r.at * 1000).toISOString(), r.system, r.route, r.dir, r.from, r.to, r.legs, r.lead, r.actual, r.errModel, r.errBase, r.learnedN, r.truth);
      const b = params.length - 13;
      return `(${Array.from({ length: 13 }, (_, k) => `$${b + k + 1}`).join(",")})`;
    });
    await octoQuery(
      `INSERT INTO raw.transit_prediction_scores (scored_at, system, route, dir, from_stop, to_stop, legs, lead_s, actual_s, err_model_s, err_base_s, learned_n, truth) VALUES ${values.join(",")}`,
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
      const stored = await writeScores(started, scores, tallies);
      console.log(`score: ${tallies.map(([s, t]) => `${s} ${t.resolved} of ${t.opened} predictions resolved, ${t.unresolved} unresolved`).join("; ")}; stored ${stored}`);
    }
    for (const view of ["marts.transit_prediction_summary", "marts.transit_prediction_thin", "marts.transit_coverage"]) await refresh(view);
  } catch (err) {
    logged("score: not stored")(err);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
