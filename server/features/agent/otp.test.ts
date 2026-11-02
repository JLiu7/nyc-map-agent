import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decodePolyline, itineraryToTrip, rankItineraries, stopName, type OtpItinerary } from "./otp";
import { serviceChanges } from "../../../src/lib/transit/serviceChanges";
import { planTrip } from "./plan";
import { tripBrief } from "./trip";
import type { Station, StationEntrances, TransitPlanner } from "./transit";

// planTrip also asks the weather, the weather alerts and the walking router; offline, those fall back, so no test
// here waits on a live site (the shared CI runners timed out on them).
beforeEach(() => { vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline")))); });
afterEach(() => { vi.unstubAllGlobals(); });
const noStations: StationEntrances = { stations: () => Promise.resolve([]), entrances: () => Promise.resolve([]) };
const t = (h: string) => `2026-10-23T${h}:00-04:00`;
const pt = (name: string, lon: number, lat: number, stop = false) => ({ name, lon, lat, stop: stop ? { gtfsId: `X:${name}`, name } : null });
const time = (h: string) => ({ scheduledTime: t(h), estimated: null });
function walk(a: ReturnType<typeof pt>, b: ReturnType<typeof pt>, s: string, e: string) {
  return { mode: "WALK", duration: 300, distance: 400, start: time(s), end: time(e), from: a, to: b, route: null, legGeometry: null, intermediateStops: null, steps: [] };
}
function ride(route: string, mode: string, a: ReturnType<typeof pt>, b: ReturnType<typeof pt>, s: string, e: string, n = 3) {
  return { mode, duration: 1800, distance: 9000, realTime: false, headsign: "Rockaway Park", start: time(s), end: time(e), from: a, to: b,
    route: { gtfsId: `F:${route}`, shortName: route, longName: null as string | null, color: "0039A6" }, legGeometry: null,
    intermediateStops: Array.from({ length: n }, (_, i) => ({ name: `S${i}`, lat: 40.6, lon: -73.8 })), steps: [] };
}
const home = pt("Origin", -73.882, 40.742), beach = pt("Destination", -73.8197, 40.5833);
const busIt: OtpItinerary = { start: t("09:02"), end: t("10:00"), duration: 3480, numberOfTransfers: 0, walkDistance: 800, legs: [
  walk(home, pt("Broadway/Elmhurst Av", -73.881, 40.743, true), "09:02", "09:07"),
  ride("Q53-SBS", "BUS", pt("Broadway/Elmhurst Av", -73.881, 40.743, true), pt("Beach 98 St", -73.82, 40.585, true), "09:10", "09:52", 12),
  walk(pt("Beach 98 St", -73.82, 40.585, true), beach, "09:52", "10:00"),
] };
const subIt: OtpItinerary = { ...busIt, end: t("10:20"), numberOfTransfers: 1, legs: [
  walk(home, pt("Elmhurst Av", -73.882, 40.742, true), "09:00", "09:04"),
  ride("R", "SUBWAY", pt("Elmhurst Av", -73.882, 40.742, true), pt("Jay St", -73.98, 40.69, true), "09:05", "09:40"),
  ride("A", "SUBWAY", pt("Jay St", -73.98, 40.69, true), pt("Beach 98 St", -73.82, 40.585, true), "09:45", "10:12"),
  walk(pt("Beach 98 St", -73.82, 40.585, true), beach, "10:12", "10:20"),
] };

describe("OTP glue", () => {
  it("decodes a Google polyline as [lon, lat]", () => {
    expect(decodePolyline("_p~iF~ps|U_ulLnnqC")).toEqual([[-120.2, 38.5], [-120.95, 40.7]]);
  });
  it("title-cases upper-case bus stop names", () => {
    expect(stopName("ROCKAWAY BEACH BLVD/BEACH 96 ST")).toBe("Rockaway Beach Blvd/Beach 96 St");
    expect(stopName("Jay St-MetroTech")).toBe("Jay St-MetroTech");
  });
  it("ranks by arrival, then transfers, then walking, one per route sequence", () => {
    const sameArrival = { ...subIt, end: busIt.end };
    expect(rankItineraries([subIt, busIt, { ...busIt }]).map((i) => i.end)).toEqual([busIt.end, subIt.end]);
    expect(rankItineraries([sameArrival, busIt])[0]).toBe(busIt);
  });
  it("keeps only the subway or the bus when asked, and puts the shortest walk first for least walking", () => {
    expect(rankItineraries([subIt, busIt], 3, false, "subway")).toEqual([subIt]);
    expect(rankItineraries([subIt, busIt], 3, false, "bus")).toEqual([busIt]);
    const shortWalk = { ...subIt, walkDistance: 200 };
    expect(rankItineraries([busIt, shortWalk], 3, false, "less-walking")[0]).toBe(shortWalk);
  });
  it("maps a bus leg with bullet, stops and a final walk FROM the stop", async () => {
    const trip = await itineraryToTrip(busIt, { label: "Elmhurst Av", at: [-73.882, 40.742] }, { label: "Rockaway Beach", at: [-73.8197, 40.5833] }, noStations);
    const r = trip.legs.find((l) => l.kind === "ride");
    expect(r).toMatchObject({ route: "Q53+", mode: "bus", fromStop: "Broadway/Elmhurst Av", toStop: "Beach 98 St", numStops: 13 });
    expect(trip.legs.at(-1)?.label).toBe("Walk from Beach 98 St to Rockaway Beach");
    expect(trip.arriveIso).toBe("2026-10-23T10:00");
  });
  it("names ferry legs by route name", async () => {
    const f = ride("RS", "FERRY", pt("Wall St/Pier 11", -74.006, 40.703, true), pt("Rockaway", -73.83, 40.58, true), "09:04", "10:05", 3);
    f.route = { ...f.route, longName: "Rockaway" };
    const it2: OtpItinerary = { ...busIt, legs: [f] };
    const trip = await itineraryToTrip(it2, { label: "A", at: [-74, 40.7] }, { label: "B", at: [-73.83, 40.58] }, noStations);
    expect(trip.legs[0]).toMatchObject({ kind: "ride", mode: "ferry", route: "Rockaway", label: "Rockaway ferry Wall St/Pier 11 → Rockaway (toward Rockaway Park)" });
  });
  it("returns alternatives and falls back to the subway router when OTP is down", async () => {
    const o = { label: "A", at: [-73.882, 40.742] as [number, number] }, d = { label: "B", at: [-73.8197, 40.5833] as [number, number] };
    const ok = await planTrip(o, d, "2026-10-23T09:00", false, { otp: { plan: () => Promise.resolve([subIt, busIt]) }, entrances: noStations });
    expect(ok.planner).toBe("otp");
    expect(ok.routes).toEqual(["Q53+"]);
    expect(ok.alternatives.map((a) => a.routes)).toEqual([["R", "A"]]);
    const none: TransitPlanner = { plan: () => Promise.resolve(null) };
    const down = await planTrip(o, d, "2026-10-23T09:00", false, { otp: { plan: () => Promise.reject(new Error("down")) }, planner: none, entrances: noStations });
    expect(down.planner).toBe("fallback");
  });
  // Owner, 2026-10-27: a weekend Flushing trip went down the 7 with no word about the 7's work that day.
  it("flags a trip whose get-off station the line skips that day, ranks it last and offers the bus", async () => {
    const st7 = (name: string, lon: number, lat: number): Station => ({ id: name, complexId: name, name, routes: ["7"], structure: "Elevated", at: [lon, lat] });
    const stations = [st7("Flushing-Main St", -73.8303, 40.7596), st7("Mets-Willets Point", -73.8456, 40.7546), st7("Junction Blvd", -73.8692, 40.7491), st7("Grand Central-42 St", -73.9768, 40.7514)];
    const ents: StationEntrances = { stations: () => Promise.resolve(stations), entrances: () => Promise.resolve([]) };
    const gc = pt("Grand Central-42 St", -73.9768, 40.7514, true), main = pt("Flushing-Main St", -73.8303, 40.7596, true);
    const seven: OtpItinerary = { start: t("10:00"), end: t("10:40"), duration: 2400, numberOfTransfers: 0, walkDistance: 300, legs: [
      walk(pt("Origin", -73.978, 40.752), gc, "10:00", "10:03"), ride("7", "SUBWAY", gc, main, "10:05", "10:38"), walk(main, pt("Destination", -73.83, 40.76), "10:38", "10:40")] };
    const changes = serviceChanges({ id: "w", routes: ["7"], text: "In Queens, no [7] at Flushing-Main St" });
    const asked: string[] = [];
    const trip = await planTrip({ label: "A", at: [-73.978, 40.752] }, { label: "B", at: [-73.83, 40.76] }, "2026-11-14T10:00", false,
      { otp: { plan: (_o, _d, _l, _a, prefer) => { asked.push(prefer ?? "fastest"); return Promise.resolve(prefer === "bus" ? [busIt] : [seven]); } }, entrances: ents, changes });
    expect(asked).toEqual(["fastest", "bus"]);
    expect(trip.routes).toEqual(["Q53+"]);
    expect(trip.impacts).toEqual([{ route: "7", text: "Why not the 7: The 7 won't stop at Flushing-Main St, so you can't get off there.", blocks: false }]);
    const [blocked] = trip.alternatives;
    expect(blocked.routes).toEqual(["7"]);
    expect(blocked.impacts).toEqual([{ route: "7", text: "The 7 won't stop at Flushing-Main St, so you can't get off there.", blocks: true }]);
    expect(tripBrief(trip).alternatives[0].blocked).toBe(true);
  });
  it("says nothing when the day's changes miss the stations the trip uses", async () => {
    const st7 = (name: string, lon: number): Station => ({ id: name, complexId: name, name, routes: ["7"], structure: "Elevated", at: [lon, 40.745] });
    const ents: StationEntrances = { stations: () => Promise.resolve([st7("52 St", -73.912), st7("Queensboro Plaza", -73.94), st7("Junction Blvd", -73.8692)]), entrances: () => Promise.resolve([]) };
    const qbp = pt("Queensboro Plaza", -73.94, 40.745, true), jb = pt("Junction Blvd", -73.8692, 40.745, true);
    const it7: OtpItinerary = { start: t("10:00"), end: t("10:30"), duration: 1800, numberOfTransfers: 0, walkDistance: 0, legs: [ride("7", "SUBWAY", qbp, jb, "10:00", "10:30")] };
    const changes = serviceChanges({ id: "s", routes: ["7"], text: "In Queens, Flushing-bound [7] skips 52 St and 69 St" });
    const trip = await planTrip({ label: "A", at: [-73.94, 40.745] }, { label: "B", at: [-73.8692, 40.745] }, "2026-11-14T10:00", false, { otp: { plan: () => Promise.resolve([it7]) }, entrances: ents, changes });
    expect(trip.impacts).toEqual([]);
    expect(trip.skips.map((s) => s.name)).toEqual(["52 St"]);
  });
});
