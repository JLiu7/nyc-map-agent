import type { NamedLine } from "@/lib/map/streetPos";
import { stairDescent } from "@/lib/map/stairs";
import { defaultDwell, motionAt } from "./dwell";
import type { ProgressTracker } from "./monotonic";
import { blendStops, type SegmentLookup } from "./history";

/** Pure transit math: estimated train positions along GTFS shapes, arrivals, vehicle bodies. */
export type SystemId = "subway" | "lirr" | "mnr";
export const RAIL_SYSTEMS: SystemId[] = ["subway", "lirr", "mnr"];
export const SYSTEM_LABELS: Record<SystemId | "bus", string> = {
  subway: "Subway",
  lirr: "LIRR",
  mnr: "Metro-North",
  bus: "Buses",
};
export type Grade = "underground" | "grade" | "elevated";
/** Viaduct deck height in metres; elevated trains ride on top of it. */
export const VIADUCT_TOP = 8;
/** How far short of its next stop a late train waits while the feed still says it is on the way (#419). */
const APPROACH_HOLD_M = 150;

export type RouteInfo = { name: string; short: string; color: string; text: string };
export type StaticSystem = {
  system: SystemId;
  routes: Record<string, RouteInfo>;
  lines: GeoJSON.FeatureCollection<GeoJSON.LineString, { route: string; color: string; grade: Grade }>;
  stations: GeoJSON.FeatureCollection<GeoJSON.Point, { id: string; name: string; routes: string }>;
  shapes: Record<string, { c: Array<[number, number]>; m: number[]; g: Grade[] }>;
  stopM: Record<string, Record<string, number>>;
  /** `up`: the bearing a stair climbs to the street, from OpenStreetMap's mapped steps (scripts/build-entrance-stairs.ts). */
  entrances?: GeoJSON.FeatureCollection<GeoJSON.Point, { id: string; name: string; kind: string; up?: number; /** "in" entry only, "out" exit only. */ way?: "in" | "out" }>;
};
/** stops: [stop id, arrival time, realtime departure when later]; origin: first stop is the trip's origin. */
/** at: the stop the vehicle reports; st: its current_status (0 INCOMING_AT, 1 STOPPED_AT, 2 IN_TRANSIT_TO); vt: position time; skipped: SKIPPED stops (not in `stops`). */
export type LiveTrip = { id: string; route: string; dir: number | null; stops: Array<[string, number] | [string, number, number]>; at?: string; st?: number; vt?: number; skipped?: string[]; origin?: boolean };
export type LiveSystem = { at: number; trips: LiveTrip[] };
export type Bus = { id: string; route: string; dir: number | null; lon: number; lat: number; bearing: number | null; next: string | null; t: number };

export type Vehicle = {
  key: string;
  system: SystemId | "bus";
  route: string;
  label: string;
  color: string;
  lon: number;
  lat: number;
  bearing: number;
  grade: Grade;
  /** Draw opacity 0–1 (buses fade when stale or re-snapping); 1 when absent. */
  alpha?: number;
  /** Metres above ground (track height profile); 0 for buses. */
  z?: number;
  dir: number | null;
  nextStop?: string;
  eta?: number;
  /** Stopped at a station: dwelling, waiting at the origin, or arrived at the terminal. */
  stopped?: { kind: "at" | "departs" | "arrived"; stop: string; t: number };
  /** Held per the live feed (src/lib/transit/holds.ts): since when, and at or before which stop. */
  held?: { since: number; stop: string; stopped: boolean };
};

/** Subway platform ids are the station id plus N/S. */
export const stationOf = (system: SystemId, stopId: string) =>
  system === "subway" ? stopId.replace(/[NS]$/, "") : stopId;

export function directionLabel(system: SystemId | "bus", stopId: string, dir: number | null): string {
  if (system === "subway") return stopId.endsWith("S") ? "Downtown" : "Uptown";
  if (system === "bus") return dir === 1 ? "Direction 1" : "Direction 0";
  return dir === 1 ? "To NYC" : "From NYC";
}

