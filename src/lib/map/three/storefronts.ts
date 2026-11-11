/** Storefront signboards and facades at street level. */
import * as THREE from "three";
import { atlasCell, facadeCategory } from "../storefrontCategory";
import { cameraRay } from "../eyePick";
import { BASE_M, BOARD, boardOffset, FACADE_H, facadeWidth, FLOOR_M, MAIN_PLATE_H, pickSign, PLATE_H, plateWidth, type StorefrontSign, WALL_GAP_M } from "../storefrontPick";
import type { CustomLayerInterface } from "maplibre-gl";
import { MercatorCoordinate, type MapLibreMap, REBUILD_M, movedM, sharedRenderer } from "./core";

export const STOREFRONT_LAYER = "city3d-storefront-signs";
export const STOREFRONT_MIN_ZOOM = 17;
const RADIUS_M = 200;
const MAX = 64; // one 1024 x 1024 atlas: 2 x 32 slots of 512 x 32

export const SIGN_COLORS: Record<string, string> = {
  food: "#9a3412", shop: "#1e3a8a", health: "#047857", money: "#3f3f46", service: "#4c1d95", mall: "#111827",
};


// ---- Brand logos for the sign bands (server: OSM brand:wikidata → Wikidata P154, re-hosted in R2) ----

const logos = new Map<string, HTMLImageElement | null>();
/** A loaded logo image, or undefined while it loads (onLoad fires once ready), or null if none. */
function logoFor(s: StorefrontSign, onLoad: () => void): HTMLImageElement | null | undefined {
  const key = `${s.name}@${s.lng.toFixed(5)},${s.lat.toFixed(5)}`;
  if (logos.has(key)) return logos.get(key);
  logos.set(key, null);
  const img = new Image();
  img.onload = () => { logos.set(key, img); onLoad(); };
  img.src = `/api/v1/storefronts/logo?${new URLSearchParams({ name: s.name, lon: s.lng.toFixed(5), lat: s.lat.toFixed(5) })}`;
  return undefined;
}

/** Signs from the loaded tiles, nearest first, deduplicated across tile edges. */
export function nearbyStorefronts(map: MapLibreMap, radius = RADIUS_M, max = MAX): StorefrontSign[] {
  const { lng, lat } = map.getCenter();
  return signsNear(map, lng, lat, radius).slice(0, max);
}

/** Signs a browser test puts on the street (dev and the e2e build only): the e2e network has no city tiles. */
const testSigns = (): StorefrontSign[] =>
  (import.meta.env.DEV || import.meta.env.VITE_E2E) && typeof window !== "undefined" ? ((window as unknown as { __storefronts?: StorefrontSign[] }).__storefronts ?? []) : [];

function signsNear(map: MapLibreMap, lng: number, lat: number, radius: number): Array<StorefrontSign & { d: number }> {
  const kx = 111_320 * Math.cos((lat * Math.PI) / 180);
  const seen = new Map<string, StorefrontSign & { d: number }>();
  const add = (p: Omit<StorefrontSign, "lng" | "lat">, x: number, y: number) => {
    const d = Math.hypot((x - lng) * kx, (y - lat) * 111_320);
    if (d > radius) return;
    const key = `${x.toFixed(7)},${y.toFixed(7)},${p.name}`;
    if (!seen.has(key)) seen.set(key, { ...p, lng: x, lat: y, d });
  };
  for (const s of testSigns()) add(s, s.lng, s.lat);
  if (map.getSource("city3d")) {
    for (const f of map.querySourceFeatures("city3d", { sourceLayer: "storefronts" })) {
      if (f.geometry.type !== "Point") continue;
      add(f.properties as Omit<StorefrontSign, "lng" | "lat">, f.geometry.coordinates[0], f.geometry.coordinates[1]);
    }
  }
  return [...seen.values()].sort((a, b) => a.d - b.d);
}

/**
 * The shop a street-level tap at screen pixel (x, y) lands on: the sign plate, shop front or directory
 * board its ray passes through, among the signs that are drawn. `maxT` is how far the ray gets before
 * a wall stops it (metres), so a shop is not picked through a building in front of it.
 */
export function storefrontOnRay(map: MapLibreMap, x: number, y: number, maxT = Infinity): StorefrontSign | null {
  const ray = cameraRay(map, x, y);
  return ray ? pickSign(ray, nearbyStorefronts(map), maxT) : null;
}

/** The directory (main) sign nearest a clicked ground point, for the panel. */
export function directoryAt(map: MapLibreMap, lng: number, lat: number): StorefrontSign | null {
  if (map.getZoom() < STOREFRONT_MIN_ZOOM) return null;
  return signsNear(map, lng, lat, 25).find((s) => s.main === 1) ?? null;
}

