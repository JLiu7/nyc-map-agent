/**
 * Live MTA feeds, proxied and slimmed for the map. GTFS-rt protobuf is decoded
 * with the official gtfs-realtime-bindings and cached in memory ~15 s, so a
 * room full of browsers costs MTA one request per feed per 15 s.
 *
 *   /api/transit          → { bus: boolean } (is MTA_BUSTIME_KEY set?)
 *   /api/transit/subway|lirr|mnr → trips with upcoming stop times
 *   /api/transit/bus      → bus vehicle positions (404 without the key). `?routes=Q1,Q2` keeps at most 20 routes.
 *   /api/transit/bus-lines → borough pages of route ids (no live positions)
 *   /api/transit/alerts   → MTA service alerts + elevator/escalator outages
 *   /api/transit/bus-trip?vehicle=&route= → one bus: headsign + upcoming stops with ETAs (SIRI)
 *   /api/transit/bus-route?route=        → one route's shape + stops, on demand (Bus Time OBA)
 *   /api/transit/bus-stops?lat=&lon=     → stops within ~300 m and the routes serving each (Bus Time OBA)
 *   /api/transit/bus-arrivals?stop=MTA_308209 → next buses at one stop with ETAs (SIRI stop-monitoring)
 *
 * /api/transit-live (live.ts) batches the rail systems and alerts into one edge-cached response.
 */
import GtfsRealtimeBindings from "gtfs-realtime-bindings";
import { json } from "../../../api/_lib/http";
import { busCatalog, filterBuses, parseBusRoutes } from "./busLines";
import { conflate, loadCenterlines } from "./conflate";
import { slimAlert, type MercuryAlert, type SlimAlert } from "./alerts";

const { FeedMessage } = GtfsRealtimeBindings.transit_realtime;
const MTA = "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/";
const FEEDS: Record<string, string[]> = {
  subway: ["gtfs", "gtfs-ace", "gtfs-bdfm", "gtfs-g", "gtfs-jz", "gtfs-nqrw", "gtfs-l", "gtfs-si"].map((f) => `${MTA}nyct%2F${f}`),
  lirr: [`${MTA}lirr%2Fgtfs-lirr`],
  mnr: [`${MTA}mnr%2Fgtfs-mnr`],
};
const TTL = 15_000;
const cache = new Map<string, { at: number; body: Promise<unknown> }>();

export function cached(key: string, load: () => Promise<unknown>, ttl = TTL): Promise<unknown> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.body;
  // Per-vehicle keys come and go; drop stale ones so the map cannot grow without bound.
  if (cache.size > 500) for (const [k, v] of cache) if (Date.now() - v.at > 6 * 3600_000 || (k.startsWith("bus-trip:") && Date.now() - v.at > TTL)) cache.delete(k);
  const body = load();
  cache.set(key, { at: Date.now(), body });
  body.catch(() => cache.delete(key));
  return body;
}

async function decode(url: string) {
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return FeedMessage.decode(new Uint8Array(await res.arrayBuffer()));
}

const num = (v: unknown): number => (v == null ? 0 : Number(v));

export type TransitTrip = {
  id: string;
  route: string;
  dir: number | null;
  /** Upcoming (and just-passed) stops: [stopId, unix seconds]. */
  /** [stop id, arrival (or departure) time, departure time when the feed gives a later one]. */
  stops: Array<[string, number] | [string, number, number]>;
  /** First update has only a departure: the train is at its origin terminal. */
  origin?: boolean;
  /** Vehicle-reported current stop, if any. */
  at?: string;
  /** Vehicle current_status: 0 INCOMING_AT, 1 STOPPED_AT, 2 IN_TRANSIT_TO. */
  st?: number;
  /** Vehicle position timestamp (unix seconds). */
  vt?: number;
  /** Stops the feed marks SKIPPED, in trip order; they are not in `stops`. */
  skipped?: string[];
};

