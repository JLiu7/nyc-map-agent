/**
 * What hangs inside Fulton St for walking it: signs (flat on a wall where one is near, else hung from
 * the ceiling), lamps, the fare lines (a turnstile on each of the model's fare-gate panels, one
 * across every walk's way through, and an accessible gate at one end of each line) and the 4 train
 * at the downtown platform. Its own file so the shell code it needs loads with the walk, not with
 * the dollhouse on the map.
 */
import * as THREE from "three";
import {
  CAR_M, CARS, DOORS_ALONG_M, dispose, LIGHT_ASIDE_M, LIGHT_EVERY_M, LIGHT_UP_M, planSigns, signMesh, trainCars, turnstile, walkAt, walkLength, walkPlaces,
  type DollhouseModel, type P3, type SignPlan,
} from "./dollhouse";
import { gatePanels, inWalkWay, inWall, surfaceFinder, walkPoints, type Shell, type ShellWall } from "./stationShell";
/** From the platform's edge to the middle of the track beside it. */
const TRAIN_OFF_EDGE_M = 1.55;

/** A sign whose board comes this close to a wall goes flat on that wall, facing out (owner, 2026-11-13). */
const WALL_NEAR_M = 1.5;
/** How far a sign on a wall stands off the wall's face. */
const OFF_WALL_M = 0.03;
/** A doorway cut where a walk passes a wall is open up to this height over the walk (stationShell's DOOR_HEAD_M). */
const DOOR_HEAD_M = 2.2;

/** A sign's board: its half width, depth (local y) and height (local z) around its origin. */
export type Board = { half: number; y0: number; y1: number; z0: number; z1: number };

function boardOf(sign: THREE.Object3D): Board {
  const b = new THREE.Box3().setFromObject(sign);
  return { half: Math.max(-b.min.x, b.max.x), y0: b.min.y, y1: b.max.y, z0: b.min.z, z1: b.max.z };
}

/**
 * Whether a board at `at` facing `heading` reaches into any wall: its footprint against the wall's,
 * two rectangles seen from above that overlap unless one of their four sides' directions parts them,
 * and its height against the wall's over the stretch the board spans.
 */
