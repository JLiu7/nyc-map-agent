import type { NearStation } from "@/lib/map/stationNear";
import type { LngLatTuple, Trip } from "./schema";

/**
 * The immersive trip preview as a pure timeline: walk at street level with
 * turn callouts → descend into the station at the chosen entrance → ride
 * (x-ray when underground, the real viaduct when elevated) with stop callouts
 * and any transfer walk → rise at the recommended exit → walk out.
 */
export type SegmentKind = "walk" | "drive" | "descend" | "ride" | "ascend";
export interface Segment {
  kind: SegmentKind;
  label: string;
  coords: LngLatTuple[];
  /** Real-world seconds this part of the trip takes. */
  realS: number;
  underground: boolean;
  route?: string;
  /** quiet: shown on screen but not spoken (the stops in the middle of a ride). */
  callouts: Array<{ f: number; text: string; quiet?: boolean }>;
  /** The station a descend or ascend goes through (GTFS id, as the x-ray data files it). */
  station?: string;
  /** Metres below the street at each point of `coords`, once the stairs are found (descend, ascend). */
  depths?: number[];
  /** Seconds on the platform: waiting for the train at a descend's end, watching it pull out at an ascend's start. */
  waitS?: number;
  /** The walk through the station's walkable model, when one was found (./stationWalks). */
  inside?: InsideWalk;
}

/** A descend or ascend walked through the station's model at eye level, walls and all, along a guide line. */
export interface InsideWalk {
  station: NearStation;
  /** The way through, in the model's local metres (x east, y north, z the floor), street end first on a descend. */
  guide: Array<[number, number, number]>;
  /** Where the rider stands for the train, local metres. */
  board: [number, number];
  /** The track the train stops on: its point beside `board` and the way the train runs (radians from east). */
  track: { at: [number, number]; angle: number };
  /** The line's colour, for the train's stripe and the boarding spot. */
  color: string;
  /** Getting off: which part of the train stops by the stairs to the exit ("at the front"). */
  trainPart?: string;
}
export interface Pose { center: LngLatTuple; bearing: number; pitch: number; zoom: number }

