import { noteTrainPart } from "@/lib/underground/lostHelper";
import { stationAt } from "@/lib/map/stationNear";
import { nearestOnLine, routeThrough, type RoutePoint } from "@/lib/map/stationRoute";
import { floorsAt, toLngLat, toLocal, walkIn, walls, type StationModel } from "@/lib/map/stationWalk";
import { lineColor } from "@/lib/transit/bullets";
import { bearing, cumulative, waitShare, type InsideWalk, type Segment } from "./flythrough";
import type { LngLatTuple } from "./schema";
import { loadStationInsides, withStairs } from "./stationStairs";

/**
 * The trip preview's way through each station, at eye level with the walls
 * up (owner, 2026-11-08: "I need to see the walls while the simulator shows
 * where and how I get in and out", and a line to the train, with no x-ray inside).
 * Each descend and ascend is routed through the station's walkable model
 * (src/lib/map/stationWalk.ts), the same one street view walks: from the
 * entrance, down its stairs and passages to the spot on the platform where the
 * train stops, then a wait for the train. Stations with no model, or no way
 * through it, keep the x-ray stairs (./stationStairs).
 */

/** Walking pace inside a station, stairs included, in metres per second. */
const STATION_PACE = 0.9;
/** Seconds on the platform: the train pulling in on the way down, pulling out on the way up. */
const WAIT_DOWN_S = 30;
const WAIT_UP_S = 12;
/** A platform edge this close to where the way ends is the one the train stops at. */
const EDGE_M = 12;
/** From a platform's edge to the middle of its track, and how far back from the edge the rider waits. */
const EDGE_TO_TRACK_M = 1.7;
const STAND_BACK_M = 2.5;
/** Shorter edges are a platform's ends or corners, not the side a train stops along. */
const EDGE_LONG_M = 12;
/** The ride's heading is measured over this much of it. */
const HEADING_M = 40;

/** Heading of a ride leaving `coords[0]` (or arriving at the end when `end`), as radians from east. */
function travelAngle(coords: LngLatTuple[], end: boolean): number {
  const line = end ? [...coords].reverse() : coords;
  const cum = cumulative(line);
  const i = cum.findIndex((d) => d >= HEADING_M);
  const b = bearing(line[0], line[i < 1 ? line.length - 1 : i]);
  // A bearing (clockwise from north) the other way along an arriving ride.
  const deg = end ? (b + 180) % 360 : b;
  return ((90 - deg) * Math.PI) / 180;
}

/**
 * Where the train stops and the rider waits: beside the platform edge nearest
 * the end of the way, the train's middle a track's width out from the edge,
 * the rider a step back from it. The mapped tracks are often metres off the
 * mapped platforms, so the edge decides. Null on a platform with no edge.
 */
function platformEdge(m: StationModel, end: RoutePoint, travel: number): { track: InsideWalk["track"]; stand: [number, number] } | null {
  let best: { at: [number, number]; angle: number; d: number } | null = null;
  for (const w of walls(m)) {
    // A platform's long side, running the way the train does: not the short edge across its end.
    if (!w.edge || Math.abs(w.z1 - end[2]) > 0.5 || Math.hypot(w.x2 - w.x1, w.y2 - w.y1) < EDGE_LONG_M) continue;
    if (Math.abs(Math.cos(Math.atan2(w.y2 - w.y1, w.x2 - w.x1) - travel)) < 0.7) continue;
    const near = nearestOnLine([[w.x1, w.y1], [w.x2, w.y2]], [end[0], end[1]]);
    if (near && near.d <= EDGE_M && (!best || near.d < best.d)) best = near;
  }
  if (!best) return null;
  // The track is on the side of the edge with no platform floor.
  let [nx, ny] = [-Math.sin(best.angle), Math.cos(best.angle)];
  if (floorsAt(m, best.at[0] + nx, best.at[1] + ny).some((h) => Math.abs(h - end[2]) < 0.75)) [nx, ny] = [-nx, -ny];
  const angle = Math.cos(best.angle - travel) >= 0 ? best.angle : best.angle + Math.PI;
  return {
    track: { at: [best.at[0] + nx * EDGE_TO_TRACK_M, best.at[1] + ny * EDGE_TO_TRACK_M], angle },
    stand: [best.at[0] - nx * STAND_BACK_M, best.at[1] - ny * STAND_BACK_M],
  };
}

