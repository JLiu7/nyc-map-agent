/**
 * Friday's real walk at 14 St-Union Sq (2026-11-13, 5:04 to 5:17 pm), set up
 * for the replay: where the clock starts, how it maps onto the Walk Guide's
 * line, and the stills from the phone's own screen recording of Google Maps.
 */
import type { LonLat } from "../clean";
import baked from "./union-sq-line.json";

/** The replay clock's zero: the first second of the phone's screen recording (22:04:27 UTC). */
export const T0 = Date.UTC(2026, 10, 13, 22, 4, 27);
export const START_S = 10;
export const END_S = 790;

/**
 * The Walk Guide's line through the station, platform to street, corners
 * included, and the level of each point (the stretch that starts there is on
 * it). Baked from the walk guide by scripts/derive-union-sq-walk.ts.
 */
export const LINE = baked.line as LonLat[];
export const LINE_LEVELS: string[] = baked.lineLevels;

export const LEVELS = ["platform", "mezzanine", "street"] as const;
/** The two elevator rides, in order: EL219 (platform to mezzanine) and EL217 (mezzanine to 14 St & 4 Av). */
export const RIDE_AT = baked.rides as { from: LonLat; to: LonLat; name: string }[];

/**
 * Google Maps on the same phone, one still every 10 s (screen recording,
 * clock-aligned within a second). A frame showing the phone's wallet and two of
 * Control Center were left out; the still before holds instead. The banner
 * "No GPS signal · Approximate location" shows from the first frame until 10 s
 * after the street elevator.
 */
const SKIP = new Set([0, 530, 720, 730, 740]);
export const GOOGLE_STILLS: { s: number; src: string }[] = [];
for (let s = START_S; s <= END_S; s += 10) {
  if (SKIP.has(s)) continue;
  const name = `${String(Math.floor(s / 60)).padStart(2, "0")}m${String(s % 60).padStart(2, "0")}s`;
  GOOGLE_STILLS.push({ s, src: `/replay/union-sq-google-maps/at-${name}.jpg` });
}
export const GOOGLE_NO_GPS = { from: 0, to: 605 };

export function stillAt(s: number): { s: number; src: string } {
  let best = GOOGLE_STILLS[0];
  for (const g of GOOGLE_STILLS) if (g.s <= s) best = g;
  return best;
}

export const loadWalk = () => import("./union-sq-walk.json").then((m) => m.default as unknown);
