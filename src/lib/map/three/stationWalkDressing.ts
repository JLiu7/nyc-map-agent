/**
 * What hangs inside Fulton St for walking it: signs (kept clear of the walls), lamps, a turnstile on
 * each of the model's fare-gate panels, and the 4 train at the downtown platform. Its own file so the
 * shell code it needs loads with the walk, not with the dollhouse on the map.
 */
import * as THREE from "three";
import {
  CAR_M, CARS, DOORS_ALONG_M, dispose, LIGHT_ASIDE_M, LIGHT_EVERY_M, LIGHT_UP_M, planSigns, signMesh, trainCars, turnstile, walkAt, walkLength,
  type DollhouseModel, type P3,
} from "./dollhouse";
import { gatePanels, type Shell, type ShellWall } from "./stationShell";
/** From the platform's edge to the middle of the track beside it. */
const TRAIN_OFF_EDGE_M = 1.55;

/** How far a hung sign may move, sideways along its board or along the walk, to clear the walls. */
const SIGN_NUDGES_M: Array<[number, number]> = [[0, 0], [0.4, 0], [-0.4, 0], [0.8, 0], [-0.8, 0], [0, 1], [0, -1], [1.2, 0], [-1.2, 0], [0, 2], [0, -2], [0.8, 1], [-0.8, 1], [0.8, -1], [-0.8, -1]];

/**
 * Where near `at` a sign facing `heading` can hang with its board clear of every wall (owner,
 * 2026-11-13: signs stuck through the walls), or null if nowhere near is.
 */
function clearOfWalls(sign: THREE.Object3D, at: P3, heading: number, walls: ShellWall[]): P3 | null {
  const bounds = new THREE.Box3().setFromObject(sign);
  const half = (bounds.max.x - bounds.min.x) / 2 + 0.05;
  const lo = bounds.min.z, hi = bounds.max.z;
  const ux = Math.cos(heading), uy = -Math.sin(heading); // along the board
  const fx = Math.sin(heading), fy = Math.cos(heading); // the way it faces, along the walk
  const near = walls.filter((w) => Math.min(Math.hypot(w.a[0] - at[0], w.a[1] - at[1]), Math.hypot(w.b[0] - at[0], w.b[1] - at[1]), segDist(at[0], at[1], w)) < half + 3);
  const hits = (c: P3) => {
    for (let s = -half; s <= half + 1e-6; s += 0.2) {
      const x = c[0] + ux * s, y = c[1] + uy * s;
      for (const w of near) {
        if (segDist(x, y, w) > w.thick / 2 + 0.06) continue;
        const k = along(x, y, w);
        const foot = w.foot[0] + (w.foot[1] - w.foot[0]) * k, top = w.top[0] + (w.top[1] - w.top[0]) * k;
        if (c[2] + hi > foot && c[2] + lo < top) return true;
      }
    }
    return false;
  };
  for (const [side, ahead] of SIGN_NUDGES_M) {
    const c: P3 = [at[0] + ux * side + fx * ahead, at[1] + uy * side + fy * ahead, at[2]];
    if (!hits(c)) return c;
  }
  return null;
}

/** How far along a wall's centre line (0 to 1) the point nearest (x, y) lies. */
function along(x: number, y: number, w: ShellWall): number {
  const dx = w.b[0] - w.a[0], dy = w.b[1] - w.a[1], L = dx * dx + dy * dy || 1;
  return Math.max(0, Math.min(1, ((x - w.a[0]) * dx + (y - w.a[1]) * dy) / L));
}

/** Distance from (x, y) to a wall's centre line, seen from above. */
function segDist(x: number, y: number, w: ShellWall): number {
  const k = along(x, y, w);
  return Math.hypot(w.a[0] + (w.b[0] - w.a[0]) * k - x, w.a[1] + (w.b[1] - w.a[1]) * k - y);
}


/** A sign, a lamp or a fare line already hung this close to another of its kind is the same one. */
const SAME_PLACE_M = 1.5;

export type WalkDressing = {
  /** Signs, lamps and fare lines along every walk, and the train; z up, in the model's frame. */
  group: THREE.Group;
  /** The train standing at the downtown platform, doors shut; move it along `track`. */
  train: THREE.Group & { open: (f: number) => void };
  /** The way the train leaves, a unit vector in the model's x, y. */
  track: { at: P3; dir: [number, number] };
  /** The middle of every door on the platform's side: x, y and the platform's floor height. */
  doors: P3[];
  /** Turns each turnstile's arms for a walker at (x, y, feet z), the same frame. */
  turnstiles: (x: number, y: number, z: number) => void;
  dispose: () => void;
};

/**
 * Everything the dollhouse hangs along its one walk, hung along every walk instead, for walking
 * the whole station: the platform and exit signs (planSigns), ceiling lamps and the fare lines, each
 * once where walks share it, and the train standing at the downtown platform with its doors.
 * `corner` names each exit's street corner for its Exit signs.
 */