const { TripDescriptor, TripUpdate } = GtfsRealtimeBindings.transit_realtime;
const TRIP_CANCELED = TripDescriptor.ScheduleRelationship.CANCELED;
const STOP_SKIPPED = TripUpdate.StopTimeUpdate.ScheduleRelationship.SKIPPED;

export async function loadTrips(system: string) {
  const feeds = await Promise.allSettled(FEEDS[system].map(decode));
  if (feeds.every((f) => f.status === "rejected")) throw new Error(`all ${system} feeds failed`);
  return slimTrips(feeds.flatMap((f) => (f.status === "fulfilled" ? [f.value] : [])), Date.now() / 1000);
}

/**
 * Decoded GTFS-rt feeds to slim trips. Cancelled trips leave the map; stops the
 * feed marks SKIPPED are dropped from the path (a train never dwells there) and
 * listed in trip order; the vehicle's current_status and timestamp are kept so
 * the map can tell a held train from a moving one. Pure, for fixture tests.
 */
export function slimTrips(feeds: Array<ReturnType<typeof FeedMessage.decode>>, now: number) {
  const trips: TransitTrip[] = [];
  for (const feed of feeds) {
    const at = new Map<string, { stop: string; st?: number; vt: number }>();
    for (const e of feed.entity) {
      const v = e.vehicle;
      if (v?.trip?.tripId && v.stopId) at.set(v.trip.tripId, { stop: v.stopId, st: v.currentStatus ?? undefined, vt: num(v.timestamp) });
    }
    for (const e of feed.entity) {
      const tu = e.tripUpdate;
      if (!tu?.trip || tu.trip.scheduleRelationship === TRIP_CANCELED) continue;
      const stops: TransitTrip["stops"] = [];
      const skipped: string[] = [];
      const updates = tu.stopTimeUpdate ?? [];
      for (const s of updates) {
        if (s.scheduleRelationship === STOP_SKIPPED) { if (s.stopId) skipped.push(s.stopId); continue; }
        const a = num(s.arrival?.time), d = num(s.departure?.time);
        const t = a || d;
        if (!s.stopId || !t || t <= now - 600) continue;
        stops.push(a && d && d > a ? [s.stopId, a, d] : [s.stopId, t]);
      }
      const first = updates.find((s) => s.scheduleRelationship !== STOP_SKIPPED);
      const origin = !!first && !num(first.arrival?.time) && !!num(first.departure?.time);
      if (!stops.length) continue;
      const tripId = tu.trip.tripId ?? e.id;
      // NYCT trip ids carry the direction (..N / ..S); rail uses direction_id.
      const m = /\.\.?([NS])/.exec(tripId);
      const dir = tu.trip.directionId ?? (m ? (m[1] === "N" ? 0 : 1) : null);
      const v = at.get(tripId);
      trips.push({
        id: tripId, route: tu.trip.routeId ?? "", dir, stops, at: v?.stop,
        ...(v?.st != null ? { st: v.st } : {}), ...(v?.vt ? { vt: v.vt } : {}),
        ...(skipped.length ? { skipped } : {}), ...(origin ? { origin } : {}),
      });
    }
  }
  return { at: Math.round(now), trips };
}

const RELAY_RENEW_MS = 24 * 3600_000;
let relayRenewedAt = 0;
/**
 * A Bus Time call. MTA_BUSTIME_KEY is either the MTA key, sent as `key=` as the MTA expects, or an
 * Octo vault working key (octo_tmp_…): then the call goes through Octo's relay, which adds the real
 * key, so this server never holds it. The working key lasts 30 days; it is renewed once a day.
 */
