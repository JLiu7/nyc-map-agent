import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { valhallaToWalk } from "./valhalla";

// A real response from the VPS: Union Square West to East 17th Street.
const real: unknown = JSON.parse(readFileSync(new URL("./fixtures/valhalla-union-square.json", import.meta.url), "utf8"));

describe("valhallaToWalk", () => {
  it("reads distance in meters, time in seconds and the decoded path", () => {
    const w = valhallaToWalk(real);
    expect(w.distanceM).toBeCloseTo(189, 0);
    expect(w.durationS).toBeCloseTo(134.9, 1);
    expect(w.coords[0][0]).toBeCloseTo(-73.9911, 3);
    expect(w.coords[0][1]).toBeCloseTo(40.7359, 3);
  });

  it("names each turn onto a street, where it happens", () => {
    const w = valhallaToWalk(real);
    expect(w.turns.map((t) => t.text)).toEqual(["Turn right onto East 17th Street"]);
    expect(w.coords).toContainEqual(w.turns[0].at);
  });

  it("leaves out turns onto unnamed walkways", () => {
    const leg = { shape: "_p~iF~ps|U_ulLnnqC", maneuvers: [{ type: 15, begin_shape_index: 1 }, { type: 4, begin_shape_index: 1 }] };
    expect(valhallaToWalk({ trip: { summary: { length: 1, time: 700 }, legs: [leg] } }).turns).toEqual([]);
  });

  it("refuses an error response", () => {
    expect(() => valhallaToWalk({ error_code: 442, error: "No path could be found" })).toThrow();
  });
});