function drawSlot(g: CanvasRenderingContext2D, i: number, s: StorefrontSign, logo?: HTMLImageElement | null) {
  const x = (i % 2) * 512, y = Math.floor(i / 2) * 32;
  g.fillStyle = SIGN_COLORS[s.cat] ?? SIGN_COLORS.service;
  g.fillRect(x, y, 512, 32);
  g.strokeStyle = "rgba(255,255,255,0.55)";
  g.lineWidth = 2;
  g.strokeRect(x + 3, y + 3, 506, 26);
  g.fillStyle = "#fff";
  g.textAlign = "center";
  g.textBaseline = "middle";
  const text = s.main ? s.name.toUpperCase() : s.name;
  // A brand logo sits on a white tile at the left of the band, the name beside it.
  const pad = logo ? 34 : 0;
  if (logo) {
    g.fillStyle = "#fff";
    g.fillRect(x + 4, y + 3, 26, 26);
    const k = Math.min(24 / logo.width, 24 / logo.height);
    g.drawImage(logo, x + 17 - (logo.width * k) / 2, y + 16 - (logo.height * k) / 2, logo.width * k, logo.height * k);
    g.fillStyle = "#fff";
  }
  let size = 22;
  do g.font = `600 ${size}px "Helvetica Neue", Arial, sans-serif`;
  while (g.measureText(text).width > 480 - pad && (size -= 1) > 10);
  g.fillText(text, x + 256 + pad / 2, y + 17);
}

