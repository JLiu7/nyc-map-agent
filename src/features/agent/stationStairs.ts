import type { LngLatTuple } from "./schema";
import { cumulative, type Segment } from "./flythrough";

/**
 * The way down a station in the trip preview: from the street entrance down
 * the station's steps and corridors to the platform where the train stops,
 * found in the x-ray station data (public/transit/xray.json). The preview walks
 * the marker along it; without a connected path it keeps the straight line.
 * Loaded on demand by the player, so the path finder stays out of the overlay chunk.
 *
 * Shapes match XrayWay / XrayStation in the transit feature, which this one may
 * not import (features import only shared core).
 */
export type StationWay = { k: "platform" | "steps" | "corridor"; c: LngLatTuple[]; from: number; to: number };
export type StationInside = { ways: StationWay[] };
/** A point on the way down and its depth in metres (0 = the street, negative below). */
type StairPoint = { at: LngLatTuple; z: number };

/** Metres per OSM level, as the x-ray view draws them (LEVEL_M in the transit model). */
const STAIR_LEVEL_M = 5;
/** The entrance must sit this close to a street-level end of the station's ways. */
const START_M = 30;
/**
 * Mapped ways rarely join up: the mezzanine floor and the platform's own floor
 * are mostly not drawn. Two points on the same level this close are one floor
 * you can walk across.
 */
const FLOOR_M = 45;
/** Crossing an undrawn floor costs more than walking a drawn way, so drawn ways win. */
const FLOOR_COST = 1.6;
/**
 * A level change nobody mapped (a mezzanine with no steps drawn down to the
 * platform) is allowed between neighbouring levels at this extra cost, so a
 * mapped flight always wins when there is one.
 */
const UNMAPPED_STAIR_COST = 40;
/** Platforms and corridors get a point at least this often, so a floor link can land mid-platform. */
const STEP_M = 8;
/** A platform far from where the train stops costs this much per metre. */
const TRAIN_COST = 3;
/** Stations whose platform is this close to the train are tried when the id has no path. */
const NEAR_TRAIN_M = 150;

function metres(a: LngLatTuple, b: LngLatTuple): number {
  const kx = 111_320 * Math.cos((((a[1] + b[1]) / 2) * Math.PI) / 180);
  return Math.hypot((b[0] - a[0]) * kx, (b[1] - a[1]) * 111_320);
}
const depth = (level: number) => Math.min(level, 0) * STAIR_LEVEL_M;

type Node = { at: LngLatTuple; level: number; platform: boolean };

/**
 * Levels for each vertex of a flight of steps. OSM's step direction is not
 * reliable, so the end given `to` is the one that lands nearer the ways (or the
 * street entrance) on level `to`; ties keep the order as mapped.
 */
function stepLevels(way: StationWay, others: Node[], street: LngLatTuple[]): number[] {
  const n = way.c.length - 1;
  const a = way.c[0], b = way.c[n];
  const near = (p: LngLatTuple, level: number) => {
    let best = Infinity;
    for (const o of others) if (o.level === level) best = Math.min(best, metres(p, o.at));
    if (level >= 0) for (const s of street) best = Math.min(best, metres(p, s));
    return Math.min(best, 500);
  };
  const asMapped = near(a, way.from) + near(b, way.to);
  const flipped = near(a, way.to) + near(b, way.from);
  const [lo, hi] = flipped < asMapped ? [way.to, way.from] : [way.from, way.to];
  return way.c.map((_, i) => lo + ((hi - lo) * i) / Math.max(n, 1));
}

/**
 * The way from a street entrance `portal` down to the platform nearest `train`
 * (where the train stops), or null when the station's ways do not connect.
 * Starts at the portal on the street and ends on the platform.
 */
export function stairPath(st: StationInside, portal: LngLatTuple, train: LngLatTuple): StairPoint[] | null {
  // Floors first: platforms and corridors sit on one level each.
  const flat: Node[] = [];
  const ways = st.ways.map((w) => (w.k === "steps" ? w : { ...w, c: densify(w.c, STEP_M) }));
  for (const w of ways) if (w.k !== "steps") for (const at of w.c) flat.push({ at, level: w.from, platform: w.k === "platform" });
  const nodes: Node[] = [];
  const edges: Array<Array<{ to: number; cost: number }>> = [];
  const link = (i: number, j: number, cost: number) => {
    edges[i].push({ to: j, cost });
    edges[j].push({ to: i, cost });
  };
  const add = (node: Node) => {
    nodes.push(node);
    edges.push([]);
    return nodes.length - 1;
  };
  for (const w of ways) {
    if (w.c.length < 2) continue;
    const levels = w.k === "steps" ? stepLevels(w, flat, [portal]) : w.c.map(() => w.from);
    const room = w.k === "corridor" && w.c.length > 3 && metres(w.c[0], w.c[w.c.length - 1]) < 0.01;
    let prev = -1;
    w.c.forEach((at, i) => {
      const id = add({ at, level: levels[i], platform: w.k === "platform" });
      // A corridor traced as a closed outline is a room: its wall is not a path, so its points join only across the floor.
      if (prev >= 0 && !room) link(prev, id, Math.hypot(metres(nodes[prev].at, at), depth(nodes[prev].level) - depth(levels[i])));
      prev = id;
    });
  }
  // Points on the same whole level close enough to share a floor, including a way's own shared vertices.
  for (let i = 0; i < nodes.length; i++) {
    if (!Number.isInteger(nodes[i].level)) continue;
    for (let j = i + 1; j < nodes.length; j++) {
      const rise = Math.abs(nodes[j].level - nodes[i].level);
      if (rise > 1 || !Number.isInteger(nodes[j].level)) continue;
      const d = metres(nodes[i].at, nodes[j].at);
      if (d > FLOOR_M) continue;
      link(i, j, rise ? Math.hypot(d, STAIR_LEVEL_M) * FLOOR_COST + UNMAPPED_STAIR_COST : d * FLOOR_COST);
    }
  }
  const start = add({ at: portal, level: 0, platform: false });
  for (let i = 0; i < start; i++) {
    if (nodes[i].level < 0) continue;
    const d = metres(portal, nodes[i].at);
    if (d <= START_M) link(start, i, d);
  }
  // Dijkstra over a few hundred nodes: a linear scan for the next node is plenty.
  const cost = nodes.map(() => Infinity);
  const prev = nodes.map(() => -1);
  const done = nodes.map(() => false);
  cost[start] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < nodes.length; i++) if (!done[i] && cost[i] < Infinity && (u < 0 || cost[i] < cost[u])) u = i;
    if (u < 0) break;
    done[u] = true;
    for (const e of edges[u]) if (cost[u] + e.cost < cost[e.to]) { cost[e.to] = cost[u] + e.cost; prev[e.to] = u; }
  }
  let end = -1, best = Infinity;
  nodes.forEach((n, i) => {
    if (!n.platform || cost[i] === Infinity || n.level >= 0) return;
    const score = cost[i] + TRAIN_COST * metres(n.at, train);
    if (score < best) { best = score; end = i; }
  });
  if (end < 0) return null;
  const path: StairPoint[] = [];
  for (let i = end; i >= 0; i = prev[i]) path.unshift({ at: nodes[i].at, z: depth(nodes[i].level) });
  return dedupe(path);
}

