/**
 * Overpasses and elevated highways at street level. The basemap tiles
 * (OpenMapTiles `transportation`) mark a road on a bridge with
 * `brunnel = bridge` and its OSM `layer` (1 = one level up), but carry no
 * height, so MapLibre paints the FDR or the BQE flat on the street that runs
 * under it. The city tiles' 3D decks (scripts/bridges.ts) only draw the tall
 * ones (layer 2 and up, the named river bridges); this layer lifts the rest
 * of the motorway and trunk decks to 6 m, ramps their loose ends down to the
 * road they join, and stands piers under them, so you walk on the street
 * below. Street-class bridges stay flat: in NYC they mostly cross a highway
 * cut or a rail trench at street grade.
 */
import * as THREE from "three";
import type { CustomLayerInterface } from "maplibre-gl";
import { eyeOrCenter } from "../streetPick";
import { toLocal } from "../signPlacement";
import { MercatorCoordinate, type MapLibreMap, REBUILD_M, movedM, LEGACY_LIGHT, sharedRenderer } from "./core";

export const OVERPASSES_LAYER = "city3d-overpasses";
const MIN_ZOOM = 15;
const RADIUS_M = 600;
/** Deck top above the street: the city tiles' 6 m per OSM level (about 4.9 m clearance under a 1.1 m deck). */
export const DECK_TOP_M = 6;
const DECK_DEPTH_M = 1.1;
const PARAPET_M = 1;
/** A loose deck end comes down to the road over this far (or half the deck, if shorter). */
const RAMP_M = 60;
const STEP_M = 8;
const PIER_EVERY_M = 30;
const PIER_SIDE_M = 1.2;
/** Ends this close to another deck's vertex, or on a tile edge, carry on into it. */
const JOIN_M = 2;

type Pt = [number, number];

/** One deck: a centreline in local metres (x east, y north) and its width. */
interface DeckPiece {
  pts: Pt[];
  width: number;
  startFree: boolean;
  endFree: boolean;
}

/** Deck width: one carriageway of a split highway, a whole two-way road, or a ramp. */
export function deckWidth(p: { class?: unknown; ramp?: unknown; oneway?: unknown }): number {
  if (Number(p.ramp) === 1) return 8;
  return Number(p.oneway) === 1 || Number(p.oneway) === -1 ? 12 : 20;
}

/** Splits every segment into steps of at most `step` metres, so a ramp curves smoothly. */
export function densify(pts: Pt[], step = STEP_M): Pt[] {
  const out: Pt[] = pts.length ? [pts[0]] : [];
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / step));
    for (let k = 1; k <= n; k++) out.push([ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n]);
  }
  return out;
}

/** Deck-top height at each vertex: `top`, easing down to 0 at each loose end. */
export function deckHeights(pts: Pt[], startFree: boolean, endFree: boolean, top = DECK_TOP_M): number[] {
  const along = [0];
  for (let i = 1; i < pts.length; i++) along.push(along[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const len = along[along.length - 1] ?? 0;
  const ramp = Math.max(1, Math.min(RAMP_M, len / 2));
  const ease = (d: number) => {
    const t = Math.min(1, Math.max(0, d / ramp));
    return t * t * (3 - 2 * t);
  };
  // A hair above the street at a loose end, so the ramp's foot does not flicker against the road paint.
  return along.map((s) => Math.max(0.05, top * Math.min(startFree ? ease(s) : 1, endFree ? ease(len - s) : 1)));
}

/** Liang-Barsky: the part of segment a-b inside the box, or null. */
function clip(a: Pt, b: Pt, box: [number, number, number, number]): [Pt, Pt] | null {
  const [x0, y0, x1, y1] = box;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  let t0 = 0, t1 = 1;
  for (const [p, q] of [[-dx, a[0] - x0], [dx, x1 - a[0]], [-dy, a[1] - y0], [dy, y1 - a[1]]] as Array<[number, number]>) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const r = q / p;
    if (p < 0) t0 = Math.max(t0, r);
    else t1 = Math.min(t1, r);
    if (t0 > t1) return null;
  }
  return [[a[0] + t0 * dx, a[1] + t0 * dy], [a[0] + t1 * dx, a[1] + t1 * dy]];
}

/** Lng/lat bounds of tile z/x/y. */
function tileBox(z: number, x: number, y: number): [number, number, number, number] {
  const n = 2 ** z;
  const lat = (yy: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * yy) / n))) * 180) / Math.PI;
  return [(x / n) * 360 - 180, lat(y + 1), ((x + 1) / n) * 360 - 180, lat(y)];
}