export async function busFetch(url: string, key: string, init: RequestInit = {}): Promise<Response> {
  const u = new URL(url);
  if (!key.startsWith("octo_tmp_")) {
    u.searchParams.set("key", key);
    return fetch(u.toString(), { ...init, signal: AbortSignal.timeout(10_000) });
  }
  const octo = (process.env.OCTO_BASE_URL ?? "https://octodb.design-bakery.com").replace(/\/$/, "");
  const auth = { authorization: `Bearer ${key}` };
  if (Date.now() - relayRenewedAt > RELAY_RENEW_MS) {
    relayRenewedAt = Date.now();
    void fetch(`${octo}/api/vault/lease/renew`, { method: "POST", headers: { ...auth, "content-type": "application/json" }, body: JSON.stringify({ expiresInDays: 30 }), signal: AbortSignal.timeout(10_000) })
      .then((r) => { if (!r.ok) console.warn(`[transit] Bus Time working key renewal failed: HTTP ${r.status}`); })
      .catch(() => console.warn("[transit] Bus Time working key renewal failed"));
  }
  // A redirect from Bus Time names the real key in its Location; never follow or pass one on.
  return fetch(`${octo}/api/vault/proxy`, { ...init, redirect: "manual", headers: { ...auth, "x-octo-target": u.toString() }, signal: AbortSignal.timeout(10_000) });
}

export async function loadBuses(key: string) {
  const res = await busFetch("https://gtfsrt.prod.obanyc.com/vehiclePositions", key);
  if (!res.ok) throw new Error(`bus positions upstream ${res.status}`);
  const feed = FeedMessage.decode(new Uint8Array(await res.arrayBuffer()));
  const buses = [];
  for (const e of feed.entity) {
    const v = e.vehicle;
    if (!v?.position) continue;
    buses.push({
      id: v.vehicle?.id ?? e.id,
      route: (v.trip?.routeId ?? "").replace(/^MTA NYCT_|^MTABC_/, ""),
      dir: v.trip?.directionId ?? null,
      lon: Math.round(v.position.longitude * 1e5) / 1e5,
      lat: Math.round(v.position.latitude * 1e5) / 1e5,
      bearing: v.position.bearing ?? null,
      next: v.stopId ?? null,
      t: num(v.timestamp),
    });
  }
  return { at: Math.round(Date.now() / 1000), buses };
}

const getMta = (path: string) => fetch(`${MTA}${path}`, { signal: AbortSignal.timeout(10_000) }).then((r) => r.json());

/**
 * Service alerts in effect at any time from → to (epoch s): "this weekend" on a Tuesday (owner, 2026-10-27:
 * the 7's weekend work was invisible on the map until it started). Outages are a right-now thing, so none.
 */
export async function loadAlertsBetween(from: number, to: number) {
  const feed = await cached("alerts-feed", () => getMta("camsys%2Fall-alerts.json"), 5 * 60_000) as { entity?: MercuryAlert[] };
  const alerts = (feed.entity ?? []).flatMap((e) => slimAlert(e, from, to) ?? []);
  return { at: Math.round(Date.now() / 1000), from, to, alerts, outages: [] };
}

