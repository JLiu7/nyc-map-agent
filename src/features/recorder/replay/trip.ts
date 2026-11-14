/**
 * The step-free trip the demo tells, Cortlandt St to 14 St-Union Sq, laid on
 * the film of it (public/walks/trip.mp4): where the rider is at each second of
 * the film. The film is the clock. Each of its 17 steps opens at one of the
 * Walk Guide's 17 checkpoints, so the dot is at a checkpoint when its step
 * starts and moves to the next one while the step plays. The film does not
 * show the ride: the dot waits on the platform, then is at the next station.
 */
import baked from "./trip-stops.json";

type LonLat = [number, number];
type Level = "street" | "concourse" | "mezzanine" | "platform";
interface Stop { id: string; station: string; level: string; at: number[]; via?: number[][]; by?: string }

/** The checkpoints, baked from the walk guide by scripts/derive-trip-replay.ts. */
const STOPS = baked as Stop[];

export const FILM = "/walks/trip.mp4";
/** The film's length in seconds. */
export const FILM_S = 120.5;

/** The second of the film where each checkpoint's step starts (the cue starts in public/walks/trip.vtt). */
const STEP_AT: Record<string, number> = {
  "fulton-entrance": 9.0, "el728x": 14.9, "dey-passage": 19.4, "to-rwe": 28.3, "cortlandt-turnstiles": 35.6, "uptown-queens": 40.7, "cortlandt-platform": 49.0,
  "us-platform": 55.0, "us-to-mezzanine": 64.2, "us-to-l": 68.7, "us-corridor": 75.5, "us-yellow": 80.9, "us-sw-turnstiles": 85.4,
  "us-downtown-sign": 90.9, "us-exit-arrow": 97.2, "us-mural-elevator": 104.0, "us-climate-clock": 108.5,
};
const TIMES = STOPS.map((s) => STEP_AT[s.id]);

const LEVEL_NAME: Record<Level, string> = { street: "Street", concourse: "Concourse", mezzanine: "Mezzanine", platform: "Platform" };
const pt = (p: number[]): LonLat => [p[0], p[1]];

/** Which stretch of the trip: 0 at Cortlandt St, 1 on the train, 2 at 14 St-Union Sq. */
export type Part = 0 | 1 | 2;

interface TripPlace {
  at: LonLat;
  /** The short label the dot carries: Street, Concourse, Mezzanine, Platform, or Train. */
  level: string;
  /** The one line on screen: the station, or the train between the two. */
  place: string;
  part: Part;
}

const metres = (a: LonLat, b: LonLat): number => Math.hypot((b[0] - a[0]) * 111_320 * Math.cos((a[1] * Math.PI) / 180), (b[1] - a[1]) * 110_540);

/** The point a share k (0 to 1) of the way along a line, by distance. */
function along(line: LonLat[], k: number): LonLat {
  const lens = line.slice(1).map((p, j) => metres(line[j], p));
  let left = k * lens.reduce((s, x) => s + x, 0);
  for (let j = 0; j < lens.length; j++) {
    if (left <= lens[j] || j === lens.length - 1) {
      const f = lens[j] > 0 ? Math.min(1, left / lens[j]) : 0;
      return [line[j][0] + (line[j + 1][0] - line[j][0]) * f, line[j][1] + (line[j + 1][1] - line[j][1]) * f];
    }
    left -= lens[j];
  }
  return line[line.length - 1];
}

const partOf = (s: Stop): Part => (s.station === STOPS[0].station ? 0 : 2);
const here = (s: Stop): TripPlace => ({ at: pt(s.at), level: LEVEL_NAME[s.level as Level], place: s.station, part: partOf(s) });

/** Where the rider is at second t of the film. */
export function tripAt(t: number): TripPlace {
  const last = STOPS.length - 1;
  if (!(t > TIMES[0])) return here(STOPS[0]);
  if (t >= TIMES[last]) return here(STOPS[last]);
  let i = 0;
  while (i < last - 1 && TIMES[i + 1] <= t) i++;
  const a = STOPS[i], b = STOPS[i + 1];
  const k = (t - TIMES[i]) / (TIMES[i + 1] - TIMES[i]);
  // The film stays on the platform while its "board the train" step plays, then cuts to the next station: so does the dot.
  if (a.by === "train") return here(a);
  // An elevator: the two ends are a step apart on the map, and the level changes half-way up or down.
  if (a.by === "elevator") return { ...here(k < 0.5 ? a : b), at: along([pt(a.at), pt(b.at)], k), part: partOf(a) };
  return { ...here(a), at: along([pt(a.at), ...(a.via ?? []).map(pt), pt(b.at)], k) };
}

/** The walked line through each station, and the straight line that stands in for the train ride between them. */
export const WALKED: LonLat[][] = ([0, 2] as const).map((part) => STOPS.filter((s) => partOf(s) === part).flatMap((s) => [pt(s.at), ...(s.by ? [] : (s.via ?? []).map(pt))]));
export const RIDE: LonLat[] = [WALKED[0][WALKED[0].length - 1], WALKED[1][0]];

/** What the map frames during each part: [[west, south], [east, north]]. */
export function frameOf(part: Part): [LonLat, LonLat] {
  const pts = part === 0 ? WALKED[0] : part === 2 ? WALKED[1] : [...WALKED[0], ...WALKED[1]];
  const lons = pts.map((p) => p[0]), lats = pts.map((p) => p[1]);
  return [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]];
}
