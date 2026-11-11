import { describe, expect, it } from "vitest";
import { densify, stairPath, stationStairs, type StationInside, type StationWay } from "./stationStairs";
import type { LngLatTuple } from "./schema";

/** A point `x` metres east and `y` metres north of a spot in Lower Manhattan. */
const O: LngLatTuple = [-74.0, 40.71];
const P = (x: number, y: number): LngLatTuple => [O[0] + x / (111_320 * Math.cos((O[1] * Math.PI) / 180)), O[1] + y / 111_320];
const near = (a: LngLatTuple, b: LngLatTuple, m = 1) =>
  Math.hypot((a[0] - b[0]) * 111_320 * Math.cos((O[1] * Math.PI) / 180), (a[1] - b[1]) * 111_320) <= m;

const steps = (c: LngLatTuple[], from: number, to: number): StationWay => ({ k: "steps", c, from, to });
const platform = (c: LngLatTuple[], level: number): StationWay => ({ k: "platform", c, from: level, to: level });

/** Entrance at the origin, steps down 20 m east to a mezzanine, more steps to a platform 40 m east. */
const station: StationInside = {
  ways: [
    steps([P(2, 0), P(20, 0)], 0, -1),
    { k: "corridor", c: [P(20, 0), P(30, 0)], from: -1, to: -1 },
    steps([P(30, 0), P(40, 0)], -1, -2),
    platform([P(40, -60), P(40, 60), P(44, 60), P(44, -60), P(40, -60)], -2),
  ],
};

describe("stairPath", () => {
  it("goes from the entrance down the mapped steps to the platform", () => {
    const path = stairPath(station, P(0, 0), P(45, 0))!;
    expect(path).not.toBeNull();
    expect(near(path[0].at, P(0, 0))).toBe(true);
    expect(path[0].z).toBe(0);
    expect(path.at(-1)!.z).toBe(-10);
    // Down the steps and along the corridor, never back up.
    for (let i = 1; i < path.length; i++) expect(path[i].z).toBeLessThanOrEqual(path[i - 1].z + 1e-9);
    expect(path.some((p) => near(p.at, P(20, 0)) && p.z === -5)).toBe(true);
    expect(path.some((p) => near(p.at, P(30, 0)))).toBe(true);
  });

  it("reads steps mapped bottom-up the right way round", () => {
    // The first flight lists its street end last but still says from 0 to -1.
    const flipped: StationInside = { ways: [steps([P(20, 0), P(2, 0)], 0, -1), ...station.ways.slice(1)] };
    const path = stairPath(flipped, P(0, 0), P(45, 0))!;
    expect(path.find((p) => near(p.at, P(2, 0)))?.z).toBe(0);
    expect(path.find((p) => near(p.at, P(20, 0)))?.z).toBe(-5);
  });

  it("ends at the platform beside the train when there are two", () => {
    const two: StationInside = {
      ways: [
        ...station.ways,
        steps([P(30, 0), P(-10, 0)], -1, -2),
        platform([P(-10, -60), P(-10, 60), P(-14, 60), P(-14, -60), P(-10, -60)], -2),
      ],
    };
    expect(stairPath(two, P(0, 0), P(46, 30))!.at(-1)!.at[0]).toBeGreaterThan(P(39, 0)[0]);
    expect(stairPath(two, P(0, 0), P(-16, 30))!.at(-1)!.at[0]).toBeLessThan(P(-9, 0)[0]);
  });

  it("lands mid-platform rather than at a far corner", () => {
    const end = stairPath(station, P(0, 0), P(45, 0))!.at(-1)!;
    expect(near(end.at, P(42, 0), 10)).toBe(true);
  });

  it("has no path when the entrance is far from the station's stairs", () => {
    expect(stairPath(station, P(-80, 0), P(45, 0))).toBeNull();
  });

  it("has no path when the station maps no stairs from the street", () => {
    expect(stairPath({ ways: station.ways.slice(1) }, P(0, 0), P(45, 0))).toBeNull();
  });

  it("guesses one unmapped level change, and prefers a mapped flight", () => {
    // The mezzanine reaches the platform level only by the guessed drop.
    const gap: StationInside = { ways: [station.ways[0], station.ways[1], platform([P(34, -60), P(34, 60), P(38, 60), P(38, -60), P(34, -60)], -2)] };
    const guessed = stairPath(gap, P(0, 0), P(40, 0))!;
    expect(guessed.at(-1)!.z).toBe(-10);
    const mapped = stairPath(station, P(0, 0), P(45, 0))!;
    // Down the mapped second flight: its foot at 40 m east, not a guessed drop from the corridor.
    expect(mapped.some((p) => near(p.at, P(40, 0)) && p.z === -10)).toBe(true);
  });
});

describe("stairPath through a room", () => {
  it("crosses a corridor traced as a closed outline instead of following its walls", () => {
    // A 30 m square mezzanine between the street stair (west side) and the platform stair (east side).
    const room: StationWay = { k: "corridor", c: [P(20, -15), P(50, -15), P(50, 15), P(20, 15), P(20, -15)], from: -1, to: -1 };
    const st: StationInside = { ways: [steps([P(2, 0), P(20, 0)], 0, -1), room, steps([P(50, 0), P(60, 0)], -1, -2), platform([P(60, -60), P(60, 60), P(64, 60), P(64, -60), P(60, -60)], -2)] };
    const path = stairPath(st, P(0, 0), P(65, 0))!;
    expect(path).not.toBeNull();
    // Straight across at y = 0, never out to a corner 15 m away.
    for (const p of path.filter((q) => q.z === -5)) expect(near(p.at, P(35, 0), 16)).toBe(true);
    expect(path.some((p) => near(p.at, P(20, 15), 3) || near(p.at, P(20, -15), 3))).toBe(false);
  });
});

describe("stationStairs", () => {
  it("uses the trip's station when it has a path", () => {
    expect(stationStairs({ A: station }, "A", P(0, 0), P(45, 0))?.id).toBe("A");
  });
  it("tries a station whose platform is by the train when the id has none", () => {
    // A complex files each line under its own id: the trip names one, the platform sits in another.
    expect(stationStairs({ A: { ways: [] }, B: station }, "A", P(0, 0), P(45, 0))?.id).toBe("B");
  });
  it("gives up when nothing nearby connects", () => {
    expect(stationStairs({ A: { ways: [] } }, "A", P(0, 0), P(45, 0))).toBeNull();
    expect(stationStairs({}, "A", P(0, 0), P(45, 0))).toBeNull();
  });
});

describe("densify", () => {
  it("adds points so none are more than the step apart", () => {
    const d = densify([P(0, 0), P(25, 0)], 8);
    expect(d).toHaveLength(5);
    expect(near(d.at(-1)!, P(25, 0))).toBe(true);
  });
});
