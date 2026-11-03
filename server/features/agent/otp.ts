/**
 * Multimodal trip search via a self-hosted OpenTripPlanner 2 (GTFS GraphQL
 * `planConnection`). OTP does the routing (subway, bus, LIRR, Metro-North,
 * ferry, SIR, with GTFS-rt); this file is thin glue that ranks its itineraries
 * and maps them onto the app's Trip/Leg contract. See docs/OTP.md.
 */
import { z } from "zod";
import type { Leg, LngLatTuple, TripCore } from "../../../src/features/agent/schema";
import { elevatorStatus, serviceAlerts } from "./services";
import { distM, openDataEntrances, type Station, type StationEntrances } from "./transit";
import { nyLocalToDate, portalFor, safe, toNyLocal } from "./trip";
import { decodePolyline } from "./polyline";
import { OTP_CONTAINER, waker } from "./sablier";

export { decodePolyline };

const OTP_URL = (process.env.OTP_URL ?? "http://nyc-map-otp:8080").replace(/\/$/, "");
/** On the VPS it sleeps when idle (#44) and loads its graph in under a minute; wait that long first. */
const OTP_WAKE_S = 75;

const QUERY = `query Plan($o: PlanLabeledLocationInput!, $d: PlanLabeledLocationInput!, $dt: PlanDateTimeInput!, $modes: PlanModesInput) {
  planConnection(origin: $o, destination: $d, dateTime: $dt, modes: $modes, first: 8, searchWindow: "PT90M") {
    edges { node {
      start end duration numberOfTransfers walkDistance
      legs {
        mode duration distance realTime headsign transitLeg
        start { scheduledTime estimated { time } }
        end { scheduledTime estimated { time } }
        from { name lat lon stop { gtfsId name } }
        to { name lat lon stop { gtfsId name } }
        route { gtfsId shortName longName color }
        legGeometry { points }
        intermediateStops { name lat lon }
        steps { relativeDirection streetName lat lon }
      }
    } }
  }
}`;

const place = z.object({ name: z.string().nullable(), lat: z.number(), lon: z.number(), stop: z.object({ gtfsId: z.string(), name: z.string() }).nullable().optional() });
const time = z.object({ scheduledTime: z.string(), estimated: z.object({ time: z.string() }).nullable().optional() });
const otpLeg = z.object({
  mode: z.string(), duration: z.number(), distance: z.number(), realTime: z.boolean().nullable().optional(), headsign: z.string().nullable().optional(), transitLeg: z.boolean().nullable().optional(),
  start: time, end: time, from: place, to: place,
  route: z.object({ gtfsId: z.string(), shortName: z.string().nullable(), longName: z.string().nullable(), color: z.string().nullable() }).nullable().optional(),
  legGeometry: z.object({ points: z.string() }).nullable().optional(),
  intermediateStops: z.array(z.object({ name: z.string(), lat: z.number(), lon: z.number() })).nullable().optional(),
  steps: z.array(z.object({ relativeDirection: z.string().nullable(), streetName: z.string().nullable(), lat: z.number(), lon: z.number() })).nullable().optional(),
});
const itinerary = z.object({ start: z.string(), end: z.string(), duration: z.number(), numberOfTransfers: z.number(), walkDistance: z.number(), legs: z.array(otpLeg) });
export type OtpItinerary = z.infer<typeof itinerary>;
const response = z.object({ data: z.object({ planConnection: z.object({ edges: z.array(z.object({ node: itinerary })) }) }) });

/** ISO with offset for a New York local time, e.g. 2026-10-23T09:00:00-04:00. */
export function nyIso(local: string): string {
  const base = local.slice(0, 16);
  const off = Math.round((Date.parse(`${base}:00Z`) - nyLocalToDate(base).getTime()) / 60000);
  const a = Math.abs(off);
  return `${base}:00${off < 0 ? "-" : "+"}${String(Math.floor(a / 60)).padStart(2, "0")}:${String(a % 60).padStart(2, "0")}`;
}

const RAIL_ONLY = { transit: { transit: [{ mode: "SUBWAY" }, { mode: "RAIL" }, { mode: "FERRY" }, { mode: "TRAM" }] } };
const BUS_ONLY = { transit: { transit: [{ mode: "BUS" }] } };

/**
 * What the rider asked for (owner, 2026-10-26): the fastest way (any mode), the subway or the bus
 * only, the least walking, or (#625) a trip that rides a ferry.
 */
export type TripPrefer = "fastest" | "subway" | "bus" | "ferry" | "less-walking";

export interface OtpClient { plan(o: LngLatTuple, d: LngLatTuple, local: string, arriveBy: boolean, prefer?: TripPrefer): Promise<OtpItinerary[]> }

