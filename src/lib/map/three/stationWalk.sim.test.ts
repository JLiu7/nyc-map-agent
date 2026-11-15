/**
 * Walks every one of Fulton St's walks, both ways, with Rapier's character controller on the walk's
 * collider (#126): nowhere along a walk does the body stop, fall out of the station or get wedged.
 * The controller stands in for ecctrl: it floats 0.25 m over the floor on a ray, as ecctrl does, and
 * rides over a lip of 0.1 m, as ecctrl's floating capsule does.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import RAPIER from "@dimforge/rapier3d-compat";
import type { DollhouseModel } from "./dollhouse";
import { bakedShellSurfaces, type BakedShell, SMOOTH_SEAMS, toYUp, walkGeometry } from "./stationWalkGeometry";
import { stationShell } from "./stationShell";

const model = JSON.parse(readFileSync("public/transit/fulton-model.json", "utf8")) as DollhouseModel;
/** The body: centre this far over the feet (capsule half height 0.5 + radius 0.3 + float 0.25). */
const CENTRE_M = 1.05;
const STEP_S = 1 / 60;
const SPEED = 2.2;

type Run = { walk: number; way: "up" | "down"; done: boolean; fell: boolean; free: number; at: string };

let world: RAPIER.World;
let lowest = 0;

beforeAll(async () => {
  await RAPIER.init();
  world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  // The colliders the walk scene builds, with the flags it gives them.
  const flags = RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES | RAPIER.TriMeshFlags.MERGE_DUPLICATE_VERTICES;
  expect(flags).toBe(SMOOTH_SEAMS);
  const shell = stationShell(model);
  // The walls the walk draws: baked by scripts/build-station-shell.ts. OLD_SHELL=1 walks the walls built at run time.
  const geo = process.env.OLD_SHELL ? walkGeometry(model, shell) : { ...walkGeometry(model, shell), ...bakedShellSurfaces(model, shell, JSON.parse(readFileSync("public/transit/fulton-shell.json", "utf8")) as BakedShell) };
  for (const c of geo.colliders) world.createCollider(RAPIER.ColliderDesc.trimesh(c.vertices, c.indices, flags));
  lowest = geo.lowest;
}, 180_000); // Building the baked walls into colliders takes over a minute on a CI runner.

/** Walks one walk one way, `off` metres to its left, following its line from point to point. */
function walk(wi: number, way: "up" | "down", off: number): Run {
  const line = model.walks[wi].path;
  // Up from the platform, or down from just inside the street end (the street is outside, behind a wall).
  const raw = way === "up" ? line.slice(0, -1) : [...line].reverse().slice(1);
  const path = raw.map(([x, y, z], i) => {
    const a = raw[Math.max(0, i - 1)], b = raw[Math.min(raw.length - 1, i + 1)], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return toYUp(x - ((b[1] - a[1]) / L) * off, y + ((b[0] - a[0]) / L) * off, z);
  });
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(path[0][0], path[0][1] + CENTRE_M + 0.05, path[0][2]));
  const col = world.createCollider(RAPIER.ColliderDesc.capsule(0.5, 0.3), body);
  const kcc = world.createCharacterController(0.02);
  kcc.setSlideEnabled(true);
  kcc.setMaxSlopeClimbAngle(1.1);
  kcc.enableAutostep(0.1, 0.05, true);
  let seg = 1, vy = 0, floorAt = path[0][1], best = Infinity, still = 0, done = false, fell = false;
  for (let step = 0; step < 60 * 400; step++) {
    const p = body.translation(), feet = p.y - CENTRE_M;
    while (seg < path.length - 1 && Math.hypot(path[seg][0] - p.x, path[seg][2] - p.z) < 0.3) seg++;
    // The line cuts some stairs short: once the real stair has taken the body to the level of a
    // point further on, aim there instead of at one far over or under its head.
    if (Math.abs(path[seg][1] - feet) > 1) {
      let s = seg, along = 0;
      while (s < path.length - 1 && along < 4 && Math.abs(path[s][1] - feet) > 0.35) { along += Math.hypot(path[s + 1][0] - path[s][0], path[s + 1][2] - path[s][2]); s++; }
      if (Math.abs(path[s][1] - feet) <= 0.35) seg = s;
    }
    const t = path[seg], dx = t[0] - p.x, dz = t[2] - p.z, d = Math.hypot(dx, dz) || 1;
    // At the end on the map and on the end's floor, not on a floor above or below it.
    if (seg === path.length - 1 && d < 0.7 && Math.abs(t[1] - feet) < 0.6) { done = true; break; }
    // A drop of more than a storey with nothing under the body is a fall through a hole.
    if (feet < floorAt - 3) { fell = true; break; }
    kcc.computeColliderMovement(col, { x: (dx / d) * SPEED * STEP_S, y: 0, z: (dz / d) * SPEED * STEP_S });
    const m = kcc.computedMovement();
    // Float like ecctrl: a ray down from the centre holds the body 0.25 m over whatever is under it.
    const hit = world.castRay(new RAPIER.Ray({ x: p.x + m.x, y: p.y, z: p.z + m.z }, { x: 0, y: -1, z: 0 }), 1.7, true, undefined, undefined, col);
    let y = p.y;
    if (hit) { floorAt = p.y - hit.timeOfImpact; vy = 0; y += (p.y - hit.timeOfImpact + CENTRE_M - p.y) * 0.3; } else { vy = Math.max(vy - 9.81 * STEP_S, -20); y += vy * STEP_S; }
    body.setNextKinematicTranslation({ x: p.x + m.x, y, z: p.z + m.z });
    world.step();
    if (p.y < lowest - 4) { fell = true; break; }
    const left = d - seg * 1000;
    if (left < best - 0.01) { best = left; still = 0; } else if (++still > 120) break;
  }
  // Where it stopped: in how many of 16 directions can it move half a metre away?
  let free = 16;
  const home = body.translation();
  if (!done && !fell) {
    free = 0;
    for (let a = 0; a < 16; a++) {
      let q = { ...home };
      for (let k = 0; k < 60; k++) {
        kcc.computeColliderMovement(col, { x: Math.cos((a * Math.PI) / 8) * SPEED * STEP_S, y: -0.01, z: Math.sin((a * Math.PI) / 8) * SPEED * STEP_S });
        const m = kcc.computedMovement();
        q = { x: q.x + m.x, y: q.y + m.y, z: q.z + m.z };
        col.setTranslation(q);
      }
      if (Math.hypot(q.x - home.x, q.z - home.z) > 0.5) free++;
      col.setTranslation(home);
    }
  }
  world.removeCharacterController(kcc);
  world.removeRigidBody(body);
  return { walk: wi, way, done, fell, free, at: `${home.x.toFixed(1)},${(-home.z).toFixed(1)},${(home.y - CENTRE_M).toFixed(1)}` };
}

const all = (off: number) => model.walks.flatMap((_, wi) => (["up", "down"] as const).map((way) => walk(wi, way, off)));

describe("walking inside Fulton St", () => {
  it("follows every walk both ways to its end", { timeout: 120_000 }, () => {
    const stopped = all(0).filter((r) => !r.done);
    expect(stopped).toEqual([]);
  });

  it("never falls out of the station or wedges, a quarter metre either side of a walk", { timeout: 240_000 }, () => {
    // Off the line it may meet a wall the line passes, so it need not finish; it must stay free to move.
    const bad = [...all(0.25), ...all(-0.25)].filter((r) => r.fell || r.free === 0);
    expect(bad).toEqual([]);
  });
});
