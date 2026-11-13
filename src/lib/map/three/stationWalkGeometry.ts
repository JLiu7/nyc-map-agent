/**
 * Fulton St drawn and collided from the same shapes (#126): the model's floors and stairs, the
 * shell's walls, ramps and ceiling (stationShell.ts), turned from the model's frame (metres, x east,
 * y north, z up) into three.js's (y up) so the walk scene and Rapier share one set of triangles.
 */
import type { DollhouseModel } from "./dollhouse";
import { cutWall, FLAT_NZ, inWalkWay, isGatePanel, stationShell, surfaceFinder, walkPoints, wallTriangles, WALK_CLEAR_M, type Shell, type ShellWall } from "./stationShell";

type P3 = [number, number, number];

/** Positions (y up) and texture coordinates, three corners per triangle. */
export type Surface = { position: Float32Array; uv: Float32Array };

export type WalkGeometry = {
  floors: Surface;
  stairs: Surface;
  walls: Surface;
  ceiling: Surface;
  /**
   * Everything a body stands on or bumps into, one indexed mesh per part (floors, ramps, walls, the
   * model's uprights, rails) for Rapier trimeshes, in three.js's frame. It is what is drawn, except
   * along the walks (see walkCollider), where nothing stands in a walk's way.
   */
  colliders: Array<{ vertices: Float32Array; indices: Uint32Array }>;
  /** The lowest floor (y): falling well below it means the figure left the station. */
  lowest: number;
};

/** Model frame (z up) to three.js (y up): a rotation, so triangles keep their winding. */
export const toYUp = (x: number, y: number, z: number): P3 => [x, z, -y];

/** Height of one step: stair textures put a stripe per rise. */
const STEP_RISE_M = 0.178;
/** Invisible rails stand this far either side of a walk where a wall was cleared out of its way. */
const RAIL_M = 0.6;
/** An invisible ramp under every walk, this wide each side of it, so the body never catches on a seam or a lip. */
const RIBBON_HALF_M = 0.5;
/**
 * Rise over run: a ramp is never steeper than this (50 degrees). The walk's line cuts some stairs short,
 * so it is steeper than the stair under it; the body climbs up to 63 degrees (slopeMaxAngle 1.1).
 */
const MAX_RAMP_SLOPE = 1.2;
/** A rise this tall and steeper than a stair is a lift, not something to walk: no ramp spans it. */
const LIFT_RISE_M = 1.5;
/** How much of a walk's street end stays walled (the street is outside the model). */
const STREET_END_M = 0.6;

/** Floors repeat their concrete every 1.5 m, walls their tiles every 3 m. */
const FLOOR_TILE_M = 1.5;
const WALL_TILE_M = 3;

function surface(tris: number[], uvOf: (x: number, y: number, z: number, t: number[]) => [number, number]): Surface {
  const position = new Float32Array(tris.length), uv = new Float32Array((tris.length / 3) * 2);
  for (let i = 0; i < tris.length; i += 9) {
    const t = tris.slice(i, i + 9);
    for (let k = 0; k < 3; k++) {
      const [x, y, z] = [t[k * 3], t[k * 3 + 1], t[k * 3 + 2]];
      position.set(toYUp(x, y, z), i + k * 3);
      uv.set(uvOf(x, y, z, t), ((i + k * 3) / 3) * 2);
    }
  }
  return { position, uv };
}

/** Tiles on an upright triangle: along its face, and up from z = 0 so rows line up from wall to wall. */
function uprightUv(x: number, y: number, z: number, t: number[]): [number, number] {
  const ux = t[3] - t[0], uy = t[4] - t[1], wx = t[6] - t[0], wy = t[7] - t[1];
  // The face's horizontal direction: the longer of its two edges from the first corner, flattened.
  const [dx, dy] = Math.hypot(ux, uy) >= Math.hypot(wx, wy) ? [ux, uy] : [wx, wy];
  const L = Math.hypot(dx, dy) || 1;
  return [(x * dx + y * dy) / L / WALL_TILE_M, z / WALL_TILE_M];
}

/**
 * Rapier's trimesh flags FIX_INTERNAL_EDGES and MERGE_DUPLICATE_VERTICES (the first includes ORIENTED):
 * the seams between triangles do not catch the body. A number, so this file needs no physics engine.
 */