function pointAt(shape: StaticSystem["shapes"][string], m: number) {
  const { c, m: ms, g } = shape;
  let lo = 0, hi = ms.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (ms[mid] <= m) lo = mid; else hi = mid;
  }
  const a = c[lo], b = c[hi];
  const f = ms[hi] === ms[lo] ? 0 : Math.min(1, Math.max(0, (m - ms[lo]) / (ms[hi] - ms[lo])));
  const lon = a[0] + (b[0] - a[0]) * f, lat = a[1] + (b[1] - a[1]) * f;
  return { lon, lat, grade: g[lo], lo, hi, f };
}

function bearingOf(a: [number, number], b: [number, number]) {
  const dx = (b[0] - a[0]) * Math.cos((a[1] * Math.PI) / 180), dy = b[1] - a[1];
  return ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
}

/**
 * Where a train is now, measured along the route shape. It dwells at each
 * stop (realtime departure when given, else a default by station), eases out
 * of and into stations, and travels in the remaining time so predicted
 * arrivals still hold. Waits at its origin until departure; stops at the
 * terminal, then leaves the map. Feeds drop passed stops, so with no passed
 * stop we extrapolate back from the first leg (capped). Null when unplaceable.
 * One function drives 2D bullets, 3D models and the follow camera.
 */
/**
 * The longest the vehicle report alone holds a train at a station. The feed keeps saying "stopped at X" until the
 * next report, which can be a minute or more old, while a real subway stops 30 seconds to a minute. Past this the
 * timetable's motion is used, unless the line is in trouble (a held train, or an active delay).
 */
export const MAX_PIN_S = 60;

export function estimateTrain(sys: StaticSystem, trip: LiveTrip, now: number, tracker?: ProgressTracker, hist?: SegmentLookup, opts: { troubled?: boolean } = {}): Vehicle | null {
  const shape = sys.shapes[trip.route];
  const sm = sys.stopM[trip.route];
  if (!shape || !sm) return null;
  const livePts = trip.stops
    .map(([id, arr, dep]) => ({ id, arr, dep, m: sm[stationOf(sys.system, id)] }))
    .filter((p): p is { id: string; arr: number; dep: number | undefined; m: number } => p.m !== undefined);
  // Blend historical segment times with live ETAs (motion only; shown ETAs stay live).
  const pts = blendStops(livePts, now, trip.route, trip.dir, hist);
  if (!pts.length) return null;
  if (pts[0].arr - now > 30 * 60) return null; // not running yet
  const names = stationNames(sys);
  let mo = motionAt(pts, now, (p) => {
    const st = stationOf(sys.system, p.id);
    return sys.system === "subway" ? defaultDwell(st, names.get(st)) : 45;
  }, { origin: trip.origin });
  if (!mo) return null; // finished
  // The feed has not cleared the stop the vehicle reports: never draw the train past it.
  const atI = trip.at ? pts.findIndex((p) => p.id === trip.at) : -1;
  // Still on the way to its first remaining stop (#419): keep it moving toward that stop, not parked at it.
  const approaching = atI === 0 && trip.st !== 1 && mo.phase !== "origin";
  if (approaching) {
    if (!(mo.phase === "moving" && mo.i === 0 && mo.f === 0)) {
      // Late against the timetable: hold just short of the stop until the feed says it arrived.
      const fwd = pts.length > 1 ? Math.sign(pts[1].m - pts[0].m) || 1 : 1;
      mo = { phase: "moving", i: 0, m: pts[0].m - fwd * Math.min(APPROACH_HOLD_M, Math.abs((pts[1]?.m ?? pts[0].m) - pts[0].m) / 2 || APPROACH_HOLD_M), f: 0 };
    }
  } else if (atI >= 0 && mo.phase !== "origin" && (mo.phase === "moving" ? mo.i >= atI : mo.i > atI) && (opts.troubled || now - (trip.vt ?? now) <= MAX_PIN_S)) {
    mo = trip.st === 1 || atI === 0
      ? { phase: "dwell", i: atI, m: pts[atI].m, departs: Math.max(now, pts[atI].dep ?? pts[atI].arr) }
      : { phase: "moving", i: atI - 1, m: pts[atI].m, f: 1 };
  }
  let m = mo.m;
  const nextI = mo.phase === "moving" ? (approaching || (mo.f === 0 && mo.i === 0 && now < pts[0].arr) ? 0 : mo.i + 1) : mo.i;
  const next = pts[Math.min(nextI, pts.length - 1)];
  const onward = pts[Math.min(mo.i + 1, pts.length - 1)];
  const forward = Math.sign(onward.m - pts[mo.i].m) || Math.sign(pts[mo.i].m - (pts[mo.i - 1]?.m ?? pts[mo.i].m)) || 1;
  if (tracker && mo.phase !== "terminal") {
    // After the dwell, roll toward the next station. Do not pass that station early.
    const tripFwd = Math.sign(pts[pts.length - 1].m - pts[0].m) || forward;
    m = tracker.update({ key: `${sys.system}:${trip.id}`, route: trip.route, forward: tripFwd, m, holdM: next.m, holdEta: next.arr }, now);
  }
  const stopped: Vehicle["stopped"] =
    mo.phase === "origin" ? { kind: "departs", stop: pts[0].id, t: mo.departs }
    : mo.phase === "dwell" ? { kind: "at", stop: pts[mo.i].id, t: mo.departs }
    : mo.phase === "terminal" ? { kind: "arrived", stop: pts[mo.i].id, t: mo.arrived }
    : undefined;
  const here = pointAt(shape, m);
  const prof = trackHeightProfile(sys, trip.route);
  const z = prof ? prof.h[here.lo] + (prof.h[here.hi] - prof.h[here.lo]) * here.f : 0;
  const grade = prof ? prof.grade[here.lo] : here.grade;
  const ahead = pointAt(shape, m + forward * 30);
  const route = sys.routes[trip.route];
  return {
    key: `${sys.system}:${trip.id}`,
    system: sys.system,
    route: trip.route,
    label: route?.short ?? trip.route,
    color: route?.color ?? "#808183",
    lon: here.lon,
    lat: here.lat,
    bearing: bearingOf([here.lon, here.lat], [ahead.lon, ahead.lat]),
    grade,
    z,
    dir: trip.dir,
    nextStop: mo.phase === "dwell" || mo.phase === "origin" ? onward.id : next.id,
    eta: livePts[Math.min(mo.phase === "dwell" || mo.phase === "origin" ? mo.i + 1 : nextI, livePts.length - 1)].arr,
    stopped,
  };
}

