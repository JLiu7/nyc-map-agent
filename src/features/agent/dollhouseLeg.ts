import type { Segment } from "./flythrough";

/** Where the dollhouse walk starts: the downtown 4/5 platform at Fulton St, by the Dey St stair. */
const FULTON_45: [number, number] = [-74.00957, 40.71042];
const NEAR_M = 220;

/**
 * Whether a station leg is played in the dollhouse view (#129): leaving a downtown 4 or 5 train at
 * Fulton St, the one walk the station model has a path for. Every other leg stays first person.
 */
export function dollhouseLeg(seg: Segment, ride: Segment | undefined): boolean {
  if (seg.kind !== "ascend" || ride?.kind !== "ride" || !/^[45]X?$/.test(ride.route ?? "")) return false;
  const from = ride.coords[0], to = ride.coords[ride.coords.length - 1];
  if (!from || !to || to[1] >= from[1]) return false; // a downtown train ends south of where it began
  const dx = (to[0] - FULTON_45[0]) * 111_320 * Math.cos((FULTON_45[1] * Math.PI) / 180), dy = (to[1] - FULTON_45[1]) * 111_320;
  return Math.hypot(dx, dy) < NEAR_M;
}