/** Further than this to the side of the train's track, the way has left the platform the train stops at. */
const PLATFORM_SIDE_M = 12;

/**
 * Index of the foot of the stairs to the exit: walking back from the platform end of the way, the
 * last point still on this platform. A hall or another platform at the same height (Fulton St's
 * hall sits level with the 4/5) is not this platform, so the walk back stops where the way moves
 * away from the train's track as well as where it climbs.
 */
export function platformFoot(route: RoutePoint[], track: InsideWalk["track"]): number {
  const end = route[route.length - 1];
  const [ux, uy] = [Math.cos(track.angle), Math.sin(track.angle)];
  const on = (p: RoutePoint) => Math.abs(p[2] - end[2]) < 0.3 && Math.abs((p[0] - track.at[0]) * -uy + (p[1] - track.at[1]) * ux) <= PLATFORM_SIDE_M;
  let foot = route.length - 1;
  while (foot > 0 && on(route[foot - 1])) foot--;
  return foot;
}

const metres = (p: RoutePoint[]) => p.slice(1).reduce((s, q, i) => s + Math.hypot(q[0] - p[i][0], q[1] - p[i][1], q[2] - p[i][2]), 0);

async function walkThrough(seg: Segment, ride: Segment | undefined): Promise<Segment | null> {
  const down = seg.kind === "descend";
  const street = down ? seg.coords[0] : seg.coords[seg.coords.length - 1];
  const train = down ? seg.coords[seg.coords.length - 1] : seg.coords[0];
  const station = (await stationAt(...train)) ?? (await stationAt(...street));
  if (!station) return null;
  const m = station.model;
  const whole = routeThrough(m, toLocal(m, ...street), toLocal(m, ...train));
  if (!whole) return null;
  // Where the way first reaches the platform: the foot of the stairs to the exit. The rider still steps
  // off at the station's stop point, the middle of the train, since the app cannot know their car; the
  // stairs are then described from there (owner, 2026-11-10).
  const route = whole;
  // The train runs the way the ride goes, and stops beside the platform's edge.
  const travel = ride ? travelAngle(ride.coords, !down) : 0;
  const end = route[route.length - 1];
  const edge = platformEdge(m, end, travel);
  if (edge) {
    // Walk the last steps to the waiting spot when nothing is in the way.
    const to = walkIn(m, { x: end[0], y: end[1], z: end[2], inside: true }, edge.stand[0] - end[0], edge.stand[1] - end[1]);
    if (Math.hypot(to.x - edge.stand[0], to.y - edge.stand[1]) < 0.3 && Math.abs(to.z - end[2]) < 0.3) route.push([edge.stand[0], edge.stand[1], end[2]]);
  }
  const board: [number, number] = [route[route.length - 1][0], route[route.length - 1][1]];
  const track = edge?.track ?? { at: toLocal(m, ...train), angle: travel };
  const guide = down ? route : [...route].reverse();
  const walkS = Math.max(30, Math.min(240, metres(route) / STATION_PACE));
  const waitS = down ? WAIT_DOWN_S : WAIT_UP_S;
  const part = down ? null : trainPartAt(m, route[platformFoot(route, track)], track.angle);
  // The where-am-I helper says it too, if the rider gets lost after stepping off (#131).
  if (part && seg.station) noteTrainPart(seg.station, part);
  const inside: InsideWalk = { station, guide, board, track, color: lineColor(ride?.route ?? ""), ...(part ? { trainPart: part } : {}) };
  const w = waitShare({ ...seg, realS: walkS + waitS, waitS });
  const name = ride?.route ? `the ${ride.route} train` : "the train";
  const callouts = down
    ? [...seg.callouts, { f: 1 - w, text: `Wait here for ${name}` }, { f: 1 - w * 0.2, text: `Board ${name}` }]
    : [{ f: 0, text: part ? `Step off ${name}. You are in the middle of the train. The stairs to your exit are ${fromMiddle(part)}` : `Step off ${name}` }, ...seg.callouts.map((c) => ({ ...c, f: Math.max(c.f, w) }))];
  return {
    ...seg,
    coords: guide.map((p) => toLngLat(m, p[0], p[1])),
    depths: guide.map((p) => p[2]),
    realS: walkS + waitS,
    waitS,
    inside,
    callouts,
  };
}