const nameCache = new WeakMap<StaticSystem, Map<string, string>>();
function stationNames(sys: StaticSystem) {
  let m = nameCache.get(sys);
  if (!m) nameCache.set(sys, (m = new Map(sys.stations.features.map((f) => [f.properties.id, f.properties.name]))));
  return m;
}

export type Arrival = { route: string; direction: string; times: number[] };

/** Next arrivals at one station, grouped by line and direction. */
export function arrivalsAt(system: SystemId, live: LiveSystem | undefined, stationId: string, now: number): Arrival[] {
  const groups = new Map<string, Arrival>();
  for (const trip of live?.trips ?? []) {
    for (const [stop, t] of trip.stops) {
      if (t < now - 30 || stationOf(system, stop) !== stationId) continue;
      const direction = directionLabel(system, stop, trip.dir);
      const key = `${trip.route}|${direction}`;
      const g = groups.get(key) ?? groups.set(key, { route: trip.route, direction, times: [] }).get(key)!;
      g.times.push(t);
    }
  }
  return [...groups.values()]
    .map((g) => ({ ...g, times: g.times.sort((a, b) => a - b).slice(0, 3) }))
    .sort((a, b) => a.route.localeCompare(b.route) || a.direction.localeCompare(b.direction));
}

export type Boarding = { station: string; name: string; toward: string | null; times: number[] };

/**
 * Next trains of one subway line at the stop where a trip boards, only those heading
 * toward the stop where it gets off. Stations come from the line's own stops nearest
 * the two points; direction from each train's neighbouring stop along the line.
 */