export async function loadAlerts() {
  const get = getMta;
  const [alertsRes, eneRes, equipRes] = await Promise.allSettled([
    get("camsys%2Fall-alerts.json"),
    get("nyct%2Fnyct_ene.json"),
    cached("equipment", () => get("nyct%2Fnyct_ene_equipments.json")),
  ]);
  const now = Date.now() / 1000;
  const alerts: SlimAlert[] = [];
  if (alertsRes.status === "fulfilled") {
    for (const e of (alertsRes.value as { entity: MercuryAlert[] }).entity ?? []) {
      const a = slimAlert(e, now);
      if (a) alerts.push(a);
    }
  }
  // Elevator / escalator outages, placed by the equipment list's GTFS stop ids.
  type Row = Record<string, string>;
  const equipment = new Map<string, Row>();
  if (equipRes.status === "fulfilled" && Array.isArray(equipRes.value)) {
    for (const q of equipRes.value as Row[]) equipment.set(q.equipmentno, q);
  }
  const current = eneRes.status === "fulfilled" && Array.isArray(eneRes.value) ? (eneRes.value as Row[]).filter((o) => o.isupcomingoutage !== "Y") : [];
  const outNow = new Set(current.map((o) => o.equipment));
  const stopsOf = (q?: Row) => (q?.elevatorsgtfsstopid ?? "").split(/[/,; ]+/).filter(Boolean);
  const outages = current.map((o) => {
    const q = equipment.get(o.equipment);
    const stops = stopsOf(q);
    const isElevator = o.equipmenttype === "EL";
    // Still accessible if another active ADA elevator serves the same stop and is not out, or the unit is redundant.
    const adaStation = [...equipment.values()].some((x) => x.ADA === "Y" && stopsOf(x).some((s) => stops.includes(s)));
    const backup = [...equipment.values()].some((x) => x.equipmentno !== o.equipment && x.equipmenttype === "EL" && x.ADA === "Y" && x.isactive === "Y" && !outNow.has(x.equipmentno) && stopsOf(x).some((s) => stops.includes(s)));
    return {
      id: o.equipment,
      station: o.station,
      routes: (o.trainno ?? "").split("/").filter(Boolean),
      stops,
      equipment: isElevator ? "Elevator" : "Escalator",
      serving: o.serving,
      reason: o.reason,
      since: o.outagedate,
      back: o.estimatedreturntoservice,
      ada: adaStation ? (!isElevator || backup || Number(q?.redundant) === 1 ? "yes" : "no") : "not-ada",
      alternative: q?.alternativeroute ?? "",
    };
  });
  return { at: Math.round(now), alerts, outages };
}

const BUSTIME = "https://bustime.mta.info/api/";
const ROUTE_RE = /^[A-Z]{1,3}\d{1,3}[A-Z+]{0,2}$/i;
const VEHICLE_RE = /^[\w .-]{1,40}$/;
const first = (v: unknown): string => {
  const x: unknown = Array.isArray(v) ? v[0] : v;
  return typeof x === "string" || typeof x === "number" ? String(x) : "";
};

/** Google encoded polyline → [lon, lat] pairs. */
export function decodePolyline(str: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let i = 0, lat = 0, lon = 0;
  while (i < str.length) {
    for (const axis of [0, 1]) {
      let shift = 0, result = 0, b: number;
      do { b = str.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20 && i < str.length);
      const d = result & 1 ? ~(result >> 1) : result >> 1;
      if (axis === 0) lat += d; else lon += d;
    }
    out.push([lon / 1e5, lat / 1e5]);
  }
  return out;
}

type SiriCall = { StopPointRef?: string; StopPointName?: unknown; ExpectedArrivalTime?: string; AimedArrivalTime?: string; Extensions?: { Distances?: { PresentableDistance?: string } } };
async function loadBusTrip(key: string, vehicle: string) {
  const qs = new URLSearchParams({ VehicleRef: vehicle, VehicleMonitoringDetailLevel: "calls", MaximumNumberOfCallsOnwards: "40" });
  const r = await busFetch(`${BUSTIME}siri/vehicle-monitoring.json?${qs}`, key);
  if (!r.ok) throw new Error(`bus-trip upstream ${r.status}`);
  const d = (await r.json()) as { Siri?: { ServiceDelivery?: { VehicleMonitoringDelivery?: Array<{ VehicleActivity?: Array<{ MonitoredVehicleJourney: Record<string, unknown> }> }> } } };
  const j = d.Siri?.ServiceDelivery?.VehicleMonitoringDelivery?.[0]?.VehicleActivity?.[0]?.MonitoredVehicleJourney;
  if (!j) return { found: false };
  const calls = ((j.OnwardCalls as { OnwardCall?: SiriCall[] } | undefined)?.OnwardCall ?? []).map((c) => {
    const t = Date.parse(c.ExpectedArrivalTime ?? c.AimedArrivalTime ?? "");
    return { id: c.StopPointRef ?? "", name: first(c.StopPointName), eta: Number.isFinite(t) ? Math.round(t / 1000) : null, away: c.Extensions?.Distances?.PresentableDistance ?? "" };
  });
  return { found: true, route: first(j.PublishedLineName), destination: first(j.DestinationName), dir: first(j.DirectionRef), calls };
}