export function boardInWall(b: Board, at: P3, heading: number, walls: ShellWall[]): boolean {
  const ux = Math.cos(heading), uy = -Math.sin(heading), fx = Math.sin(heading), fy = Math.cos(heading);
  const fm = (b.y0 + b.y1) / 2, fh = (b.y1 - b.y0) / 2;
  const cx = at[0] + fx * fm, cy = at[1] + fy * fm;
  for (const w of walls) {
    const dx = w.b[0] - w.a[0], dy = w.b[1] - w.a[1], L = Math.hypot(dx, dy);
    if (L < 1e-6) continue;
    const tx = dx / L, ty = dy / L, mx = (w.a[0] + w.b[0]) / 2 - cx, my = (w.a[1] + w.b[1]) / 2 - cy;
    const apart = ([kx, ky]: [number, number]) =>
      Math.abs(mx * kx + my * ky) >= b.half * Math.abs(ux * kx + uy * ky) + fh * Math.abs(fx * kx + fy * ky) + (L / 2) * Math.abs(tx * kx + ty * ky) + (w.thick / 2) * Math.abs(-ty * kx + tx * ky);
    if (apart([ux, uy]) || apart([fx, fy]) || apart([tx, ty]) || apart([-ty, tx])) continue;
    // The stretch of the wall the board spans, and the wall's foot and top over it.
    const s = (cx - w.a[0]) * tx + (cy - w.a[1]) * ty, r = b.half * Math.abs(ux * tx + uy * ty) + fh * Math.abs(fx * tx + fy * ty);
    const k0 = Math.max(0, (s - r) / L), k1 = Math.min(1, (s + r) / L);
    const foot = Math.min(lerp(w.foot, k0), lerp(w.foot, k1)), top = Math.max(lerp(w.top, k0), lerp(w.top, k1));
    if (at[2] + b.z1 > foot && at[2] + b.z0 < top) return true;
  }
  return false;
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

const lerp = (v: [number, number], k: number) => v[0] + (v[1] - v[0]) * k;

/** Walk points (x, y, z) in 1 m cells, to find the ones near a spot quickly. */
function pointGrid(pts: P3[]) {
  const grid = new Map<string, P3[]>();
  for (const p of pts) {
    const k = `${Math.floor(p[0])},${Math.floor(p[1])}`;
    (grid.get(k) ?? grid.set(k, []).get(k)!).push(p);
  }
  /** The points within `r` metres of (x, y), seen from above. */
  return (x: number, y: number, r: number): P3[] => {
    const out: P3[] = [];
    for (let i = Math.floor(x - r); i <= Math.floor(x + r); i++) for (let j = Math.floor(y - r); j <= Math.floor(y + r); j++)
      for (const p of grid.get(`${i},${j}`) ?? []) if (Math.hypot(p[0] - x, p[1] - y) < r) out.push(p);
    return out;
  };
}

/**
 * The direction boards that belong to the platforms rather than one walk (owner, 2026-11-13:
 * "downtown train sign uptown train sign"). Fulton St's 4/5 has two side platforms across the
 * tracks: the edge nearest the downtown track is the downtown platform's, the other the uptown one's.
 * - On the uptown platform, "Fulton St" and "Uptown & The Bronx" boards across from each downtown
 *   one, 2.5 m in from the edge, facing whoever stands on that platform. (The downtown train,
 *   standing between, hides them from the downtown side.)
 * - Where each walk's first stair leaves the downtown platform's level, a board 3 m out on the
 *   platform side for whoever comes off that stair: "Downtown & Brooklyn" with the platform's lines.
 */
export function platformBoards(model: DollhouseModel): SignPlan[] {
  const seg = ([x1, y1, x2, y2]: number[]) => ({ a: [x1, y1], b: [x2, y2] }) as ShellWall;
  const [tx, ty] = model.track.at;
  const [down, up] = [...model.edges].sort((p, q) => segDist(tx, ty, seg(p)) - segDist(tx, ty, seg(q)));
  const out: SignPlan[] = [];
  if (up) {
    const [x1, y1, x2, y2, z] = up, len = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / len, uy = (y2 - y1) / len;
    // Away from the tracks: off the edge on the side the downtown edge is not.
    const side = Math.sign((down[0] - x1) * -uy + (down[1] - y1) * ux) || 1, ax = uy * side, ay = -ux * side;
    for (const w of model.walks) {
      const p = planSigns(model, w, null)[0].at, s = (p[0] - x1) * ux + (p[1] - y1) * uy;
      const at: P3 = [x1 + ux * s + ax * 2.5, y1 + uy * s + ay * 2.5, z + 2.6];
      if (s < 3 || s > len - 3 || out.some((o) => Math.hypot(o.at[0] - at[0], o.at[1] - at[1]) < 3)) continue;
      out.push({ at, heading: Math.atan2(-ax, -ay), lines: [{ bullets: model.lines, text: "Fulton St" }, { text: "Uptown & The Bronx" }] });
    }
  }
  for (const w of model.walks) {
    // The walk's first stair, up or down, is the one off the platform's level; one far from the
    // downtown edge belongs to another part of the station.
    const f = walkPlaces(w.path).signs[0];
    if (down && f && Math.abs(f.at[2] - w.path[0][2]) < 0.3 && segDist(f.at[0], f.at[1], seg(down)) < 25) {
      out.push({ at: [f.at[0] - Math.sin(f.heading) * 3, f.at[1] - Math.cos(f.heading) * 3, f.at[2] + 2.5], heading: f.heading + Math.PI, lines: [{ bullets: model.lines, text: "Downtown & Brooklyn" }, null] });
    }
  }
  return out;
}

/** A board as hung: where, which way, and its box at the scale it hangs. */
export type Placed = { at: P3; heading: number; b: Board };

/** A board hung, as a slab a new board must keep out of: 15 cm thicker each side, so none covers another. */
function slabOf({ at, heading, b }: Placed): ShellWall {
  const ux = Math.cos(heading) * b.half, uy = -Math.sin(heading) * b.half, d = (b.y0 + b.y1) / 2;
  const cx = at[0] + Math.sin(heading) * d, cy = at[1] + Math.cos(heading) * d;
  return { a: [cx - ux, cy - uy], b: [cx + ux, cy + uy], foot: [at[2] + b.z0, at[2] + b.z0], top: [at[2] + b.z1, at[2] + b.z1], thick: b.y1 - b.y0 + 0.3 };
}

/** Whether one board would cover another. */
export const boardsOverlap = (p: Placed, q: Placed) => boardInWall(p.b, p.at, p.heading, [slabOf(q)]);

/**
 * Where a sign planned at `at` facing `heading` goes (owner, 2026-11-13: signs went through walls, and
 * then went missing). With a wall within WALL_NEAR_M of its board, flat on that wall's face on the
 * sign's side, at its usual height, facing out; else hung where planned. Every spot is checked
 * against every wall; when none clears, it hangs at the nearest spot that does, smaller if it must. Never dropped.
 */
function placeSign(b: Board, rods: Board, at: P3, heading: number, all: ShellWall[], walkNear: (x: number, y: number, r: number) => P3[], placed: Placed[] = []): { at: P3; heading: number; flat: boolean; scale: number } {
  const slabs = placed.filter((q) => Math.hypot(q.at[0] - at[0], q.at[1] - at[1]) < q.b.half + b.half + 8).map(slabOf);
  const clear = (c: P3, h: number, box: Board) => !boardInWall(box, c, h, slabs);
  const r = b.half + WALL_NEAR_M;
  // Every spot tried lies within this of where the sign was planned: only these walls can reach it.
  const walls = all.filter((w) => segDist(at[0], at[1], w) < r + b.half + 3);
  const near = walls
    .map((w) => ({ w, d: segDist(at[0], at[1], w) - w.thick / 2 }))
    .filter(({ w, d }) => d < r && Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) > 0.5)
    .sort((p, q) => p.d - q.d);
  for (const { w } of near) {
    const dx = w.b[0] - w.a[0], dy = w.b[1] - w.a[1], L = Math.hypot(dx, dy);
    const tx = dx / L, ty = dy / L;
    // The face on the sign's side: the normal points from the wall's centre line toward the sign.
    const side = Math.sign((at[0] - w.a[0]) * -ty + (at[1] - w.a[1]) * tx) || 1;
    const nx = -ty * side, ny = tx * side;
    // Facing out along n: the board's front faces -(sin h, cos h).
    const h = Math.atan2(-nx, -ny);
    const off = w.thick / 2 + OFF_WALL_M - b.y0;
    const s0 = Math.min(Math.max(((at[0] - w.a[0]) * tx + (at[1] - w.a[1]) * ty), Math.min(b.half, L / 2)), Math.max(L - b.half, L / 2));
    for (const shift of [0, 0.3, -0.3, 0.6, -0.6, 1, -1, 1.5, -1.5]) {
      const s = s0 + shift;
      if (s < 0 || s > L) continue;
      const k = s / L, foot = lerp(w.foot, k), top = lerp(w.top, k);
      // At its usual height, or moved up or down to stand within the wall's (over a doorway, on its lintel).
      const z = Math.min(Math.max(at[2], foot - b.z0 + 0.02), top - b.z1 - 0.02);
      if (z + b.z0 < foot || Math.abs(z - at[2]) > 0.6) continue;
      const c: P3 = [w.a[0] + tx * s + nx * off, w.a[1] + ty * s + ny * off, z];
      // Not where a walk's doorway is cut through this wall below the board.
      const door = walkNear(c[0], c[1], b.half + 0.6).some(([x, y, pz]) => {
        const span = inWalkWay(w, x, y, pz);
        return span && span[0] < s + b.half && span[1] > s - b.half && z + b.z0 < pz + DOOR_HEAD_M + 0.05;
      });
      if (!door && !boardInWall(b, c, h, walls) && clear(c, h, b)) return { at: c, heading: h, flat: true, scale: 1 };
    }
  }
  // Hung on its rods where planned, or the nearest spot round it (out to 3 m, up to 0.8 m lower) that
  // clears every wall and every board already hung; smaller only when none does.
  for (const scale of [1, 0.75, 0.5, 0.3]) {
    const sb = { half: rods.half * scale, y0: rods.y0, y1: rods.y1, z0: rods.z0 * scale, z1: rods.z1 * scale };
    for (let r = 0; r <= 3; r += 0.5) for (let i = 0; i < (r ? 8 : 1); i++) for (const up of [0, -0.4, -0.8]) {
      const c: P3 = [at[0] + r * Math.cos((i * Math.PI) / 4), at[1] + r * Math.sin((i * Math.PI) / 4), at[2] + up];
      if (!boardInWall(sb, c, heading, walls) && clear(c, heading, sb)) return { at: c, heading, flat: false, scale };
    }
  }
  return { at, heading, flat: false, scale: 0.3 };
}

