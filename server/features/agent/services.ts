/**
 * Thin server-side wrappers over the keyless public APIs the app already uses.
 * Each returns plain data; the AI SDK tools in tools.ts call these.
 */
import { formatStreetText } from "../../../src/lib/streetName";
import { serviceChanges, type ServiceChange } from "../../../src/lib/transit/serviceChanges";
import { coarsen } from "../../../src/lib/weather/street";
import { z } from "zod";
import GtfsRealtimeBindings from "gtfs-realtime-bindings";
import type { FeedAlert, LiveVehicle, TroubleStation } from "../../../src/lib/transit/trouble";
import type { LngLatTuple, RestroomSpot } from "../../../src/features/agent/schema";
import { bestCandidate, matchLandmark, matchStation, type GeoCandidate } from "./places";
import { distM, openDataEntrances, type Station } from "./transit";
import { findCorner, parseCorner, type Corner } from "./corner";
import { noteSource } from "./freshness";
import { cached } from "../../lib/ttlCache";
import { openAt } from "./hours";
import { VALHALLA_URL, valhallaWalk } from "./valhalla";

const UA = { "User-Agent": "nyc-map-agent (github.com/Pukujan-lab/nyc-map-agent)" };
export const OSRM_FOOT_URL = (process.env.VITE_OSRM_URL ?? "https://routing.openstreetmap.de/routed-foot").replace(/\/$/, "");

async function getJson(url: string, timeoutMs = 10000): Promise<unknown> {
  return (await getJsonDated(url, timeoutMs)).json;
}
/** JSON plus the response's last-modified time (Socrata sends the dataset's last update), when present. */
async function getJsonDated(url: string, timeoutMs = 10000): Promise<{ json: unknown; modified: string | null }> {
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`${new URL(url).host} returned ${res.status}`);
  return { json: await res.json(), modified: res.headers.get("x-soda2-truth-last-modified") ?? res.headers.get("last-modified") };
}

/* ---------- geocode: NYC Planning GeoSearch (same service as src/lib/api/geosearch.ts) ---------- */
const geoSchema = z.object({
  features: z.array(z.object({ geometry: z.object({ coordinates: z.tuple([z.number(), z.number()]) }), properties: z.object({ label: z.string(), confidence: z.number().optional() }) })),
});
export interface Place { label: string; at: LngLatTuple }
interface GeocodeDeps { stations?: () => Promise<Station[]>; geosearch?: (text: string) => Promise<GeoCandidate[]>; shops?: (text: string) => Promise<Place | null>; corner?: (corner: Corner) => Place | null }

/**
 * A shop, restaurant or other named business by name ("Aldi at Rego Park"). NYC
 * GeoSearch only knows addresses and picked "ICCD Rego Park" for that (owner report,
 * 2026-10-24); OpenStreetMap's Nominatim knows the store. Bounded to the five boroughs;
 * only business-like results count, so streets and neighbourhoods still go to GeoSearch.
 * Cached a day per text, which also keeps us far under Nominatim's 1 request a second.
 */