export const httpOtp: OtpClient = {
  async plan(o, d, local, arriveBy, prefer = "fastest") {
    // Not ready in time: ask anyway; if it is down, planTrip falls back to the built-in router.
    if (!(await waker.ready(OTP_CONTAINER, OTP_WAKE_S))) console.warn(`[otp] not ready after ${OTP_WAKE_S} s of waking`);
    const loc =([lon, lat]: LngLatTuple) => ({ location: { coordinate: { latitude: lat, longitude: lon } } });
    const dt = arriveBy ? { latestArrival: nyIso(local) } : { earliestDeparture: nyIso(local) };
    const ask = async (modes?: unknown) => {
      const res = await fetch(`${OTP_URL}/otp/gtfs/v1`, {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(12000),
        body: JSON.stringify({ query: QUERY, variables: { o: loc(o), d: loc(d), dt, modes } }),
      });
      if (!res.ok) throw new Error(`OTP returned ${res.status}`);
      return response.parse(await res.json()).data.planConnection.edges.map((e) => e.node);
    };
    if (prefer === "subway") return ask(RAIL_ONLY);
    if (prefer === "bus") return ask(BUS_ONLY);
    // All modes, plus a rail-only search so a strong bus option cannot crowd the
    // subway/LIRR alternative out of the result page.
    const [all, rail] = await Promise.all([ask(), ask(RAIL_ONLY).catch(() => [])]);
    return [...all, ...rail];
  },
};

const transit = (i: OtpItinerary) => i.legs.filter((l) => l.route);
/** Route bullet: MTA SBS "Q53-SBS" → "Q53+"; ferries use the route name. */
function bullet(l: z.infer<typeof otpLeg>): string {
  const r = l.route!;
  // NYC Ferry short names are codes ("RS"); riders know the route name ("Rockaway").
  if (l.mode === "FERRY" && r.longName) return r.longName.replace(/\s+(Route|Ferry Route)$/i, "");
  const s = (r.shortName || r.longName || r.gtfsId.split(":")[1] || "?").replace(/-SBS$/i, "+");
  return s;
}
const signature = (i: OtpItinerary) => transit(i).map(bullet).join(">") || "walk";

/**
 * Top N itineraries: earliest arrival (latest departure for arrive-by), then
 * fewer transfers, then less walking. One per distinct route sequence.
 * "less-walking" puts the shortest walk first; "subway" and "bus" keep only rides on those.
 */
export function rankItineraries(items: OtpItinerary[], n = 3, arriveBy = false, prefer: TripPrefer = "fastest"): OtpItinerary[] {
  const t = (s: string) => new Date(s).getTime();
  const fits = (i: OtpItinerary) => prefer === "bus" ? transit(i).every((l) => l.mode === "BUS")
    : prefer === "subway" ? transit(i).every((l) => l.mode !== "BUS")
    : prefer === "ferry" ? transit(i).some((l) => l.mode === "FERRY") : true;
  const time = (a: OtpItinerary, b: OtpItinerary) => (arriveBy ? t(b.start) - t(a.start) : t(a.end) - t(b.end));
  const sorted = items.filter(fits).sort((a, b) => prefer === "less-walking"
    ? a.walkDistance - b.walkDistance || time(a, b) || a.numberOfTransfers - b.numberOfTransfers
    : time(a, b) || a.numberOfTransfers - b.numberOfTransfers || a.walkDistance - b.walkDistance);
  const seen = new Set<string>(); const out: OtpItinerary[] = [];
  for (const i of sorted) { const k = signature(i); if (seen.has(k)) continue; seen.add(k); out.push(i); if (out.length === n) break; }
  return out;
}

