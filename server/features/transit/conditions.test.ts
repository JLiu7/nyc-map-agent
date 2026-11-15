import { describe, expect, it } from "vitest";
import { noticeRoutes, trafficNear, wetness } from "./conditions";

describe("conditions", () => {
  it("names the lines with a notice in effect now, open-ended ones included", () => {
    const alerts = [{ routes: ["A", "C"], start: 100, end: 200 }, { routes: ["M15"], start: 100, end: 0 }, { routes: ["G"], start: 300, end: 400 }, { routes: ["7"], start: 10, end: 90 }];
    expect([...noticeRoutes(alerts, 150)].sort()).toEqual(["A", "C", "M15"]);
  });
  it("reads rain and snow as wet, anything else as dry, and no reading as unknown", () => {
    expect([wetness("rain"), wetness("snow"), wetness("cloudy"), wetness(undefined)]).toEqual(["rain", "snow", "dry", null]);
  });
  it("takes the nearest speed link within 80 m of a stop, and none when all are further", () => {
    const fdr = { level: "jam", coords: [[-73.9712, 40.7400], [-73.9712, 40.7500]] as Array<[number, number]> };
    const far = { level: "free", coords: [[-73.9800, 40.7400], [-73.9800, 40.7500]] as Array<[number, number]> };
    const off = { level: "unknown", coords: [[-73.9710, 40.7400], [-73.9710, 40.7500]] as Array<[number, number]> };
    expect(trafficNear([far, fdr, off], -73.9716, 40.745)).toBe(2); // about 34 m from the jammed link
    expect(trafficNear([far], -73.9716, 40.745)).toBeNull(); // about 700 m away
    expect(trafficNear([{ ...far, level: "slow" }], -73.9803, 40.745)).toBe(1);
  });
});