export const SMOOTH_SEAMS = 144;

export function walkGeometry(model: DollhouseModel, shell: Shell = stationShell(model)): WalkGeometry {
  // Most of the model's uprights are its fare gates' panels. Drawn as wall they read as broken shards
  // (owner, 2026-11-13), so the walk draws turnstiles there instead and leaves the panels out; they
  // still stand in the collider.
  const wallTris: number[] = [];
  for (let i = 0; i < shell.uprights.length; i += 9) {
    const t = shell.uprights.slice(i, i + 9);
    if (!isGatePanel(t)) wallTris.push(...t);
  }
  for (const w of shell.walls) wallTris.push(...wallTriangles(w));
  // A bridge that slopes is a ramp laid where the model left out a stair's foot: drawn as treads, not
  // as a slab of floor lying across the stair (owner, 2026-11-13).
  const flatBridges: number[] = [], slopedBridges: number[] = [];
  for (let i = 0; i < shell.bridges.length; i += 9) {
    const t = shell.bridges.slice(i, i + 9);
    const u = [t[3] - t[0], t[4] - t[1], t[5] - t[2]], v = [t[6] - t[0], t[7] - t[1], t[8] - t[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const len = Math.hypot(n[0], n[1], n[2]);
    (len > 0 && Math.abs(n[2]) / len < FLAT_NZ ? slopedBridges : flatBridges).push(...t);
  }
  const floors = surface([...shell.floors, ...flatBridges], (x, y) => [x / FLOOR_TILE_M, y / FLOOR_TILE_M]);
  const stairs = surface([...shell.stairs, ...slopedBridges], (x, y, z) => [(x + y) / 2, z / STEP_RISE_M]);
  const walls = surface(wallTris, uprightUv);
  const ceiling = surface(shell.ceiling, (x, y) => [x / WALL_TILE_M, y / WALL_TILE_M]);

  // One collider per part: Rapier smooths the seams inside each mesh by its edges, and a ramp laid over
  // a floor in the same mesh confuses that and catches the body.
  const colliders = Object.values(walkCollider(model, shell)).filter((t) => t.length).map((solid) => {
    const vertices = new Float32Array(solid.length);
    for (let i = 0; i < solid.length; i += 3) vertices.set(toYUp(solid[i], solid[i + 1], solid[i + 2]), i);
    const indices = new Uint32Array(solid.length / 3);
    for (let i = 0; i < indices.length; i++) indices[i] = i;
    return { vertices, indices };
  });

  let lowest = Infinity;
  for (let i = 2; i < shell.floors.length; i += 3) lowest = Math.min(lowest, shell.floors[i]);
  return { floors, stairs, walls, ceiling, colliders, lowest };
}

/**
 * What the body collides with (model frame, nine numbers per triangle). The drawn station's walls sit
 * on the model's floor edges, and the model's walks run close by them: a wall's end pokes into a turn,
 * two walls meet on the walk, a stair's side wall stands across its foot. A body 0.6 m wide catches on
 * those and stops. So along every walk, any part of a wall within WALK_CLEAR_M of the walk's line is
 * left out of the collider (it is still drawn). Where that wall stood, an invisible rail RAIL_M from the
 * walk keeps the body from stepping off where the wall guarded a drop, and an invisible ramp under each
 * walk carries it over seams and lips between the model's floors and stairs.
 */
export function walkCollider(model: DollhouseModel, shell: Shell): Record<"ground" | "walls" | "uprights" | "rails" | "ramps", number[]> {
  const ground: number[] = [...shell.floors, ...shell.bridges, ...shell.stairs];
  const wallsOut: number[] = [], uprights: number[] = [], rails: number[] = [], ramps: number[] = [];
  // Every 0.1 m along each walk but its street end (the street is outside, behind a wall).
  const walks = model.walks.map((w) => {
    const end = w.path[w.path.length - 1];
    return walkPoints(w.path, 0.1).filter(([x, y]) => Math.hypot(x - end[0], y - end[1]) > STREET_END_M);
  });
  const cuts = new Map<ShellWall, Array<[number, number, number]>>();
  // For each walk point, which sides (+1 left, -1 right) lost a wall.
  const sides = walks.map((pts) => pts.map(() => new Set<number>()));
  walks.forEach((pts, wi) => pts.forEach(([x, y, z, ux, uy], i) => {
    for (const w of shell.walls) {
      const span = inWalkWay(w, x, y, z);
      if (!span) continue;
      (cuts.get(w) ?? cuts.set(w, []).get(w)!).push([span[0], span[1], z]);
      // Which side of the walk the wall stood on: its nearest point, across the walk's heading.
      const dx = w.b[0] - w.a[0], dy = w.b[1] - w.a[1], L = Math.hypot(dx, dy);
      const s = Math.max(0, Math.min(L, ((x - w.a[0]) * dx + (y - w.a[1]) * dy) / L));
      const across = (w.a[0] + (dx * s) / L - x) * -uy + (w.a[1] + (dy * s) / L - y) * ux;
      if (Math.abs(across) < 0.1) { sides[wi][i].add(1); sides[wi][i].add(-1); } else sides[wi][i].add(Math.sign(across));
    }
  }));
  // Lintels stay out: they sit over doorways at head height above the walk's line, and where a walk
  // starts down a stair the floor under the body is higher than that line, so a head would hit them.

  // The model's own upright pieces (a stair's side, a column): one in a walk's way is left out whole.
  const cell = (x: number, y: number) => `${Math.floor(x)},${Math.floor(y)}`;
  const near = new Map<string, Array<[number, number]>>();
  walks.forEach((pts, wi) => pts.forEach(([x, y], i) => (near.get(cell(x, y)) ?? near.set(cell(x, y), []).get(cell(x, y))!).push([wi, i])));
  const u = shell.uprights;
  for (let t = 0; t < u.length; t += 9) {
    // Its footprint: the two corners farthest apart in plan.
    const c = [0, 3, 6].map((k): [number, number, number] => [u[t + k], u[t + k + 1], u[t + k + 2]]);
    const pairs: Array<[number, number]> = [[0, 1], [1, 2], [0, 2]];
    const [i0, i1] = pairs.reduce((m, q) => (Math.hypot(c[q[0]][0] - c[q[1]][0], c[q[0]][1] - c[q[1]][1]) > Math.hypot(c[m[0]][0] - c[m[1]][0], c[m[0]][1] - c[m[1]][1]) ? q : m));
    const a = c[i0], b = c[i1], zLo = Math.min(c[0][2], c[1][2], c[2][2]), zHi = Math.max(c[0][2], c[1][2], c[2][2]);
    const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1e-9;
    let inWay = false;
    for (let gx = Math.floor(Math.min(a[0], b[0]) - 1); gx <= Math.floor(Math.max(a[0], b[0]) + 1); gx++) {
      for (let gy = Math.floor(Math.min(a[1], b[1]) - 1); gy <= Math.floor(Math.max(a[1], b[1]) + 1); gy++) {
        for (const [wi, i] of near.get(`${gx},${gy}`) ?? []) {
          const [x, y, z, ux, uy] = walks[wi][i];
          if (zHi < z + 0.3 || zLo > z + 1.8) continue;
          const k = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / L2));
          const px = a[0] + dx * k, py = a[1] + dy * k;
          if (Math.hypot(x - px, y - py) >= WALK_CLEAR_M) continue;
          inWay = true;
          const across = (px - x) * -uy + (py - y) * ux;
          if (Math.abs(across) < 0.1) { sides[wi][i].add(1); sides[wi][i].add(-1); } else sides[wi][i].add(Math.sign(across));
        }
      }
    }
    if (!inWay) uprights.push(...u.slice(t, t + 9));
  }

  // Rails: only where the cleared piece guarded a drop (no floor near the walk's height beside it), and
  // never across any walk (a turn's inside, a crossing walk).
  const tri = (a: number[]) => { const o: Array<[P3, P3, P3]> = []; for (let i = 0; i < a.length; i += 9) o.push([[a[i], a[i + 1], a[i + 2]], [a[i + 3], a[i + 4], a[i + 5]], [a[i + 6], a[i + 7], a[i + 8]]]); return o; };
  const under = surfaceFinder(tri(ground));
  // A wall that stops short of the floor beside it (a stair's side wall over the corridor next to the
  // stair) leaves a slot the body slips half under and wedges in. Each piece comes down to that floor,
  // half a metre at a time, unless the longer piece would stand in a walk's way.
  const newlyInWay = (was: ShellWall, now: ShellWall) => {
    const xs = [now.a[0], now.b[0]], ys = [now.a[1], now.b[1]];
    for (let gx = Math.floor(Math.min(...xs) - 1); gx <= Math.floor(Math.max(...xs) + 1); gx++)
      for (let gy = Math.floor(Math.min(...ys) - 1); gy <= Math.floor(Math.max(...ys) + 1); gy++)
        for (const [wi, i] of near.get(`${gx},${gy}`) ?? []) {
          const [x, y, z] = walks[wi][i];
          if (inWalkWay(now, x, y, z) && !inWalkWay(was, x, y, z)) return true;
        }
    return false;
  };
  for (const w of shell.walls) {
    if (w.door === "lintel") continue;
    for (const piece of (cuts.has(w) ? cutWall(w, cuts.get(w)!) : [w]).filter((p) => p.door !== "lintel"))
      for (const seg of downToFloor(piece, under)) wallsOut.push(...wallTriangles(newlyInWay(seg.was, seg.now) ? seg.was : seg.now));
  }
  const drop = (x: number, y: number, z: number) => !under(x, y).some((h) => Math.abs(h - z) < 0.5);
  const steps = model.walks.flatMap((w) => w.path.slice(1).map((q, i) => [w.path[i], q] as const));
  const clearOfWalks = (x: number, y: number, z: number) => !steps.some(([a, b]) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1e-9;
    const k = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / L2));
    return Math.abs(a[2] + (b[2] - a[2]) * k - z) < 1.5 && Math.hypot(x - a[0] - dx * k, y - a[1] - dy * k) < RAIL_M - 0.1;
  });
  walks.forEach((pts, wi) => {
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1], q = pts[i];
      if (Math.hypot(q[0] - p[0], q[1] - p[1]) > 0.3) continue;
      for (const sgn of [1, -1]) {
        if (!sides[wi][i - 1].has(sgn) && !sides[wi][i].has(sgn)) continue;
        const a: [number, number] = [p[0] - p[4] * sgn * RAIL_M, p[1] + p[3] * sgn * RAIL_M];
        const b: [number, number] = [q[0] - q[4] * sgn * RAIL_M, q[1] + q[3] * sgn * RAIL_M];
        if (!clearOfWalks(a[0], a[1], p[2]) || !clearOfWalks(b[0], b[1], q[2])) continue;
        const m: [number, number] = [p[0] - p[4] * sgn * 0.4, p[1] + p[3] * sgn * 0.4];
        if (!drop(a[0], a[1], p[2]) && !drop(m[0], m[1], p[2])) continue;
        rails.push(...wallTriangles({ a, b, foot: [p[2] - 0.3, q[2] - 0.3], top: [p[2] + 2, q[2] + 2], thick: 0.1 }));
      }
    }
  });

  // Ramps under the walks. Their height follows the walk's line, raised just enough that no stretch is
  // steeper than MAX_RAMP_SLOPE, so a kink in the line (the top of a stair it cuts short) becomes a
  // slope the body climbs, never a step it catches on. A rise far steeper and
  // taller than a stair (a lift) splits the walk: no ramp spans it.
  const cut: number[] = [];
  model.walks.forEach((w, wi) => {
    const ramp: number[] = [], ends: number[] = [];
    const profile = rampProfile(w.path);
    for (const { pts, s } of profile.pieces) {
      const z = s.map((d) => profile.at(d) - 0.03);
      const slope = (i: number) => Math.abs(z[i + 1] - z[i]) / Math.max(1e-6, s[i + 1] - s[i]);
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i], L = s[i] - s[i - 1];
        const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L, nx = -uy * RIBBON_HALF_M, ny = ux * RIBBON_HALF_M;
        const quad = (p: P3, q: P3, to = ramp) => {
          to.push(p[0] + nx, p[1] + ny, p[2], q[0] + nx, q[1] + ny, q[2], q[0] - nx, q[1] - ny, q[2]);
          to.push(p[0] + nx, p[1] + ny, p[2], q[0] - nx, q[1] - ny, q[2], p[0] - nx, p[1] - ny, p[2]);
        };
        const a0: P3 = [a[0], a[1], z[i - 1]], b0: P3 = [b[0], b[1], z[i]];
        quad(a0, b0);
        // Past each end, 0.5 m sloping down from it (as steep as either stretch at a turn), so turns stay
        // covered and no overhang stands proud of the next stretch.
        const dropA = Math.max(slope(i - 1), i >= 2 ? slope(i - 2) : 0) * 0.5 + 0.03;
        const dropB = Math.max(slope(i - 1), i < pts.length - 1 ? slope(i) : 0) * 0.5 + 0.03;
        quad([a[0] - ux * 0.5, a[1] - uy * 0.5, z[i - 1] - dropA], a0, ends);
        quad(b0, [b[0] + ux * 0.5, b[1] + uy * 0.5, z[i] - dropB], ends);
      }
    }
    // A walk's ramp is cut only where it hangs over the same walk (one leg of a hairpin over the other).
    // Walks side by side down one stair run at slightly different heights; cutting one's ramp for the
    // other's would hole both. The overhangs are cut closer: at a hairpin, the next stretch's overhang
    // runs back over the stretch being climbed, just above it.
    for (const v of clearHeadroom(ramp, walks, near, cell, wi, undefined, cut)) ramps.push(v);
    for (const v of clearHeadroom(ends, walks, near, cell, wi, 0.1, cut)) ramps.push(v);
  });
  // The model's stairs are cut closer: one crossing a walk's own flight at an angle stands just over
  // it, low enough to catch the front of a body climbing, while floors and flights under the walk stay.
  const flat = clearHeadroom([...shell.floors, ...shell.bridges], walks, near, cell, undefined, undefined, cut);
  const stairsCut = clearHeadroom(shell.stairs, walks, near, cell, undefined, 0.1, cut);
  const cleared: number[] = [];
  for (const v of flat) cleared.push(v);
  for (const v of stairsCut) cleared.push(v);
  // Cutting never opens a hole: a piece cut out comes back unless something kept is under it to stand
  // on (within 2 m below, the walk it was cut for).
  const kept = surfaceFinder(tri([...cleared, ...ramps]));
  for (let i = 0; i < cut.length; i += 9) {
    const cx = (cut[i] + cut[i + 3] + cut[i + 6]) / 3, cy = (cut[i + 1] + cut[i + 4] + cut[i + 7]) / 3, cz = (cut[i + 2] + cut[i + 5] + cut[i + 8]) / 3;
    if (kept(cx, cy).some((h) => h < cz - 0.05 && h > cz - 3)) continue;
    for (let k = 0; k < 9; k++) cleared.push(cut[i + k]);
  }
  return { ground: faceUp(cleared), walls: wallsOut, uprights, rails, ramps: faceUp(ramps) };
}