const R = 6371000;
function dist(a: LngLatTuple, b: LngLatTuple): number {
  const k = Math.PI / 180;
  const x = (b[0] - a[0]) * k * Math.cos(((a[1] + b[1]) / 2) * k);
  const y = (b[1] - a[1]) * k;
  return Math.sqrt(x * x + y * y) * R;
}
export function bearing(a: LngLatTuple, b: LngLatTuple): number {
  const dx = (b[0] - a[0]) * Math.cos((a[1] * Math.PI) / 180);
  return ((Math.atan2(dx, b[1] - a[1]) * 180) / Math.PI + 360) % 360;
}
export function cumulative(coords: LngLatTuple[]): number[] {
  const out = [0];
  for (let i = 1; i < coords.length; i++) out.push(out[i - 1] + dist(coords[i - 1], coords[i]));
  return out;
}
/** Point at fraction f (0..1) of a polyline's length. */
export function along(coords: LngLatTuple[], f: number): LngLatTuple {
  const cum = cumulative(coords);
  const total = cum[cum.length - 1] || 1;
  const d = Math.min(Math.max(f, 0), 1) * total;
  const i = cum.findIndex((c) => c >= d);
  if (i <= 0) return coords[0];
  const t = (d - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
  return [coords[i - 1][0] + t * (coords[i][0] - coords[i - 1][0]), coords[i - 1][1] + t * (coords[i][1] - coords[i - 1][1])];
}
/** Fraction along the line of the vertex nearest p. */
function fractionOf(coords: LngLatTuple[], p: LngLatTuple): number {
  const cum = cumulative(coords);
  const total = cum[cum.length - 1] || 1;
  let best = 0;
  let bestD = Infinity;
  coords.forEach((c, i) => { const d = dist(c, p); if (d < bestD) { bestD = d; best = cum[i]; } });
  // Callouts off a straight-line stub ride project by distance from the start.
  if (coords.length === 2) return Math.min(1, dist(coords[0], p) / total);
  return best / total;
}

/** A callout before the legs are joined: placed by its point on the map, or at a fixed fraction. */
type Mark = { f: number; text: string; quiet?: boolean; at?: LngLatTuple };
type Draft = Omit<Segment, "callouts"> & { callouts: Mark[] };

const nearestVertex = (coords: LngLatTuple[], p: LngLatTuple) =>
  coords.reduce((best, c, i) => (dist(c, p) < dist(coords[best], p) ? i : best), 0);

/**
 * Make each part start where the last one ended, so the marker never jumps (owner report, 2026-10-26:
 * "the guy just teleported from the exit to the middle of the station"). The planner's walks run to and
 * from the station's stop point, not the entrance or exit we picked, and its rides start on the track,
 * not at the station's middle. So a walk into a station stops at the entrance, a walk out starts at the
 * exit, the stairs meet the train where it stops, and any other gap becomes a short straight step.
 */
function joinUp(segs: Draft[]): Draft[] {
  for (let i = 1; i < segs.length; i++) {
    const prev = segs[i - 1], cur = segs[i];
    const end = prev.coords[prev.coords.length - 1];
    if (prev.kind === "walk" && cur.kind === "descend") {
      const portal = cur.coords[0];
      prev.coords = [...prev.coords.slice(0, Math.max(1, nearestVertex(prev.coords, portal))), portal];
    } else if (prev.kind === "ascend" && cur.kind === "walk") {
      cur.coords = [end, ...cur.coords.slice(nearestVertex(cur.coords, end) + 1)];
      if (cur.coords.length < 2) cur.coords.push(end);
    } else if (prev.kind === "descend" && cur.kind === "ride") {
      prev.coords = [prev.coords[0], cur.coords[0]];
    } else if (prev.kind === "ride" && cur.kind === "ascend") {
      cur.coords = [end, cur.coords[cur.coords.length - 1]];
    } else if (dist(end, cur.coords[0]) > 3) {
      cur.coords = [end, ...cur.coords];
    }
  }
  return segs;
}

export function buildTimeline(trip: Trip): Segment[] {
  const segs: Draft[] = [];
  for (const leg of trip.legs) {
    if (leg.kind === "drive") {
      segs.push({ kind: "drive", label: leg.label, coords: leg.coords, realS: leg.durationS, underground: false, callouts: leg.turns.map((t) => ({ f: 0, at: t.at, text: t.text })) });
    } else if (leg.kind === "walk" || leg.kind === "transfer") {
      segs.push({ kind: "walk", label: leg.label, coords: leg.coords, realS: leg.durationS, underground: leg.kind === "transfer", callouts: leg.turns.map((t) => ({ f: 0, at: t.at, text: t.text })) });
    } else if (leg.kind === "enter") {
      const p: LngLatTuple = [leg.portal.lon, leg.portal.lat];
      const s: LngLatTuple = [leg.station.lon, leg.station.lat];
      segs.push({ kind: "descend", label: leg.label, coords: [p, s], realS: 60, underground: true, station: leg.station.id, callouts: [{ f: 0, text: leg.label }] });
    } else if (leg.kind === "ride") {
      segs.push({ kind: "ride", label: leg.label, coords: leg.coords, realS: leg.durationS, underground: leg.underground, route: leg.route, callouts: [{ f: 0, text: leg.label }, ...leg.stops.map((s, i) => ({ f: 0, at: s.at, text: s.text, quiet: !speakStop(i, leg.stops.length) }))] });
    } else {
      const p: LngLatTuple = [leg.portal.lon, leg.portal.lat];
      const s: LngLatTuple = [leg.station.lon, leg.station.lat];
      const outage = leg.portal.outage ? ` ${leg.portal.outage}` : "";
      segs.push({ kind: "ascend", label: leg.label, coords: [s, p], realS: 60, underground: true, station: leg.station.id, callouts: [{ f: 0, text: `${leg.label}.${outage}` }] });
    }
  }
  // Join the parts first, then place each callout on the line it ended up on.
  return joinUp(segs.filter((s) => s.coords.length >= 2)).map((s) => ({
    ...s,
    callouts: s.callouts.map(({ at, ...c }) => (at ? { ...c, f: fractionOf(s.coords, at) } : c)),
  }));
}

/** Share of a leg spent standing on the platform. */
/** The least of a station leg's play time spent on the platform, so a short wait still shows the train come and go. */
const WAIT_SHARE = { descend: 0.3, ascend: 0.2 };

/** The share of a station leg spent on the platform waiting: the train pulling in, or out. */
export const waitShare = (seg: Segment) =>
  seg.waitS ? Math.min(0.9, Math.max(seg.kind === "ascend" ? WAIT_SHARE.ascend : WAIT_SHARE.descend, seg.waitS / (seg.realS || 1))) : 0;

/**
 * How far along its path the rider is at fraction f of a leg: a descend walks
 * then waits at the platform, an ascend waits (the train pulling out) then walks.
 */
export function moveAt(seg: Segment, f: number): number {
  const w = waitShare(seg);
  if (!w) return f;
  return seg.kind === "ascend" ? Math.max(0, (f - w) / (1 - w)) : Math.min(1, f / (1 - w));
}

/** How far through the wait on the platform the rider is at fraction f (0..1), or null while walking. */
export function waitAt(seg: Segment, f: number): number | null {
  const w = waitShare(seg);
  if (!w) return null;
  if (seg.kind === "ascend") return f < w ? f / w : null;
  return f > 1 - w ? (f - (1 - w)) / w : null;
}

/** Metres below the street at fraction f of a descend or ascend; 0 without stairs. */
export function depthAt(seg: Segment, f: number): number {
  const z = seg.depths;
  if (!z || z.length !== seg.coords.length) return 0;
  const cum = cumulative(seg.coords);
  const d = Math.min(Math.max(f, 0), 1) * (cum[cum.length - 1] || 1);
  const i = cum.findIndex((c) => c >= d);
  if (i <= 0) return z[0];
  const t = (d - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
  return z[i - 1] + t * (z[i] - z[i - 1]);
}

/** On foot (walks, stairs in and out) the preview runs this many times faster than a ride (owner, 2026-10-27: walking was "super duper slow"). */
const FOOT_RATE = 4;
/** How far ahead along the walk through a station the eye turns to face, metres. */
const INSIDE_LOOK_M = 1.5;
/** How fast the walk through a station moves on screen at 10x, metres a second. */
const INSIDE_MPS = 2.5;
const onFoot = (seg: Segment) => seg.kind === "walk" || seg.kind === "descend" || seg.kind === "ascend";

/**
 * Wall-clock seconds for one scene of the preview, as a walkthrough someone follows:
 * the parts on foot are held long enough to read and look around, and the ride, where
 * nothing changes, is short (owner, 2026-11-10: the ride sat on one caption for 20 s
 * while the walk through the station went by in 6). At 10x: a street walk 4 to 12 s,
 * real stairs 6 s, a walk through the station with the wait for the train 22 to 60 s by its length, a ride
 * 4 to 10 s. Other speeds scale all of it.
 */
export function wallSeconds(seg: Segment, speed: number): number {
  const pace = 10 / speed;
  const foot = Math.min(12 * pace, Math.max(4 * pace, seg.realS / (speed * FOOT_RATE)));
  // Through a station the walk is paced by its length, about 2.5 m a second on screen plus the wait for
  // the train, never under 22 s: a long way round Fulton St in 22 s went by too fast to follow (owner, 2026-11-10).
  if (seg.inside) return Math.min(60, Math.max(22, (cumulative(seg.coords).at(-1) ?? 0) / INSIDE_MPS + 6)) * pace;
  if (seg.depths) return 6 * pace;
  if (onFoot(seg)) return foot;
  return Math.min(10 * pace, Math.max(4 * pace, seg.realS / speed));
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export function poseAt(seg: Segment, f: number): Pose {
  const center = along(seg.coords, f);
  // Inside a station the eye looks a short way ahead, not a fiftieth of the whole walk: on a 200 m walk that
  // was 4 m, so on a stair the view swung to its side wall well before the top (Fulton St, 2026-11-11).
  const len = seg.inside ? cumulative(seg.coords).at(-1) ?? 0 : 0;
  const ahead = along(seg.coords, Math.min(1, f + (len > 0 ? Math.min(0.02, INSIDE_LOOK_M / len) : 0.02)));
  const b = dist(center, ahead) > 0.5 ? bearing(center, ahead) : bearing(seg.coords[0], seg.coords[seg.coords.length - 1]);
  switch (seg.kind) {
    case "walk": return { center, bearing: b, pitch: 75, zoom: 18.5 };
    // Car eye height (~1.2 m): MapLibre has no altitude, so max pitch + a high zoom.
    case "drive": return { center, bearing: b, pitch: 80, zoom: 19 };
    case "descend": return { center, bearing: b, pitch: lerp(75, 55, f), zoom: lerp(18.5, 16.8, f) };
    case "ascend": return { center, bearing: b, pitch: lerp(55, 75, f), zoom: lerp(16.8, 18.5, f) };
    case "ride": return { center, bearing: b, pitch: seg.underground ? 55 : 65, zoom: seg.underground ? 15.8 : 16.4 };
  }
}

/**
 * On a ride, only the last two stops are spoken (your stop is next, then your
 * stop); the ones in between still show on screen. Narrating every stop was
 * noise once you are on the train (owner, 2026-10-24).
 */
export function speakStop(i: number, count: number): boolean {
  return i >= count - 2;
}

/** The latest callout reached at fraction f. */
export function calloutAt(seg: Segment, f: number): string {
  return calloutInfoAt(seg, f).text;
}

/** The latest callout reached at fraction f, and whether it should be spoken. */
export function calloutInfoAt(seg: Segment, f: number): { text: string; quiet: boolean } {
  let out = { text: seg.label, quiet: false };
  for (const c of seg.callouts) if (c.f <= f + 1e-6) out = { text: c.text, quiet: Boolean(c.quiet) };
  return out;
}
