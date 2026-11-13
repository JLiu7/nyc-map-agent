/**
 * What a walker inside Fulton St would see wrong, found by casting rays from eye height at every
 * half metre of every walk against exactly what the walk scene draws (#126; owner, 2026-11-13:
 * check the whole walk, not a few screenshots). Plain three.js with a bounding-volume tree, no
 * rendering, so it runs in tests.
 */
import * as THREE from "three";
import { acceleratedRaycast, computeBoundsTree } from "three-mesh-bvh";
import type { DollhouseModel } from "./dollhouse";
import { toYUp, type WalkGeometry } from "./stationWalkGeometry";

type P3 = [number, number, number];

export type DefectKind =
  /** Looking up from the walk sees nothing: open ceiling. */
  | "open-up"
  /** Something overhead lower than a doorway's head: a slab at head height. */
  | "low-head"
  /** Looking around from the walk sees out into nothing: a hole in a wall or ceiling. */
  | "hole"
  /** Looking down sees the top of a ceiling: a ceiling poking up through a floor. */
  | "ceiling-from-above"
  /** A wall or ceiling stands across the walk at chest height. */
  | "in-the-way"
  /** Looking out over the track sees nothing beyond it: open on purpose, reported but not a fault. */
  | "track-side";

export type Defect = {
  kind: DefectKind; walk: number; at: P3;
  /** For a hole: the way the first ray out went, model frame (x east, y north, z up), and whether it left from the camera. */
  ray?: P3; fromCamera?: boolean;
};

const EYE_M = 1.6;
const STEP_M = 0.5;
/** The stretch at a walk's street end, where it is open to the sky on purpose. */
const STREET_END_M = 6;
/** Anything overhead lower than this above the feet is in the way of a head. */
const HEAD_M = 2.1;
/** A ray that meets nothing at all has left the station. */
const FAR_M = Infinity;
/** Bearings and elevations looked along from each point (dense, so a slit a hand wide shows). */
const BEARINGS = 72;
const ELEVATIONS = [-0.6, -0.35, -0.15, 0, 0.2, 0.5, 0.9, 1.3];
/** The chase camera sits up to this far behind the walker and this high over the feet. */
const CAMERA_BACK_M = 2.5;
const CAMERA_UP_M = 2;

type Part = "floors" | "stairs" | "walls" | "ceiling";
const PARTS: Part[] = ["floors", "stairs", "walls", "ceiling"];

/** One mesh of everything drawn, and which part each triangle came from. */
function sceneOf(geo: WalkGeometry) {
  const total = PARTS.reduce((n, p) => n + geo[p].position.length, 0);
  const pos = new Float32Array(total);
  const part: Part[] = [];
  let o = 0;
  for (const p of PARTS) {
    pos.set(geo[p].position, o);
    o += geo[p].position.length;
    for (let i = 0; i < geo[p].position.length / 9; i++) part.push(p);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  (g as unknown as { computeBoundsTree: typeof computeBoundsTree }).computeBoundsTree = computeBoundsTree;
  (g as unknown as { computeBoundsTree: () => void }).computeBoundsTree();
  const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  mesh.raycast = acceleratedRaycast;
  return { mesh, part };
}

/** Points every STEP_M along a walk, model frame, with the distance from its street end. */
function along(path: P3[]): Array<{ p: P3; dir: [number, number]; fromStreet: number }> {
  const out: Array<{ p: P3; dir: [number, number]; fromStreet: number }> = [];
  let walked = 0;
  // Walks run from the platform (path[0]) to the street (the last point).
  const total = path.slice(1).reduce((s, q, i) => s + Math.hypot(q[0] - path[i][0], q[1] - path[i][1]), 0);
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 1e-6) continue;
    for (let d = 0; d < L; d += STEP_M) {
      const k = d / L;
      out.push({ p: [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k], dir: [(b[0] - a[0]) / L, (b[1] - a[1]) / L], fromStreet: total - walked - d });
    }
    walked += L;
  }
  return out;
}