/** Nothing stands over a walk's line from the body's rounded bottom up to this far above it (the body is 1.85 m tall, and the line runs below a stair it cuts short). */
const HEAD_HI_M = 2.3;
/** Floors, stairs and ramps within this of a walk's line in plan count as over it: the body's radius and a margin. */
const HEAD_REACH_M = 0.4;
/**
 * How high over the walk's line a surface d metres from it in plan may stand before the body hits
 * it: the body floats 0.25 m up on a rounded bottom of radius 0.3. A slope as steep as any ramp (1.5)
 * stays under this, so nothing the body stands on counts as over it.
 */
const underBody = (d: number) => (d < 0.3 ? 0.25 + 0.3 - Math.sqrt(0.09 - d * d) : 0.55 + (d - 0.3) * 1.5);

/**
 * Cuts out of the floors, stairs and ramps every piece over a walk at head height. In places the
 * model's floor runs on over the stairwell below it, a slab at head height over the stair, and at a
 * hairpin one leg's ramp hangs over the other's: the body wedges under them and cannot move. A
 * triangle near a walk is split until its pieces are small, and the pieces over the walk are left out.
 */
/** Lengths of at most half a metre of wall `w`, each with (`now`) its foot brought down to the highest floor within 2.2 m under it beside it, and (`was`) as it stood. */
function downToFloor(w: ShellWall, floorAt: (x: number, y: number) => number[]): Array<{ was: ShellWall; now: ShellWall }> {
  const dx = w.b[0] - w.a[0], dy = w.b[1] - w.a[1], L = Math.hypot(dx, dy);
  if (L < 1e-6) return [{ was: w, now: w }];
  const n = Math.ceil(L / 0.5), nx = -dy / L, ny = dx / L, off = w.thick / 2 + 0.15;
  const at = (v: [number, number], k: number) => v[0] + (v[1] - v[0]) * k;
  const out: Array<{ was: ShellWall; now: ShellWall }> = [];
  for (let i = 0; i < n; i++) {
    const k0 = i / n, k1 = (i + 1) / n;
    const was: ShellWall = { ...w, a: [w.a[0] + dx * k0, w.a[1] + dy * k0], b: [w.a[0] + dx * k1, w.a[1] + dy * k1], foot: [at(w.foot, k0), at(w.foot, k1)], top: [at(w.top, k0), at(w.top, k1)] };
    const lo = Math.min(...was.foot);
    let g = -Infinity;
    for (const k of [0.1, 0.5, 0.9]) for (const side of [off, -off]) {
      const x = was.a[0] + (was.b[0] - was.a[0]) * k + nx * side, y = was.a[1] + (was.b[1] - was.a[1]) * k + ny * side;
      for (const h of floorAt(x, y)) if (h < lo - 0.1 && h > lo - 2.2 && h > g) g = h;
    }
    out.push({ was, now: g === -Infinity ? was : { ...was, foot: [Math.min(was.foot[0], g - 0.05), Math.min(was.foot[1], g - 0.05)] } });
  }
  return out;
}