export function boardingArrivals(sys: StaticSystem, live: LiveSystem | undefined, route: string, from: [number, number], to: [number, number], now: number): Boarding | null {
  const sm = sys.stopM[route];
  if (!sm) return null;
  const onLine = sys.stations.features.filter((f) => f.properties.id in sm);
  const kx = Math.cos(from[1] * Math.PI / 180);
  const nearest = (p: [number, number]) => onLine.reduce<(typeof onLine)[number] | null>((best, f) => {
    const d = (g: (typeof onLine)[number]) => Math.hypot((g.geometry.coordinates[0] - p[0]) * kx, g.geometry.coordinates[1] - p[1]);
    return !best || d(f) < d(best) ? f : best;
  }, null);
  const a = nearest(from), b = nearest(to);
  if (!a || !b || a === b) return null;
  const id = a.properties.id;
  const way = Math.sign(sm[b.properties.id] - sm[id]);
  const times: number[] = [];
  const lasts = new Map<string, number>();
  for (const trip of live?.trips ?? []) {
    if (trip.route.replace(/X$/, "") !== route) continue;
    const i = trip.stops.findIndex(([stop]) => stationOf(sys.system, stop) === id);
    if (i < 0 || trip.stops[i][1] < now - 30) continue;
    const next = trip.stops[i + 1], prev = trip.stops[i - 1];
    const m = (s: string) => sm[stationOf(sys.system, s)];
    const step = next && m(next[0]) !== undefined ? m(next[0]) - sm[id] : prev && m(prev[0]) !== undefined ? sm[id] - m(prev[0]) : 0;
    if (Math.sign(step) !== way) continue;
    times.push(trip.stops[i][1]);
    const last = stationOf(sys.system, trip.stops[trip.stops.length - 1][0]);
    lasts.set(last, (lasts.get(last) ?? 0) + 1);
  }
  // Where these trains end, as the platform signs say it; the line's far stop when none are running.
  const ends = Object.entries(sm).sort((x, y) => x[1] - y[1]);
  const end = [...lasts].sort((x, y) => y[1] - x[1])[0]?.[0] ?? (way > 0 ? ends[ends.length - 1]?.[0] : ends[0]?.[0]);
  const toward = sys.stations.features.find((f) => f.properties.id === end)?.properties.name ?? null;
  return { station: id, name: a.properties.name, toward, times: times.sort((x, y) => x - y).slice(0, 3) };
}

export const minutesUntil = (t: number, now: number) => Math.max(0, Math.floor((t - now) / 60));

/** Oriented rectangle footprint (length × width metres) for a fill-extrusion vehicle body. */
export function bodyPolygon(lon: number, lat: number, bearing: number, length: number, width: number): GeoJSON.Polygon {
  const rad = (bearing * Math.PI) / 180;
  const mLat = 1 / 111_320, mLon = 1 / (111_320 * Math.cos((lat * Math.PI) / 180));
  const fx = Math.sin(rad), fy = Math.cos(rad); // forward unit (east, north)
  const corner = (along: number, across: number): [number, number] => [
    lon + (fx * along + fy * across) * mLon,
    lat + (fy * along - fx * across) * mLat,
  ];
  const l = length / 2, w = width / 2;
  // Pointed nose so heading reads in 3D.
  return { type: "Polygon", coordinates: [[corner(l + 2, 0), corner(l, w), corner(-l, w), corner(-l, -w), corner(l, -w), corner(l + 2, 0)]] };
}

function bodyPolygonFlat(lon: number, lat: number, bearing: number, length: number, width: number): GeoJSON.Polygon {
  const p = bodyPolygon(lon, lat, bearing, length, width).coordinates[0];
  return { type: "Polygon", coordinates: [[p[1], p[2], p[3], p[4], p[1]]] };
}

/**
 * Hand-placed rail structures the OSM grade match gets wrong or that need a
 * real deck height. Bridges are drawn by the bridges work in the shared
 * threeLayer, so we draw no viaduct there; trains just ride at `deck`.
 */
