/**
 * Bakes Fulton St's walls and ceilings for the first-person walk into public/transit/fulton-shell.json
 * (#126). The walk used to stand a wall along every floor edge, and where floors, stairs and ramps met
 * those walls crossed, left gaps or stood in the way. Here the space a person walks through is built
 * as one solid instead: every floor, stair and ramp triangle is pushed up 3 m into a block, grown a few
 * centimetres so neighbours overlap, and all the blocks are merged exactly by manifold-3d. The inside
 * of that solid is the station: its sides are the walls, its top the ceiling. Floors are dropped (the
 * model draws its own), and so are walls along the platform edges, which stay open to the track.
 *
 *   pnpm build:station-shell
 *
 * Reads public/transit/fulton-model.json. Output is committed; rerun when that model changes.
 * Writes triangles in the model's frame (z up): { walls: number[], ceiling: number[] }.
 */
import { readFileSync, writeFileSync } from "node:fs";
import Module from "manifold-3d";
import type { DollhouseModel } from "../src/lib/map/three/dollhouse";
import { stationShell } from "../src/lib/map/three/stationShell";

const SRC = "public/transit/fulton-model.json", OUT = "public/transit/fulton-shell.json";
/** How tall each block is: the station's ceiling height over its floors. */
const H = 3;
/** How far each block grows sideways, so neighbouring blocks overlap and merge. */
const GROW = 0.03;
/** A wall this close to a platform edge is over the track, and is left open. */
const TRACK_M = 0.6;

const model = JSON.parse(readFileSync(SRC, "utf8")) as DollhouseModel;
const shell = stationShell(model);
const wasm = await Module();
wasm.setup();
const { Manifold } = wasm;

const blocks = [];
for (const tris of [shell.floors, shell.stairs, shell.bridges]) {
  for (let i = 0; i < tris.length; i += 9) {
    const t = tris.slice(i, i + 9);
    if (Math.abs((t[3] - t[0]) * (t[7] - t[1]) - (t[4] - t[1]) * (t[6] - t[0])) < 1e-4) continue;
    const pts: Array<[number, number, number]> = [];
    for (let k = 0; k < 3; k++) {
      const [x, y, z] = t.slice(k * 3, k * 3 + 3);
      for (const [dx, dy] of [[GROW, 0], [-GROW, 0], [0, GROW], [0, -GROW]]) pts.push([x + dx, y + dy, z - 0.05], [x + dx, y + dy, z + H]);
    }
    blocks.push(Manifold.hull(pts));
  }
}
const solid = Manifold.union(blocks).simplify(0.005);
const mesh = solid.getMesh();
const P = mesh.vertProperties, n = mesh.numProp, T = mesh.triVerts;

const nearTrack = (x: number, y: number, z: number) => model.edges.some(([x1, y1, x2, y2, ez]) => {
  if (!(z > ez - TRACK_M && z < ez + H + 0.3)) return false;
  const dx = x2 - x1, dy = y2 - y1, L2 = dx * dx + dy * dy || 1e-9;
  const k = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / L2));
  return Math.hypot(x - (x1 + dx * k), y - (y1 + dy * k)) < TRACK_M;
});

const walls: number[] = [], ceiling: number[] = [];
const r3 = (x: number) => Math.round(x * 1000) / 1000;
for (let i = 0; i < T.length; i += 3) {
  const v = [0, 1, 2].map((k) => [P[T[i + k] * n], P[T[i + k] * n + 1], P[T[i + k] * n + 2]]);
  const u = v[1].map((c, j) => c - v[0][j]), w = v[2].map((c, j) => c - v[0][j]);
  const nx = u[1] * w[2] - u[2] * w[1], ny = u[2] * w[0] - u[0] * w[2], nz = u[0] * w[1] - u[1] * w[0];
  const len = Math.hypot(nx, ny, nz);
  if (!len) continue;
  const up = nz / len; // the solid's outward normal
  if (up < -0.6) continue; // a floor
  // Turned (0, 2, 1) to face into the space a person walks in.
  const tri = [...v[0], ...v[2], ...v[1]].map(r3);
  if (up > 0.6) {
    // Kept only while it still faces down after rounding, so it is never seen as a slab from above.
    if ((tri[3] - tri[0]) * (tri[7] - tri[1]) - (tri[4] - tri[1]) * (tri[6] - tri[0]) < 0) ceiling.push(...tri);
    continue;
  }
  const c = [0, 1, 2].map((j) => (v[0][j] + v[1][j] + v[2][j]) / 3);
  if (nearTrack(c[0], c[1], c[2])) continue;
  walls.push(...tri);
}
writeFileSync(OUT, JSON.stringify({ walls, ceiling }));
console.log(`${OUT}: ${walls.length / 9} wall and ${ceiling.length / 9} ceiling triangles`);