function clearHeadroom(ground: number[], walks: ReadonlyArray<ReadonlyArray<readonly number[]>>, near: Map<string, Array<[number, number]>>, cell: (x: number, y: number) => string, only?: number, clear?: number, cutOut?: number[]): number[] {
  const out: number[] = [];
  const over = (t: number[], small: boolean) => {
    const xs = [t[0], t[3], t[6]], ys = [t[1], t[4], t[7]], zs = [t[2], t[5], t[8]];
    const zLo = Math.min(...zs), zHi = Math.max(...zs);
    for (let gx = Math.floor(Math.min(...xs) - HEAD_REACH_M); gx <= Math.floor(Math.max(...xs) + HEAD_REACH_M); gx++) {
      for (let gy = Math.floor(Math.min(...ys) - HEAD_REACH_M); gy <= Math.floor(Math.max(...ys) + HEAD_REACH_M); gy++) {
        for (const [wi, i] of near.get(cell(gx, gy)) ?? []) {
          if (only !== undefined && wi !== only) continue;
          const [x, y, z] = walks[wi][i];
          if (zHi <= z + (clear ?? 0.25) || zLo >= z + HEAD_HI_M) continue;
          const [d, h] = planNearest(x, y, t);
          if (d >= HEAD_REACH_M) continue;
          // A big triangle is split wherever it could be over the walk; a small piece goes only if it is.
          if (!small || (h > z + (clear ?? underBody(d)) && h < z + HEAD_HI_M)) return true;
        }
      }
    }
    return false;
  };
  const visit = (t: number[], depth: number) => {
    const small = depth >= 7 || Math.max(Math.hypot(t[3] - t[0], t[4] - t[1]), Math.hypot(t[6] - t[3], t[7] - t[4]), Math.hypot(t[0] - t[6], t[1] - t[7])) < 0.25;
    if (!over(t, small)) { out.push(...t); return; }
    if (small) { if (cutOut) for (const v of t) cutOut.push(v); return; }
    const m = (a: number, b: number) => [0, 1, 2].map((k) => (t[a + k] + t[b + k]) / 2);
    const A = t.slice(0, 3), B = t.slice(3, 6), C = t.slice(6, 9), ab = m(0, 3), bc = m(3, 6), ca = m(6, 0);
    for (const q of [[...A, ...ab, ...ca], [...ab, ...B, ...bc], [...ca, ...bc, ...C], [...ab, ...bc, ...ca]]) visit(q, depth + 1);
  };
  for (let i = 0; i < ground.length; i += 9) visit(ground.slice(i, i + 9), 0);
  return out;
}

