import { describe, expect, it } from "vitest";
import { dollhouseLeg } from "./dollhouseLeg";
import type { Segment } from "./flythrough";

const seg = (over: Partial<Segment>): Segment => ({ kind: "ascend", label: "", coords: [], realS: 60, underground: true, callouts: [], ...over });
const CITY_HALL: [number, number] = [-74.00413, 40.71307], FULTON: [number, number] = [-74.00957, 40.71037], WALL: [number, number] = [-74.0118, 40.7076];

describe("which station leg plays in the dollhouse view", () => {
  it("is the walk off a downtown 4 at Fulton St", () => {
    expect(dollhouseLeg(seg({}), seg({ kind: "ride", route: "4", coords: [CITY_HALL, FULTON] }))).toBe(true);
    expect(dollhouseLeg(seg({}), seg({ kind: "ride", route: "5", coords: [CITY_HALL, FULTON] }))).toBe(true);
  });
  it("is not an uptown train, another line, another station or the walk down", () => {
    expect(dollhouseLeg(seg({}), seg({ kind: "ride", route: "4", coords: [WALL, FULTON] }))).toBe(false);
    expect(dollhouseLeg(seg({}), seg({ kind: "ride", route: "A", coords: [CITY_HALL, FULTON] }))).toBe(false);
    expect(dollhouseLeg(seg({}), seg({ kind: "ride", route: "4", coords: [CITY_HALL, WALL] }))).toBe(false);
    expect(dollhouseLeg(seg({ kind: "descend" }), seg({ kind: "ride", route: "4", coords: [CITY_HALL, FULTON] }))).toBe(false);
    expect(dollhouseLeg(seg({}), undefined)).toBe(false);
  });
});