const POI = new Set(["shop", "amenity", "tourism", "leisure", "office", "craft", "healthcare"]);
const nominatimSchema = z.array(z.object({ category: z.string(), name: z.string().optional(), display_name: z.string(), lon: z.coerce.number(), lat: z.coerce.number() }));
const STREET_WORD = /\b(?:st|street|av|ave|avenue|blvd|boulevard|rd|road|pl|place|dr|drive|ln|lane|pkwy|parkway|ter|terrace|way|ct|court|sq|square|broadway|bowery|hwy|highway|plaza|expy|expressway|tpke|turnpike)\b/i;
export function businessQuery(text: string): string | null {
  const t = text.trim();
  // A house number and a street ("61-11 Junction Blvd") is an address: GeoSearch is better at those.
  // A number alone is not: "55 Fulton Market" is a grocery on Fulton St, and GeoSearch sent it to the
  // Fulton Fish Market in the Bronx (owner's partner, 2026-11-12).
  if (/^\d/.test(t) && STREET_WORD.test(t)) return null;
  return t.replace(/\s+(?:at|in|on|near|by)\s+/i, ", ");
}
async function nominatimBusiness(text: string): Promise<Place | null> {
  const q = businessQuery(text);
  if (!q) return null;
  return cached(`shop:${q.toLowerCase()}`, 86_400_000, async () => {
    const url = `https://nominatim.openstreetmap.org/search?${new URLSearchParams({ q, format: "jsonv2", limit: "3", bounded: "1", viewbox: "-74.26,40.92,-73.69,40.49" })}`;
    const hit = nominatimSchema.parse(await getJson(url, 5000)).find((r) => POI.has(r.category) && r.name);
    if (!hit) return null;
    // "Aldi, 61-11, Junction Boulevard, Rego Park, …" → "Aldi, 61-11 Junction Boulevard, Rego Park"
    const parts = hit.display_name.split(", ");
    const street = /^\d[\d-]*$/.test(parts[1] ?? "") ? `${parts[1]} ${parts[2] ?? ""}`.trim() : parts[1];
    const area = /^\d[\d-]*$/.test(parts[1] ?? "") ? parts[3] : parts[2];
    return { label: [hit.name, street, area].filter(Boolean).join(", "), at: [hit.lon, hit.lat] };
  });
}

async function geosearchCandidates(text: string): Promise<GeoCandidate[]> {
  const data = geoSchema.parse(await getJson(`https://geosearch.planninglabs.nyc/v2/search?${new URLSearchParams({ text, size: "5" })}`));
  return data.features.map((f) => ({ label: f.properties.label.replace(/, USA$/, ""), at: f.geometry.coordinates, confidence: f.properties.confidence ?? 0 }));
}

/** Curated landmarks, then GTFS station names, then street corners, then businesses, then GeoSearch (highest confidence). */
export async function geocode(text: string, deps: GeocodeDeps = {}): Promise<Place | null> {
  const lm = matchLandmark(text);
  if (lm) return { label: lm.label, at: lm.at };
  try {
    const st = matchStation(text, await (deps.stations ?? (() => openDataEntrances.stations()))());
    if (st) return { label: `${st.name} station`, at: st.at };
  } catch {
    // Station list unavailable: fall through to GeoSearch.
  }
  const corner = parseCorner(text);
  if (corner) {
    try {
      const at = (deps.corner ?? findCorner)(corner);
      if (at) return at;
    } catch {
      // Corner table unreadable: fall through to GeoSearch.
    }
  }
  try {
    const shop = await (deps.shops ?? nominatimBusiness)(text);
    if (shop) return shop;
  } catch {
    // Nominatim down or slow: fall through to GeoSearch.
  }
  const best = bestCandidate(await (deps.geosearch ?? geosearchCandidates)(text));
  return best ? { label: best.label, at: best.at } : null;
}
export async function reverseGeocode([lon, lat]: LngLatTuple): Promise<string | null> {
  try {
    const data = geoSchema.parse(
      await getJson(`https://geosearch.planninglabs.nyc/v2/reverse?${new URLSearchParams({ "point.lat": String(lat), "point.lon": String(lon), size: "1" })}`, 5000),
    );
    const raw = data.features[0]?.properties.label.replace(/,.*$/, "");
    if (!raw) return null;
    // "111 EAST 41 STREET" → "East 41 Street": the street, not a house number, spelled out.
    return formatStreetText(raw.replace(/^\d+[A-Z-]*\s+/i, ""));
  } catch {
    return null;
  }
}