async function loadBusRoute(key: string, route: string) {
  for (const agency of ["MTA NYCT", "MTABC"]) {
    const r = await busFetch(`${BUSTIME}where/stops-for-route/${encodeURIComponent(`${agency}_${route}`)}.json?${new URLSearchParams({ includePolylines: "true", version: "2" })}`, key);
    if (!r.ok) continue;
    const d = (await r.json()) as { code?: number; data?: { entry?: { polylines?: Array<{ points: string }> }; references?: { stops?: Array<{ id: string; name: string; lat: number; lon: number; routeIds?: string[] }> } } };
    const lines = (d.data?.entry?.polylines ?? []).map((p) => decodePolyline(p.points)).filter((l) => l.length > 1);
    if (!lines.length) continue;
    const id = `${agency}_${route}`;
    const stops = (d.data?.references?.stops ?? []).filter((s) => !s.routeIds || s.routeIds.includes(id)).map((s) => ({ id: s.id, name: s.name, lon: s.lon, lat: s.lat }));
    // Snap to street centerlines and attach the right-hand lane offset (m) per vertex.
    const pts = lines.flat();
    const bbox: [number, number, number, number] = [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))];
    const snapped = conflate(lines, await loadCenterlines(bbox));
    return { route, lines: snapped.lines, offsets: snapped.offsets, stops };
  }
  return { route, lines: [], stops: [] };
}

type ObaStop = { id: string; name: string; lat: number; lon: number; direction?: string; routeIds?: string[] };
type ObaRoute = { id: string; shortName?: string };
type ObaStopGroup = { name?: string | { name?: string }; stopIds?: string[] };

const SIGN_WORDS: Record<string, string> = { BKLYN: "Brooklyn", JCT: "Jct", HTS: "Hts", STA: "Sta", CTR: "Ctr", LIRR: "LIRR", SBS: "SBS", JFK: "JFK", LGA: "LGA" };
/** "GREENPOINT MANHATTAN AV via GRAHAM AV" → "Greenpoint Manhattan Av": where the bus is going, as a pole sign says it. */
export function towards(raw: string): string {
  const place = raw.replace(/\s+via\s.*$/i, "").replace(/^(SELECT BUS|LIMITED|LTD)\s+/i, "").trim();
  return place.split(/\s+/).map((w) => SIGN_WORDS[w.toUpperCase()] ?? (/^\d/.test(w) ? w.toLowerCase() : w.toLowerCase().replace(/(^|-)([a-z])/g, (_, h: string, c: string) => h + c.toUpperCase()))).join(" ");
}

/** Each stop's destination on one route, from its stop groupings (one group per direction). */
async function routeHeadings(key: string, routeId: string): Promise<Record<string, string>> {
  const r = await busFetch(`${BUSTIME}where/stops-for-route/${encodeURIComponent(routeId)}.json?${new URLSearchParams({ includePolylines: "false", version: "2" })}`, key);
  if (!r.ok) return {};
  const d = (await r.json()) as { data?: { entry?: { stopGroupings?: Array<{ stopGroups?: ObaStopGroup[] }> } } };
  const out: Record<string, string> = {};
  for (const g of (d.data?.entry?.stopGroupings ?? []).flatMap((x) => x.stopGroups ?? [])) {
    const name = typeof g.name === "string" ? g.name : g.name?.name;
    if (name) for (const id of g.stopIds ?? []) out[id] ??= towards(name);
  }
  return out;
}

/**
 * Bus stops around a point with the route numbers that serve each, for the street-level pole signs,
 * and where each route's buses go from that stop (owner, 2026-10-27: "say which direction the buses are heading").
 */
