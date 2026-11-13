import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { DollhouseModel } from "./dollhouse";

type P3 = [number, number, number];
import { crossesWall, floorBothSides, shellOpenings, stationShell, surfaceFinder, walkPoints } from "./stationShell";

// Every station model, so one built later is held to the same shell as Fulton St's.
const STATIONS = ["fulton", "barclays", "cityhall"] as const;
const load = (id: string) => JSON.parse(readFileSync(`public/transit/${id}-model.json`, "utf8")) as DollhouseModel;

describe.each(STATIONS)("the %s model's shell for walking inside", (id) => {
  const model = load(id);
  it("has no opening a person could lean or step through, except over the track", { timeout: 180_000 }, () => {
    const gaps = shellOpenings(model, stationShell(model));
    expect(gaps.slice(0, 20), `${gaps.length} open points along floor and stair edges`).toEqual([]);
  });

  it("leaves every walk from the street to the platforms clear of walls", { timeout: 60_000 }, () => {
    const shell = stationShell(model), { walls } = shell;
    const tris: Array<[P3, P3, P3]> = [];
    for (const list of [shell.floors, shell.stairs, shell.bridges]) for (let i = 0; i < list.length; i += 9) {
      tris.push([[list[i], list[i + 1], list[i + 2]], [list[i + 3], list[i + 4], list[i + 5]], [list[i + 6], list[i + 7], list[i + 8]]]);
    }
    const under = surfaceFinder(tris);
    // The last 0.6 m at each end, where a walk meets the street outside the model, may be walled.
    // A wall a walk only brushes as it runs alongside is fine: the figure slides along it. So is one
    // where the walk cuts a corner over a stairwell, with no floor on the far side.
    const blocked = model.walks.flatMap((w) => walkPoints(w.path, 0.1, 0.6))
      .filter(([x, y, z, ux, uy]) => walls.some((wall) => crossesWall(wall, x, y, z, ux, uy) && floorBothSides(under, wall, x, y, z)))
      .map((p) => p.slice(0, 3).map((v) => v.toFixed(2)).join(","));
    expect(blocked.slice(0, 20), `${blocked.length} walk points inside a wall`).toEqual([]);
  });

  it("closes the corners: every wall overlaps the next one where they meet", () => {
    const { walls } = stationShell(model);
    expect(walls.length).toBeGreaterThan(100);
    for (const w of walls.filter((w) => !w.door)) expect(Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1])).toBeGreaterThan(w.thick);
  });

  it("takes each wall down to the floor below it, never leaving a stair's side open underneath", () => {
    const { walls } = stationShell(model);
    // A doorway's sill and lintel, and pieces capped under a floor overhead, are the only shorter ones.
    for (const w of walls.filter((w) => !w.door && !w.capped)) for (const end of [0, 1] as const) expect(w.top[end] - w.foot[end]).toBeGreaterThan(3.2);
    // A capped piece still reaches below its own top by more than a step, and never inverts.
    for (const w of walls.filter((w) => w.capped)) for (const end of [0, 1] as const) expect(w.top[end] - w.foot[end]).toBeGreaterThan(0.09);
  });
});