/* ---------- route_walk: the self-hosted Valhalla (./valhalla), else the public OSRM foot profile (same server as src/lib/api/routing.ts) ---------- */
const osrmSchema = z.object({
  routes: z.array(
    z.object({
      distance: z.number(),
      duration: z.number(),
      geometry: z.object({ coordinates: z.array(z.tuple([z.number(), z.number()])) }),
      legs: z.array(z.object({ steps: z.array(z.object({ name: z.string(), maneuver: z.object({ type: z.string(), modifier: z.string().optional(), location: z.tuple([z.number(), z.number()]) }) })) })),
    }),
  ).min(1),
});
export interface WalkResult { coords: LngLatTuple[]; distanceM: number; durationS: number; turns: Array<{ at: LngLatTuple; text: string }> }
export async function routeWalk(a: LngLatTuple, b: LngLatTuple): Promise<WalkResult> {
  if (VALHALLA_URL) {
    try {
      return await valhallaWalk(a, b);
    } catch {
      // Valhalla down or no route: the public OSRM server below.
    }
  }
  const c = `${a[0].toFixed(6)},${a[1].toFixed(6)};${b[0].toFixed(6)},${b[1].toFixed(6)}`;
  const data = osrmSchema.parse(await getJson(`${OSRM_FOOT_URL}/route/v1/foot/${c}?overview=full&geometries=geojson&steps=true`));
  const r = data.routes[0];
  const turns = r.legs.flatMap((l) =>
    l.steps
      .filter((s) => s.maneuver.type === "turn" || s.maneuver.type === "end of road" || s.maneuver.type === "fork")
      .map((s) => ({ at: s.maneuver.location, text: formatStreetText(`Turn ${s.maneuver.modifier ?? ""} onto ${s.name || "the path"}`.replace(/\s+/g, " ")) })),
  );
  // OSRM's foot duration is ~5 km/h; keep it.
  return { coords: r.geometry.coordinates, distanceM: r.distance, durationS: r.duration, turns };
}

/* ---------- weather_forecast: Open-Meteo hourly (free, keyless) ---------- */
const WMO: Record<number, string> = { 0: "Clear", 1: "Mostly clear", 2: "Partly cloudy", 3: "Overcast", 45: "Fog", 48: "Fog", 51: "Drizzle", 53: "Drizzle", 55: "Drizzle", 61: "Light rain", 63: "Rain", 65: "Heavy rain", 71: "Light snow", 73: "Snow", 75: "Heavy snow", 80: "Showers", 81: "Showers", 82: "Heavy showers", 95: "Thunderstorm", 96: "Thunderstorm", 99: "Thunderstorm" };
const nullableSeries = z.array(z.number().nullable()).optional();
const meteoSchema = z.object({ hourly: z.object({ time: z.array(z.string()), temperature_2m: z.array(z.number()), precipitation_probability: z.array(z.number().nullable()), weather_code: z.array(z.number()), apparent_temperature: nullableSeries, precipitation: nullableSeries, wind_speed_10m: nullableSeries, wind_gusts_10m: nullableSeries }) });
export async function weatherAt(at: LngLatTuple, localIso: string) {
  // About 1 km is enough for a forecast (docs/PRIVACY.md, "More precision than needed").
  const { lat, lon } = coarsen(at[1], at[0]);
  const q = new URLSearchParams({ latitude: String(lat), longitude: String(lon), hourly: "temperature_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,wind_speed_10m,wind_gusts_10m", timezone: "America/New_York", forecast_days: "7" });
  const h = meteoSchema.parse(await getJson(`https://api.open-meteo.com/v1/forecast?${q}`)).hourly;
  const hour = localIso.slice(0, 13);
  const i = h.time.findIndex((t) => t.startsWith(hour));
  // Past the 7-day forecast (or before it): say nothing rather than another hour's weather.
  if (i < 0) throw new Error(`No forecast for ${hour}`);
  noteSource("forecast");
  return {
    time: h.time[i], tempC: h.temperature_2m[i], precipPct: h.precipitation_probability[i] ?? 0, summary: WMO[h.weather_code[i]] ?? "Mixed",
    code: h.weather_code[i], feelsLikeC: h.apparent_temperature?.[i] ?? null, precipMm: h.precipitation?.[i] ?? null, windKmh: h.wind_speed_10m?.[i] ?? null, gustKmh: h.wind_gusts_10m?.[i] ?? null,
  };
}

/* ---------- hazards: NWS active alerts at a point ---------- */
const nwsSchema = z.object({ updated: z.string().optional(), features: z.array(z.object({ properties: z.object({ headline: z.string().nullable().optional(), event: z.string() }) })) });
export async function hazardsAt(at: LngLatTuple): Promise<string[]> {
  const { lat, lon } = coarsen(at[1], at[0]);
  const data = nwsSchema.parse(await getJson(`https://api.weather.gov/alerts/active?point=${lat},${lon}`));
  noteSource("weather-alerts", data.updated ?? Date.now());
  return data.features.map((f) => f.properties.headline ?? f.properties.event);
}