export async function loadBusStops(key: string, lat: number, lon: number) {
  const qs = new URLSearchParams({ lat: String(lat), lon: String(lon), latSpan: "0.006", lonSpan: "0.008", version: "2" });
  const r = await busFetch(`${BUSTIME}where/stops-for-location.json?${qs}`, key);
  if (!r.ok) throw new Error(`bus-stops upstream ${r.status}`);
  const d = (await r.json()) as { data?: { list?: ObaStop[]; references?: { routes?: ObaRoute[] } } };
  const names = new Map((d.data?.references?.routes ?? []).map((x) => [x.id, x.shortName ?? x.id.replace(/^[^_]*_/, "")]));
  const list = d.data?.list ?? [];
  const routeIds = [...new Set(list.flatMap((s) => s.routeIds ?? []))].slice(0, 24);
  const heads = new Map(await Promise.all(routeIds.map(async (id) =>
    [id, await (cached(`bus-heads:${id}`, () => routeHeadings(key, id), 24 * 3600_000) as Promise<Record<string, string>>).catch((): Record<string, string> => ({}))] as const)));
  const short = (id: string) => names.get(id) ?? id.replace(/^[^_]*_/, "");
  const stops = list.map((s) => ({
    id: s.id,
    name: s.name,
    lat: s.lat,
    lon: s.lon,
    dir: s.direction ?? "",
    routes: [...new Set((s.routeIds ?? []).map(short))].sort((a, b) => a.localeCompare(b, "en", { numeric: true })),
    heads: Object.fromEntries((s.routeIds ?? []).flatMap((id) => { const to = heads.get(id)?.[s.id]; return to ? [[short(id), to]] : []; })),
  }));
  return { stops };
}

const STOP_RE = /^(MTA|MTABC)_\d{1,8}$/;
type SiriVisit = { MonitoredVehicleJourney?: Record<string, unknown> & { MonitoredCall?: SiriCall } };
/** Next buses at one stop (SIRI stop-monitoring), soonest first. */
export async function loadBusArrivals(key: string, stop: string) {
  const qs = new URLSearchParams({ MonitoringRef: stop, MaximumStopVisits: "12", StopMonitoringDetailLevel: "normal" });
  const r = await busFetch(`${BUSTIME}siri/stop-monitoring.json?${qs}`, key);
  if (!r.ok) throw new Error(`bus-arrivals upstream ${r.status}`);
  const d = (await r.json()) as { Siri?: { ServiceDelivery?: { StopMonitoringDelivery?: Array<{ MonitoredStopVisit?: SiriVisit[] }> } } };
  const visits = d.Siri?.ServiceDelivery?.StopMonitoringDelivery?.[0]?.MonitoredStopVisit ?? [];
  const arrivals = visits.flatMap((v) => {
    const j = v.MonitoredVehicleJourney;
    if (!j) return [];
    const c = j.MonitoredCall;
    const t = Date.parse(c?.ExpectedArrivalTime ?? c?.AimedArrivalTime ?? "");
    return [{ route: first(j.PublishedLineName), destination: first(j.DestinationName), vehicle: first(j.VehicleRef), eta: Number.isFinite(t) ? Math.round(t / 1000) : null, away: c?.Extensions?.Distances?.PresentableDistance ?? "" }];
  });
  arrivals.sort((a, b) => (a.eta ?? Infinity) - (b.eta ?? Infinity));
  return { arrivals };
}