export function createStorefrontLayer(): CustomLayerInterface {
  let map: MapLibreMap;
  let renderer: THREE.WebGLRenderer;
  const scene = new THREE.Scene();
  const camera = new THREE.Camera();
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 1024;
  const g = canvas.getContext("2d")!;
  const atlas = new THREE.CanvasTexture(canvas);
  atlas.colorSpace = THREE.SRGBColorSpace;
  // One upload per changed sign set; no mipmap chain to rebuild.
  atlas.generateMipmaps = false;
  atlas.minFilter = THREE.LinearFilter;
  const uv = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 2), 2);
  const geometry = new THREE.PlaneGeometry(1, 1);
  geometry.setAttribute("slot", uv);
  const material = new THREE.MeshBasicMaterial({ map: atlas, side: THREE.DoubleSide });
  // Each instance samples its own 512 x 32 cell of the atlas.
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec2 slot;")
      .replace("#include <uv_vertex>", "#include <uv_vertex>\nvMapUv = vec2((slot.x + uv.x) * 0.5, 1.0 - (slot.y + 1.0 - uv.y) / 32.0);");
  };
  const mesh = new THREE.InstancedMesh(geometry, material, MAX);
  mesh.frustumCulled = false;
  mesh.count = 0;
  scene.add(mesh);
  // Ground-floor shop fronts behind the bands: one atlas (5 x 2 categories),
  // one instanced draw, a per-shop tint so a block never looks cloned.
  const facadeTex = new THREE.TextureLoader().load("/textures/storefront-atlas.png", () => map?.triggerRepaint());
  facadeTex.colorSpace = THREE.SRGBColorSpace;
  const cell = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 2), 2);
  const facadeGeo = new THREE.PlaneGeometry(1, 1);
  facadeGeo.setAttribute("cell", cell);
  const facadeMat = new THREE.MeshBasicMaterial({ map: facadeTex, side: THREE.DoubleSide });
  facadeMat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec2 cell;")
      .replace("#include <uv_vertex>", "#include <uv_vertex>\nvMapUv = vec2((cell.x + uv.x) / 5.0, 1.0 - (cell.y + 1.0 - uv.y) / 2.0);");
  };
  const facades = new THREE.InstancedMesh(facadeGeo, facadeMat, MAX);
  facades.frustumCulled = false;
  facades.count = 0;
  scene.add(facades);
  let origin = new MercatorCoordinate(0, 0, 0);
  let scale = 1;
  let shown = "";
  let lastCheck = 0;
  let builtAt = { lng: 0, lat: 0 };
  let builtZoom = -1;
  const onData = (e: { sourceId?: string; isSourceLoaded?: boolean }) => {
    if (e.sourceId === "city3d" && e.isSourceLoaded) refresh();
  };

  const refresh = () => {
    const c = map.getCenter();
    builtAt = { lng: c.lng, lat: c.lat };
    builtZoom = map.getZoom();
    if (builtZoom < STOREFRONT_MIN_ZOOM) {
      if (mesh.count || facades.count || shown) {
        mesh.count = 0;
        facades.count = 0;
        shown = "";
      }
      return;
    }
    // A main (mall / many-shop) sign also gets a small "Directory" board beside it.
    const signs = nearbyStorefronts(map).flatMap((s): Array<StorefrontSign & { dx?: number; z?: number }> =>
      s.main ? [s, { ...s, name: "Directory", main: 0, sw: BOARD.w, dx: boardOffset(s), z: BOARD.z }] : [s],
    ).slice(0, MAX);
    // Real size at eye level; from higher up a 0.8 m plate is 2-4 px, so it
    // grows to stay about 14 px tall and readable (#67).
    const mpp = (78_271.517 * Math.cos((c.lat * Math.PI) / 180)) / 2 ** builtZoom;
    const grow = Math.min(6, Math.max(1, (mpp * 14) / PLATE_H));
    const logoOf = (s: StorefrontSign) => (s.main || s.name === "Directory" ? null : logoFor(s, () => { shown = ""; refresh(); }));
    const key = `${grow.toFixed(1)}|` + signs.map((s) => `${s.lng},${s.lat},${logoOf(s) ? 1 : 0}`).join("|");
    if (key === shown) return;
    shown = key;
    origin = MercatorCoordinate.fromLngLat(c, 0);
    scale = origin.meterInMercatorCoordinateUnits();
    const kx = 111_320 * Math.cos((c.lat * Math.PI) / 180);
    g.clearRect(0, 0, canvas.width, canvas.height);
    const m = new THREE.Matrix4();
    let nf = 0;
    signs.forEach((s, i) => {
      drawSlot(g, i, s, logoOf(s));
      uv.setXY(i, i % 2, Math.floor(i / 2));
      const b = (s.brg * Math.PI) / 180;
      const n = new THREE.Vector3(Math.sin(b), Math.cos(b), 0);
      const t = new THREE.Vector3(-Math.cos(b), Math.sin(b), 0);
      const h = (s.main ? MAIN_PLATE_H : PLATE_H) * grow;
      const w = plateWidth(s) * Math.min(grow, 2);
      const zc = Math.max(s.z ?? BASE_M + s.fl * FLOOR_M, h / 2 + 0.3);
      const pos = new THREE.Vector3((s.lng - c.lng) * kx, (s.lat - c.lat) * 111_320, zc)
        .addScaledVector(n, WALL_GAP_M * grow)
        .addScaledVector(t, (s.dx ?? 0) * grow);
      m.makeBasis(t.clone().multiplyScalar(w), new THREE.Vector3(0, 0, h), n).setPosition(pos);
      mesh.setMatrixAt(i, m);
      // Ground-floor shop front under a ground-floor band (not the directory board).
      if (!s.fl && !s.dx && s.name !== "Directory" && grow < 1.5) {
        const fw = facadeWidth(s);
        const [cx, cy] = atlasCell(facadeCategory(s.kind, s.cat));
        cell.setXY(nf, cx, cy);
        const fpos = new THREE.Vector3((s.lng - c.lng) * kx, (s.lat - c.lat) * 111_320, FACADE_H / 2).addScaledVector(n, 0.06);
        m.makeBasis(t.clone().multiplyScalar(fw), new THREE.Vector3(0, 0, FACADE_H), n).setPosition(fpos);
        facades.setMatrixAt(nf, m);
        facades.setColorAt(nf, new THREE.Color().setScalar(0.92 + ((i * 7) % 17) / 100)); // ±8%, so a block never looks cloned
        nf++;
      }
    });
    facades.count = nf;
    facades.instanceMatrix.needsUpdate = true;
    if (facades.instanceColor) facades.instanceColor.needsUpdate = true;
    cell.needsUpdate = true;
    mesh.count = signs.length;
    mesh.instanceMatrix.needsUpdate = true;
    uv.needsUpdate = true;
    atlas.needsUpdate = true;
    // refresh runs on moveend/idle, after the last frame: without a repaint the
    // new signs never reached the screen until the next camera move (#67).
    map.triggerRepaint();
  };
  // jumpTo fires moveend every frame. Plates depend on where you stand and the zoom, not the bearing.
  const onMove = () => {
    const z = map.getZoom();
    if (z < STOREFRONT_MIN_ZOOM) {
      if (shown || mesh.count || facades.count) refresh();
      return;
    }
    if (shown && Math.abs(z - builtZoom) < 0.05 && movedM(map.getCenter(), builtAt) < REBUILD_M) return;
    refresh();
  };

  return {
    id: STOREFRONT_LAYER,
    type: "custom",
    renderingMode: "3d",
    onAdd(m, gl) {
      map = m;
      renderer = sharedRenderer(m, gl);
      map.on("moveend", onMove);
      map.on("idle", refresh);
      map.on("sourcedata", onData);
      refresh();
    },
    onRemove() {
      map.off("moveend", onMove);
      map.off("idle", refresh);
      map.off("sourcedata", onData);
      geometry.dispose();
      material.dispose();
      atlas.dispose();
      facadeGeo.dispose();
      facadeMat.dispose();
      facadeTex.dispose();
    },
    render(_gl, args) {
      // Animated layers (weather, hazards) keep the map from ever going idle,
      // so also re-check the loaded tiles about once a second while drawing.
      const now = performance.now();
      if (now - lastCheck > 1000) {
        lastCheck = now;
        refresh();
      }
      if (!mesh.count && !facades.count) return;
      const l = new THREE.Matrix4().makeTranslation(origin.x, origin.y, origin.z ?? 0).scale(new THREE.Vector3(scale, -scale, scale));
      camera.projectionMatrix = new THREE.Matrix4().fromArray(args.defaultProjectionData.mainMatrix as unknown as number[]).multiply(l);
      renderer.resetState();
      renderer.render(scene, camera);
    },
  };
}

// ---- Hero landmarks (glTF) ----
