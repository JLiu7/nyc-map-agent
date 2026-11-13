import { describe, expect, it } from "vitest";
import { dollhouseLeg } from "./dollhouseLeg";
import type { Segment } from "./flythrough";

const seg = (over: Partial<Segment>): Segment => ({ kind: "ascend", label: "", coords: [], realS: 60, underground: true, callouts: [], ...over });
const CITY_HALL: [number, number] = [-74.00413, 40.71307], FULTON: [number, number] = [-74.00957, 40.71037], WALL: [number, number] = [-74.0118, 40.7076];
const GRAND_CENTRAL: [number, number] = [-73.97659, 40.75187], ATLANTIC: [number, number] = [-73.97768, 40.68431], NEVINS: [number, number] = [-73.98025, 40.68831];

describe("which station leg plays in the dollhouse view", () => {
  it("is the walk off a downtown 4 at Fulton St", () => {
    expect(dollhouseLeg(seg({}), seg({ kind: "ride", route: "4", coords: [CITY_HALL, FULTON] }))).toBe("fulton");
    expect(dollhouseLeg(seg({}), seg({ kind: "ride", route: "5", coords: [CITY_HALL, FULTON] }))).toBe("fulton");
  });
  it("is the walk off a downtown 4, 5 or 6 at Brooklyn Bridge–City Hall", () => {
    for (const route of ["4", "5", "6"]) expect(dollhouseLeg(seg({}), seg({ kind: "ride", route, coords: [GRAND_CENTRAL, CITY_HALL] }))).toBe("cityhall");
  });
  it("is the walk off a Brooklyn-bound 2 or 3 at Atlantic Av–Barclays Ctr, whose local platform the model walks from", () => {
    for (const route of ["2", "3"]) expect(dollhouseLeg(seg({}), seg({ kind: "ride", route, coords: [FULTON, ATLANTIC] }))).toBe("barclays");
    // The 4 and 5 stop at the express island, which has no walks yet.
    for (const route of ["4", "5"]) expect(dollhouseLeg(seg({}), seg({ kind: "ride", route, coords: [FULTON, ATLANTIC] }))).toBe(null);
    expect(dollhouseLeg(seg({}), seg({ kind: "ride", route: "Q", coords: [CITY_HALL, ATLANTIC] }))).toBe(null);
  });
  it("is not an uptown train, another line, another station or the walk down", () => {
    expect(dollhouseLeg(seg({}), seg({ kind: "ride", route: "4", coords: [WALL, FULTON] }))).toBe(null);
    expect(dollhouseLeg(seg({}), seg({ kind: "ride", route: "4", coords: [ATLANTIC, NEVINS] }))).toBe(null);
    expect(dollhouseLeg(seg({}), seg({ kind: "ride", route: "6", coords: [FULTON, CITY_HALL] }))).toBe(null);
    expect(dollhouseLeg(seg({}), seg({ kind: "ride", route: "A", coords: [CITY_HALL, FULTON] }))).toBe(null);
    expect(dollhouseLeg(seg({}), seg({ kind: "ride", route: "4", coords: [CITY_HALL, WALL] }))).toBe(null);
    expect(dollhouseLeg(seg({ kind: "descend" }), seg({ kind: "ride", route: "4", coords: [CITY_HALL, FULTON] }))).toBe(null);
    expect(dollhouseLeg(seg({}), undefined)).toBe(null);
  });
});
