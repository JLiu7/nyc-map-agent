-- migrate:up
-- Tracker health (#11): how much the live tracker has learned, and how far off
-- its predictions are. Written by scripts/transit-observe.ts, read by
-- server/features/transit/health.ts.

-- One row per scored prediction (server/features/transit/score.ts). Bounded:
-- the observer stores at most 400 rows per system per run and deletes rows
-- older than 21 days, so the table stays under about 1.7 million rows.
CREATE TABLE IF NOT EXISTS raw.transit_prediction_scores (
  scored_at timestamptz NOT NULL,          -- when the vehicle got there
  system text NOT NULL CHECK (system IN ('subway', 'bus')),
  route text NOT NULL,
  dir smallint,
  from_stop text NOT NULL,                 -- where the vehicle was when the prediction was made
  to_stop text NOT NULL,                   -- the stop predicted
  legs smallint NOT NULL,
  lead_s real NOT NULL,                    -- seconds ahead, by the default prediction
  actual_s real NOT NULL,                  -- seconds it really took
  err_model_s real NOT NULL,               -- predicted minus actual, with learned times
  err_base_s real NOT NULL,                -- the same without learned times
  learned_n integer,                       -- fewest samples behind a learned time used; null = none used
  truth smallint NOT NULL                  -- 0 feed's last listed arrival, 1 vehicle "stopped at" report, 2 bus seen leaving
);
CREATE INDEX IF NOT EXISTS transit_prediction_scores_time ON raw.transit_prediction_scores (scored_at);

-- One row per system per observer run: how many predictions were opened, and
-- how many never resolved before the run ended (so late vehicles are counted).
CREATE TABLE IF NOT EXISTS raw.transit_prediction_runs (
  run_at timestamptz NOT NULL,
  system text NOT NULL,
  opened integer NOT NULL,
  resolved integer NOT NULL,
  unresolved integer NOT NULL,
  stored integer NOT NULL,
  PRIMARY KEY (run_at, system)
);

-- Error by line, time-of-day band, lead and sample count. `l_` columns cover
-- only predictions a learned time entered, where model and base can differ.
-- Bands are those of server/features/transit/segments.ts (BANDS).
CREATE MATERIALIZED VIEW IF NOT EXISTS marts.transit_prediction_summary AS
WITH s AS (
  SELECT system, route,
    CASE WHEN h <= 4 THEN 0 WHEN h <= 6 THEN 5 WHEN h <= 9 THEN 7 WHEN h <= 15 THEN 10 WHEN h <= 19 THEN 16 ELSE 20 END::text AS band,
    CASE WHEN lead_s < 180 THEN '1-3' WHEN lead_s < 360 THEN '3-6' ELSE '6-10' END AS lead,
    CASE WHEN learned_n IS NULL THEN 'none' WHEN learned_n < 5 THEN '2-4' WHEN learned_n < 10 THEN '5-9' ELSE '10+' END AS samples,
    abs(err_model_s) AS am, abs(err_base_s) AS ab, learned_n IS NOT NULL AS l
  FROM (SELECT *, extract(hour FROM scored_at AT TIME ZONE 'America/New_York') AS h FROM raw.transit_prediction_scores) x
), d AS (
  SELECT system, 'all' AS dim, '' AS key, am, ab, l FROM s
  UNION ALL SELECT system, 'route', route, am, ab, l FROM s
  UNION ALL SELECT system, 'band', band, am, ab, l FROM s
  UNION ALL SELECT system, 'lead', lead, am, ab, l FROM s
  UNION ALL SELECT system, 'samples', samples, am, ab, l FROM s
)
SELECT system, dim, key,
  count(*)::int AS n,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY am)::real AS mae_model,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY ab)::real AS mae_base,
  (avg((am <= 60)::int))::real AS w60_model,
  (avg((ab <= 60)::int))::real AS w60_base,
  (count(*) FILTER (WHERE l))::int AS l_n,
  (percentile_cont(0.5) WITHIN GROUP (ORDER BY am) FILTER (WHERE l))::real AS l_mae_model,
  (percentile_cont(0.5) WITHIN GROUP (ORDER BY ab) FILTER (WHERE l))::real AS l_mae_base,
  (avg((am <= 60)::int) FILTER (WHERE l))::real AS l_w60_model,
  (avg((ab <= 60)::int) FILTER (WHERE l))::real AS l_w60_base