export function walkDressing(model: DollhouseModel, corner: (exit: [number, number]) => string | null, shell?: Shell): WalkDressing {
  const group = new THREE.Group();
  const hung: Array<{ kind: string; at: P3 }> = [];
  const fresh = (kind: string, at: P3) => {
    if (hung.some((h) => h.kind === kind && Math.hypot(h.at[0] - at[0], h.at[1] - at[1]) < SAME_PLACE_M && Math.abs(h.at[2] - at[2]) < 1)) return false;
    hung.push({ kind, at });
    return true;
  };
  const lampGeo = new THREE.BoxGeometry(0.12, 1.2, 0.04);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xfffbea });
  const rotors: Array<{ rotor: THREE.Group; at: THREE.Vector3 }> = [];
  for (const walk of model.walks) {
    for (const plan of planSigns(model, walk, corner(walk.exit))) {
      if (!fresh(JSON.stringify(plan.lines), plan.at)) continue;
      const sign = signMesh(plan.lines, [], plan.small);
      const at = shell ? clearOfWalls(sign, plan.at, plan.heading, shell.walls) : plan.at;
      // No spot near its own clears every wall: better no sign than one sticking out of a wall.
      if (!at) { dispose(sign); continue; }
      sign.position.set(...at);
      sign.rotation.z = -plan.heading;
      group.add(sign);
    }
    const total = walkLength(walk.path);
    for (let d = 2; d < total; d += LIGHT_EVERY_M) {
      const p = walkAt(walk.path, d / total);
      const at: P3 = [p.x - Math.cos(p.heading) * LIGHT_ASIDE_M, p.y + Math.sin(p.heading) * LIGHT_ASIDE_M, p.z + LIGHT_UP_M];
      if (!fresh("lamp", at)) continue;
      const lamp = new THREE.Mesh(lampGeo, lampMat);
      lamp.position.set(...at);
      lamp.rotation.z = -p.heading;
      group.add(lamp);
    }
  }
  // A turnstile on each of the model's own fare-gate panels, its cabinet where the panel stands.
  for (const { at, heading } of gatePanels(model)) {
    const t = turnstile();
    t.group.rotation.z = -heading;
    t.group.position.set(at[0] - Math.cos(heading) * 0.32, at[1] + Math.sin(heading) * 0.32, at[2]);
    group.add(t.group);
    t.group.updateMatrixWorld(true);
    rotors.push({ rotor: t.rotor, at: new THREE.Vector3(0.17, 0, 0).applyMatrix4(t.group.matrixWorld) });
  }
  // The train's cars run back from its front along local -x. The model's track angle points them
  // away from the platform, so the walk turns the train round: its ten cars line the platform from
  // track.at, and it pulls out the way its front faces.
  const angle = model.track.angle + Math.PI;
  const dir: [number, number] = [Math.cos(angle), Math.sin(angle)];
  // Across the track (+ to the left of dir), and the platform's side of it: where the walks start.
  const across = (x: number, y: number) => (x - model.track.at[0]) * -dir[1] + (y - model.track.at[1]) * dir[0];
  const s0 = model.walks[0].path[0];
  const side = Math.sign(across(s0[0], s0[1])) || 1;
  // The train runs TRAIN_OFF_EDGE_M out from the platform's edge over the track (the model's edges)
  // on the walks' side.
  let edge: number | null = null;
  for (const [x1, y1, x2, y2] of model.edges) {
    const c = across((x1 + x2) / 2, (y1 + y2) / 2) * side;
    if (c < across(s0[0], s0[1]) * side && (edge == null || c > edge)) edge = c;
  }
  const mid = edge == null ? 0 : (edge - TRAIN_OFF_EDGE_M) * side;
  const at: P3 = [model.track.at[0] - dir[1] * mid, model.track.at[1] + dir[0] * mid, model.track.at[2]];
  const train = trainCars(true) as THREE.Group & { open: (f: number) => void };
  train.position.set(...at);
  train.rotation.z = angle;
  group.add(train);
  // Each door's spot on the platform, just in from the edge.
  const floor = s0[2];
  const doorAt = edge == null ? 1.4 : TRAIN_OFF_EDGE_M + 0.3;
  const doors: P3[] = [];
  for (let i = 0; i < CARS; i++) for (const along of DOORS_ALONG_M) {
    const a = -i * CAR_M + along;
    doors.push([at[0] + dir[0] * a - dir[1] * side * doorAt, at[1] + dir[1] * a + dir[0] * side * doorAt, floor]);
  }
  return {
    group, train, doors,
    track: { at, dir },
    turnstiles: (x, y, z) => {
      for (const r of rotors) {
        if (Math.abs(r.at.z - z) > 1.5) continue;
        const d = Math.hypot(r.at.x - x, r.at.y - y);
        r.rotor.rotation.y = d < 0.8 ? ((0.8 - d) / 0.8) * (Math.PI / 3) : 0;
      }
    },
    dispose: () => dispose(group),
  };
}