export type Structure = { id: string; kind: "bridge" | "viaduct"; deck: number; routes: string[]; line: Array<[number, number]> };
export const STRUCTURES: Structure[] = [
  // Subway tracks on the Manhattan Bridge (B D N Q), lower level ~40 m over the river.
  { id: "manhattan-bridge", kind: "bridge", deck: 40, routes: ["B", "D", "N", "Q"], line: [[-73.9947, 40.7149], [-73.9902, 40.7072], [-73.9866, 40.7010]] },
  // J M Z on the Williamsburg Bridge, centre tracks ~38 m.
  { id: "williamsburg-bridge", kind: "bridge", deck: 38, routes: ["J", "M", "Z"], line: [[-73.9807, 40.7166], [-73.9712, 40.7135], [-73.9617, 40.7104]] },
  // 1 train's Manhattan Valley Viaduct over 125 St, ~16 m.
  { id: "manhattan-valley-viaduct", kind: "viaduct", deck: 16, routes: ["1"], line: [[-73.9620, 40.8105], [-73.9585, 40.8158], [-73.9561, 40.8205]] },
  // 3 train's Harlem–148 St terminal. The open-air match calls this pocket a tunnel, so the car sat under the el.
  { id: "harlem-148", kind: "viaduct", deck: VIADUCT_TOP, routes: ["3"], line: [[-73.9349, 40.8232], [-73.9357, 40.8235], [-73.9365, 40.8239]] },
  // 7 and 7X at Flushing–Main St. The match calls the first 450 m a tunnel, then a short street-level gap, so the car sat under the el.
  { id: "flushing-main", kind: "viaduct", deck: VIADUCT_TOP, routes: ["7", "7X"], line: [[-73.83003, 40.7596], [-73.83303, 40.75858], [-73.83649, 40.75781]] },
  // M train on the Myrtle Avenue viaduct. The open-air match calls the Middle
  // Village terminal street level, so the first 650 m sat on the pavement.
  { id: "myrtle-viaduct", kind: "viaduct", deck: VIADUCT_TOP, routes: ["M"], line: [[-73.8896, 40.7114], [-73.8900, 40.7103], [-73.8906, 40.7091], [-73.8915, 40.7081], [-73.8924, 40.7073], [-73.8937, 40.7067], [-73.8953, 40.7063]] },
];

function metresToSegment(p: [number, number], a: [number, number], b: [number, number]): number {
  const k = Math.cos((p[1] * Math.PI) / 180) * 111_320;
  const ax = (a[0] - p[0]) * k, ay = (a[1] - p[1]) * 111_320, bx = (b[0] - p[0]) * k, by = (b[1] - p[1]) * 111_320;
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(ax + dx * t, ay + dy * t);
}
export function structureAt(p: [number, number], within = 60, route?: string): Structure | undefined {
  return STRUCTURES.find((s) => (!route || s.routes.includes(route)) && s.line.some((a, i) => i > 0 && metresToSegment(p, s.line[i - 1], a) < within));
}

const MAX_GRADE = 0.035; // 3.5 % ramps from portals / up to decks
/** Short underground pocket at a shape end that opens onto open track. St George is 374 m. A real tunnel is kilometres, so this does not lift one. */
const TERMINAL_TAIL_M = 400;
const profiles = new WeakMap<object, { h: Float32Array; grade: Grade[] }>();
/**
 * Track height (metres above ground) for every vertex of a route's shape:
 * underground 0 (drawn as ghosts), at grade 0, elevated VIADUCT_TOP, bridges
 * and hand-placed viaducts at their deck, with ramps no steeper than 3.5 %
 * so trains climb out of the tunnel portal, hold the deck, and descend.
 * Bridge models can call this to align their track decks.
 */
export function trackHeightProfile(sys: StaticSystem, route: string): { m: number[]; h: Float32Array; grade: Grade[] } | null {
  const shape = sys.shapes[route];
  if (!shape) return null;
  let p = profiles.get(shape);
  if (!p) {
    const n = shape.c.length, h = new Float32Array(n), grade = shape.g.slice(), raw = grade.slice();
    for (let i = 0; i < n; i++) {
      const s = sys.system === "subway" ? structureAt(shape.c[i], 60, route) : undefined;
      if (s) { grade[i] = "elevated"; h[i] = s.deck; }
      else if (sys.system !== "subway") grade[i] = "grade";
      else h[i] = grade[i] === "elevated" ? VIADUCT_TOP : 0;
    }
    // Ramps: a forward and a backward max-plus pass.
    for (let i = 1; i < n; i++) h[i] = Math.max(h[i], h[i - 1] - MAX_GRADE * (shape.m[i] - shape.m[i - 1]));
    for (let i = n - 2; i >= 0; i--) h[i] = Math.max(h[i], h[i + 1] - MAX_GRADE * (shape.m[i + 1] - shape.m[i]));
    // A ramp out of a tunnel is above ground: treat it as elevated, not a ghost.
    for (let i = 0; i < n; i++) if (h[i] > 1 && grade[i] === "underground") grade[i] = "elevated";
    // A short underground pocket at either end, opening onto track OSM already called open, is a mis-tagged terminal (St George). Flushing and Harlem–148 St are structures above: their raw neighbor is not the viaduct.
    const promoteTail = (i0: number, i1: number, neighbor: number) => {
      if (raw[neighbor] === "underground" || (shape.m[i1] ?? 0) - (shape.m[i0] ?? 0) > TERMINAL_TAIL_M) return;
      const open: Grade = raw[neighbor] === "elevated" ? "elevated" : "grade";
      const hN = open === "elevated" ? Math.max(h[neighbor], VIADUCT_TOP) : 0;
      for (let k = i0; k <= i1; k++) { grade[k] = open; h[k] = hN; }
    };
    let lead = 0;
    while (lead < n && grade[lead] === "underground") lead++;
    if (lead > 0 && lead < n) promoteTail(0, lead - 1, lead);
    let last = n - 1;
    while (last >= 0 && grade[last] === "underground") last--;
    if (last >= 0 && last < n - 1) promoteTail(last + 1, n - 1, last);
    p = { h, grade };
    profiles.set(shape, p);
  }
  return { m: shape.m, ...p };
}