/** Extra points along a line so no two are more than `step` metres apart. */
export function densify(c: LngLatTuple[], step: number): LngLatTuple[] {
  const out: LngLatTuple[] = c.length ? [c[0]] : [];
  for (let i = 1; i < c.length; i++) {
    const n = Math.ceil(metres(c[i - 1], c[i]) / step);
    for (let k = 1; k <= n; k++) out.push([c[i - 1][0] + ((c[i][0] - c[i - 1][0]) * k) / n, c[i - 1][1] + ((c[i][1] - c[i - 1][1]) * k) / n]);
  }
  return out;
}

/** Drop repeated points: joined ways share their end vertices. */
function dedupe(path: StairPoint[]): StairPoint[] {
  return path.filter((p, i) => i === 0 || metres(p.at, path[i - 1].at) > 0.3 || Math.abs(p.z - path[i - 1].z) > 0.3);
}

/**
 * The way down for a trip's station, and the id of the station it was found in:
 * its own id first, then any station whose platform is near the train (a
 * complex's other lines are filed under their own ids).
 */
export function stationStairs(xray: Record<string, StationInside>, id: string, portal: LngLatTuple, train: LngLatTuple): { id: string; path: StairPoint[] } | null {
  const own = xray[id];
  const first = own ? stairPath(own, portal, train) : null;
  if (first) return { id, path: first };
  const near = Object.entries(xray)
    .filter(([k]) => k !== id)
    .map(([k, st]) => ({ k, st, d: Math.min(Infinity, ...st.ways.filter((w) => w.k === "platform").flatMap((w) => w.c.map((c) => metres(c, train)))) }))
    .filter((s) => s.d <= NEAR_TRAIN_M)
    .sort((a, b) => a.d - b.d);
  for (const { k, st } of near) {
    const path = stairPath(st, portal, train);
    if (path) return { id: k, path };
  }
  return null;
}

let insides: Promise<Record<string, StationInside>> | null = null;
/** The x-ray station data, fetched once; an empty set when it cannot be had, so the preview keeps its straight lines. */
export function loadStationInsides(): Promise<Record<string, StationInside>> {
  insides ??= fetch("/transit/xray.json")
    .then((r) => (r.ok ? (r.json() as Promise<Record<string, StationInside>>) : {}))
    .catch(() => {
      insides = null;
      return {};
    });
  return insides;
}

/** Walking pace inside a station, stairs included, in metres per second. */
const STATION_PACE = 0.9;

/**
 * Send each descend and ascend down the station's real steps and corridors
 * (owner, 2026-11-07: "make sure people can actually travel down there using stairs").
 * A descend runs entrance → stairs → platform → the train; an ascend the reverse,
 * up to the exit. A station whose ways do not connect keeps its straight line.
 */
export function withStairs(segs: Segment[], xray: Record<string, StationInside>): Segment[] {
  return segs.map((seg) => {
    if ((seg.kind !== "descend" && seg.kind !== "ascend") || !seg.station) return seg;
    const down = seg.kind === "descend";
    const street = down ? seg.coords[0] : seg.coords[seg.coords.length - 1];
    const train = down ? seg.coords[seg.coords.length - 1] : seg.coords[0];
    const found = stationStairs(xray, seg.station, street, train);
    if (!found) return seg;
    const { path } = found;
    const floor = path[path.length - 1].z;
    const ordered = down ? path : [...path].reverse();
    const coords = down ? [...ordered.map((p) => p.at), train] : [train, ...ordered.map((p) => p.at)];
    const depths = down ? [...ordered.map((p) => p.z), floor] : [floor, ...ordered.map((p) => p.z)];
    const realS = Math.max(30, Math.min(240, cumulative(coords).at(-1)! / STATION_PACE));
    return { ...seg, coords, depths, realS, station: found.id };
  });
}