FROM d GROUP BY system, dim, key;
CREATE UNIQUE INDEX IF NOT EXISTS transit_prediction_summary_key ON marts.transit_prediction_summary (system, dim, key);

-- Stretches where a learned time from fewer than 5 samples did worse than the
-- default, seen at least 3 times.
CREATE MATERIALIZED VIEW IF NOT EXISTS marts.transit_prediction_thin AS
SELECT system, route, coalesce(dir, -1)::smallint AS dir, from_stop, to_stop,
  count(*)::int AS n, min(learned_n)::int AS learned_n,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY abs(err_model_s))::real AS mae_model,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY abs(err_base_s))::real AS mae_base
FROM raw.transit_prediction_scores
WHERE learned_n < 5
GROUP BY 1, 2, 3, 4, 5
HAVING count(*) >= 3
  AND percentile_cont(0.5) WITHIN GROUP (ORDER BY abs(err_model_s)) > percentile_cont(0.5) WITHIN GROUP (ORDER BY abs(err_base_s));
CREATE UNIQUE INDEX IF NOT EXISTS transit_prediction_thin_key ON marts.transit_prediction_thin (system, route, dir, from_stop, to_stop);

-- How much has been learned: per line or bus route, schedule (1 weekday,
-- 6 Saturday, 7 Sunday) and time-of-day band, the stop-to-stop stretches with
-- any sample, with enough for the app to use them (3 subway observations, 2 bus
-- run medians: the thresholds in segments.ts and busSegments.ts), with 5 or
-- more, and the samples behind them. Subway samples are single observations;
-- bus samples are per-run medians, at most 15 kept per hour of the week.
CREATE MATERIALIZED VIEW IF NOT EXISTS marts.transit_coverage AS
SELECT system, route, sched, band,
  count(*)::int AS segments,
  (count(*) FILTER (WHERE n >= used_min))::int AS used,
  (count(*) FILTER (WHERE n >= 5))::int AS solid,
  sum(n)::int AS samples,
  now() AS refreshed_at
FROM (
  SELECT 'subway' AS system, 3 AS used_min, route,
    (CASE WHEN dow <= 5 THEN 1 ELSE dow END)::smallint AS sched,
    (CASE WHEN hour <= 4 THEN 0 WHEN hour <= 6 THEN 5 WHEN hour <= 9 THEN 7 WHEN hour <= 15 THEN 10 WHEN hour <= 19 THEN 16 ELSE 20 END)::smallint AS band,
    dir, from_stop, to_stop, sum(n) AS n
  FROM marts.transit_segment_hourly WHERE system = 'subway' AND kind = 'travel'
  GROUP BY 3, 4, 5, 6, 7, 8
  UNION ALL
  SELECT 'bus', 2, route,
    (CASE WHEN dow <= 5 THEN 1 ELSE dow END)::smallint,
    (CASE WHEN hour <= 4 THEN 0 WHEN hour <= 6 THEN 5 WHEN hour <= 9 THEN 7 WHEN hour <= 15 THEN 10 WHEN hour <= 19 THEN 16 ELSE 20 END)::smallint,
    dir, from_stop, to_stop, sum(cardinality(samples))
  FROM raw.transit_bus_segment_samples WHERE kind = 'travel'
  GROUP BY 3, 4, 5, 6, 7, 8
) s
GROUP BY system, route, sched, band;
CREATE UNIQUE INDEX IF NOT EXISTS transit_coverage_key ON marts.transit_coverage (system, route, sched, band);

-- migrate:down
DROP MATERIALIZED VIEW IF EXISTS marts.transit_coverage;
DROP MATERIALIZED VIEW IF EXISTS marts.transit_prediction_thin;
DROP MATERIALIZED VIEW IF EXISTS marts.transit_prediction_summary;
DROP TABLE IF EXISTS raw.transit_prediction_runs;
DROP TABLE IF EXISTS raw.transit_prediction_scores;