/** A tile-clipped line: each tile keeps only its own part, so a deck is not drawn twice in the tiles' overlap. */
function clipToTile(line: Pt[], box: [number, number, number, number]): Pt[][] {
  const runs: Pt[][] = [];
  let run: Pt[] = [];
  for (let i = 1; i < line.length; i++) {
    const c = clip(line[i - 1], line[i], box);
    if (!c) {
      if (run.length > 1) runs.push(run);
      run = [];
      continue;
    }
    const last = run[run.length - 1];
    if (!last || last[0] !== c[0][0] || last[1] !== c[0][1]) {
      if (run.length > 1) runs.push(run);
      run = [c[0]];
    }
    run.push(c[1]);
  }
  if (run.length > 1) runs.push(run);
  return runs;
}

interface RawFeature {
  properties: Record<string, unknown> | null;
  geometry: { type: string; coordinates: unknown };
  _x?: number;
  _y?: number;
  _z?: number;
}

function linesOf(g: RawFeature["geometry"]): Pt[][] {
  if (g.type === "LineString") return [g.coordinates as Pt[]];
  if (g.type === "MultiLineString") return g.coordinates as Pt[][];
  return [];
}

/** True for a deck this layer lifts: motorway or trunk on a one-level bridge. */
export function isLowHighwayDeck(p: Record<string, unknown>): boolean {
  return p.brunnel === "bridge" && (p.class === "motorway" || p.class === "trunk") && (Number(p.layer) || 1) === 1;
}

