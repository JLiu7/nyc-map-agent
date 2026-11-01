/**
 * GET /api/ferry : NYC Ferry + Staten Island Ferry for the map, read straight from the
 * two published GTFS feeds (./gtfs.ts) and NYC Ferry's GTFS-rt vehicle positions.
 * Returns route lines, terminals/piers, and vessels: live positions where the feed has
 * them, otherwise schedule-based estimates (linear between consecutive stops).
 * Timetables are cached 6 h, the response 30 s.
 */
import GtfsRealtimeBindings from "gtfs-realtime-bindings";
import { fail, json } from "../../../api/_lib/http";
import { cached } from "../../lib/ttlCache";
import { FEEDS, fetchFeed, merge, type Timetable } from "./gtfs";

const { FeedMessage } = GtfsRealtimeBindings.transit_realtime;
const VEHICLES = "https://nycferry.connexionz.net/rtt/public/utility/gtfsrealtime.aspx/vehicleposition";
const TZ = "America/New_York";

interface ScheduledStop { scheduledDeparture: number; scheduledArrival: number; serviceDay: number; stop: { lat: number; lon: number } }
export interface LiveVessel { id: string; route: string; lon: number; lat: number; heading: number | null; at: number | null }

export interface FerryVessel { id: string; route: string; lon: number; lat: number; heading: number | null; source: "live" | "schedule" }
export interface FerryData { routes: GeoJSON.FeatureCollection; terminals: GeoJSON.FeatureCollection; vessels: FerryVessel[] }

const ymd = (unix: number) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(unix * 1000)).replaceAll("-", "");

/** Unix time of a service day's start in New York (GTFS: noon minus 12 h, so DST days work). */
export function serviceDay(date: string): number {
  const noon = Date.UTC(+date.slice(0, 4), +date.slice(4, 6) - 1, +date.slice(6, 8), 12);
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric" }).formatToParts(new Date(noon)).map((x) => [x.type, x.value]));
  const offset = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - noon;
  return (noon - offset) / 1000 - 12 * 3600;
}

/** Where a scheduled trip is at `now` (unix s), or null when it is not running. */
export function estimate(stoptimes: ScheduledStop[], now: number): { lon: number; lat: number; heading: number } | null {
  for (let i = 0; i + 1 < stoptimes.length; i++) {
    const a = stoptimes[i], b = stoptimes[i + 1];
    const t0 = a.serviceDay + a.scheduledDeparture, t1 = b.serviceDay + b.scheduledArrival;
    if (now < t0 || now > t1) continue;
    const k = t1 > t0 ? (now - t0) / (t1 - t0) : 0;
    const lon = a.stop.lon + (b.stop.lon - a.stop.lon) * k, lat = a.stop.lat + (b.stop.lat - a.stop.lat) * k;
    const heading = ((Math.atan2((b.stop.lon - a.stop.lon) * Math.cos((lat * Math.PI) / 180), b.stop.lat - a.stop.lat) * 180) / Math.PI + 360) % 360;
    return { lon, lat, heading };
  }
  return null;
}

export function toFerryData(t: Timetable, now: number, live: LiveVessel[] = []): FerryData {
  const routes: GeoJSON.Feature[] = [];
  const terms = new Map<string, GeoJSON.Feature>();
  const vessels: FerryVessel[] = [];
  const fresh = live.filter((v) => v.at == null || now - v.at < 600);
  // A trip after midnight can belong to yesterday's service day ("25:10:00").
  const days = [ymd(now), ymd(now - 86_400)].map((d) => ({ start: serviceDay(d), on: t.services(d) }));
  for (const r of t.routes) {
    const color = r.color ? `#${r.color}` : "#1D7FB8";
    for (const line of r.shapes) routes.push({ type: "Feature", properties: { route: r.name, color }, geometry: { type: "LineString", coordinates: line } });
    for (const s of r.stops) {
      const key = s.name.toLowerCase();
      if (!terms.has(key)) terms.set(key, { type: "Feature", properties: { name: s.name }, geometry: { type: "Point", coordinates: [s.lon, s.lat] } });
    }
    const mine = fresh.filter((v) => v.route === r.id);
    if (mine.length) {
      for (const v of mine) vessels.push({ id: v.id, route: r.name, lon: v.lon, lat: v.lat, heading: v.heading, source: "live" });
      continue;
    }
    for (const trip of t.trips) {
      if (trip.route !== r.id) continue;
      for (const day of days) {
        if (!day.on.has(trip.service)) continue;
        const e = estimate(trip.times.map((s) => ({ scheduledDeparture: s.dep, scheduledArrival: s.arr, serviceDay: day.start, stop: s })), now);
        if (e) vessels.push({ id: trip.id, route: r.name, ...e, source: "schedule" });
      }
    }
  }
  return { routes: { type: "FeatureCollection", features: routes }, terminals: { type: "FeatureCollection", features: [...terms.values()] }, vessels };
}

/** Both timetables; one failing feed leaves the other on the map. */
async function timetable(): Promise<Timetable> {
  const got = await Promise.allSettled(Object.entries(FEEDS).map(([prefix, url]) => fetchFeed(prefix, url)));
  const ok = got.flatMap((g) => (g.status === "fulfilled" ? [g.value] : []));
  if (!ok.length) throw (got[0] as PromiseRejectedResult).reason;
  return merge(ok);
}

/** NYC Ferry's live boats; the map falls back to the schedule when this fails. */
async function liveVessels(): Promise<LiveVessel[]> {
  const res = await fetch(VEHICLES, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`connexionz returned ${res.status}`);
  const feed = FeedMessage.decode(new Uint8Array(await res.arrayBuffer()));
  return feed.entity.flatMap((e) => {
    const v = e.vehicle;
    if (!v?.position || !v.trip?.routeId) return [];
    return [{ id: v.vehicle?.id || v.vehicle?.label || e.id, route: `ferry:${v.trip.routeId}`, lon: v.position.longitude, lat: v.position.latitude, heading: v.position.bearing ?? null, at: v.timestamp != null ? Number(v.timestamp) : null }];
  });
}

async function load(): Promise<FerryData> {
  const [t, live] = await Promise.all([cached("ferry-gtfs", 6 * 3600_000, timetable), cached("ferry-live", 30_000, liveVessels).catch(() => [])]);
  return toFerryData(t, Date.now() / 1000, live);
}

export async function GET(): Promise<Response> {
  try {
    return json(await cached("ferry", 30_000, load), { maxAge: 30, browserMaxAge: 30 });
  } catch (err) {
    return fail(err);
  }
}
