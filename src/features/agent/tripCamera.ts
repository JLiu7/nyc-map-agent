import { EYE_HEIGHT_M } from "@/lib/map/walk";
import type { LngLatTuple } from "./schema";
import type { Segment } from "./flythrough";

/**
 * The trip preview's street camera: on foot the preview looks through the
 * rider's eyes, 1.7 m up like street view (src/lib/map/walk.ts), from the start
 * until the train and again from getting off (owner, 2026-11-07). Pure, so it is
 * tested without a map.
 */

/**
 * The street the eye looks at, metres ahead. 1.7 m up, 19 m ahead is an 85°
 * tilt, the map's own ceiling outside street view, so the camera is never clamped.
 */
export const LOOK_AHEAD_M = 19;
/**
 * MapLibre keeps the camera above the ground (6.15 raises any camera below
 * sea level), so the eye cannot follow the rider down. Over the first
 * SINK_M of the stairs it sinks to EYE_FLOOR_M while the station shows in x-ray below...
 */
const SINK_M = 1.5;
const EYE_FLOOR_M = 0.4;
/** ...then over the next DIVE_M it rises behind and above the rider, looking down through the ground. */
const DIVE_M = 3;
const CHASE_BACK_M = 24;
const CHASE_UP_M = 14;
/** Seconds the camera takes to ease between the map and the eye. */
export const EYE_BLEND_S = 0.9;

/** Walks on the street and stairs with a path through the station take the eye; rides and transfers do not. */
export function usesEye(seg: Segment): boolean {
  if (seg.kind === "walk") return !seg.underground;
  return (seg.kind === "descend" || seg.kind === "ascend") && Boolean(seg.depths);
}

type EyeRig = { eye: LngLatTuple; eyeAlt: number; look: LngLatTuple; lookAlt: number };

const smooth = (t: number) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

function offset(at: LngLatTuple, east: number, north: number): LngLatTuple {
  return [at[0] + east / (111_320 * Math.cos((at[1] * Math.PI) / 180)), at[1] + north / 111_320];
}

/**
 * Eye and aim for a rider at `at` facing `bearing`, `depth` metres below the
 * street (0 on the street, negative on the stairs). On the street it is a
 * pedestrian's eye; going down it sinks, then rises behind the rider and looks
 * down at them through the dimmed ground. The aim is moved up its ray to the
 * ground, where the map centre has to sit.
 *
 * Without `dive` (a station walked at eye level, drawn over the map below the
 * street) the eye only sinks to the ground, and above the street it climbs
 * with the rider to an elevated platform.
 */
export function eyeRig(at: LngLatTuple, bearing: number, depth = 0, dive = true): EyeRig {
  const r = (bearing * Math.PI) / 180, fx = Math.sin(r), fy = Math.cos(r);
  const z = Math.min(0, depth);
  const up = dive ? 0 : Math.max(0, depth);
  const s = dive ? smooth((-z - SINK_M) / DIVE_M) : 0;
  const lerp = (a: number, b: number) => a + (b - a) * s;
  const ahead = offset(at, fx * LOOK_AHEAD_M, fy * LOOK_AHEAD_M);
  const behind = offset(at, -fx * CHASE_BACK_M, -fy * CHASE_BACK_M);
  const eye: LngLatTuple = [lerp(at[0], behind[0]), lerp(at[1], behind[1])];
  const eyeAlt = lerp(Math.max(EYE_FLOOR_M, EYE_HEIGHT_M + z), CHASE_UP_M) + up;
  let look: LngLatTuple = [lerp(ahead[0], at[0]), lerp(ahead[1], at[1])];
  let lookAlt = z + up;
  if (lookAlt < 0) {
    const t = eyeAlt / (eyeAlt - lookAlt);
    look = [eye[0] + (look[0] - eye[0]) * t, eye[1] + (look[1] - eye[1]) * t];
    lookAlt = 0;
  }
  return { eye, eyeAlt, look, lookAlt };
}

/** A camera pose as MapLibre's jumpTo takes it. */
export type Cam = { center: LngLatTuple; zoom: number; pitch: number; bearing: number; elevation: number };

/** Ease from one pose to another; `t` runs 0..1 and is smoothed at both ends. Bearing turns the short way. */
export function blendCam(a: Cam, b: Cam, t: number): Cam {
  const k = smooth(t);
  const lerp = (x: number, y: number) => x + (y - x) * k;
  const turn = ((b.bearing - a.bearing + 540) % 360) - 180;
  return {
    center: [lerp(a.center[0], b.center[0]), lerp(a.center[1], b.center[1])],
    zoom: lerp(a.zoom, b.zoom),
    pitch: lerp(a.pitch, b.pitch),
    bearing: (((a.bearing + turn * k) % 360) + 360) % 360,
    elevation: lerp(a.elevation, b.elevation),
  };
}
