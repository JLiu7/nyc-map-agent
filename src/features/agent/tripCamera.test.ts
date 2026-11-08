import { describe, expect, it } from "vitest";
import { blendCam, eyeRig, LOOK_AHEAD_M, usesEye, type Cam } from "./tripCamera";
import { buildTimeline, depthAt, wallSeconds, type Segment } from "./flythrough";
import { withStairs, type StationInside } from "./stationStairs";
import type { LngLatTuple, Trip } from "./schema";

const O: LngLatTuple = [-74.0, 40.71];
const kx = 111_320 * Math.cos((O[1] * Math.PI) / 180);
const P = (x: number, y: number): LngLatTuple => [O[0] + x / kx, O[1] + y / 111_320];
const metresEast = (p: LngLatTuple) => (p[0] - O[0]) * kx;
const metresNorth = (p: LngLatTuple) => (p[1] - O[1]) * 111_320;

const seg = (over: Partial<Segment>): Segment => ({ kind: "walk", label: "", coords: [P(0, 0), P(10, 0)], realS: 60, underground: false, callouts: [], ...over });

describe("usesEye", () => {
  it("looks through the rider's eyes on street walks and real stairs only", () => {
    expect(usesEye(seg({}))).toBe(true);
    expect(usesEye(seg({ underground: true }))).toBe(false); // a transfer inside the station
    expect(usesEye(seg({ kind: "ride" }))).toBe(false);
    expect(usesEye(seg({ kind: "drive" }))).toBe(false);
    expect(usesEye(seg({ kind: "descend" }))).toBe(false); // no stairs found: plain switch
    expect(usesEye(seg({ kind: "descend", depths: [0, -5] }))).toBe(true);
    expect(usesEye(seg({ kind: "ascend", depths: [-5, 0] }))).toBe(true);
  });
});

describe("eyeRig", () => {
  it("stands 1.7 m up on the street and looks down the street ahead", () => {
    const r = eyeRig(O, 90);
    expect(r.eyeAlt).toBeCloseTo(1.7);
    expect(r.lookAlt).toBe(0);
    expect(metresEast(r.look)).toBeCloseTo(LOOK_AHEAD_M, 1);
    expect(metresNorth(r.look)).toBeCloseTo(0, 3);
    // 85° tilt at most, the map's ceiling outside street view.
    expect(90 - (Math.atan(r.eyeAlt / LOOK_AHEAD_M) * 180) / Math.PI).toBeLessThanOrEqual(85);
  });

  it("sinks at the top of the stairs, then rises behind the rider and looks down at them", () => {
    const top = eyeRig(O, 0, -0.5);
    expect(top.eyeAlt).toBeLessThan(1.7);
    expect(top.eyeAlt).toBeGreaterThan(0);
    const deep = eyeRig(O, 0, -10);
    expect(deep.eyeAlt).toBeGreaterThan(5);
    expect(metresNorth(deep.eye)).toBeLessThan(-10); // behind a rider facing north
    // The aim is on the ground, on the line from the eye to the rider below.
    expect(deep.lookAlt).toBe(0);
    const t = deep.eyeAlt / (deep.eyeAlt + 10);
    expect(metresNorth(deep.look)).toBeCloseTo(metresNorth(deep.eye) * (1 - t), 1);
  });

  it("never puts the eye below the street", () => {
    for (const z of [0, -0.5, -1, -1.5, -2, -3, -5, -10, -20]) expect(eyeRig(O, 45, z).eyeAlt).toBeGreaterThan(0);
  });
});

describe("blendCam", () => {
  const a: Cam = { center: [0, 0], zoom: 15, pitch: 0, bearing: 350, elevation: 0 };
  const b: Cam = { center: [1, 1], zoom: 21, pitch: 85, bearing: 10, elevation: 0 };
  it("starts at one pose and ends at the other", () => {
    expect(blendCam(a, b, 0)).toEqual(a);
    expect(blendCam(a, b, 1).zoom).toBe(21);
    expect(blendCam(a, b, 1).bearing).toBeCloseTo(10);
  });
  it("turns the short way round", () => {
    expect(blendCam(a, b, 0.5).bearing).toBeCloseTo(0);
  });
});

describe("withStairs", () => {
  const station: StationInside = {
    ways: [
      { k: "steps", c: [P(2, 0), P(20, 0)], from: 0, to: -1 },
      { k: "steps", c: [P(20, 0), P(36, 0)], from: -1, to: -2 },
      { k: "platform", c: [P(40, -60), P(40, 60), P(44, 60), P(44, -60), P(40, -60)], from: -2, to: -2 },
    ],
  };
  const portal = (lon: number, lat: number) => ({ lon, lat, label: "SE entrance", type: "Stair", elevatorOnly: false, outage: null });
  const trip = {
    legs: [
      { kind: "walk", label: "Walk", coords: [P(-100, 0), P(0, 0)], durationS: 80, turns: [] },
      { kind: "enter", label: "Enter", station: { id: "A", name: "Fulton", lon: P(42, 0)[0], lat: P(42, 0)[1] }, portal: portal(...P(0, 0)) },
      { kind: "ride", route: "A", label: "Ride", coords: [P(46, 0), P(46, 2000)], durationS: 300, stops: [], underground: true, geometrySource: "gtfs-shape" },
      { kind: "exit", label: "Exit", station: { id: "B", name: "Far", lon: P(46, 2000)[0], lat: P(46, 2000)[1] }, portal: portal(...P(60, 2000)) },
      { kind: "walk", label: "Walk", coords: [P(60, 2000), P(60, 2100)], durationS: 80, turns: [] },
    ],
  } as unknown as Trip;

  it("sends the walk in down the station's steps to the platform, and leaves stations without data alone", () => {
    const segs = withStairs(buildTimeline(trip), { A: station });
    const down = segs[1];
    expect(down.kind).toBe("descend");
    expect(down.depths).toBeDefined();
    expect(down.coords).toHaveLength(down.depths!.length);
    expect(down.depths![0]).toBe(0);
    expect(down.depths!.at(-1)).toBe(-10);
    expect(down.coords.at(-1)).toEqual(P(46, 0)); // boards where the train stops
    expect(depthAt(down, 0)).toBe(0);
    expect(depthAt(down, 1)).toBe(-10);
    expect(depthAt(down, 0.3)).toBeLessThan(0);
    // Real stairs get time on screen at 10x.
    expect(wallSeconds(down, 10)).toBeGreaterThanOrEqual(5 * Math.min(1, down.realS / 50));
    const up = segs[3];
    expect(up.kind).toBe("ascend");
    expect(up.depths).toBeUndefined();
    expect(usesEye(up)).toBe(false);
  });

  it("climbs from the platform to the exit when the station has data", () => {
    const out = { ways: station.ways.map((w) => ({ ...w, c: w.c.map(([x, y]) => [x, y + 2000 / 111_320] as LngLatTuple) })) };
    const exitAt = P(0, 2000);
    const t = { ...trip, legs: trip.legs.map((l) => (l.kind === "exit" ? { ...l, portal: portal(...exitAt) } : l)) } as Trip;
    const up = withStairs(buildTimeline(t), { B: out })[3];
    expect(up.depths![0]).toBe(-10);
    expect(up.depths!.at(-1)).toBe(0);
    expect(up.coords.at(-1)).toEqual(exitAt);
  });
});