export async function GET(request: Request): Promise<Response> {
  const system = new URL(request.url).pathname.replace(/^\/api(?:\/v1)?\/transit\/?/, "");
  const busKey = process.env.MTA_BUSTIME_KEY;
  try {
    if (!system) return json({ bus: Boolean(busKey) }, { maxAge: 60, browserMaxAge: 60 });
    if (system === "bus-lines") return json(busCatalog(), { maxAge: 86_400, browserMaxAge: 86_400 });
    if (system === "bus") {
      if (!busKey) return json({ error: "bus_unavailable" }, { status: 404 });
      const picked = parseBusRoutes(new URL(request.url).searchParams.get("routes"));
      if (picked === "bad") return json({ error: "bad_route" }, { status: 400 });
      const body = await cached("bus", () => loadBuses(busKey)) as { at: number; buses: Array<{ route: string }> };
      return json(picked ? { at: body.at, buses: filterBuses(body.buses, picked) } : body, { maxAge: 15, browserMaxAge: 10 });
    }
    if (system === "bus-stops") {
      if (!busKey) return json({ error: "bus_unavailable" }, { status: 404 });
      const q = new URL(request.url).searchParams;
      const lat = Number(q.get("lat"));
      const lon = Number(q.get("lon"));
      if (!(lat > 40.4 && lat < 41 && lon > -74.3 && lon < -73.6)) return json({ error: "bad_point" }, { status: 400 });
      // ~100 m grid so walkers on one block share a cached answer.
      const glat = Math.round(lat * 1000) / 1000;
      const glon = Math.round(lon * 1000) / 1000;
      return json(await cached(`bus-stops:v2:${glat},${glon}`, () => loadBusStops(busKey, glat, glon), 24 * 3600_000), { maxAge: 3600, browserMaxAge: 3600 });
    }
    if (system === "bus-arrivals") {
      if (!busKey) return json({ error: "bus_unavailable" }, { status: 404 });
      const stop = new URL(request.url).searchParams.get("stop") ?? "";
      if (!STOP_RE.test(stop)) return json({ error: "bad_stop" }, { status: 400 });
      return json(await cached(`bus-arrivals:${stop}`, () => loadBusArrivals(busKey, stop)), { maxAge: 15, browserMaxAge: 10 });
    }
    if (system === "bus-trip" || system === "bus-route") {
      if (!busKey) return json({ error: "bus_unavailable" }, { status: 404 });
      const q = new URL(request.url).searchParams;
      const route = (q.get("route") ?? "").toUpperCase();
      if (route && !ROUTE_RE.test(route)) return json({ error: "bad_route" }, { status: 400 });
      if (system === "bus-route") {
        if (!route) return json({ error: "bad_route" }, { status: 400 });
        return json(await cached(`bus-route:${route}`, () => loadBusRoute(busKey, route), 6 * 3600_000), { maxAge: 3600, browserMaxAge: 3600 });
      }
      const vehicle = q.get("vehicle") ?? "";
      if (!VEHICLE_RE.test(vehicle)) return json({ error: "bad_vehicle" }, { status: 400 });
      return json(await cached(`bus-trip:${vehicle}`, () => loadBusTrip(busKey, vehicle)), { maxAge: 15, browserMaxAge: 10 });
    }
    if (system === "alerts") {
      const q = new URL(request.url).searchParams;
      if (q.has("from")) {
        // Whole hours, so riders asking about the same weekend share one cached answer.
        const from = Math.floor(Number(q.get("from")) / 3600) * 3600, to = Math.ceil(Number(q.get("to")) / 3600) * 3600;
        const now = Date.now() / 1000;
        if (!(to > from && to - from <= 4 * 86_400 && to > now - 86_400 && from < now + 60 * 86_400)) return json({ error: "bad_window" }, { status: 400 });
        return json(await cached(`alerts:${from}-${to}`, () => loadAlertsBetween(from, to), 5 * 60_000), { maxAge: 300, browserMaxAge: 120 });
      }
      return json(await cached("alerts", loadAlerts), { maxAge: 60, browserMaxAge: 30 });
    }
    if (!(system in FEEDS)) return json({ error: "unknown_system" }, { status: 404 });
    return json(await cached(system, () => loadTrips(system)), { maxAge: 15, browserMaxAge: 10 });
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    return json({ error: "upstream_error" }, { status: 502 });
  }
}