/** A sign, a lamp or a fare line already hung this close to another of its kind is the same one. */
const SAME_PLACE_M = 1.5;

/** A fare line: the model's gate panels standing side by side, the walk way through them along `run`. */
export type FareRow = { panels: Array<{ at: P3; heading: number }>; heading: number; z: number };

/** The model's gate panels in fare lines: parallel, level, and in a row across their run, 0.91 m apart. */
export function fareRows(model: DollhouseModel): FareRow[] {
  const ps = gatePanels(model);
  const left = new Set(ps.map((_, i) => i));
  const parallel = (a: number, b: number) => Math.abs(Math.sin(a - b)) < 0.2;
  const rows: FareRow[] = [];
  for (const s of ps.keys()) {
    if (!left.delete(s)) continue;
    const h = ps[s].heading, ux = Math.sin(h), uy = Math.cos(h);
    const row = [ps[s]];
    for (let grew = true; grew;) {
      grew = false;
      for (const i of left) {
        const p = ps[i];
        if (!parallel(p.heading, h) || Math.abs(p.at[2] - ps[s].at[2]) > 0.3) continue;
        if (row.some((q) => { const dx = p.at[0] - q.at[0], dy = p.at[1] - q.at[1]; return Math.abs(dx * ux + dy * uy) < 0.6 && Math.abs(dx * uy - dy * ux) < 2.2; })) {
          row.push(p); left.delete(i); grew = true;
        }
      }
    }
    // In order across the row, along (-cos h, sin h).
    row.sort((p, q) => (p.at[1] - q.at[1]) * ux - (p.at[0] - q.at[0]) * uy);
    rows.push({ panels: row, heading: h, z: ps[s].at[2] });
  }
  return rows;
}

