import { describe, expect, it } from "vitest";
import type { GpsRow, Recording } from "../format";
import { fitPath, roughNote, walkPath } from "./path";

const T = 1_763_150_000_000;
const rec = (gps: GpsRow[]): Recording => ({ v: 1, startedAt: T, device: "iPhone", motion: [], heading: [], gps, baro: [], steps: [], marks: [] });
// About 111 m per 0.001 degree of latitude; at 40.735 N, 0.001 degree of longitude is about 84 m.
const LAT = 40.735, LON = -73.99;

describe("the path on the review screen", () => {
  it("joins the good location fixes in time order and measures the walk", () => {
    const p = walkPath(rec([[T + 2000, LAT + 0.001, LON, 8], [T, LAT, LON, 10], [T + 4000, LAT + 0.001, LON + 0.001, 12]]));
    expect(p.why).toBeNull();
    expect(p.points).toHaveLength(3);
    expect(p.points[0]).toEqual([0, 0]);
    expect(p.points[1][1]).toBeCloseTo(110.5, 0);
    expect(p.points[2][0]).toBeCloseTo(84.3, 0);
    expect(p.lengthM).toBeCloseTo(110.5 + 84.3, 0);
  });

  it("leaves out fixes that are too rough, and ones that did not move", () => {
    const p = walkPath(rec([[T, LAT, LON, 10], [T + 1000, LAT, LON, 10], [T + 2000, LAT + 0.01, LON, 65], [T + 3000, LAT + 0.0005, LON, 10]]));
    expect(p.points).toHaveLength(2);
    expect(p.lengthM).toBeCloseTo(55.3, 0);
  });

  it("draws the fixes that are good enough when several are rough, and says how many were left out", () => {
    // The owner's real walk (#223): fourteen fixes, most of them from between tall buildings.
    const rough = [[T + 1000, LAT + 0.0002, LON, 80], [T + 2000, LAT + 0.0004, LON, 120], [T + 4000, LAT + 0.0008, LON, 65]] as GpsRow[];
    const good = [[T, LAT, LON, 12], [T + 3000, LAT + 0.0006, LON, 15], [T + 5000, LAT + 0.001, LON, 9]] as GpsRow[];
    const p = walkPath(rec([rough[0], good[0], rough[1], good[1], rough[2], good[2]]));
    expect(p.why).toBeNull();
    expect(p.points).toHaveLength(3);
    expect(p.lengthM).toBeCloseTo(110.5, 0);
    expect(p.fixes).toBe(6);
    expect(p.rough).toBe(3);
    expect(roughNote(p)).toBe("3 of 6 fixes were too rough to use.");
  });

  it("still says it cannot draw when every fix is rough", () => {
    const p = walkPath(rec([[T, LAT, LON, 80], [T + 1000, LAT + 0.001, LON, 90], [T + 2000, LAT + 0.002, LON, 200]]));
    expect(p.why).toMatch(/too rough/);
    expect(p.points).toEqual([]);
    expect(p.rough).toBe(3);
    expect(roughNote(p)).toBe("3 of 3 fixes were too rough to use.");
  });

  it("says nothing about rough fixes when every one was used", () => {
    const p = walkPath(rec([[T, LAT, LON, 5], [T + 1000, LAT + 0.001, LON, 5]]));
    expect(p.rough).toBe(0);
    expect(roughNote(p)).toBeNull();
  });

  it("says why there is no path", () => {
    expect(walkPath(rec([])).why).toMatch(/No location/);
    expect(walkPath(rec([[T, LAT, LON, 80]])).why).toMatch(/too rough/);
    expect(walkPath(rec([[T, LAT, LON, 5], [T + 1000, LAT, LON, 5]])).why).toMatch(/did not move/);
    expect(walkPath(rec([])).points).toEqual([]);
  });

  it("fits the path in the box with north up and one scale both ways", () => {
    expect(fitPath([[0, 0], [0, 100], [50, 100]], 300, 180, 15)).toEqual([[112.5, 165], [112.5, 15], [187.5, 15]]);
    expect(fitPath([], 300, 180, 15)).toEqual([]);
  });
});
