-- migrate:up
-- The MTA's published bus speeds between timepoints (data.ny.gov kufs-yh3x,
-- "MTA Bus Route Segment Speeds: Beginning 2025"), to set beside our own
-- learned times on the tracker health page (#11). The observer imports a few
-- routes per run (scripts/transit-observe.ts): the last three published months,
-- averaged by trips over the schedule (1 weekday, 6 Saturday, 7 Sunday) and
-- hour. Bounded: one row per route, direction, timepoint pair, schedule and
-- hour, about 430 rows a route and under 200,000 in all; a route's rows are
-- replaced when it is imported again, at most every 30 days.
CREATE TABLE IF NOT EXISTS raw.mta_bus_segment_speeds (
  route text NOT NULL,
  direction text NOT NULL,        -- the MTA's compass letter (N, S, E, W)
  from_stop text NOT NULL,        -- timepoint stop id, the same ids our bus rows use
  to_stop text NOT NULL,
  stop_order smallint NOT NULL,   -- the first timepoint's place along the route
  sched smallint NOT NULL CHECK (sched IN (1, 6, 7)),
  hour smallint NOT NULL CHECK (hour BETWEEN 0 AND 23),
  avg_s real NOT NULL,            -- average travel time, seconds, weighted by trips
  distance_m real NOT NULL,       -- road distance
  trips integer NOT NULL,
  PRIMARY KEY (route, direction, from_stop, to_stop, sched, hour)
);
CREATE TABLE IF NOT EXISTS raw.mta_bus_speed_imports (
  route text PRIMARY KEY,
  imported_at timestamptz NOT NULL DEFAULT now(),
  since date NOT NULL,            -- the first month included
  rows integer NOT NULL
);

-- migrate:down
DROP TABLE IF EXISTS raw.mta_bus_speed_imports;
DROP TABLE IF EXISTS raw.mta_bus_segment_speeds;
