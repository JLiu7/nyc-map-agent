import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { DollhouseModel } from "./dollhouse";
import { stationShell } from "./stationShell";
import { bakedShellSurfaces, type BakedShell, toYUp, walkGeometry, type Surface, type WalkGeometry } from "./stationWalkGeometry";
import { defectSpots, walkDefects } from "./walkDefects";

const model = JSON.parse(readFileSync("public/transit/fulton-model.json", "utf8")) as DollhouseModel;

type P3 = [number, number, number];
const surf = (quads: Array<[P3, P3, P3, P3]>): Surface => {
  const pos: number[] = [];
  for (const [a, b, c, d] of quads) for (const p of [a, b, c, a, c, d]) pos.push(...toYUp(...p));
  return { position: new Float32Array(pos), uv: new Float32Array((pos.length / 3) * 2) };
};
/** A closed corridor 30 m long, 4 wide, 3 tall, with a walk down its middle; `leave` drops one wall. */
function box(leave?: "north") {
  const L = 30, W = 4, H = 3;
  const floor: [P3, P3, P3, P3] = [[0, 0, 0], [L, 0, 0], [L, W, 0], [0, W, 0]];
  // Wound to face down, as walkGeometry winds every ceiling: drawn from below only.
  const roof: [P3, P3, P3, P3] = [[0, 0, H], [0, W, H], [L, W, H], [L, 0, H]];
  const walls: Array<[P3, P3, P3, P3]> = [
    [[0, 0, 0], [L, 0, 0], [L, 0, H], [0, 0, H]],
    ...(leave === "north" ? [] : [[[0, W, 0], [L, W, 0], [L, W, H], [0, W, H]] as [P3, P3, P3, P3]]),
    [[0, 0, 0], [0, W, 0], [0, W, H], [0, 0, H]],
    [[L, 0, 0], [L, W, 0], [L, W, H], [L, 0, H]],
  ];
  const geo = { floors: surf([floor]), stairs: surf([]), walls: surf(walls), ceiling: surf([roof]) } as unknown as WalkGeometry;
  const m = { walks: [{ exit: [0, 0], path: [[2, 2, 0], [28, 2, 0]] }], edges: [] } as unknown as DollhouseModel;
  return { geo, m };
}

describe("the walk defect check", () => {
  it("finds nothing wrong in a closed corridor", () => {
    const { geo, m } = box();
    expect(walkDefects(m, geo)).toEqual([]);
  });
  it("finds the hole where a wall is missing", () => {
    const { geo, m } = box("north");
    expect(new Set(walkDefects(m, geo).map((d) => d.kind))).toEqual(new Set(["hole"]));
  });
});

describe("walking every Fulton St walk", () => {
  it("counts what a walker would see wrong", () => {
    const shell = stationShell(model);
    // The walls the walk draws: baked by scripts/build-station-shell.ts. OLD_SHELL=1 counts the walls built at run time.
    const geo = process.env.OLD_SHELL ? walkGeometry(model, shell) : { ...walkGeometry(model, shell), ...bakedShellSurfaces(model, shell, JSON.parse(readFileSync("public/transit/fulton-shell.json", "utf8")) as BakedShell) };
    const defects = walkDefects(model, geo);
    const spots = defectSpots(defects);
    const byKind: Record<string, number> = {};
    for (const s of spots) byKind[s.kind] = (byKind[s.kind] ?? 0) + 1;
    if (process.env.WALK_DEFECTS_OUT) writeFileSync(process.env.WALK_DEFECTS_OUT, JSON.stringify({ points: defects.length, spots: spots.length, byKind, spotsList: spots.map((s) => `${s.kind} walk ${s.walk} at ${s.at.map((v) => v.toFixed(1)).join(",")} x${s.count}${s.ray ? ` ray ${s.ray.map((v) => v.toFixed(2)).join(",")}${s.fromCamera ? " cam" : ""}` : ""}`) }, null, 1));
    expect(defects.length).toBeGreaterThanOrEqual(0);
  }, 300_000);
});
