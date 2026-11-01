import { describe, expect, it } from "vitest";
import { readFeed } from "./gtfs";
import { estimate, serviceDay, toFerryData } from "./routes";

const s = (dep: number, arr: number, lon: number, lat: number) => ({ scheduledDeparture: dep, scheduledArrival: arr, serviceDay: 1000, stop: { lon, lat } });

// One NYC Ferry route with a single weekday trip from 10:00 to 10:20.
const feed = readFeed("ferry", {
  "routes.txt": 'route_id,route_short_name,route_long_name,route_color\n"RS","RS","Rockaway-Soundview",4E008E\n',
  "stops.txt": "stop_id,stop_name,stop_lat,stop_lon\n1,Wall St/Pier 11,40.70,-74.00\n2,Rockaway,40.60,-73.90\n",
  "trips.txt": "route_id,service_id,trip_id,shape_id\nRS,wk,t1,sh\n",
  "stop_times.txt": "trip_id,arrival_time,departure_time,stop_id,stop_sequence\nt1,10:00:00,10:00:00,1,1\nt1,10:20:00,10:20:00,2,2\n",
  "shapes.txt": "shape_id,shape_pt_lon,shape_pt_lat,shape_pt_sequence\nsh,-73.90,40.60,2\nsh,-74.00,40.70,1\n",
  "calendar.txt": "service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nwk,1,1,1,1,1,0,0,20261001,20261231\n",
});
// Monday 2026-11-02, 10:10 in New York (EST, UTC-5).
const monday1010 = Date.UTC(2026, 10, 2, 15, 10) / 1000;

describe("ferry glue", () => {
  it("interpolates a scheduled vessel between stops, null when not running", () => {
    const times = [s(100, 100, -74, 40.7), s(300, 300, -73.9, 40.7)];
    expect(estimate(times, 1200)).toMatchObject({ lon: -73.95, lat: 40.7 });
    expect(estimate(times, 2000)).toBeNull();
  });
  it("starts a New York service day at local midnight, across DST", () => {
    expect(serviceDay("20261102")).toBe(Date.UTC(2026, 10, 2, 5) / 1000);
    expect(serviceDay("20260701")).toBe(Date.UTC(2026, 6, 1, 4) / 1000);
  });
  it("builds lines, terminals and a scheduled boat from the timetable", () => {
    const d = toFerryData(feed, monday1010);
    expect(d.routes.features).toMatchObject([{ properties: { route: "Rockaway-Soundview", color: "#4E008E" }, geometry: { coordinates: [[-74, 40.7], [-73.9, 40.6]] } }]);
    expect(d.terminals.features).toHaveLength(2);
    expect(d.vessels).toMatchObject([{ id: "ferry:t1", route: "Rockaway-Soundview", source: "schedule" }]);
    expect(d.vessels[0].lon).toBeCloseTo(-73.95);
  });
  it("runs no scheduled boats on a day the service is off", () => {
    expect(toFerryData(feed, monday1010 + 5 * 86_400).vessels).toEqual([]);
  });
  it("prefers live positions over schedule estimates for a route", () => {
    const live = toFerryData(feed, monday1010, [{ id: "v1", route: "ferry:RS", lon: -73.95, lat: 40.65, heading: 90, at: monday1010 - 10 }]);
    expect(live.vessels).toEqual([{ id: "v1", route: "Rockaway-Soundview", lon: -73.95, lat: 40.65, heading: 90, source: "live" }]);
    const stale = toFerryData(feed, monday1010, [{ id: "v1", route: "ferry:RS", lon: -73.95, lat: 40.65, heading: 90, at: monday1010 - 3600 }]);
    expect(stale.vessels).toMatchObject([{ source: "schedule" }]);
  });
});