function inRing(pt: Pt, ring: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Deck pieces around `eye`, in metres from it, from the loaded basemap
 * features and the city tiles' tall decks (`tall`: lng/lat rings) to step
 * around. Pure, for tests.
 */
export function overpassPieces(features: RawFeature[], eye: { lng: number; lat: number }, tall: Pt[][] = [], radius = RADIUS_M): DeckPiece[] {
  const z = Math.max(0, ...features.map((f) => f._z ?? 0));
  type Run = { ll: Pt[]; width: number; box?: [number, number, number, number] };
  const runs: Run[] = [];
  /** Vertices of every high deck, with the lifted run each belongs to (-1: a city-tiles deck). */
  const joints: Array<{ at: Pt; run: number }> = [];
  for (const f of features) {
    const p = f.properties ?? {};
    if (p.brunnel !== "bridge" || (f._z ?? z) !== z) continue;
    const lifted = isLowHighwayDeck(p);
    const box = f._x != null && f._y != null && f._z != null ? tileBox(f._z, f._x, f._y) : undefined;
    for (const line of linesOf(f.geometry)) {
      const parts = box ? clipToTile(line, box) : [line];
      // Any deck that is lifted here or by the city tiles is somewhere a lifted end can carry on into.
      for (const ll of parts) {
        const run = lifted ? runs.push({ ll, width: deckWidth(p), box }) - 1 : -1;
        if (lifted || (Number(p.layer) || 1) >= 2) for (const q of ll) joints.push({ at: toLocal(q[0], q[1], eye), run });
      }
    }
  }
  const out: DeckPiece[] = [];
  runs.forEach((r, i) => {
    const mid = r.ll[Math.floor(r.ll.length / 2)];
    // Where the city tiles already draw this deck high (a river bridge's approach), it is theirs.
    if (tall.some((ring) => inRing(mid, ring))) return;
    const pts = r.ll.map((q) => toLocal(q[0], q[1], eye));
    if (!pts.some(([x, y]) => Math.hypot(x, y) < radius)) return;
    const onEdge = (q: Pt) => !!r.box && (Math.abs(q[0] - r.box[0]) < 1e-9 || Math.abs(q[0] - r.box[2]) < 1e-9 || Math.abs(q[1] - r.box[1]) < 1e-9 || Math.abs(q[1] - r.box[3]) < 1e-9);
    const joined = (end: Pt) => joints.some((j) => j.run !== i && Math.hypot(j.at[0] - end[0], j.at[1] - end[1]) < JOIN_M);
    out.push({
      pts,
      width: r.width,
      startFree: !onEdge(r.ll[0]) && !joined(pts[0]),
      endFree: !onEdge(r.ll[r.ll.length - 1]) && !joined(pts[pts.length - 1]),
    });
  });
  return out;
}

/** Deck slab, parapets and soffit for one piece, in the layer's local metres (offset by `at`). */
function deckGeometry(piece: DeckPiece, at: Pt): { top: number[]; sides: number[]; piers: Array<[number, number, number, number, number]> } {
  const pts = densify(piece.pts);
  const h = deckHeights(pts, piece.startFree, piece.endFree);
  const half = piece.width / 2;
  const L: Array<[number, number]> = [], R: Array<[number, number]> = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = -(b[1] - a[1]) / len, ny = (b[0] - a[0]) / len;
    L.push([pts[i][0] + at[0] + nx * half, pts[i][1] + at[1] + ny * half]);
    R.push([pts[i][0] + at[0] - nx * half, pts[i][1] + at[1] - ny * half]);
  }
  const top: number[] = [], sides: number[] = [];
  const quad = (out: number[], p: number[][]) => out.push(...p[0], ...p[1], ...p[2], ...p[0], ...p[2], ...p[3]);
  for (let i = 1; i < pts.length; i++) {
    const t0 = h[i - 1], t1 = h[i];
    const b0 = Math.max(0, t0 - DECK_DEPTH_M), b1 = Math.max(0, t1 - DECK_DEPTH_M);
    const p0 = Math.max(t0 + 0.02, Math.min(t0 + PARAPET_M, t0 * 2)), p1 = Math.max(t1 + 0.02, Math.min(t1 + PARAPET_M, t1 * 2));
    quad(top, [[...L[i - 1], t0], [...R[i - 1], t0], [...R[i], t1], [...L[i], t1]]);
    // Soffit, then each side from the soffit up to the parapet's top.
    quad(sides, [[...L[i - 1], b0], [...L[i], b1], [...R[i], b1], [...R[i - 1], b0]]);
    quad(sides, [[...L[i - 1], b0], [...L[i - 1], p0], [...L[i], p1], [...L[i], b1]]);
    quad(sides, [[...R[i - 1], b0], [...R[i], b1], [...R[i], p1], [...R[i - 1], p0]]);
  }
  // Piers: a pair of columns under the deck every PIER_EVERY_M where it is high enough to stand on.
  const piers: Array<[number, number, number, number, number]> = [];
  let since = PIER_EVERY_M / 2;
  for (let i = 1; i < pts.length; i++) {
    since += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (since < PIER_EVERY_M || h[i] < DECK_TOP_M * 0.75) continue;
    since = 0;
    const a = pts[i - 1], b = pts[i];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = -(b[1] - a[1]) / len, ny = (b[0] - a[0]) / len;
    for (const side of piece.width > 10 ? [-0.3, 0.3] : [0]) {
      piers.push([pts[i][0] + at[0] + nx * piece.width * side, pts[i][1] + at[1] + ny * piece.width * side, h[i] - DECK_DEPTH_M, Math.atan2(b[1] - a[1], b[0] - a[0]), PIER_SIDE_M]);
    }
  }
  return { top, sides, piers };
}

