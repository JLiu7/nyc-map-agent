/**
 * Eye-level picking. At street-view pitch, queryRenderedFeatures on
 * fill-extrusions is unreliable and the click's lngLat is the ground far behind
 * the facade (or nothing, above the horizon). Instead cast the camera ray
 * through the clicked pixel and march it over the loaded building footprints
 * (city3d `buildings`: `h` height, `base` min height), the hero landmark
 * models (cylinders) and ground-floor storefronts. Plain math, no three.js.
 */
import type { Map as MapLibreMap } from "maplibre-gl";
import { LANDMARKS, type Landmark } from "./landmarks";

/** `t` is how far along the ray the hit is, in metres from the camera. */
export type EyeHit =
  | { kind: "landmark"; lng: number; lat: number; t: number; landmark: Landmark }
  | { kind: "building"; lng: number; lat: number; t: number; z: number; props: Record<string, unknown> }
  | { kind: "ground"; lng: number; lat: number; t: number };

/** Rough model heights (m) for the landmark cylinders. */
const LANDMARK_H: Record<string, number> = { "empire-state": 443, chrysler: 319, "one-wtc": 541, liberty: 93 };
const STEP_M = 1.5;
const MAX_M = 700;

type Ring = { minX: number; minY: number; maxX: number; maxY: number; pts: Array<[number, number]>; h: number; base: number; props: Record<string, unknown> };

function inside(pts: Array<[number, number]>, x: number, y: number): boolean {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/**
 * The ray through screen pixel (x, y), as an origin (camera) and a unit direction, in local metres (east, north, up).
 * The view's centre is not the canvas centre when the map has padding: a phone pads the bottom for the
 * chat bar and walk controls (179 px at 375 x 812), which lifts the centre by half of it. Ignoring that
 * aimed every street-level tap about 90 px low, so a tap on a shop sign read as the wall above it.
 */
export function cameraRay(map: MapLibreMap, x: number, y: number) {
  const { clientWidth: W, clientHeight: H } = map.getCanvas();
  if (!W || !H) return null;
  const fov = (map.getVerticalFieldOfView() * Math.PI) / 180;
  const f = H / 2 / Math.tan(fov / 2); // camera-to-centre distance, in pixels
  const p = (map.getPitch() * Math.PI) / 180, th = (map.getBearing() * Math.PI) / 180;
  const hx = Math.sin(th), hy = Math.cos(th);
  // Camera position: f pixels back from the centre along the view axis (512 px tiles).
  const c = map.getCenter();
  const mpp = (40_075_016.686 * Math.cos((c.lat * Math.PI) / 180)) / (512 * 2 ** map.getZoom());
  const dist = f * mpp, back = dist * Math.sin(p);
  const ll = { lng: c.lng - (hx * back) / (111_320 * Math.cos((c.lat * Math.PI) / 180)), lat: c.lat - (hy * back) / 111_320 };
  const alt = (map.getCenterElevation?.() ?? 0) + dist * Math.cos(p);
  const F = [hx * Math.sin(p), hy * Math.sin(p), -Math.cos(p)];
  const U = [hx * Math.cos(p), hy * Math.cos(p), Math.sin(p)];
  const R = [Math.cos(th), -Math.sin(th), 0];
  const pad = map.getPadding?.() ?? {};
  const cx = W / 2 + ((pad.left ?? 0) - (pad.right ?? 0)) / 2, cy = H / 2 + ((pad.top ?? 0) - (pad.bottom ?? 0)) / 2;
  const a = (x - cx) / f, b = (cy - y) / f;
  const d = [0, 1, 2].map((i) => F[i] + a * R[i] + b * U[i]);
  const n = Math.hypot(d[0], d[1], d[2]);
  return { lng: ll.lng, lat: ll.lat, alt, f, dir: [d[0] / n, d[1] / n, d[2] / n] as [number, number, number] };
}

/** First thing the ray through (x, y) hits: a landmark, a building wall/roof, or the ground. */
export function eyePick(map: MapLibreMap, x: number, y: number): EyeHit | null {
  const ray = cameraRay(map, x, y);
  if (!ray) return null;
  const kx = 111_320 * Math.cos((ray.lat * Math.PI) / 180), ky = 111_320;
  const toLL = (e: number, n: number) => ({ lng: ray.lng + e / kx, lat: ray.lat + n / ky });
  const [dx, dy, dz] = ray.dir;
  const horiz = Math.hypot(dx, dy) || 1e-6;
  // Ground hit (if the ray goes down) bounds the march.
  const tGround = dz < 0 ? ray.alt / -dz : Infinity;
  const tMax = Math.min(tGround, MAX_M / horiz);
  // Footprints near the ray, in local metres from the camera.
  const rings: Ring[] = [];
  const ex = dx * tMax, ny = dy * tMax;
  const box = { minX: Math.min(0, ex) - 30, maxX: Math.max(0, ex) + 30, minY: Math.min(0, ny) - 30, maxY: Math.max(0, ny) + 30 };
  if (map.getSource("city3d")) {
    for (const ft of map.querySourceFeatures("city3d", { sourceLayer: "buildings" })) {
      const g = ft.geometry;
      const polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
      const props = (ft.properties ?? {}) as Record<string, unknown>;
      const h = Number(props.h ?? 0), base = Number(props.base ?? 0);
      if (!(h > 0) || props.hero === 1) continue; // hero footprints are drawn as landmark models
      for (const poly of polys) {
        const pts = poly[0].map(([lon, lat]) => [(lon - ray.lng) * kx, (lat - ray.lat) * ky] as [number, number]);
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const [px, py] of pts) { minX = Math.min(minX, px); maxX = Math.max(maxX, px); minY = Math.min(minY, py); maxY = Math.max(maxY, py); }
        if (maxX < box.minX || minX > box.maxX || maxY < box.minY || minY > box.maxY) continue;
        rings.push({ minX, minY, maxX, maxY, pts, h, base, props });
      }
    }
  }
  const marks = LANDMARKS.map((l) => ({ l, e: (l.lon - ray.lng) * kx, n: (l.lat - ray.lat) * ky, h: LANDMARK_H[l.id] ?? 100 }));
  const step = STEP_M / horiz;
  for (let t = step; t <= tMax; t += step) {
    const e = dx * t, n = dy * t, z = ray.alt + dz * t;
    for (const m of marks) if (z <= m.h && Math.hypot(e - m.e, n - m.n) <= m.l.radiusM) return { kind: "landmark", ...toLL(e, n), t, landmark: m.l };
    for (const r of rings) {
      const within = (at: number) => { const z1 = ray.alt + dz * at; return z1 <= r.h && z1 >= r.base && inside(r.pts, dx * at, dy * at); };
      if (e < r.minX || e > r.maxX || n < r.minY || n > r.maxY || !within(t)) continue;
      // The march steps 1.5 m: halve back to where the ray enters the wall, so the hit is on the facade, not inside it.
      let lo = t - step, hi = t;
      for (let i = 0; i < 8; i++) { const mid = (lo + hi) / 2; if (within(mid)) hi = mid; else lo = mid; }
      return { kind: "building", ...toLL(dx * hi, dy * hi), t: hi, z: ray.alt + dz * hi, props: r.props };
    }
  }
  return Number.isFinite(tGround) && tGround * horiz <= MAX_M ? { kind: "ground", ...toLL(dx * tGround, dy * tGround), t: tGround } : null;
}

// Dev-only handle for headless QA.
if (import.meta.env.DEV && typeof window !== "undefined") Object.assign(window, { __eyePick: eyePick, __cameraRay: cameraRay });