/* ---------- elevator_status: MTA elevator & escalator feed (keyless JSON) ---------- */
const eneSchema = z.array(z.object({ station: z.string(), trainno: z.string(), equipmenttype: z.string(), serving: z.string(), ADA: z.string().optional(), outagedate: z.string(), estimatedreturntoservice: z.string(), reason: z.string(), isupcomingoutage: z.string() }));
export type Outage = z.infer<typeof eneSchema>[number];
let eneCache: { at: number; rows: Outage[] } | null = null;
export async function elevatorOutages(): Promise<Outage[]> {
  if (!eneCache || Date.now() - eneCache.at >= 5 * 60_000) {
    eneCache = { at: Date.now(), rows: eneSchema.parse(await getJson("https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fnyct_ene.json")) };
  }
  // The feed carries no timestamp of its own: its age is when we fetched it.
  noteSource("mta-elevators", eneCache.at);
  return eneCache.rows;
}
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
export async function elevatorStatus(stationName: string): Promise<string[]> {
  const key = norm(stationName).slice(0, 8);
  return (await elevatorOutages())
    .filter((o) => o.isupcomingoutage !== "Y" && norm(o.station).startsWith(key))
    .map((o) => `${o.equipmenttype === "EL" ? "Elevator" : "Escalator"} out at ${o.station} (${o.serving}) — ${o.reason}, back ${o.estimatedreturntoservice}`);
}

/** Stations on these lines with an elevator or escalator out now, one line each: what the line card lists (#370). */
export function lineOutages(rows: Outage[], routes: string[]): string[] {
  const byStation = new Map<string, Outage[]>();
  for (const o of rows) {
    if (o.isupcomingoutage === "Y" || !o.trainno.split("/").some((r) => routes.includes(r.toUpperCase()))) continue;
    byStation.set(o.station, [...(byStation.get(o.station) ?? []), o]);
  }
  return [...byStation].map(([station, list]) => {
    const kinds = [...new Set(list.map((o) => (o.equipmenttype === "EL" ? "elevator" : "escalator")))];
    return `${kinds.join(" and ")} out at ${station}`.replace(/^./, (c) => c.toUpperCase());
  });
}

/* ---------- nearest_restroom: NYC Open Data Public Restrooms (i7jb-7jku, keyless; the map's restroom layer reads the same rows via Octo) ---------- */
const restroomRow = z.object({
  facility_name: z.string(),
  latitude: z.string(),
  longitude: z.string(),
  status: z.string().optional(),
  hours_of_operation: z.string().optional(),
  accessibility: z.string().optional(),
  operator: z.string().optional(),
});
export type RestroomRow = z.infer<typeof restroomRow>;
let restroomCache: { at: number; rows: RestroomRow[]; modified: string | null } | null = null;
export async function publicRestrooms(): Promise<RestroomRow[]> {
  if (!restroomCache || Date.now() - restroomCache.at >= 60 * 60_000) {
    const q = new URLSearchParams({ $select: "facility_name,latitude,longitude,status,hours_of_operation,accessibility,operator", $where: "latitude IS NOT NULL", $limit: "5000" });
    const { json, modified } = await getJsonDated(`https://data.cityofnewyork.us/resource/i7jb-7jku.json?${q}`);
    const rows = z.array(z.unknown()).parse(json).flatMap((r) => {
      const p = restroomRow.safeParse(r);
      return p.success ? [p.data] : [];
    });
    restroomCache = { at: Date.now(), rows, modified };
  }
  // The dataset's own last update, not our fetch time: the city list changes rarely.
  noteSource("restrooms", restroomCache.modified);
  return restroomCache.rows;
}
/**
 * The `n` closest restrooms to `at` that are operational and not closed at `now` by their listed hours
 * (unknown hours count as possibly open). Closed ones are listed only when nothing else is nearer than 1.5 km.
 */
