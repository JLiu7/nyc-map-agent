/**
 * Browser plumbing for the underground helper: the offline service worker
 * (public/sw.js), street names and landmarks read from the loaded map while
 * online, and the compass (used only for the optional platform calibration and
 * as a last resort that must agree with a trusted heading).
 */
import type { Map as MapLibreMap } from "maplibre-gl";
import { type Pt } from "./exits";
import { packTileUrls } from "./tiles";

// Reading streets and places off the loaded map is shared with the trip preview.
export { meetPoint, readMap } from "@/lib/map/mapRead";

// Registered for every visit now (#132); kept here too for the helper's own call.
export { registerOfflineWorker } from "@/lib/offline/worker";

/**
 * A real request, because navigator.onLine is often wrong underground and on
 * captive Wi-Fi. The service worker never answers /api/*, so this hits the network.
 */
export async function probe<T = unknown>(url = "/api/transit/alerts", ms = 6000): Promise<{ ok: boolean; body: T | null }> {
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(ms) });
    return { ok: res.ok, body: res.ok ? ((await res.json()) as T) : null };
  } catch {
    return { ok: false, body: null };
  }
}

/** Cache name shared with public/sw.js, which falls back to it for basemap requests that fail. */
export const TILE_CACHE = "nyc-map-tiles-v1";

/**
 * Save the basemap pieces an offline map of this station needs: the vector
 * tiles around the station and its exits, plus the style, tile index, fonts
 * and icons the page already loaded from the basemap host. Returns the bytes
 * stored for this station's tiles (to report the pack size), or null when it
 * could not (no Cache API, map not ready, offline).
 */
export async function cacheStationTiles(map: MapLibreMap | null, points: Pt[]): Promise<{ bytes: number; tiles: number } | null> {
  if (!map || typeof caches === "undefined") return null;
  const src = map.getSource("openmaptiles") as unknown as { tiles?: string[]; maxzoom?: number; url?: string } | undefined;
  if (!src?.tiles?.length) return null;
  const urls = packTileUrls(src.tiles, points, src.maxzoom ?? 14);
  const host = new URL(src.tiles[0]).origin;
  const support = new Set<string>();
  for (const e of performance.getEntriesByType("resource")) {
    if (e.name.startsWith(host) && !/\/\d+\/\d+\/\d+\.pbf/.test(e.name)) support.add(e.name);
  }
  try {
    const cache = await caches.open(TILE_CACHE);
    let bytes = 0;
    for (const u of urls) {
      const hit = (await cache.match(u)) ?? (await fetch(u, { mode: "cors" }).then(async (r) => (r.ok ? (await cache.put(u, r.clone()), r) : null)));
      if (hit) bytes += (await hit.clone().blob()).size;
    }
    await Promise.all([...support].map(async (u) => ((await cache.match(u)) ? undefined : cache.add(u).catch(() => undefined))));
    return { bytes, tiles: urls.length };
  } catch {
    return null;
  }
}

type MotionEventCtor = { requestPermission?: () => Promise<"granted" | "denied"> };

/**
 * Motion magnitude (m/s², gravity removed) for the stop detector. Asks
 * permission where required (iOS), so call it from a tap. Null when there is
 * no sensor or permission was refused. Browsers stop these events when the
 * screen locks or the tab is hidden. Samples are never stored or sent.
 */
export async function watchMotion(onSample: (t: number, mag: number) => void): Promise<(() => void) | null> {
  if (typeof window === "undefined" || !("DeviceMotionEvent" in window)) return null;
  const Ctor = window.DeviceMotionEvent as unknown as MotionEventCtor;
  try {
    if (typeof Ctor.requestPermission === "function" && (await Ctor.requestPermission()) !== "granted") return null;
  } catch {
    return null;
  }
  const handler = (e: DeviceMotionEvent) => {
    const a = e.acceleration;
    const g = e.accelerationIncludingGravity;
    const mag = a && a.x !== null ? Math.hypot(a.x ?? 0, a.y ?? 0, a.z ?? 0) : g && g.x !== null ? Math.abs(Math.hypot(g.x ?? 0, g.y ?? 0, g.z ?? 0) - 9.81) : null;
    if (mag !== null && Number.isFinite(mag)) onSample(performance.now() / 1000, mag);
  };
  window.addEventListener("devicemotion", handler);
  return () => window.removeEventListener("devicemotion", handler);
}

type OrientationEventCtor = { requestPermission?: () => Promise<"granted" | "denied"> };

/**
 * Listen for the raw compass heading (0 = north). Asks permission where the
 * browser requires it (iOS), so call it from a tap. Resolves to null when
 * there is no compass or permission was refused, else a stop function.
 */
export async function watchCompass(onHeading: (deg: number | null) => void): Promise<(() => void) | null> {
  if (typeof window === "undefined" || !("DeviceOrientationEvent" in window)) return null;
  const Ctor = window.DeviceOrientationEvent as unknown as OrientationEventCtor;
  try {
    if (typeof Ctor.requestPermission === "function" && (await Ctor.requestPermission()) !== "granted") return null;
  } catch {
    return null;
  }
  const handler = (e: DeviceOrientationEvent) => {
    const ios = (e as DeviceOrientationEvent & { webkitCompassHeading?: number }).webkitCompassHeading;
    const deg = typeof ios === "number" ? ios : e.absolute && typeof e.alpha === "number" ? 360 - e.alpha : null;
    onHeading(deg !== null && Number.isFinite(deg) ? ((deg % 360) + 360) % 360 : null);
  };
  const type = "ondeviceorientationabsolute" in window ? "deviceorientationabsolute" : "deviceorientation";
  window.addEventListener(type, handler as EventListener);
  return () => window.removeEventListener(type, handler as EventListener);
}