/** The turnstile's lane, in its own frame: the walk goes along +y here, the arms across it. */
const LANE_X = -0.15;
/** A turnstile's cabinet, in its own frame, and its half width. */
const CABINET_X = 0.32, CABINET_HALF = 0.17;
/** The arms' hub leans back this far from upright, so an arm swings forward and down as it is pushed. */
const HUB_TILT = Math.PI / 4;
/** One push turns the arms a third of a turn: the next arm then stands where the last one did. */
const ARMS_TURN = (2 * Math.PI) / 3;
/** The accessible gate's leaf, and how far its lane's middle stands past the row's last panel. */
const WIDE_GATE_M = 0.9, WIDE_LANE_OUT_M = 0.55;
/** From one gate panel to the next along a fare line. */
const LANE_M = 0.91;

type Rotor = { rotor: THREE.Group; lane: P3; dir: [number, number] };

/** The wide swing gate for wheelchairs, strollers and luggage, its leaf across local x, its blue sign on the post at +x. */
function accessibleGate(): THREE.Group {
  const g = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, color: number, x: number, y: number, z: number, rx = 0) => {
    const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color }));
    m.position.set(x, y, z);
    m.rotation.x = rx;
    g.add(m);
  };
  const post = WIDE_GATE_M / 2 + 0.05;
  add(new THREE.BoxGeometry(0.12, 0.3, 1.05), 0x5b616b, post, 0, 0.525);
  add(new THREE.BoxGeometry(WIDE_GATE_M, 0.03, 0.7), 0xc7ccd3, 0, 0, 0.55);
  // The blue sign with its white wheelchair figure, on both faces.
  add(new THREE.BoxGeometry(0.3, 0.02, 0.3), 0x1d5fbf, post, 0, 1.25);
  const white = 0xffffff;
  add(new THREE.TorusGeometry(0.07, 0.014, 6, 20), white, post - 0.01, 0, 1.19, Math.PI / 2);
  add(new THREE.BoxGeometry(0.04, 0.03, 0.04), white, post - 0.03, 0, 1.36);
  add(new THREE.BoxGeometry(0.025, 0.03, 0.11), white, post - 0.03, 0, 1.27);
  add(new THREE.BoxGeometry(0.1, 0.03, 0.025), white, post + 0.01, 0, 1.22);
  g.userData.accessible = true;
  return g;
}