/**
 * Raised track from the height profiles: one deck quad per shape segment that
 * sits above ground (viaducts, portal ramps, bridge decks), each at its own
 * height, so bridge tracks climb, hold the deck and descend. Piers only off
 * the bridges. `raisedCells` lets the ground lines step aside under them.
 */
export function raisedTrack(sys: StaticSystem): {
  decks: GeoJSON.FeatureCollection<GeoJSON.Polygon>;
  piers: GeoJSON.FeatureCollection<GeoJSON.Polygon>;
  raisedCells: Set<string>;
} {
  const decks: GeoJSON.Feature<GeoJSON.Polygon>[] = [], piers: GeoJSON.Feature<GeoJSON.Polygon>[] = [];
  const raisedCells = new Set<string>();
  if (sys.system !== "subway") return { decks: { type: "FeatureCollection", features: decks }, piers: { type: "FeatureCollection", features: piers }, raisedCells };
  for (const route of Object.keys(sys.shapes)) {
    const shape = sys.shapes[route];
    const prof = trackHeightProfile(sys, route);
    if (!prof) continue;
    const color = sys.routes[route]?.color ?? "#808183";
    let sincePier = 0;
    for (let i = 1; i < shape.c.length; i++) {
      const top = (prof.h[i - 1] + prof.h[i]) / 2;
      if (top < 1) continue;
      const [a, b] = [shape.c[i - 1], shape.c[i]];
      const mid: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      raisedCells.add(cellKey(a)).add(cellKey(b));
      const dx = (b[0] - a[0]) * 111_320 * Math.cos((a[1] * Math.PI) / 180), dy = (b[1] - a[1]) * 111_320;
      const len = Math.hypot(dx, dy);
      if (len < 1) continue;
      const brg = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
      const bridge = structureAt(mid, 150, route)?.kind === "bridge";
      decks.push({ type: "Feature", properties: { color, top, bridge }, geometry: bodyPolygonFlat(mid[0], mid[1], brg, len + 1, bridge ? 3.5 : 7) });
      sincePier += len;
      if (!bridge && sincePier > 40) {
        sincePier = 0;
        piers.push({ type: "Feature", properties: { top }, geometry: bodyPolygonFlat(b[0], b[1], 0, 1.2, 1.2) });
      }
    }
  }
  return { decks: { type: "FeatureCollection", features: decks }, piers: { type: "FeatureCollection", features: piers }, raisedCells };
}
/** ~45 m grid cell key. */
export const cellKey = (p: GeoJSON.Position) => `${Math.round(p[0] * 2400)},${Math.round(p[1] * 2400)}`;

const LINE_MERGE_M = 45;
const LINE_CELL = 0.001; // ~80–110 m grid for the segment index

function cellKeyLine(p: GeoJSON.Position): string {
  return `${Math.floor(p[0] / LINE_CELL)},${Math.floor(p[1] / LINE_CELL)}`;
}