/** The point of triangle t nearest (x, y) in plan: how far it is (0 inside) and how high the triangle is there. */
function planNearest(x: number, y: number, t: number[]): [number, number] {
  const c = (i: number, j: number) => (t[j] - t[i]) * (y - t[i + 1]) - (t[j + 1] - t[i + 1]) * (x - t[i]);
  const d1 = c(0, 3), d2 = c(3, 6), d3 = c(6, 0), area = d1 + d2 + d3;
  if (Math.abs(area) > 1e-9 && ((d1 >= 0 && d2 >= 0 && d3 >= 0) || (d1 <= 0 && d2 <= 0 && d3 <= 0))) {
    // d2 weighs the corner opposite edge 3-6 (corner 0), and so on.
    return [0, (d2 * t[2] + d3 * t[5] + d1 * t[8]) / area];
  }
  let best: [number, number] = [Infinity, 0];
  for (const [i, j] of [[0, 3], [3, 6], [6, 0]]) {
    const dx = t[j] - t[i], dy = t[j + 1] - t[i + 1], L2 = dx * dx + dy * dy || 1e-9;
    const k = Math.max(0, Math.min(1, ((x - t[i]) * dx + (y - t[i + 1]) * dy) / L2));
    const d = Math.hypot(x - t[i] - dx * k, y - t[i + 1] - dy * k);
    if (d < best[0]) best = [d, t[i + 2] + (t[j + 2] - t[i + 2]) * k];
  }
  return best;
}