export type WalkDressing = {
  /** Signs, lamps and fare lines along every walk, and the train; z up, in the model's frame. */
  group: THREE.Group;
  /** The train standing at the downtown platform, doors shut; move it along `track`. */
  train: THREE.Group & { open: (f: number) => void };
  /** The way the train leaves, a unit vector in the model's x, y. */
  track: { at: P3; dir: [number, number] };
  /** The middle of every door on the platform's side: x, y and the platform's floor height. */
  doors: P3[];
  /** Where each walk goes through a fare line: the middle of its turnstile's lane, and the way through. */
  crossings: Array<{ at: P3; dir: [number, number] }>;
  /** Turns each turnstile's arms for a walker at (x, y, feet z), the same frame. */
  turnstiles: (x: number, y: number, z: number) => void;
  dispose: () => void;
};

/**
 * Everything the dollhouse hangs along its one walk, hung along every walk instead, for walking
 * the whole station: the platform and exit signs (planSigns, platformBoards), ceiling lamps and the fare lines, each
 * once where walks share it, and the train standing at the downtown platform with its doors.
 * `corner` names each exit's street corner for its Exit signs.
 */
export function walkDressing(model: DollhouseModel, corner: (exit: [number, number]) => string | null, shell?: Shell): WalkDressing {
  const group = new THREE.Group();
  const walls = shell?.walls ?? [];
  const hung: Array<{ kind: string; at: P3 }> = [];
  const fresh = (kind: string, at: P3) => {
    if (hung.some((h) => h.kind === kind && Math.hypot(h.at[0] - at[0], h.at[1] - at[1]) < SAME_PLACE_M && Math.abs(h.at[2] - at[2]) < 1)) return false;
    hung.push({ kind, at });
    return true;
  };
  // Every walk's points, 0.1 m apart, once where walks share a stretch.
  const seen = new Set<string>();
  const walkNear = pointGrid(model.walks.flatMap((w) => walkPoints(w.path, 0.1)).filter(([x, y, z]) => {
    const k = `${Math.round(x * 10)},${Math.round(y * 10)},${Math.round(z)}`;
    return !seen.has(k) && !!seen.add(k);
  }).map(([x, y, z]): P3 => [x, y, z]));
  const lampGeo = new THREE.BoxGeometry(0.12, 1.2, 0.04);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xfffbea });
  const placed: Placed[] = [];
  const plans = [...model.walks.flatMap((walk) => planSigns(model, walk, corner(walk.exit))), ...platformBoards(model)];
  for (const plan of plans) {
    const key = JSON.stringify(plan.lines);
    if (!fresh(key, plan.at)) continue;
    const flat = signMesh(plan.lines, [], plan.small, false), hung = signMesh(plan.lines, [], plan.small);
    const flatB = boardOf(flat), hungB = boardOf(hung);
    const spot = placeSign(flatB, hungB, plan.at, plan.heading, walls, walkNear, placed);
    // On a wall it is fixed flat; hung from the ceiling, on its rods.
    const sign = spot.flat ? flat : hung;
    dispose(spot.flat ? hung : flat);
    sign.position.set(...spot.at);
    sign.rotation.z = -spot.heading;
    sign.scale.setScalar(spot.scale);
    sign.userData.sign = { key, planned: plan.at };
    const box = spot.flat ? flatB : hungB, k = spot.scale;
    placed.push({ at: spot.at, heading: spot.heading, b: { half: box.half * k, y0: box.y0, y1: box.y1, z0: box.z0 * k, z1: box.z1 * k } });
    group.add(sign);
  }
  for (const walk of model.walks) {
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

  // The fare lines. Each walk goes through its own turnstile where it crosses a line; the panels'
  // turnstiles stand everywhere else, but never one with its cabinet or arms in a walk's way.
  const rotors: Rotor[] = [];
  const crossings: WalkDressing["crossings"] = [];
  /** A turnstile walked through along `heading`, its lane's middle at `lane`. */
  const putTurnstile = (lane: P3, heading: number) => {
    const t = turnstile();
    // The hub leans back: an arm across the lane swings forward and down as it is pushed.
    const tilt = new THREE.Group();
    tilt.position.copy(t.rotor.position);
    tilt.rotation.x = HUB_TILT;
    t.rotor.position.set(0, 0, 0);
    t.group.add(tilt);
    tilt.add(t.rotor);
    const ux = Math.cos(heading), uy = -Math.sin(heading);
    t.group.rotation.z = -heading;
    t.group.position.set(lane[0] - ux * LANE_X, lane[1] - uy * LANE_X, lane[2]);
    group.add(t.group);
    rotors.push({ rotor: t.rotor, lane, dir: [Math.sin(heading), Math.cos(heading)] });
  };
  /** Whether a turnstile walked along `heading` with its lane at `lane` keeps its cabinet and resting arm out of every walk. */
  const clearOfWalks = (lane: P3, heading: number) => {
    const ux = Math.cos(heading), uy = -Math.sin(heading);
    const parts: Array<[number, number]> = [[CABINET_X - LANE_X, 0.3 + CABINET_HALF]];
    for (let x = -0.33; x <= 0.17; x += 0.1) parts.push([x - LANE_X, 0.3]);
    return parts.every(([dx, r]) => walkNear(lane[0] + ux * dx, lane[1] + uy * dx, r).every((p) => Math.abs(p[2] - lane[2]) > 1.2));
  };
  const under = shell ? surfaceFinder(trisOf(shell.floors)) : null;
  const gates: P3[] = [];
  for (const row of fareRows(model)) {
    const h = row.heading, rx = Math.sin(h), ry = Math.cos(h); // the way through
    const ax = -ry, ay = rx; // across the row, the way it is sorted
    const o = row.panels[0].at;
    const acrossOf = (x: number, y: number) => (x - o[0]) * ax + (y - o[1]) * ay;
    const runOf = (x: number, y: number) => (x - o[0]) * rx + (y - o[1]) * ry;
    const run = row.panels.reduce((s, p) => s + runOf(p.at[0], p.at[1]), 0) / row.panels.length;
    const first = acrossOf(o[0], o[1]), last = acrossOf(...(row.panels[row.panels.length - 1].at.slice(0, 2) as [number, number]));
    const rowWalls = walls.filter((w) => segDist(o[0] + ax * (last / 2), o[1] + ay * (last / 2), w) < last / 2 + 3);
    const here = (c: number, r = run): P3 => [o[0] + ax * c + rx * r, o[1] + ay * c + ry * r, row.z];
    // Where each walk goes through this row.
    const through: number[] = [];
    for (const walk of model.walks) {
      const p = walk.path;
      for (let i = 1; i < p.length; i++) {
        const [a, b] = [p[i - 1], p[i]];
        if (Math.abs(a[2] - row.z) > 0.5 || Math.abs(b[2] - row.z) > 0.5) continue;
        const ra = runOf(a[0], a[1]) - run, rb = runOf(b[0], b[1]) - run;
        if (ra * rb > 0 || ra === rb) continue;
        const k = ra / (ra - rb), x = a[0] + (b[0] - a[0]) * k, y = a[1] + (b[1] - a[1]) * k;
        const c = acrossOf(x, y);
        if (c < first - 0.6 || c > last + 0.6 || through.some((t) => Math.abs(t - c) < 0.6)) continue;
        through.push(c);
        // Walked either way, its cabinet on whichever side keeps it furthest from every walk, the lane
        // shifted up to 0.18 m off the walk toward it if need be (its arms still reach across the walk).
        let best = { room: -1, way: rb > ra ? h : h + Math.PI, lane: here(c) };
        for (const shift of [0, 0.08, 0.15, 0.18]) for (const w of [best.way, best.way + Math.PI]) {
          const ux = Math.cos(w), uy = -Math.sin(w), d = shift * Math.sign(ux * ax + uy * ay);
          const lane = here(c + d), cx = lane[0] + ux * (CABINET_X - LANE_X), cy = lane[1] + uy * (CABINET_X - LANE_X);
          const room = Math.min(1, ...walkNear(cx, cy, 1).filter((q) => Math.abs(q[2] - row.z) < 1.2).map((q) => Math.hypot(q[0] - cx, q[1] - cy)));
          if (room > best.room + 0.01) best = { room, way: w, lane };
          if (room >= 0.3 + CABINET_HALF) break;
        }
        const { way, lane } = best;
        putTurnstile(lane, way);
        crossings.push({ at: lane, dir: [Math.sin(way), Math.cos(way)] });
      }
    }
    // The accessible gate: a wide lane past one end of the row or, where the row runs wall to wall,
    // in the lane nearest an end that has room. Never in a walk's way, a wall, or over a gap in the floor.
    const busy = (c0: number, c1: number) => through.some((t) => t + 0.65 > c0 && t - 0.65 < c1);
    // `half`: how far across the lane to check, past its leaf outside the row, inside its panels within.
    const fits = (c: number, half: number) => {
      const [gx, gy] = here(c);
      // Two fare lines meeting at a corner: one gate there, the other line's at its other end.
      if (busy(c - WIDE_GATE_M / 2, c + WIDE_GATE_M / 2) || gates.some((g) => Math.hypot(g[0] - gx, g[1] - gy) < 1.1 && Math.abs(g[2] - row.z) < 1)) return false;
      for (let s = -half; s <= half + 0.01; s += 0.1) for (const r of [-0.2, 0, 0.2]) {
        const [x, y, z] = here(c + s, run + r);
        if (walkNear(x, y, 0.45).some((q) => Math.abs(q[2] - z) < 1.2)) return false;
        if (rowWalls.some((w) => inWall(w, x, y, z + 0.5, 0.05) || inWall(w, x, y, z + 1.2, 0.05))) return false;
        if (under && !under(x, y, 0.02).some((f) => Math.abs(f - z) < 0.3)) return false;
      }
      return true;
    };
    const spots: Array<[number, number]> = [[last + WIDE_LANE_OUT_M, 0.55], [first - WIDE_LANE_OUT_M, 0.55]];
    // Failing both ends, the lanes nearest them, working in.
    for (let i = 0; i < row.panels.length - 1; i++) spots.push([last - (i + 0.5) * LANE_M, 0.3], [first + (i + 0.5) * LANE_M, 0.3]);
    const wide = spots.find(([c, half]) => fits(c, half))?.[0];
    if (wide != null) {
      const gate = accessibleGate();
      const at = here(wide);
      gate.position.set(...at);
      // Its post on the side away from the row's middle.
      gate.rotation.z = -h + (wide > (first + last) / 2 ? Math.PI : 0);
      group.add(gate);
      gates.push(at);
    }
    // The panels' own turnstiles, each with its cabinet on the panel and its arms across the lane
    // beside it, unless that lane is a walk's way through (it has its own), the accessible gate's, or
    // a walk brushes them.
    const cab = CABINET_X - LANE_X;
    for (const p of row.panels) {
      const c = acrossOf(p.at[0], p.at[1]);
      // The last panel's lane would open past the row's end, against its wall.
      if (c + cab > last || busy(c - CABINET_HALF, c + cab + 0.2) || (wide != null && Math.abs(c + cab - wide) < 0.5)) continue;
      const lane: P3 = [p.at[0] + ax * cab, p.at[1] + ay * cab, p.at[2]];
      if (clearOfWalks(lane, h)) putTurnstile(lane, h);
    }
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
    group, train, doors, crossings,
    track: { at, dir },
    turnstiles: (x, y, z) => {
      for (const { rotor, lane, dir: [fx, fy] } of rotors) {
        // A third of a turn while the walker goes through the lane, by how far through it is: the
        // arms come to rest a third round, which looks the same as where they started.
        const dx = x - lane[0], dy = y - lane[1], ahead = dx * fx + dy * fy, aside = dy * fx - dx * fy;
        const k = Math.abs(z - lane[2]) < 1 && Math.abs(aside) < 0.45 ? Math.min(1, Math.max(0, (ahead + 0.35) / 0.7)) : 0;
        rotor.rotation.y = -ARMS_TURN * k * k * (3 - 2 * k);
      }
    },
    dispose: () => dispose(group),
  };
}

function trisOf(list: number[]): Array<[P3, P3, P3]> {
  const out: Array<[P3, P3, P3]> = [];
  for (let i = 0; i < list.length; i += 9) out.push([[list[i], list[i + 1], list[i + 2]], [list[i + 3], list[i + 4], list[i + 5]], [list[i + 6], list[i + 7], list[i + 8]]]);
  return out;
}