/** Segments of lines already drawn, so a later branch can drop the shared trunk. */
function coverIndex(): { add: (line: GeoJSON.Position[]) => void; has: (p: [number, number]) => boolean } {
  const cells = new Map<string, Array<[[number, number], [number, number]]>>();
  const add = (line: GeoJSON.Position[]) => {
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1] as [number, number], b = line[i] as [number, number];
      const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / LINE_CELL));
      for (let s = 0; s <= steps; s++) {
        const key = cellKeyLine([a[0] + ((b[0] - a[0]) * s) / steps, a[1] + ((b[1] - a[1]) * s) / steps]);
        const list = cells.get(key);
        const seg: [[number, number], [number, number]] = [a, b];
        if (list) { if (!list.includes(seg)) list.push(seg); }
        else cells.set(key, [seg]);
      }
    }
  };
  const has = (p: [number, number]) => {
    const cx = Math.floor(p[0] / LINE_CELL), cy = Math.floor(p[1] / LINE_CELL);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const list = cells.get(`${cx + dx},${cy + dy}`);
      if (!list) continue;
      for (const [a, b] of list) if (metresToSegment(p, a, b) < LINE_MERGE_M) return true;
    }
    return false;
  };
  return { add, has };
}

/**
 * One drawing of each track. GTFS stores a shape per branch, so a shared trunk
 * is painted once per branch. The elevated stroke is already opaque and looks
 * the same stacked; the translucent underground dash stacks into a solid
 * stretch in some places and a broken dash in others, which is the seam
 * between elevated runs. Same color and grade within 45 m is one line (the
 * shape resample is 40 m, and the two directions disagree by about that at a
 * portal). Where a later shape leaves the trunk, only the branch is kept.
 */
export function dedupeTrackLines<T extends GeoJSON.Feature<GeoJSON.LineString>>(features: T[]): T[] {
  const groups = new Map<string, T[]>();
  for (const f of features) {
    const p = f.properties as { color?: string; grade?: string } | null;
    const key = `${p?.color ?? ""}|${p?.grade ?? ""}`;
    const list = groups.get(key);
    if (list) list.push(f);
    else groups.set(key, [f]);
  }
  const out: T[] = [];
  for (const group of groups.values()) {
    const index = coverIndex();
    const ordered = group.slice().sort((a, b) => b.geometry.coordinates.length - a.geometry.coordinates.length);
    for (const f of ordered) {
      const coords = f.geometry.coordinates;
      if (coords.length < 2) continue;
      const covered = coords.map((pt) => index.has(pt as [number, number]));
      let start = -1;
      const emit = (to: number) => {
        const seg = coords.slice(start, to);
        if (seg.length > 1) {
          out.push({ ...f, geometry: { type: "LineString", coordinates: seg } });
          index.add(seg);
        }
        start = -1;
      };
      for (let i = 0; i < coords.length; i++) {
        if (!covered[i]) { if (start < 0) start = Math.max(0, i - 1); }
        else if (start >= 0) emit(i + 1);
      }
      if (start >= 0) emit(coords.length);
    }
  }
  return out;
}

/** Split subway ground lines into runs, marking runs under raised track `raised` so 3D hides them and 2D draws them solid. */
export function splitRaised(lines: GeoJSON.Feature<GeoJSON.LineString>[], raised: Set<string>): GeoJSON.Feature<GeoJSON.LineString>[] {
  const out: GeoJSON.Feature<GeoJSON.LineString>[] = [];
  for (const f of lines) {
    const c = f.geometry.coordinates;
    const flag = c.map((p) => raised.has(cellKey(p)));
    let start = 0;
    for (let i = 1; i <= c.length; i++) {
      if (i === c.length || flag[i] !== flag[start]) {
        const seg = c.slice(start, Math.min(i + 1, c.length));
        if (seg.length > 1) out.push({ ...f, properties: { ...f.properties, grade: flag[start] ? "elevated" : (f.properties as { grade: Grade }).grade }, geometry: { type: "LineString", coordinates: seg } });
        start = i;
      }
    }
  }
  return out;
}

/** One 15 m viaduct bay (columns + girders + rails) centred at lon/lat; `station` bays get a platform and canopy. */
export type Bay = { lon: number; lat: number; bearing: number; top: number; len: number; station: boolean };
const BAY = 15;
const BRIDGE_BOX = STRUCTURES.filter((s) => s.kind === "bridge").map((s) => {
  const xs = s.line.map((p) => p[0]), ys = s.line.map((p) => p[1]);
  return [Math.min(...xs) - 0.002, Math.min(...ys) - 0.002, Math.max(...xs) + 0.002, Math.max(...ys) + 0.002];
});

/**
 * Bays along elevated subway shapes (not bridges, which have their own model; not portal ramps under 5 m).
 * Several routes share one structure, so bays are de-duplicated on a ~10 m grid by heading.
 */