export function nearestRestrooms(rows: RestroomRow[], at: LngLatTuple, n = 3, now = new Date()): RestroomSpot[] {
  const spots = rows
    .map((r) => ({ r, lon: Number(r.longitude), lat: Number(r.latitude) }))
    .filter((x) => Number.isFinite(x.lon) && Number.isFinite(x.lat))
    .map(({ r, lon, lat }) => ({
      name: r.facility_name,
      lon,
      lat,
      distanceM: Math.round(distM(at, [lon, lat])),
      status: r.status ?? null,
      hours: r.hours_of_operation ?? null,
      accessibility: r.accessibility ?? null,
      operator: r.operator ?? null,
      openNow: openAt(r.hours_of_operation, now),
    }))
    .sort((a, b) => a.distanceM - b.distanceM);
  const open = spots.filter((s) => (!s.status || /^operational$/i.test(s.status)) && s.openNow !== false);
  return (open.length && open[0].distanceM <= 1500 ? open : spots).slice(0, n);
}

/* ---------- planned work / service alerts: MTA GTFS-rt alerts (JSON flavour) ---------- */
/** GTFS-rt header: the feed's own "as of" time, seconds since the epoch. */
const feedHeader = z.object({ timestamp: z.union([z.number(), z.string()]).optional() }).optional();
const noteAlertsFeed = (header: z.infer<typeof feedHeader>) => noteSource("mta-alerts", header?.timestamp !== undefined ? Number(header.timestamp) * 1000 : Date.now());
/**
 * Is an alert in force at `atEpochS`? GTFS-rt active periods: no period means
 * always; a missing start or end is open-ended. Planned work for a future trip
 * counts only when one of its periods covers that trip's time.
 */
export function activeAt(periods: Array<{ start?: number; end?: number }>, atEpochS: number): boolean {
  return periods.length === 0 || periods.some((p) => (p.start || 0) <= atEpochS && atEpochS <= (p.end || Infinity));
}
const alertSchema = z.object({
  header: feedHeader,
  entity: z.array(z.object({ alert: z.object({
    active_period: z.array(z.object({ start: z.number().optional(), end: z.number().optional() })).default([]),
    informed_entity: z.array(z.object({ route_id: z.string().optional() })).default([]),
    header_text: z.object({ translation: z.array(z.object({ text: z.string(), language: z.string().optional() })) }).optional(),
  }) })),
});
export async function serviceAlerts(routes: string[], atEpochS: number): Promise<string[]> {
  const data = alertSchema.parse(await getJson("https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/camsys%2Fsubway-alerts.json"));
  noteAlertsFeed(data.header);
  const out = new Set<string>();
  for (const { alert } of data.entity) {
    if (!alert.informed_entity.some((e) => e.route_id && routes.includes(e.route_id))) continue;
    const active = activeAt(alert.active_period, atEpochS);
    const text = alert.header_text?.translation.find((t) => !t.language || t.language === "en")?.text;
    if (active && text) out.add(text.replace(/\s+/g, " ").slice(0, 220));
  }
  return [...out].slice(0, 5);
}

/* ---------- station skips and platform changes (#253) ---------- */
const changeSchema = z.object({
  header: feedHeader,
  entity: z.array(z.object({ id: z.string().default(""), alert: z.object({
    active_period: z.array(z.object({ start: z.number().optional(), end: z.number().optional() })).default([]),
    informed_entity: z.array(z.object({ route_id: z.string().optional() })).default([]),
    header_text: z.object({ translation: z.array(z.object({ text: z.string(), language: z.string().optional() })) }).optional(),
  }) })),
});
/** Active direction-aware skips and platform changes at a time (subway alerts feed). */
export async function stationServiceChanges(atEpochS: number): Promise<ServiceChange[]> {
  const data = changeSchema.parse(await getJson("https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/camsys%2Fsubway-alerts.json"));
  noteAlertsFeed(data.header);
  return data.entity.flatMap(({ id, alert }) => {
    const active = activeAt(alert.active_period, atEpochS);
    const text = alert.header_text?.translation.find((t) => !t.language || t.language === "en")?.text;
    if (!active || !text) return [];
    return serviceChanges({ id, text, routes: [...new Set(alert.informed_entity.map((e) => e.route_id).filter((r): r is string => Boolean(r)))] });
  });
}

