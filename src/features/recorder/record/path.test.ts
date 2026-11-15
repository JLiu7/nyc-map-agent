import { describe, expect, it } from "vitest";
import type { GpsRow, Recording } from "../format";
import { fitPath, walkPath } from "./path";

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