export function viaductBays(sys: StaticSystem): Bay[] {
  if (sys.system !== "subway") return [];
  const seen = new Set<string>(), bays: Bay[] = [];
  // ~45 m cells around each station (3x3 neighbourhood ≈ an 8-car platform either side).
  const stationCells = new Set<string>();
  for (const f of sys.stations.features) {
    const [x, y] = f.geometry.coordinates;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) stationCells.add(`${Math.round(x * 2400) + dx},${Math.round(y * 2400) + dy}`);
  }
  const nearBridge = (p: [number, number], route: string) => BRIDGE_BOX.some((b) => p[0] > b[0] && p[0] < b[2] && p[1] > b[1] && p[1] < b[3]) && structureAt(p, 80, route)?.kind === "bridge";
  for (const route of Object.keys(sys.shapes)) {
    const shape = sys.shapes[route], prof = trackHeightProfile(sys, route);
    if (!prof) continue;
    let carry = 0;
    for (let i = 1; i < shape.c.length; i++) {
      const [a, b] = [shape.c[i - 1], shape.c[i]];
      const ha = prof.h[i - 1], hb = prof.h[i], seg = shape.m[i] - shape.m[i - 1];
      if (Math.min(ha, hb) < 5 || seg <= 0) { carry = 0; continue; }
      const kx = 111_320 * Math.cos((a[1] * Math.PI) / 180);
      const brg = ((Math.atan2((b[0] - a[0]) * kx, (b[1] - a[1]) * 111_320) * 180) / Math.PI + 360) % 360;
      for (let d = carry; d < seg; d += BAY) {
        const t = d / seg, lon = a[0] + (b[0] - a[0]) * t, lat = a[1] + (b[1] - a[1]) * t;
        if (nearBridge([lon, lat], route)) continue;
        const key = `${Math.round(lon * 9000)},${Math.round(lat * 9000)},${Math.round((brg % 180) / 20)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const station = stationCells.has(cellKey([lon, lat]));
        bays.push({ lon, lat, bearing: brg, top: ha + (hb - ha) * t, len: BAY, station });
      }
      carry = (carry + Math.ceil((seg - carry) / BAY) * BAY) - seg;
    }
  }
  return bays;
}

/** A street entrance for the 3D kit; `bearing` is the way its stair goes down (src/lib/map/stairs.ts). */
export type EntranceInstance = { lon: number; lat: number; bearing: number; kind: "stair" | "elevator"; out: boolean; id: string; name: string };
export function entranceInstances(sys: StaticSystem, outStations: Set<string>, center: [number, number], radius = 300, lines: NamedLine[] = []): EntranceInstance[] {
  const st = new Map(sys.stations.features.map((f) => [String(f.properties.id), f.geometry.coordinates as [number, number]]));
  const kx = 111_320 * Math.cos((center[1] * Math.PI) / 180), out: EntranceInstance[] = [];
  for (const f of sys.entrances?.features ?? []) {
    const [lon, lat] = f.geometry.coordinates;
    if (Math.hypot((lon - center[0]) * kx, (lat - center[1]) * 111_320) > radius) continue;
    if (!/stair|elevator|escalator/i.test(f.properties.kind)) continue; // easements, station houses, walkways: no kit
    const s = st.get(String(f.properties.id));
    const bearing = stairDescent([lon, lat], s ?? null, f.properties.up, lines);
    const elevator = /elevator/i.test(f.properties.kind);
    out.push({ lon, lat, bearing, kind: elevator ? "elevator" : "stair", out: elevator && outStations.has(String(f.properties.id)), id: String(f.properties.id), name: f.properties.name });
  }
  return out;
}

/** OSM `level` like "-2", "-1;0", "-2--1" → [min, max]. */
export function parseLevel(v: string | undefined, fallback = 0): [number, number] {
  const n = (v ?? "").match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
  return n.length ? [Math.min(...n), Math.max(...n)] : [fallback, fallback];
}
/** One station's insides for the x-ray view (public/transit/xray.json, keyed by GTFS station id). */
export type XrayWay = { k: "platform" | "steps" | "corridor"; c: Array<[number, number]>; from: number; to: number };
export type XrayStation = { ways: XrayWay[]; elevators: Array<{ lon: number; lat: number; from: number }> };
/** Metres per OSM level. */
export const LEVEL_M = 5;