/* ---------- MTA trouble per line (#361): alerts, stations, live trains ---------- */
const troubleFeedSchema = z.object({ header: feedHeader, entity: z.array(z.object({ id: z.string().default(""), alert: z.object({}).passthrough() })) });
let troubleFeed: { at: number; alerts: FeedAlert[]; header: z.infer<typeof feedHeader> } | null = null;
/** The camsys subway alerts as raw entities (Mercury extension kept), cached 30 s. */
export async function subwayAlertEntities(): Promise<FeedAlert[]> {
  if (!troubleFeed || Date.now() - troubleFeed.at >= 30_000) {
    const data = troubleFeedSchema.parse(await getJson("https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/camsys%2Fsubway-alerts.json"));
    troubleFeed = { at: Date.now(), alerts: data.entity as FeedAlert[], header: data.header };
  }
  noteAlertsFeed(troubleFeed.header);
  return troubleFeed.alerts;
}

/** Agent stations (39hk-dx4f) in the shape the trouble model reads; rows without a GTFS id are left out. */
export const troubleStations = (stations: Station[]): TroubleStation[] =>
  stations.flatMap((s) => (s.gtfsId ? [{ gtfsId: s.gtfsId, complexId: s.complexId, name: s.name, routes: s.routes, at: s.at, north: s.north, south: s.south }] : []));

/** Which NYCT realtime feed carries a line. */
export function feedForRoute(route: string): string | null {
  const r = route.toUpperCase().replace(/X$/, "");
  if (/^[1-7]$|^GS$/.test(r)) return "gtfs";
  if (/^(A|C|E|H|FS)$/.test(r)) return "gtfs-ace";
  if (/^(B|D|F|M)$/.test(r)) return "gtfs-bdfm";
  if (r === "G") return "gtfs-g";
  if (/^(J|Z)$/.test(r)) return "gtfs-jz";
  if (/^(N|Q|R|W)$/.test(r)) return "gtfs-nqrw";
  if (r === "L") return "gtfs-l";
  if (r === "SI" || r === "SIR") return "gtfs-si";
  return null;
}

const { FeedMessage, VehiclePosition } = GtfsRealtimeBindings.transit_realtime;
/** Live vehicles on these lines (NYCT GTFS-rt), each joined with its trip update. */
export async function subwayVehicles(routes: string[]): Promise<LiveVehicle[]> {
  const feeds = [...new Set(routes.map(feedForRoute).filter((f): f is string => Boolean(f)))];
  const want = new Set(routes.map((r) => r.toUpperCase()));
  const out: LiveVehicle[] = [];
  let oldest: number | null = null;
  for (const f of feeds) {
    const res = await fetch(`https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2F${f}`, { headers: UA, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`MTA ${f} returned ${res.status}`);
    const msg = FeedMessage.decode(new Uint8Array(await res.arrayBuffer()));
    const at = Number(msg.header.timestamp) * 1000;
    if (at && (oldest === null || at < oldest)) oldest = at;
    const updates = new Map(msg.entity.flatMap((e) => (e.tripUpdate?.trip?.tripId ? [[e.tripUpdate.trip.tripId, e.tripUpdate.stopTimeUpdate ?? []] as const] : [])));
    for (const e of msg.entity) {
      const v = e.vehicle;
      const tripId = v?.trip?.tripId;
      const route = v?.trip?.routeId ?? "";
      if (!v || !tripId || !v.stopId || !want.has(route)) continue;
      const u = updates.get(tripId) ?? [];
      out.push({
        tripId,
        route,
        stopId: v.stopId,
        stopped: v.currentStatus === VehiclePosition.VehicleStopStatus.STOPPED_AT,
        ts: Number(v.timestamp ?? 0),
        remaining: u.length,
        atOrigin: !!u[0] && !Number(u[0].arrival?.time ?? 0) && !!Number(u[0].departure?.time ?? 0),
      });
    }
  }
  noteSource("mta-trains", oldest ?? Date.now());
  return out;
}