/** Every defect along every walk, nearest first along each walk. */
export function walkDefects(model: DollhouseModel, geo: WalkGeometry): Defect[] {
  const { mesh, part } = sceneOf(geo);
  const ray = new THREE.Raycaster();
  ray.far = FAR_M;
  const hit = (o: THREE.Vector3, d: THREE.Vector3, far = FAR_M) => {
    ray.set(o, d.clone().normalize());
    ray.far = far;
    // Ceilings are drawn from below only (FrontSide): a ray that meets one from its back sees through it.
    // The bounds tree reorders the index, so faceIndex no longer counts triangles in order; a vertex does.
    const partOf = (x: THREE.Intersection) => part[x.face ? Math.floor(x.face.a / 3) : 0];
    const h = ray.intersectObject(mesh, false).find((x) => partOf(x) !== "ceiling" || !x.face || ray.ray.direction.dot(x.face.normal) < 0);
    if (!h) return null;
    // Which way the face hit points, turned to face up: a ray going down onto it sees its top.
    const n = h.face ? h.face.normal.clone() : new THREE.Vector3(0, 1, 0);
    if (n.y < 0) n.negate();
    return { dist: h.distance, part: partOf(h), y: h.point.y, fromAbove: ray.ray.direction.dot(n) < -1e-3 && n.y > 0.5 };
  };
  /** Whether a ray from (x, z) along (dx, dz), seen from above, crosses the platform's edge over a track. */
  const tracks = model.edges.map(([x1, y1, x2, y2, ez]) => [...toYUp(x1, y1, ez), ...toYUp(x2, y2, ez)]);
  const overTrack = (o: THREE.Vector3, d: THREE.Vector3) => tracks.some(([ax, ay, az, bx, , bz]) => {
    if (Math.abs(ay - (o.y - EYE_M)) > 2.5) return false;
    const rx = bx - ax, rz = bz - az, den = d.x * rz - d.z * rx;
    if (Math.abs(den) < 1e-9) return false;
    const t = ((ax - o.x) * rz - (az - o.z) * rx) / den, u = ((ax - o.x) * d.z - (az - o.z) * d.x) / den;
    // The walker may stand right on the edge, or a step back from it.
    return t > -1 && u >= -0.05 && u <= 1.05;
  });
  const out: Defect[] = [];
  model.walks.forEach((w, wi) => {
    for (const { p, dir, fromStreet } of along(w.path)) {
      if (fromStreet < STREET_END_M) continue;
      const [x, y, z] = toYUp(p[0], p[1], p[2]);
      const eye = new THREE.Vector3(x, y + EYE_M, z);
      const at: P3 = [p[0], p[1], p[2]];
      const up = hit(eye, new THREE.Vector3(0, 1, 0));
      if (!up) out.push({ kind: "open-up", walk: wi, at });
      else if (up.y < y + HEAD_M) out.push({ kind: "low-head", walk: wi, at });
      // From the eye, and from where the chase camera sits behind and above (if nothing is between).
      const [bx, , bz] = toYUp(-dir[0], -dir[1], 0);
      const back = new THREE.Vector3(bx, (CAMERA_UP_M - EYE_M) / CAMERA_BACK_M, bz).normalize();
      const toCam = hit(eye, back, CAMERA_BACK_M * 1.2);
      const eyes = toCam ? [eye] : [eye, eye.clone().addScaledVector(back, CAMERA_BACK_M * 1.2)];
      let hole = false, track = false, fromAbove = false, ray: P3 | undefined, fromCamera = false;
      for (const o of eyes) for (let b = 0; b < BEARINGS && !hole; b++) for (const el of ELEVATIONS) {
        const a = (b / BEARINGS) * Math.PI * 2;
        const d = new THREE.Vector3(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el));
        const h = hit(o, d);
        if (!h) { if (overTrack(o, d)) track = true; else { hole = true; ray = [d.x, -d.z, d.y]; fromCamera = o !== eye; break; } continue; }
        if (h.part === "ceiling" && h.fromAbove) fromAbove = true;
      }
      if (hole) out.push({ kind: "hole", walk: wi, at, ray, fromCamera });
      else if (track) out.push({ kind: "track-side", walk: wi, at });
      if (fromAbove) out.push({ kind: "ceiling-from-above", walk: wi, at });
      // Ahead along the walk at chest height, half a step: no wall or ceiling may stand there.
      const [dx, , dz] = toYUp(dir[0], dir[1], 0);
      const chest = new THREE.Vector3(x, y + 1.2, z);
      const ahead = hit(chest, new THREE.Vector3(dx, 0, dz), STEP_M);
      if (ahead && (ahead.part === "walls" || ahead.part === "ceiling")) out.push({ kind: "in-the-way", walk: wi, at });
    }
  });
  return out;
}

/** Defects merged into spots: one per kind within 2 m of each other. */
export function defectSpots(defects: Defect[]): Array<Defect & { count: number }> {
  const spots: Array<Defect & { count: number }> = [];
  for (const d of defects) {
    const s = spots.find((s) => s.kind === d.kind && Math.hypot(s.at[0] - d.at[0], s.at[1] - d.at[1]) < 2 && Math.abs(s.at[2] - d.at[2]) < 1.5);
    if (s) s.count++;
    else spots.push({ ...d, count: 1 });
  }
  return spots;
}