/** Raised motorway and trunk decks around the eye, in MapLibre's canvas and depth buffer. */
export function createOverpassLayer(): CustomLayerInterface {
  let map: MapLibreMap | null = null;
  let renderer: THREE.WebGLRenderer | null = null;
  const scene = new THREE.Scene();
  const camera = new THREE.Camera();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x6b6b6b, 1.1 * LEGACY_LIGHT));
  const sun = new THREE.DirectionalLight(0xffffff, 0.9 * LEGACY_LIGHT);
  sun.position.set(0.4, -0.6, 1);
  scene.add(sun);
  const origin = MercatorCoordinate.fromLngLat([-73.97, 40.73], 0);
  const s = origin.meterInMercatorCoordinateUnits();
  const local = new THREE.Matrix4().makeTranslation(origin.x, origin.y, origin.z).scale(new THREE.Vector3(s, -s, s));

  const asphalt = new THREE.MeshLambertMaterial({ color: 0x55585e, side: THREE.DoubleSide });
  const concrete = new THREE.MeshLambertMaterial({ color: 0x9c978e, side: THREE.DoubleSide });
  const topMesh = new THREE.Mesh(new THREE.BufferGeometry(), asphalt);
  const sideMesh = new THREE.Mesh(new THREE.BufferGeometry(), concrete);
  const PIER_CAP = 600;
  const pierGeom = new THREE.BoxGeometry(1, 1, 1);
  pierGeom.translate(0, 0, 0.5);
  const pierMesh = new THREE.InstancedMesh(pierGeom, concrete, PIER_CAP);
  for (const m of [topMesh, sideMesh, pierMesh]) {
    m.frustumCulled = false;
    scene.add(m);
  }
  pierMesh.count = 0;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), sc = new THREE.Vector3(), zAxis = new THREE.Vector3(0, 0, 1);
  let builtAt = { lng: 0, lat: 0 };
  let shown = "";
  let wasZoomOk = false;
  let anchored = false;
  let empty = true;

  const setPositions = (mesh: THREE.Mesh, arr: number[]) => {
    mesh.geometry.dispose();
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(arr, 3));
    g.computeVertexNormals();
    mesh.geometry = g;
  };

  const refresh = () => {
    if (!map) return;
    const eye = eyeOrCenter(map);
    builtAt = eye;
    wasZoomOk = map.getZoom() >= MIN_ZOOM;
    anchored = true;
    let pieces: DeckPiece[] = [];
    if (wasZoomOk && map.getSource("openmaptiles")) {
      const tall: Pt[][] = [];
      if (map.getSource("city3d")) {
        for (const f of map.querySourceFeatures("city3d", { sourceLayer: "bridges" })) {
          const p = f.properties ?? {};
          if (p.kind === "deck" && Number(p.height) > 8.5 && f.geometry.type === "Polygon") tall.push(f.geometry.coordinates[0] as Pt[]);
        }
      }
      const feats = map.querySourceFeatures("openmaptiles", { sourceLayer: "transportation", filter: ["==", ["get", "brunnel"], "bridge"] });
      pieces = overpassPieces(feats as unknown as RawFeature[], eye, tall);
    }
    const key = pieces.map((p) => `${p.pts[0].map((v) => v.toFixed(0)).join(",")}:${p.pts.length}:${+p.startFree}${+p.endFree}`).sort().join("|") + `@${eye.lng.toFixed(4)},${eye.lat.toFixed(4)}`;
    if (key === shown) return;
    shown = key;
    const mc = MercatorCoordinate.fromLngLat([eye.lng, eye.lat], 0);
    const at: Pt = [(mc.x - origin.x) / s, -(mc.y - origin.y) / s];
    const top: number[] = [], sides: number[] = [];
    let n = 0;
    for (const piece of pieces) {
      const g = deckGeometry(piece, at);
      top.push(...g.top);
      sides.push(...g.sides);
      for (const [x, y, height, angle, across] of g.piers) {
        if (n >= PIER_CAP) break;
        q.setFromAxisAngle(zAxis, angle);
        pierMesh.setMatrixAt(n++, m4.compose(pos.set(x, y, 0), q, sc.set(PIER_SIDE_M, across, height)));
      }
    }
    setPositions(topMesh, top);
    setPositions(sideMesh, sides);
    pierMesh.count = n;
    pierMesh.instanceMatrix.needsUpdate = true;
    empty = top.length === 0;
    map.triggerRepaint();
  };
  const onData = (e: { sourceId?: string; isSourceLoaded?: boolean }) => {
    if ((e.sourceId === "openmaptiles" || e.sourceId === "city3d") && e.isSourceLoaded) refresh();
  };
  // jumpTo fires moveend on every walk frame and every look. Rebuild when the eye moves, or zoom crosses the cutoff.
  const onMove = () => {
    if (!map) return;
    const zoomOk = map.getZoom() >= MIN_ZOOM;
    if (anchored && zoomOk === wasZoomOk && movedM(eyeOrCenter(map), builtAt) < REBUILD_M) return;
    refresh();
  };

  return {
    id: OVERPASSES_LAYER,
    type: "custom",
    renderingMode: "3d",
    onAdd(m, gl) {
      map = m;
      renderer = sharedRenderer(m, gl);
      m.on("moveend", onMove);
      m.on("sourcedata", onData);
      refresh();
    },
    onRemove(m) {
      m.off("moveend", onMove);
      m.off("sourcedata", onData);
      // The renderer is shared by every three.js layer; never dispose it here.
      renderer = null;
    },
    render(_gl, args) {
      if (!renderer || !map || map.getZoom() < MIN_ZOOM || empty) return;
      camera.projectionMatrix = new THREE.Matrix4().fromArray(args.defaultProjectionData.mainMatrix as unknown as number[]).multiply(local);
      renderer.resetState();
      renderer.render(scene, camera);
    },
  };
}