/** "BROADWAY/WHITNEY AV" → "Broadway/Whitney Av" (MTA bus stop names are upper case). */
export function stopName(s: string): string {
  if (s !== s.toUpperCase()) return s;
  return s.toLowerCase().replace(/(^|[\s/(-])([a-z])/g, (_, p: string, c: string) => p + c.toUpperCase()).replace(/\b(\d+)(St|Nd|Rd|Th)\b/g, (_, n: string, x: string) => n + x.toLowerCase());
}

const MODE: Record<string, "subway" | "bus" | "rail" | "ferry" | "tram"> = { SUBWAY: "subway", BUS: "bus", RAIL: "rail", FERRY: "ferry", TRAM: "tram", MONORAIL: "tram" };
const NOUN = { subway: "train", bus: "bus", rail: "train", ferry: "ferry", tram: "tram" } as const;
const local = (s: string) => toNyLocal(new Date(s));
const ll = (p: { lon: number; lat: number }): LngLatTuple => [p.lon, p.lat];

async function nearestStation(at: LngLatTuple, src: StationEntrances): Promise<Station | null> {
  const all = await src.stations();
  const best = all.reduce<Station | null>((b, s) => (!b || distM(s.at, at) < distM(b.at, at) ? s : b), null);
  return best && distM(best.at, at) < 250 ? best : null;
}

/** Map one OTP itinerary onto a Trip (extras: subway exits, elevators, alerts). */
export async function itineraryToTrip(
  it: OtpItinerary,
  origin: { label: string; at: LngLatTuple },
  destination: { label: string; at: LngLatTuple },
  src: StationEntrances = openDataEntrances,
): Promise<TripCore> {
  const legs: Leg[] = [];
  const elevators: string[] = [];
  const routes: string[] = [];
  let exitAdvice: string | null = null;
  const lastTransit = it.legs.reduce((k, l, i) => (l.route ? i : k), -1);
  for (let i = 0; i < it.legs.length; i++) {
    const l = it.legs[i];
    const coords = l.legGeometry?.points ? decodePolyline(l.legGeometry.points) : [];
    const geom: LngLatTuple[] = coords.length >= 2 ? coords : [ll(l.from), ll(l.to)];
    if (!l.route) {
      const prev = it.legs[i - 1]; const next = it.legs[i + 1];
      const toName = next ? stopName(next.from.stop?.name ?? next.from.name ?? "the stop") : destination.label;
      const label = !prev ? `Walk to ${toName}` : !next ? `Walk from ${stopName(prev.to.stop?.name ?? prev.to.name ?? "the stop")} to ${destination.label}` : `Transfer: walk to ${toName}`;
      legs.push({ kind: prev && next ? "transfer" : "walk", label, coords: geom, durationS: l.duration, distanceM: l.distance,
        turns: (l.steps ?? []).filter((s) => s.relativeDirection && !/DEPART|CONTINUE/.test(s.relativeDirection)).map((s) => ({ at: [s.lon, s.lat] as LngLatTuple, text: `Turn ${s.relativeDirection!.toLowerCase().replace(/_/g, " ")} onto ${s.streetName || "the path"}` })) });
      continue;
    }
    const mode = MODE[l.mode] ?? "bus";
    const b = bullet(l); routes.push(b);
    const fromStop = stopName(l.from.stop?.name ?? l.from.name ?? "");
    const toStop = stopName(l.to.stop?.name ?? l.to.name ?? "");
    const stops = (l.intermediateStops ?? []).map((s) => ({ at: [s.lon, s.lat] as LngLatTuple, text: stopName(s.name) }));
    if (mode === "subway") elevators.push(...(await safe(elevatorStatus(fromStop), [])), ...(await safe(elevatorStatus(toStop), [])));
    legs.push({
      kind: "ride", route: b, mode, fromStop, toStop, numStops: stops.length + 1, color: l.route.color ? `#${l.route.color}` : undefined, headsign: l.headsign ?? undefined,
      label: `${b} ${NOUN[mode]} ${fromStop} → ${toStop}${l.headsign ? ` (toward ${l.headsign})` : ""}`,
      coords: geom, durationS: l.duration, stops, underground: mode === "subway", geometrySource: "gtfs-shape",
    });
    if (i === lastTransit && mode === "subway") {
      const st = await safe(nearestStation(ll(l.to), src), null);
      if (st) {
        const exit = await portalFor(st, await safe(src.entrances(st.complexId), []), destination.at, "exit", elevators);
        legs.push({ kind: "exit", station: { id: st.id, name: st.name, lon: st.at[0], lat: st.at[1] }, portal: exit, label: `Use the ${exit.label} at ${st.name}` });
        exitAdvice = `Use the ${exit.label} at ${st.name}.${exit.elevatorOnly ? " It is elevator-only." : ""}`;
      }
    }
  }
  if (!legs.length) legs.push({ kind: "walk", label: `Walk to ${destination.label}`, coords: [origin.at, destination.at], durationS: it.duration, distanceM: it.walkDistance, turns: [] });
  const alerts = await safe(serviceAlerts(routes, Math.floor(new Date(it.start).getTime() / 1000)), []);
  const rt = it.legs.some((l) => l.realTime);
  return {
    id: crypto.randomUUID(), mode: routes.length ? "transit" : "walk", origin, destination,
    departIso: local(it.start), arriveIso: local(it.end), legs, routes, alerts, elevators: [...new Set(elevators)], hazards: [], weather: null, exitAdvice,
    context: [], skips: [], impacts: [], stubbed: rt ? [] : ["Scheduled times (no live predictions for these trips yet)."], planner: "otp",
  };
}
