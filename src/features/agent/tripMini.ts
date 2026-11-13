import type { Segment } from "./flythrough";
import { routeColor } from "./tripLayer";

/** Walks, stairs and drives on the trip's mini map: slate, so the rides keep their line colours. */
const ON_FOOT = "#475569";

/** The trip's parts as lines for the mini map, each ride in its line's colour. */
export function tripMiniLine(segs: Segment[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: segs.filter((s) => s.coords.length >= 2).map((s) => ({
      type: "Feature", properties: { color: s.kind === "ride" && s.route ? routeColor(s.route) : ON_FOOT },
      geometry: { type: "LineString", coordinates: s.coords },
    })),
  };
}

/** "4 train Brooklyn Bridge–City Hall → Fulton St (toward Woodlawn)": the stop you get on at, and the one you get off at. */
const rideEnds = (label: string): { from: string | null; to: string | null } => {
  const m = /^\S+ \S+ (.+?) → (.+?)(?: \(toward .*\))?$/.exec(label);
  return { from: m?.[1] ?? null, to: m?.[2] ?? null };
};

/**
 * The next stop to show on the mini map, `f` (0 to 1) into part `i`: on a ride, the next station
 * the train reaches; on foot or on the stairs, where the next ride starts; after the last ride, the destination.
 */
export function nextStopAt(segs: Segment[], i: number, f: number, destination: string | null): string | null {
  const seg = segs[i];
  if (!seg) return destination;
  if (seg.kind === "ride") {
    const stop = seg.callouts.slice(1).find((c) => c.f > f);
    return stop?.text ?? rideEnds(seg.label).to ?? destination;
  }
  const ride = segs.slice(i + 1).find((s) => s.kind === "ride");
  return (ride && rideEnds(ride.label).from) || destination;
}
