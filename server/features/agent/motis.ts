/**
 * Multimodal trip search via a self-hosted MOTIS 2 (`/api/v6/plan`), an alternative to OTP that
 * builds the NYC dataset in seconds and serves it in a few hundred MB. Same feeds as OTP
 * (deploy/motis/build.sh). This file only maps MOTIS itineraries onto the OTP shape, so ranking
 * and itineraryToTrip in ./otp stay the one path. Picked with TRIP_PLANNER=motis (see ./plan).
 */
import { z } from "zod";
import type { LngLatTuple } from "../../../src/features/agent/schema";
import { decodePolyline, nyIso, type OtpClient, type OtpItinerary } from "./otp";

const MOTIS_URL = (process.env.MOTIS_URL ?? "http://nyc-map-motis:8080").replace(/\/$/, "");

const poly = z.object({ points: z.string(), precision: z.number() });
const place = z.object({ name: z.string(), stopId: z.string().optional(), lat: z.number(), lon: z.number() });
const leg = z.object({
  mode: z.string(), from: place, to: place, duration: z.number(), startTime: z.string(), endTime: z.string(),
  scheduledStartTime: z.string(), scheduledEndTime: z.string(), realTime: z.boolean().optional(), distance: z.number().nullish(),
  headsign: z.string().nullish(), routeId: z.string().nullish(), routeShortName: z.string().nullish(), routeLongName: z.string().nullish(), routeColor: z.string().nullish(),
  intermediateStops: z.array(place).nullish(), legGeometry: poly.nullish(),
  steps: z.array(z.object({ relativeDirection: z.string().nullish(), distance: z.number().nullish(), streetName: z.string().nullish(), polyline: poly })).nullish(),
});
const itinerary = z.object({ duration: z.number(), startTime: z.string(), endTime: z.string(), transfers: z.number(), legs: z.array(leg) });
export const motisResponse = z.object({ itineraries: z.array(itinerary) });
type MotisLeg = z.infer<typeof leg>;

/** MOTIS splits rail by GTFS route type; OTP's five modes are all the trip mapper knows. */
const MODE: Record<string, string> = {
  SUBWAY: "SUBWAY", METRO: "SUBWAY", BUS: "BUS", COACH: "BUS", FERRY: "FERRY", TRAM: "TRAM", CABLE_CAR: "TRAM", AERIAL_LIFT: "TRAM", AREAL_LIFT: "TRAM", FUNICULAR: "TRAM",
  RAIL: "RAIL", REGIONAL_RAIL: "RAIL", REGIONAL_FAST_RAIL: "RAIL", SUBURBAN: "RAIL", LONG_DISTANCE: "RAIL", HIGHSPEED_RAIL: "RAIL", NIGHT_RAIL: "RAIL",
};
const RAIL_ONLY = "SUBWAY,METRO,RAIL,REGIONAL_RAIL,REGIONAL_FAST_RAIL,SUBURBAN,FERRY,TRAM,AERIAL_LIFT";
const BUS_ONLY = "BUS,COACH";

/** Dataset-tagged MOTIS id "subway_A" → OTP-style "SUBWAY:A" (the tags are OTP's feed ids, lower case). */
export const gtfsId = (id: string) => { const i = id.indexOf("_"); return i < 0 ? id : `${id.slice(0, i).toUpperCase()}:${id.slice(i + 1)}`; };

/** [lon, lat][] → Google encoded polyline at precision 5, the form ./otp decodes. */
export function encodePolyline(pts: LngLatTuple[]): string {
  let out = "", plat = 0, plon = 0;
  const put = (v: number) => { let n = v < 0 ? ~(v << 1) : v << 1; while (n >= 0x20) { out += String.fromCharCode((0x20 | (n & 0x1f)) + 63); n >>= 5; } out += String.fromCharCode(n + 63); };
  for (const [lon, lat] of pts) { const a = Math.round(lat * 1e5), o = Math.round(lon * 1e5); put(a - plat); put(o - plon); plat = a; plon = o; }
  return out;
}

const stop = (p: z.infer<typeof place>) => (p.stopId ? { gtfsId: gtfsId(p.stopId), name: p.name } : null);
const pt = (p: z.infer<typeof place>) => ({ name: p.name === "START" || p.name === "END" ? null : p.name, lat: p.lat, lon: p.lon, stop: stop(p) });

function toOtpLeg(l: MotisLeg): OtpItinerary["legs"][number] {
  const mode = MODE[l.mode] ?? l.mode;
  const ride = mode !== "WALK" && !!l.routeId;
  return {
    mode, duration: l.duration, distance: l.distance ?? 0, realTime: l.realTime ?? false, headsign: l.headsign ?? null, transitLeg: ride,
    start: { scheduledTime: l.scheduledStartTime, estimated: l.realTime ? { time: l.startTime } : null },
    end: { scheduledTime: l.scheduledEndTime, estimated: l.realTime ? { time: l.endTime } : null },
    from: pt(l.from), to: pt(l.to),
    route: ride ? { gtfsId: gtfsId(l.routeId!), shortName: l.routeShortName ?? null, longName: l.routeLongName ?? null, color: l.routeColor ?? null } : null,
    legGeometry: l.legGeometry ? { points: encodePolyline(decodePolyline(l.legGeometry.points, l.legGeometry.precision)) } : null,
    intermediateStops: (l.intermediateStops ?? []).map((s) => ({ name: s.name, lat: s.lat, lon: s.lon })),
    steps: (l.steps ?? []).map((s) => {
      const [lon, lat] = decodePolyline(s.polyline.points, s.polyline.precision)[0] ?? [l.from.lon, l.from.lat];
      return { relativeDirection: s.relativeDirection ?? null, streetName: s.streetName || null, lat, lon };
    }),
  };
}

export function toOtpItinerary(it: z.infer<typeof itinerary>): OtpItinerary {
  const legs = it.legs.map(toOtpLeg);
  return {
    start: it.startTime, end: it.endTime, duration: it.duration, numberOfTransfers: it.transfers, legs,
    walkDistance: legs.filter((l) => l.mode === "WALK").reduce((s, l) => s + l.distance, 0),
  };
}

export const httpMotis: OtpClient = {
  async plan(o, d, local, arriveBy, prefer = "fastest") {
    const ask = async (modes?: string) => {
      const q = new URLSearchParams({ fromPlace: `${o[1]},${o[0]}`, toPlace: `${d[1]},${d[0]}`, time: nyIso(local), arriveBy: String(arriveBy), numItineraries: "8", searchWindow: "5400" });
      if (modes) q.set("transitModes", modes);
      const res = await fetch(`${MOTIS_URL}/api/v6/plan?${q}`, { signal: AbortSignal.timeout(12000) });
      if (!res.ok) throw new Error(`MOTIS returned ${res.status}`);
      return motisResponse.parse(await res.json()).itineraries.map(toOtpItinerary);
    };
    if (prefer === "subway") return ask(RAIL_ONLY);
    if (prefer === "bus") return ask(BUS_ONLY);
    // As with OTP: a rail-only search too, so a strong bus option cannot crowd the subway out.
    const [all, rail] = await Promise.all([ask(), ask(RAIL_ONLY).catch(() => [])]);
    return [...all, ...rail];
  },
};