/**
 * Turns every triangle to face up. The physics engine fixes internal edges by each triangle's facing,
 * and a floor wound face-down pushes the body into it instead of holding it up: it sticks there.
 */
function faceUp(t: number[]): number[] {
  for (let i = 0; i < t.length; i += 9) {
    const ax = t[i + 3] - t[i], ay = t[i + 4] - t[i + 1], bx = t[i + 6] - t[i], by = t[i + 7] - t[i + 1];
    if (ax * by - ay * bx >= 0) continue;
    for (let k = 0; k < 3; k++) [t[i + 3 + k], t[i + 6 + k]] = [t[i + 6 + k], t[i + 3 + k]];
  }
  return t;
}

/**
 * The height of the ramp under a walk, by distance along it in plan: the walk's line raised just
 * enough that no stretch is steeper than MAX_RAMP_SLOPE. A rise far steeper and taller than a stair (a
 * lift) splits the walk into pieces no ramp spans; there it gives the line's own height.
 */
export function rampProfile(path: P3[]): { pieces: Array<{ pts: P3[]; s: number[] }>; at: (d: number) => number } {
  const pieces: Array<{ pts: P3[]; s: number[] }> = [];
  let cur: { pts: P3[]; s: number[] } = { pts: [path[0]], s: [0] };
  let run = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    run += L;
    if (Math.abs(b[2] - a[2]) > LIFT_RISE_M && Math.abs(b[2] - a[2]) > L * MAX_RAMP_SLOPE) {
      pieces.push(cur);
      cur = { pts: [b], s: [run] };
    } else if (L > 1e-6) { cur.pts.push(b); cur.s.push(run); }
  }
  pieces.push(cur);
  const at = (d: number) => {
    for (const p of pieces) {
      if (p.pts.length < 2 || d < p.s[0] - 1e-6 || d > p.s[p.s.length - 1] + 1e-6) continue;
      return Math.max(...p.pts.map((q, j) => q[2] - MAX_RAMP_SLOPE * Math.abs(d - p.s[j])));
    }
    // In a lift's gap: the line's own height.
    let r = 0;
    for (let i = 1; i < path.length; i++) {
      const L = Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
      if (d <= r + L) return path[i - 1][2] + (path[i][2] - path[i - 1][2]) * (L > 1e-6 ? (d - r) / L : 1);
      r += L;
    }
    return path[path.length - 1][2];
  };
  return { pieces: pieces.filter((p) => p.pts.length >= 2), at };
}
