import type { Segment } from "./flythrough";
import { STATION_MODELS, type StationModelId } from "@/lib/map/stationModels";

/** How far the ride's last stop may be from the middle of the model's platform. */
const NEAR_M = 220;

/**
 * Which station model plays a station leg in the dollhouse view (#129), or null: leaving a train
 * that runs south (downtown, or on to Brooklyn) at a station whose model has walks from that
 * train's platform. Every other leg stays first person.
 */
export function dollhouseLeg(seg: Segment, ride: Segment | undefined): StationModelId | null {
  if (seg.kind !== "ascend" || ride?.kind !== "ride") return null;
  const from = ride.coords[0], to = ride.coords[ride.coords.length - 1];
  if (!from || !to || to[1] >= from[1]) return null; // these trains end south of where they began
  for (const m of STATION_MODELS) {
    if (!m.routes.test(ride.route ?? "")) continue;
    const [lon, lat] = m.platform;
    const dx = (to[0] - lon) * 111_320 * Math.cos((lat * Math.PI) / 180), dy = (to[1] - lat) * 111_320;
    if (Math.hypot(dx, dy) < NEAR_M) return m.id;
  }
  return null;
}