/** A platform edge further than this to the side of the stairs belongs to another platform. */
const SAME_PLATFORM_M = 16;

/**
 * Which part of the train stops by a point on the platform, in words, or null when the platform's
 * length cannot be read. A train fills nearly the whole platform, so how far along it the stairs to
 * the exit are is how far along the train to ride (owner, 2026-11-10: "wish we knew which car we came
 * out of ... where the stairs are relative to the train itself"). `travel` is the way the train runs.
 */
export function trainPartAt(m: StationModel, at: RoutePoint, travel: number): string | null {
  const [ux, uy] = [Math.cos(travel), Math.sin(travel)];
  let [lo, hi] = [Infinity, -Infinity];
  for (const w of walls(m)) {
    if (!w.edge || Math.abs(w.z1 - at[2]) > 0.5) continue;
    if (Math.abs(Math.cos(Math.atan2(w.y2 - w.y1, w.x2 - w.x1) - travel)) < 0.7) continue;
    const near = nearestOnLine([[w.x1, w.y1], [w.x2, w.y2]], [at[0], at[1]]);
    // Only this platform's edges: the ones the stairs' own spot lies alongside, give or take the stairs' landing.
    const [ta, tb] = [w.x1 * ux + w.y1 * uy, w.x2 * ux + w.y2 * uy];
    const side = Math.abs((at[0] - w.x1) * -uy + (at[1] - w.y1) * ux);
    if (!near || side > SAME_PLATFORM_M) continue;
    lo = Math.min(lo, ta, tb);
    hi = Math.max(hi, ta, tb);
  }
  if (hi - lo < 60) return null;
  return trainPart((at[0] * ux + at[1] * uy - lo) / (hi - lo));
}

/** Where a part of the train is for someone standing at its middle. */
export function fromMiddle(part: string): string {
  // Said by the train's ends, not "ahead" or "behind": stepping off, the rider may face either way.
  if (part === "in the middle") return "right by you";
  if (part === "at the front" || part === "at the back") return `${part} of the train`;
  return /front/.test(part) ? "a little toward the front of the train" : "a little toward the back of the train";
}

/** A share of the way along the train, 0 its back and 1 its front, in five plain parts. */
export function trainPart(f: number): string {
  if (f >= 0.8) return "at the front";
  if (f >= 0.6) return "between the middle and the front";
  if (f > 0.4) return "in the middle";
  if (f > 0.2) return "between the middle and the back";
  return "at the back";
}

/** Route the trip's station legs through the walkable stations, falling back to the x-ray stairs. */
export async function withStationWalks(segs: Segment[]): Promise<Segment[]> {
  const walked = await Promise.all(
    segs.map((seg, i) => {
      if ((seg.kind !== "descend" && seg.kind !== "ascend") || !seg.station || seg.elevator) return Promise.resolve(null);
      const ride = segs[seg.kind === "descend" ? i + 1 : i - 1];
      return walkThrough(seg, ride?.kind === "ride" ? ride : undefined).catch(() => null);
    }),
  );
  const rest = walked.some((w, i) => !w && segs[i].station) ? withStairs(segs, await loadStationInsides()) : segs;
  const out = rest.map((seg, i) => walked[i] ?? seg);
  // The part of the train that stops by the exit's stairs is said before it matters: boarding, and at the start of the ride.
  out.forEach((seg, i) => {
    const part = seg.kind === "ascend" ? seg.inside?.trainPart : undefined;
    const ride = out[i - 1];
    if (!part || ride?.kind !== "ride") return;
    out[i - 1] = { ...ride, callouts: [ride.callouts[0], { f: 0.04, text: `The stairs to your exit are ${part} of the train. Ride there to step off beside them` }, ...ride.callouts.slice(1)].filter(Boolean) };
    const board = out[i - 2];
    if (board?.kind === "descend") out[i - 2] = { ...board, callouts: board.callouts.map((c) => (/^Board /.test(c.text) ? { ...c, text: `${c.text}. For your exit, ride ${part}` } : c)) };
  });
  return out;
}
