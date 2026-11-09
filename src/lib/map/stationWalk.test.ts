import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildStation, floorUnder, reachableShare, streetTops, toLngLat, toLocal, walkIn, walls, type StationModel, type StationPos, type WalkStation, type WalkWay } from "./stationWalk";

// Metres east/north of a point in Lower Manhattan, as lon/lat.
const kx = 111_320 * Math.cos((40.71 * Math.PI) / 180);
const ll = (x: number, y: number): [number, number] => [-74.0 + x / kx, 40.71 + y / 111_320];
const way = (k: WalkWay["k"], pts: Array<[number, number]>, from: number, to = from): WalkWay => ({ k, c: pts.map(([x, y]) => ll(x, y)), from, to });

/** A street stair down to a mezzanine passage, a stair to a platform below it. */
const small: WalkStation = {
  ways: [
    way("steps", [[0, 0], [0, -8]], 0, -1),
    way("corridor", [[0, -8], [0, -30]], -1),
    way("steps", [[0, -30], [8, -30]], -1, -2),
    way("platform", [[8, -40], [8, 60]], -2),
  ],
};

/** Walks straight from `pos` towards (tx, ty) local metres in 0.4 m frames, for at most `n` frames. */
function walkTo(m: StationModel, pos: StationPos, tx: number, ty: number, n = 400): StationPos {
  let p = pos;
  for (let i = 0; i < n; i++) {
    const d = Math.hypot(tx - p.x, ty - p.y);
    if (d < 0.3) break;
    p = walkIn(m, p, ((tx - p.x) / d) * Math.min(0.4, d), ((ty - p.y) / d) * Math.min(0.4, d));
  }
  return p;
}
const at = (m: StationModel, x: number, y: number): StationPos => {
  const [lx, ly] = toLocal(m, ...ll(x, y));
  return { x: lx, y: ly, z: 0, inside: false };
};

