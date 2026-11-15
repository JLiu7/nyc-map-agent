-- migrate:up
-- Tracker health, second step (#11): the conditions at the time of each scored
-- prediction, error per stop, and how many samples each single hour has.

-- Nullable, so rows scored before this stay valid and are left out of the splits.
ALTER TABLE raw.transit_prediction_scores
  ADD COLUMN IF NOT EXISTS notice boolean,   -- a service notice was active for the line or route
  ADD COLUMN IF NOT EXISTS weather text,     -- 'dry', 'rain' or 'snow' (one reading for the city, at the start of the run)
  ADD COLUMN IF NOT EXISTS traffic smallint; -- buses: the DOT speed link within 80 m of the stop: 0 free, 1 slow, 2 jam; null = no link near

-- The summary gains four ways to split error: rush hour, notice, weather, traffic.
DROP MATERIALIZED VIEW IF EXISTS marts.transit_prediction_summary;
CREATE MATERIALIZED VIEW marts.transit_prediction_summary AS
WITH s AS (
  SELECT system, route,
    CASE WHEN h <= 4 THEN 0 WHEN h <= 6 THEN 5 WHEN h <= 9 THEN 7 WHEN h <= 15 THEN 10 WHEN h <= 19 THEN 16 ELSE 20 END::text AS band,
    CASE WHEN lead_s < 180 THEN '1-3' WHEN lead_s < 360 THEN '3-6' ELSE '6-10' END AS lead,
    CASE WHEN learned_n IS NULL THEN 'none' WHEN learned_n < 5 THEN '2-4' WHEN learned_n < 10 THEN '5-9' ELSE '10+' END AS samples,
    -- Rush: Monday to Friday, 7 to 10 and 16 to 20, the two peak bands.
    CASE WHEN d <= 5 AND ((h BETWEEN 7 AND 9) OR (h BETWEEN 16 AND 19)) THEN 'rush' ELSE 'off-peak' END AS rush,
    CASE WHEN notice IS NULL THEN NULL WHEN notice THEN 'yes' ELSE 'no' END AS notice,
    weather,
    CASE traffic WHEN 0 THEN 'free' WHEN 1 THEN 'slow' WHEN 2 THEN 'jam' END AS traffic,
    abs(err_model_s) AS am, abs(err_base_s) AS ab, learned_n IS NOT NULL AS l
  FROM (SELECT *, extract(hour FROM scored_at AT TIME ZONE 'America/New_York') AS h, extract(isodow FROM scored_at AT TIME ZONE 'America/New_York') AS d FROM raw.transit_prediction_scores) x
), d AS (
  SELECT system, 'all' AS dim, '' AS key, am, ab, l FROM s
  UNION ALL SELECT system, 'route', route, am, ab, l FROM s
  UNION ALL SELECT system, 'band', band, am, ab, l FROM s
  UNION ALL SELECT system, 'lead', lead, am, ab, l FROM s
  UNION ALL SELECT system, 'samples', samples, am, ab, l FROM s
  UNION ALL SELECT system, 'rush', rush, am, ab, l FROM s
  UNION ALL SELECT system, 'notice', notice, am, ab, l FROM s WHERE notice IS NOT NULL
  UNION ALL SELECT system, 'weather', weather, am, ab, l FROM s WHERE weather IS NOT NULL
  UNION ALL SELECT system, 'traffic', traffic, am, ab, l FROM s WHERE traffic IS NOT NULL
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

-- Error per predicted stop, for stops scored at least 5 times.
CREATE MATERIALIZED VIEW IF NOT EXISTS marts.transit_prediction_stops AS
SELECT system, route, to_stop,
  count(*)::int AS n,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY abs(err_model_s))::real AS mae_model,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY abs(err_base_s))::real AS mae_base,
  (avg((abs(err_model_s) <= 60)::int))::real AS w60_model
FROM raw.transit_prediction_scores
GROUP BY 1, 2, 3 HAVING count(*) >= 5;
CREATE UNIQUE INDEX IF NOT EXISTS transit_prediction_stops_key ON marts.transit_prediction_stops (system, route, to_stop);

-- Samples per single hour: per line or route, schedule (1 weekday, 6 Saturday,
-- 7 Sunday) and hour, the stretches with any sample, with 5 or more, with 8 or
-- more (enough to trust the hour alone), and the samples.
CREATE MATERIALIZED VIEW IF NOT EXISTS marts.transit_coverage_hourly AS
SELECT system, route, sched, hour,
  count(*)::int AS segments,
  (count(*) FILTER (WHERE n >= 5))::int AS solid,
  (count(*) FILTER (WHERE n >= 8))::int AS enough,
  sum(n)::int AS samples
FROM (
  SELECT 'subway' AS system, route, (CASE WHEN dow <= 5 THEN 1 ELSE dow END)::smallint AS sched, hour, dir, from_stop, to_stop, sum(n) AS n
  FROM marts.transit_segment_hourly WHERE system = 'subway' AND kind = 'travel'
  GROUP BY 2, 3, 4, 5, 6, 7
  UNION ALL
  SELECT 'bus', route, (CASE WHEN dow <= 5 THEN 1 ELSE dow END)::smallint, hour, dir, from_stop, to_stop, sum(cardinality(samples))
  FROM raw.transit_bus_segment_samples WHERE kind = 'travel'
  GROUP BY 2, 3, 4, 5, 6, 7
) s
GROUP BY system, route, sched, hour;
CREATE UNIQUE INDEX IF NOT EXISTS transit_coverage_hourly_key ON marts.transit_coverage_hourly (system, route, sched, hour);

-- migrate:down
DROP MATERIALIZED VIEW IF EXISTS marts.transit_coverage_hourly;
DROP MATERIALIZED VIEW IF EXISTS marts.transit_prediction_stops;
-- The summary reads the three columns, so it goes first; then the summary of the first step comes back.
DROP MATERIALIZED VIEW IF EXISTS marts.transit_prediction_summary;
ALTER TABLE raw.transit_prediction_scores DROP COLUMN IF EXISTS notice, DROP COLUMN IF EXISTS weather, DROP COLUMN IF EXISTS traffic;
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
