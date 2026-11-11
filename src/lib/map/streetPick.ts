/**
 * Tap targets for 3D street furniture (restroom kiosks, bus stop signs) and
 * subway entrances, registered by the
 * three.js layer and hit-tested here in screen space without three.js, so the
 * click handlers can stay in the main chunk and in the feature modules.
 */
import type { Map as MapLibreMap } from "maplibre-gl";
import { cameraTransform } from "./cameraTransform";
import { cameraRay } from "./eyePick";

export interface PickTarget {
  kind: "restroom" | "place" | "busstop" | "entrance";
  id: string;
  lng: number;
  lat: number;
  /** Height of the model, metres. */
  h: number;
  props: Record<string, unknown>;
}

/**
 * Where the viewer stands: the camera's ground point. At eye level the map
 * centre sits far down the look ray, so anything "near the centre" is
 * hundreds of metres ahead; overhead the two coincide.
 */
export function eyeOrCenter(map: MapLibreMap): { lng: number; lat: number } {
  try {
    const p = cameraTransform(map)?.getCameraLngLat();
    if (p && Number.isFinite(p.lng) && Number.isFinite(p.lat)) return { lng: p.lng, lat: p.lat };
  } catch {
    /* fall through */
  }
  const c = map.getCenter();
  return { lng: c.lng, lat: c.lat };
}
/** One list per owner: the furniture layer and the transit layer each replace only their own. */
const groups = new Map<string, PickTarget[]>();
let targets: PickTarget[] = [];

export function setPickTargets(t: PickTarget[], group = "furniture"): void {
  groups.set(group, t);
  targets = [...groups.values()].flat();
}

/** Half the width of a pole or kiosk as a tap target, metres; never under 18 px on screen. */
const RADIUS_M = 0.5;

/**
 * The model under a screen point: the nearest one whose upright body (ground
 * to `h` metres) the tap's ray passes within half a metre of, in front of the
 * camera. Small or distant models keep an 18 px margin.
 *
 * This used to compare screen positions from `map.project`, which mirrors a
 * point behind the camera to far below the screen. A bus stop pole 178 m
 * behind the walker then counted as the nearest thing, as wide and tall as the
 * whole phone screen, so every tap on a shop or a wall opened that bus stop
 * (owner, 2026-11-10).
 */
export function pickAt(map: MapLibreMap, x: number, y: number): PickTarget | null {
  if (!targets.length) return null;
  const ray = cameraRay(map, x, y);
  if (!ray) return null;
  const kx = 111_320 * Math.cos((ray.lat * Math.PI) / 180), ky = 111_320;
  const [dx, dy, dz] = ray.dir;
  const flat = dx * dx + dy * dy;
  let best: PickTarget | null = null;
  let bestT = Infinity;
  for (const t of targets) {
    const e = (t.lng - ray.lng) * kx, n = (t.lat - ray.lat) * ky;
    // Where the ray passes closest to the model's upright axis; from straight overhead, where it meets the ground.
    const at = flat > 1e-4 ? (e * dx + n * dy) / flat : dz < 0 ? ray.alt / -dz : -1;
    if (!(at > 0) || at >= bestT) continue; // behind the camera, or farther than one already found
    const z = ray.alt + dz * at;
    const off = Math.hypot(e - dx * at, n - dy * at, z - Math.min(Math.max(z, 0), t.h));
    if (off > Math.max(RADIUS_M, (18 * at) / ray.f)) continue;
    best = t;
    bestT = at;
  }
  return best;
}

/** Shop and café restrooms get 3D kiosks with the "Include shops & cafés" chip; public restrooms always do. */
export const kioskSources = { places: false };

/** Street-level bus-stop poles. The Layers switch writes this; the furniture layer reads it. */
let busStopsOn = true;
const busStopListeners = new Set<() => void>();

export function busStopsShown(): boolean {
  return busStopsOn;
}

export function setBusStopsShown(on: boolean): void {
  if (busStopsOn === on) return;
  busStopsOn = on;
  for (const listener of busStopListeners) listener();
}

export function subscribeBusStops(listener: () => void): () => void {
  busStopListeners.add(listener);
  return () => busStopListeners.delete(listener);
}
