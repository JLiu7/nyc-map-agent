import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { besideFlight, buildStation, drawn, floorsAt, floorUnder, outline, reachableShare, rooms, streetTops, toLngLat, toLocal, walkIn, floorWellOpen, walls, wellOpen, type StationModel, type StationPos, type WalkStation, type WalkWay } from "./stationWalk";

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

  it("fills a corridor traced as a closed outline: a room you can cross corner to corner", () => {
    // A 20 m by 16 m mezzanine room in place of the 3 m passage, same stairs and platform.
    const room = way("corridor", [[-10, -30], [10, -30], [10, -14], [-10, -14], [-10, -30]], -1);
    const m = buildStation({ ways: [small.ways[0], way("corridor", [[0, -8], [0, -14]], -1), room, small.ways[2], small.ways[3]] })!;
    for (const [x, y] of [[-8, -28], [8, -16], [0, -22]] as const) expect(floorsAt(m, ...toLocal(m, ...ll(x, y)))).toContain(-5);
    // Outside the outline there is no floor: the passage's old 3 m strip would have ended at x = 1.5.
    expect(floorsAt(m, ...toLocal(m, ...ll(-13, -22)))).toEqual([]);
    const mezz = walkTo(m, at(m, 0, 2), ...toLocal(m, ...ll(0, -20)));
    const corner = walkTo(m, mezz, ...toLocal(m, ...ll(-8, -28)));
    expect(corner.z).toBeCloseTo(-5, 1);
    expect(Math.hypot(...[corner.x, corner.y].map((v, i) => v - toLocal(m, ...ll(-8, -28))[i]))).toBeLessThan(0.5);
    // Its wall stops you: walking on west leaves you inside the room.
    const west = walkTo(m, corner, ...toLocal(m, ...ll(-20, -28)));
    expect(toLngLat(m, west.x, west.y)[0]).toBeGreaterThan(ll(-10.5, 0)[0]);
    expect(reachableShare(m)).toBeGreaterThan(0.99);
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

describe("drawn", () => {
  /** A passage and a platform at an angle to the grid, so their cells step along every wall. */
  const slanted: WalkStation = {
    ways: [
      way("steps", [[0, 0], [6, -6]], 0, -1),
      way("corridor", [[6, -6], [30, -20]], -1),
      way("steps", [[30, -20], [36, -26]], -1, -2),
      way("platform", [[20, -60], [70, 10]], -2),
    ],
  };
  type Run = ReturnType<typeof drawn>["floors"][number];
  const covers = (runs: Run[], x: number, y: number, z: number) => runs.some((r) => Math.abs(r.z - z) < 0.1 && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + 0.5);
  type Rim = ReturnType<typeof drawn>["rims"][number];
  /** Is (x, y) under a stairwell's rim, the strip of slab along a stair's side, at height z? */
  const rimmed = (rims: Rim[], x: number, y: number, z: number) =>
    rims.some(({ strip }) => {
      if (Math.abs(strip[0][2] - z) > 0.1) return false;
      const turns = strip.map((a, i) => { const b = strip[(i + 1) % 4]; return Math.sign((b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0])); });
      return turns.every((t) => t >= 0) || turns.every((t) => t <= 0);
    });
  /** Is (x, y) inside a stairwell that opens a slab at height z there (a wall can run into a stair's footprint)? */
  const inWell = (m: StationModel, x: number, y: number, z: number, open: (t: number, z: number) => boolean) =>
    m.pieces.some((g) => { if (!g.flight) return false; const b = besideFlight(g.flight, x, y); return b.d <= 1.02 && open(b.z, z); });

  it("reaches every wall with floor and ceiling, leaving no gap along its foot or top", () => {
    const m = buildStation(slanted)!;
    const { floors, ceilings, beds, rims } = drawn(m);
    let points = 0;
    const missed: string[] = [];
    for (const room of rooms(m)) {
      for (const w of outline(room, (look, h) => floorsAt(m, ...look).some((f) => Math.abs(f - h) <= 0.75))) {
        const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
        for (let t = 0.1; t <= 0.9; t += 0.25 / Math.max(len, 1)) {
          const [x, y] = [w.x1 + (w.x2 - w.x1) * t, w.y1 + (w.y2 - w.y1) * t];
          points++;
          if (!covers([...floors, ...beds], x, y, w.z1) && !rimmed(rims, x, y, w.z1) && !inWell(m, x, y, w.z1, floorWellOpen)) missed.push(`floor ${x.toFixed(1)},${y.toFixed(1)}`);
          if (!covers(ceilings, x, y, w.z1) && !rimmed(rims, x, y, w.z1 + 3.2) && !inWell(m, x, y, w.z1 + 3.2, wellOpen)) missed.push(`ceiling ${x.toFixed(1)},${y.toFixed(1)}`);
        }
      }
    }
    expect(points).toBeGreaterThan(200);
    expect(missed).toEqual([]);
  });

  it("keeps the floor off the tracks and out of the stairwell", () => {
    const m = buildStation(slanted)!;
    const { floors } = drawn(m);
    // Over the track beside the platform, 3 m past its edge, there is no floor at platform height.
    const [px, py] = toLocal(m, ...ll(45, -25));
    const [ex, ey] = [px + 0.707 * 6, py - 0.707 * 6];
    expect(covers(floors, ex, ey, -10)).toBe(false);
  });
});

describe("stairwells", () => {
  const xray = JSON.parse(readFileSync("public/transit/xray.json", "utf8")) as Record<string, WalkStation>;
  // Fulton St and 14 St-Union Sq: before the wells were cut, 870 and 379 slab cells hung over their stairs.
  for (const id of ["418", "635"]) {
    it(`leaves head room over every stair tread at station ${id}`, () => {
      const m = buildStation(xray[id])!;
      const stairs = m.pieces.filter((g) => g.stair);
      expect(stairs.length).toBeGreaterThan(10);
      const treads = (x: number, y: number) => stairs.flatMap((g) => {
        const [i, j] = [Math.floor((x - g.x0) / 0.5), Math.floor((y - g.y0) / 0.5)];
        const h = i < 0 || j < 0 || i >= g.nx || j >= g.ny ? NaN : g.h[j * g.nx + i];
        return Number.isNaN(h) ? [] : [h];
      });
      const { floors, ceilings } = drawn(m);
      let over = 0, cells = 0;
      const check = (runs: typeof floors, lift: number, rest: number) => {
        for (const r of runs) for (let k = 0; k < Math.round(r.w / 0.5); k++) {
          cells++;
          const z = r.z + lift;
          if (treads(r.x + (k + 0.5) * 0.5, r.y + 0.25).some((h) => h < z - rest && h + 1.8 > z)) over++;
        }
      };
      // A ceiling 3.2 m over its floor, and a floor a stair is still climbing to.
      check(ceilings, 3.2, -0.2);
      check(floors, 0, 0.35);
      expect(cells).toBeGreaterThan(10_000);
      expect(over).toBe(0);
    });

    it(`cuts each stairwell along the stair's sides and closes its rim at station ${id}`, () => {
      const m = buildStation(xray[id])!;
      const flights = m.pieces.filter((g) => g.flight);
      const { floors, ceilings, rims } = drawn(m);
      // No slab cell reaches inside a stair's side walls where the stair opens it: cut by cells alone, a stair at an
      // angle to the grid left teeth of slab inside its walls and holes beside them (owner's trip recording, 2026-11-11).
      let inside = 0;
      const check = (runs: typeof floors, lift: number, open: (t: number, z: number) => boolean) => {
        for (const r of runs) for (let k = 0; k < Math.round(r.w / 0.5); k++) {
          const [x, y, z] = [r.x + k * 0.5, r.y, r.z + lift];
          for (const g of flights) {
            if (x + 0.5 < g.x0 - 0.5 || y + 0.5 < g.y0 - 0.5 || x > g.x0 + g.nx * 0.5 + 0.5 || y > g.y0 + g.ny * 0.5 + 0.5) continue;
            if ([[0.05, 0.05], [0.45, 0.05], [0.05, 0.45], [0.45, 0.45]].some(([dx, dy]) => { const b = besideFlight(g.flight!, x + dx, y + dy); return b.beside && b.d < 0.97 && open(b.z, z); })) inside++;
          }
        }
      };
      // Inside the walls a slab shows wherever it is over the treads and under the stair's own ceiling (2.6 m up).
      check(ceilings, 3.2, (t, z) => t + 2.6 > z && t < z - 0.05);
      // A floor: short of its last step, which lands on it (a cell there may overhang the top tread by its half-width).
      check(floors, 0, (t, z) => t + 2.6 > z && t < z - 0.6);
      expect(inside).toBe(0);
      // And the rim closes the cut past the walls, in ceilings and floors alike.
      expect(rims.filter((r) => r.kind === "ceiling").length).toBeGreaterThan(20);
      expect(rims.filter((r) => r.kind !== "ceiling").length).toBeGreaterThan(20);
    });
  }
});
