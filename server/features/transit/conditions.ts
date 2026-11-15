/**
 * The conditions around a scored prediction (#11): was a service notice active
 * for the line, was it raining or snowing, and for a bus, how fast was traffic
 * on a DOT speed link by the stop. Stored beside each score so error can be
 * split by them. Nothing here changes a prediction. Pure functions: the observer
 * script fetches the notices, the weather and the speed links from the live
 * site, the same answers the app's own screens get.
 */
export type Conditions = { notice: boolean | null; weather: "dry" | "rain" | "snow" | null; traffic: 0 | 1 | 2 | null };

type Alert = { routes?: string[]; start?: number; end?: number };
/** Lines and routes with a notice in effect at `at` (unix seconds); an end of 0 is open-ended. */
export function noticeRoutes(alerts: Alert[], at: number): Set<string> {
  const out = new Set<string>();
  for (const a of alerts) {
    if ((a.start ?? 0) > at || ((a.end ?? 0) !== 0 && (a.end ?? 0) < at)) continue;
    for (const r of a.routes ?? []) out.add(r);
  }
  return out;
}

/** The app's weather kinds, down to what matters on the road. */
export function wetness(kind: string | undefined): Conditions["weather"] {
  return kind === "rain" || kind === "snow" ? kind : kind ? "dry" : null;
}

export type SpeedLink = { level: string; coords: Array<[number, number]> };
const LEVELS: Record<string, 0 | 1 | 2> = { free: 0, slow: 1, jam: 2 };
const KY = 111_320;
/** Metres from a point to a line's nearest segment. */
function distance(lon: number, lat: number, line: Array<[number, number]>): number {
  const kx = KY * Math.cos((lat * Math.PI) / 180);
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    const ax = (line[i - 1][0] - lon) * kx, ay = (line[i - 1][1] - lat) * KY, bx = (line[i][0] - lon) * kx, by = (line[i][1] - lat) * KY;
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    const u = l2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0;
    best = Math.min(best, Math.hypot(ax + u * dx, ay + u * dy));
  }
  return best;
}
/**
 * The speed level of the nearest DOT link within `within` metres of a point, or null. The links
 * cover highways, bridges and some avenues, so most bus stops have none.
 */
export function trafficNear(links: SpeedLink[], lon: number, lat: number, within = 80): Conditions["traffic"] {
  let best = within, level: Conditions["traffic"] = null;
  for (const l of links) {
    if (!(l.level in LEVELS) || l.coords.length < 2) continue;
    // Skip links whose first point is far away before measuring every segment (links are a few km at most).
    if (Math.abs(l.coords[0][1] - lat) > 0.08 || Math.abs(l.coords[0][0] - lon) > 0.1) continue;
    const d = distance(lon, lat, l.coords);
    if (d <= best) { best = d; level = LEVELS[l.level]; }
  }
  return level;
}
