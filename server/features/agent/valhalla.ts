/**
 * Walking routes from the self-hosted Valhalla on the VPS (deploy/valhalla/build.sh), pedestrian
 * profile. routeWalk in ./services uses it when VALHALLA_URL is set and falls back to the public
 * OSRM foot server when it fails.
 */
import { z } from "zod";
import { formatStreetText } from "../../../src/lib/streetName";
import type { LngLatTuple } from "../../../src/features/agent/schema";
import { decodePolyline } from "./polyline";
import { VALHALLA_CONTAINER, waker } from "./sablier";
import type { WalkResult } from "./services";

export const VALHALLA_URL = (process.env.VALHALLA_URL ?? "").replace(/\/$/, "");
/** On the VPS it sleeps when idle (#44) and starts in about a second. */
const VALHALLA_WAKE_S = 20;

const maneuver = z.object({ type: z.number(), street_names: z.array(z.string()).optional(), begin_shape_index: z.number() });
const routeSchema = z.object({
  trip: z.object({
    summary: z.object({ length: z.number(), time: z.number() }),
    legs: z.array(z.object({ shape: z.string(), maneuvers: z.array(maneuver) })).min(1),
  }),
});

/** Valhalla maneuver types that are turns (its DirectionsLeg_Maneuver_Type). */
const TURN: Record<number, string> = { 9: "slight right", 10: "right", 11: "sharp right", 14: "sharp left", 15: "left", 16: "slight left" };

/**
 * A Valhalla /route response → WalkResult. Turns onto unnamed walkways (plazas, crosswalks)
 * are left out: "turn left onto the walkway" five times across a park says nothing useful.
 */
export function valhallaToWalk(json: unknown): WalkResult {
  const { trip } = routeSchema.parse(json);
  const coords: LngLatTuple[] = []; const turns: WalkResult["turns"] = [];
  for (const leg of trip.legs) {
    const shape = decodePolyline(leg.shape, 6);
    for (const m of leg.maneuvers) {
      const street = m.street_names?.[0];
      if (TURN[m.type] && street) turns.push({ at: shape[m.begin_shape_index], text: formatStreetText(`Turn ${TURN[m.type]} onto ${street}`) });
    }
    coords.push(...shape);
  }
  return { coords, distanceM: trip.summary.length * 1000, durationS: trip.summary.time, turns };
}

export async function valhallaWalk([aLon, aLat]: LngLatTuple, [bLon, bLat]: LngLatTuple): Promise<WalkResult> {
  // Not ready in time: ask anyway; routeWalk falls back to OSRM if it fails.
  await waker.ready(VALHALLA_CONTAINER, VALHALLA_WAKE_S);
  const res = await fetch(`${VALHALLA_URL}/route`, {
    method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(8000),
    body: JSON.stringify({ locations: [{ lat: aLat, lon: aLon }, { lat: bLat, lon: bLon }], costing: "pedestrian", units: "kilometers" }),
  });
  if (!res.ok) throw new Error(`Valhalla returned ${res.status}`);
  return valhallaToWalk(await res.json());
}
