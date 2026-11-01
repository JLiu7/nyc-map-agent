import { describe, expect, it } from "vitest";
import { estimateTrain, MAX_PIN_S, type LiveTrip, type StaticSystem } from "./model";

const sys: StaticSystem = {
  system: "subway",
  routes: { G: { name: "Crosstown", short: "G", color: "#6CBE45", text: "#FFFFFF" } },
  lines: { type: "FeatureCollection", features: [] },
  stations: { type: "FeatureCollection", features: [] },
  shapes: { G: { c: [[-73.95, 40.7], [-73.95, 40.72]], m: [0, 2226], g: ["underground", "underground"] } },
  stopM: { G: { A: 0, B: 1113, C: 2226 } },
};
// The timetable has the train leaving B (arrives 200, leaves about 230) and reaching C at 300.
// The vehicle feed still says "stopped at B" as of `vt`.
const trip = (vt: number): LiveTrip => ({ id: "t1", route: "G", dir: 0, stops: [["BN", 200], ["CN", 300]], at: "BN", st: 1, vt });
const NOW = 270;

describe("how long the vehicle report holds a train at a station", () => {
  it("holds it while the report is fresh", () => {
    const v = estimateTrain(sys, trip(NOW - 10), NOW)!;
    expect(v.stopped?.kind).toBe("at");
    expect(v.lat).toBeCloseTo(40.71, 4);
  });

  it(`lets it move once the report is more than ${MAX_PIN_S} s old: the feed only repeats its last "stopped"`, () => {
    const v = estimateTrain(sys, trip(NOW - (MAX_PIN_S + 20)), NOW)!;
    expect(v.stopped).toBeUndefined();
    expect(v.lat).toBeGreaterThan(40.71);
  });

  it("still holds it there when the line is in trouble, however old the report", () => {
    const v = estimateTrain(sys, trip(NOW - 300), NOW, undefined, undefined, { troubled: true })!;
    expect(v.stopped?.kind).toBe("at");
  });

  it("does not change a train the timetable already has at the station", () => {
    const v = estimateTrain(sys, trip(NOW - 300), 210)!;
    expect(v.stopped?.kind).toBe("at");
  });
});
