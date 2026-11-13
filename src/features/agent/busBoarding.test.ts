import { describe, expect, it } from "vitest";
import { buildTimeline, calloutAt, moveAt, waitAt, wallSeconds } from "./flythrough";
import { boardingAt } from "./busBoarding";
import type { Trip } from "./schema";

const stop: [number, number] = [-74.0094, 40.7101];
const trip = {
  id: "bus", mode: "transit", origin: { label: "Fulton St", at: [-74.0087, 40.7102] }, destination: { label: "Aldi", at: [-73.99, 40.73] },
  departIso: "2026-11-13T10:00", arriveIso: "2026-11-13T10:20", routes: ["M55"], alerts: [], elevators: [], hazards: [], context: [], stubbed: [], skips: [], impacts: [],
  legs: [
    { kind: "walk", label: "Walk to Broadway/Fulton St", coords: [[-74.0087, 40.7102], stop], durationS: 60, distanceM: 60, turns: [] },
    { kind: "ride", mode: "bus", route: "M55", label: "M55 bus Broadway/Fulton St → Houston St", fromStop: "Broadway/Fulton St", toStop: "Houston St", color: "#00AEEF",
      coords: [stop, [-74.0072, 40.7146], [-74.0023, 40.7253]], durationS: 600, stops: [{ at: [-74.0072, 40.7146], text: "Chambers St" }], underground: false, geometrySource: "gtfs-shape" },
  ],
} as unknown as Trip;

describe("getting on the bus", () => {
  const ride = buildTimeline(trip)[1];
  it("waits at the stop before the ride, and says so", () => {
    expect(ride.board).toBeGreaterThan(0.3);
    expect(calloutAt(ride, 0)).toBe("Wait for the M55 bus at Broadway/Fulton St");
    expect(waitAt(ride, 0.1)).not.toBeNull();
    expect(moveAt(ride, 0.1)).toBe(0);
    expect(calloutAt(ride, ride.board! + 0.01)).toBe("M55 bus Broadway/Fulton St → Houston St");
    expect(waitAt(ride, ride.board! + 0.01)).toBeNull();
  });
  it("keeps the ride itself as long as before, with the stop added", () => {
    const train = buildTimeline({ ...trip, legs: [trip.legs[0], { ...trip.legs[1], mode: "subway" }] } as Trip)[1];
    expect(train.board).toBeUndefined();
    expect(wallSeconds(ride, 10) * (1 - ride.board!)).toBeCloseTo(wallSeconds(train, 10));
    expect(wallSeconds(ride, 10) * ride.board!).toBeCloseTo(7);
  });
  it("places the stops after the wait", () => {
    const chambers = ride.callouts.find((c) => c.text === "Chambers St")!;
    expect(chambers.f).toBeGreaterThan(ride.board!);
  });
  it("brings the bus up the road to the stop, then the rider on board", () => {
    const start = boardingAt(ride, 0), stopped = boardingAt(ride, 0.7), done = boardingAt(ride, 1);
    const m = (a: [number, number], b: [number, number]) => Math.hypot((a[0] - b[0]) * 84_000, (a[1] - b[1]) * 111_000);
    expect(m(start.bus, stop)).toBeGreaterThan(150);
    expect(m(stopped.bus, stop)).toBeLessThan(1);
    expect(m(start.rider, stop)).toBeGreaterThan(3);
    expect(start.aboard).toBe(false);
    expect(m(done.rider, stop)).toBeLessThan(0.5);
    expect(done.aboard).toBe(true);
  });
});
