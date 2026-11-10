import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onOrBy, portalFor } from "./trip";
import type { Entrance, Station } from "./transit";
import type { LngLatTuple } from "../../../src/features/agent/schema";

const st: Station = { id: "631", complexId: "610", name: "Grand Central-42 St", routes: ["4"], structure: "Subway", at: [-73.9768, 40.7518] };
const dest: LngLatTuple = [-73.9750, 40.7530];
// The lift is nearest to the destination as the crow flies; the NW stair is a longer walk than the SE one.
const lift: Entrance = { complexId: "610", at: [-73.9752, 40.7528], type: "Elevator", entry: true, exit: true };
const nw: Entrance = { complexId: "610", at: [-73.9760, 40.7525], type: "Stair", entry: true, exit: true };
const se: Entrance = { complexId: "610", at: [-73.9762, 40.7520], type: "Stair", entry: true, exit: true };
const walkM = new Map<string, number>([[String(lift.at), 30], [String(nw.at), 400], [String(se.at), 150]]);
const walk = (a: LngLatTuple) => Promise.resolve({ coords: [a, dest], distanceM: walkM.get(String(a)) ?? 999, durationS: 60, turns: [] });

beforeEach(() => { vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline")))); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("portalFor", () => {
  it("takes the shortest walk, not the shortest straight line", async () => {
    const p = await portalFor(st, [nw, se], dest, "exit", [], walk);
    expect([p.lon, p.lat]).toEqual(se.at);
  });

  it("skips an elevator-only exit while the station's elevator is out", async () => {
    const out = ["Elevator out at Grand Central-42 St (street to mezzanine) — repair, back soon"];
    expect((await portalFor(st, [lift, nw, se], dest, "exit", [], walk)).type).toBe("Elevator");
    const p = await portalFor(st, [lift, nw, se], dest, "exit", out, walk);
    expect(p.type).toBe("Stair");
    expect(p.outage).toBeNull();
  });

  it("keeps the elevator, with its warning, when it is the only way out", async () => {
    const p = await portalFor(st, [lift], dest, "exit", ["Escalator out at X", "Elevator out at Grand Central-42 St"], walk);
    expect(p.outage).toBe("Elevator out at Grand Central-42 St");
  });

  it("falls back to the straight line when the walking router is down", async () => {
    const p = await portalFor(st, [nw, se], dest, "exit", [], () => Promise.reject(new Error("down")));
    expect([p.lon, p.lat]).toEqual(nw.at);
  });
});

describe("an exit named after what is beside it", () => {
  it("is on a street and by a place", () => {
    for (const street of ["Broadway", "East 42 Street", "Lexington Avenue", "Park Row", "Fulton St"]) expect(onOrBy(street)).toBe("on");
    for (const place of ["Saint Paul's Chapel", "Grand Central Terminal", "Oculus"]) expect(onOrBy(place)).toBe("by");
  });
});
