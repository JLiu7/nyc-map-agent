import { describe, expect, it } from "vitest";
import { buildStation, toLocal, type WalkStation, type WalkWay } from "@/lib/map/stationWalk";
import { fromMiddle, trainPart, trainPartAt } from "./stationWalks";

const kx = 111_320 * Math.cos((40.71 * Math.PI) / 180);
const ll = (x: number, y: number): [number, number] => [-74.0 + x / kx, 40.71 + y / 111_320];
const way = (k: WalkWay["k"], pts: Array<[number, number]>, from: number, to = from): WalkWay => ({ k, c: pts.map(([x, y]) => ll(x, y)), from, to });

describe("which part of the train stops by the stairs", () => {
  it("names five parts from the back to the front", () => {
    expect([0.05, 0.3, 0.5, 0.7, 0.95].map(trainPart)).toEqual(["at the back", "between the middle and the back", "in the middle", "between the middle and the front", "at the front"]);
  });

  it("says where the stairs are for someone at the middle of the train", () => {
    expect(fromMiddle("in the middle")).toBe("right by you");
    expect(fromMiddle("at the front")).toBe("at the front of the train");
    expect(fromMiddle("between the middle and the back")).toBe("a little toward the back of the train");
  });

  // A platform 160 m long running north, stairs down to it near its north end.
  const station: WalkStation = {
    ways: [
      way("steps", [[0, 70], [0, 62]], 0, -1),
      way("corridor", [[0, 62], [8, 62]], -1),
      way("steps", [[8, 62], [8, 54]], -1, -2),
      way("platform", [[8, -80], [8, 80]], -2),
    ],
  };
  const m = buildStation(station)!;
  const at = (x: number, y: number): [number, number, number] => [...toLocal(m, ...ll(x, y)), -10];

  it("reads the stairs' place along the platform against the way the train runs", () => {
    const north = Math.PI / 2, south = -Math.PI / 2;
    // The stairs land 54 m north of the platform's middle: the front of a northbound train, the back of a southbound one.
    expect(trainPartAt(m, at(8, 54), north)).toBe("at the front");
    expect(trainPartAt(m, at(8, 54), south)).toBe("at the back");
    expect(trainPartAt(m, at(8, 0), north)).toBe("in the middle");
    expect(trainPartAt(m, at(8, -30), north)).toBe("between the middle and the back");
  });

  it("says nothing where no platform edge runs the train's way", () => {
    expect(trainPartAt(m, at(8, 54), 0)).toBeNull();
  });
});