describe("buildStation", () => {
  it("needs a platform", () => {
    expect(buildStation({ ways: [way("corridor", [[0, 0], [10, 0]], -1)] })).toBeNull();
  });

  it("walks from the street down the stairs to the platform and back up", () => {
    const m = buildStation(small)!;
    expect(m.elevated).toBe(false);
    const street = at(m, 0, 2);
    const mezz = walkTo(m, street, ...toLocal(m, ...ll(0, -20)));
    expect(mezz.z).toBeCloseTo(-5, 1);
    const plat = walkTo(m, mezz, ...toLocal(m, ...ll(0, -30)));
    const onPlat = walkTo(m, walkTo(m, plat, ...toLocal(m, ...ll(8, -30))), ...toLocal(m, ...ll(8, -10)));
    expect(onPlat.z).toBeCloseTo(-10, 1);
    let back = onPlat;
    for (const [x, y] of [[8, -30], [0, -30], [0, 4]] as const) back = walkTo(m, back, ...toLocal(m, ...ll(x, y)));
    expect(back.z).toBe(0);
    expect(Math.hypot(...[back.x, back.y].map((v, i) => v - toLocal(m, ...ll(0, 4))[i]))).toBeLessThan(0.5);
  });

  it("stops you at a wall, and slides you along it", () => {
    const m = buildStation(small)!;
    const mezz = walkTo(m, at(m, 0, 2), ...toLocal(m, ...ll(0, -20)));
    // The passage is 3 m wide: walking east leaves you at its wall.
    const east = walkTo(m, mezz, ...toLocal(m, ...ll(20, -20)));
    expect(east.z).toBeCloseTo(-5, 1);
    expect(toLngLat(m, east.x, east.y)[0]).toBeLessThan(ll(1.8, 0)[0]);
    // Walking diagonally into the wall still makes headway along the passage.
    const slid = walkTo(m, east, ...toLocal(m, ...ll(20, -26)), 20);
    expect(slid.y).toBeLessThan(east.y - 2);
  });

  it("does not let you off the platform edge or through the floor", () => {
    const m = buildStation(small)!;
    const plat = walkTo(m, walkTo(m, walkTo(m, at(m, 0, 2), ...toLocal(m, ...ll(0, -30))), ...toLocal(m, ...ll(8, -30))), ...toLocal(m, ...ll(8, 0)));
    const off = walkTo(m, plat, ...toLocal(m, ...ll(30, 0)));
    expect(off.z).toBeCloseTo(-10, 1);
    expect(toLngLat(m, off.x, off.y)[0]).toBeLessThan(ll(11.3, 0)[0]);
    // Standing on the street over the platform, there is nothing to fall onto.
    expect(floorUnder(m, ...toLocal(m, ...ll(8, 10)), 0)).toEqual({ z: 0, inside: false });
  });

  it("takes you down a stair you walk onto at an angle, not only straight along it", () => {
    const m = buildStation(small)!;
    // 45 degrees off the flight's line: the step turns to run down it.
    const down = walkTo(m, at(m, -2, 2), ...toLocal(m, ...ll(6, -6)), 60);
    expect(down.z).toBeLessThan(-2);
    // Across the top at right angles you stay on the pavement.
    const across = walkTo(m, at(m, -4, -0.3), ...toLocal(m, ...ll(4, -0.3)));
    expect(across.z).toBe(0);
  });

  it("walks past the side of a stairwell without falling in", () => {
    const m = buildStation(small)!;
    const past = walkTo(m, at(m, -5, -4), ...toLocal(m, ...ll(5, -4)));
    expect(past.z).toBe(0);
  });

  it("adds a stair where an entrance has none, and joins a platform nobody mapped stairs to", () => {
    const st: WalkStation = { ways: [way("corridor", [[0, -10], [0, -30]], -1), way("platform", [[20, -40], [20, 40]], -2)] };
    const m = buildStation(st, { entrances: [ll(0, 0)] })!;
    expect(m.added).toBeGreaterThanOrEqual(2);
    expect(streetTops(m).length).toBeGreaterThan(0);
    expect(reachableShare(m)).toBe(1);
  });

  it("climbs to an elevated platform", () => {
    const st: WalkStation = { ways: [way("steps", [[0, 0], [0, 16]], 0, 2), way("platform", [[3, -40], [3, 60]], 2)] };
    const m = buildStation(st)!;
    expect(m.elevated).toBe(true);
    const top = walkTo(m, at(m, 0, -2), ...toLocal(m, ...ll(0, 17)));
    expect(top.z).toBeCloseTo(10, 1);
    const on = walkTo(m, top, ...toLocal(m, ...ll(3, 40)));
    expect(on.z).toBeCloseTo(10, 1);
  });

  it("draws walls along the passage and edges along the platform", () => {
    const ws = walls(buildStation(small)!);
    expect(ws.some((w) => !w.edge && Math.abs(w.z1 + 5) < 0.1)).toBe(true);
    expect(ws.some((w) => w.edge && Math.abs(w.z1 + 10) < 0.1)).toBe(true);
    // The platform runs north-south: its edge is two long straight lines, not a staircase of cells.
    const edges = ws.filter((w) => w.edge);
    expect(edges.length).toBeLessThan(12);
    expect(Math.max(...edges.map((w) => Math.hypot(w.x2 - w.x1, w.y2 - w.y1)))).toBeGreaterThan(40);
  });
});

describe("the committed stations", () => {
  type Sub = { entrances: { features: Array<{ properties: { id: string; kind: string }; geometry: { coordinates: [number, number] } }> } };
  const sub = JSON.parse(readFileSync("public/transit/subway.json", "utf8")) as Sub;
  const doors = (id: string) => sub.entrances.features.filter((f) => f.properties.id === id && /Stair|Escalator|Elevator/.test(f.properties.kind)).map((f) => f.geometry.coordinates);
  for (const file of ["xray", "elevated"]) {
    it(`lets you walk to most platforms in ${file}.json`, () => {
      const all = JSON.parse(readFileSync(`public/transit/${file}.json`, "utf8")) as Record<string, WalkStation>;
      let built = 0, full = 0;
      for (const [id, st] of Object.entries(all)) {
        const m = buildStation(st, { entrances: doors(id) });
        if (!m) continue;
        built++;
        if (reachableShare(m) > 0.99) full++;
      }
      expect(built).toBeGreaterThan(100);
      console.log(`${file}: ${full} of ${built} stations reach every platform`);
      expect(full / built).toBeGreaterThan(0.8);
    }, 120_000);
  }
});
