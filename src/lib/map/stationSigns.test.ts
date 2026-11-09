import { describe, expect, it } from "vitest";
import { bulletsFor, trimFor } from "./stationSignWords";
import { placeSigns, SIGN_Z, type SignInfo } from "./stationSigns";
import { buildStation, toLocal, type WalkStation, type WalkWay } from "./stationWalk";

const kx = 111_320 * Math.cos((40.71 * Math.PI) / 180);
const ll = (x: number, y: number): [number, number] => [-74.0 + x / kx, 40.71 + y / 111_320];
const way = (k: WalkWay["k"], pts: Array<[number, number]>, from: number, to = from): WalkWay => ({ k, c: pts.map(([x, y]) => ll(x, y)), from, to });

/** A street stair down to a passage, a stair down to a platform running north. */
const small: WalkStation = {
  ways: [
    way("steps", [[0, 0], [0, -8]], 0, -1),
    way("corridor", [[0, -8], [0, -30]], -1),
    way("steps", [[0, -30], [8, -30]], -1, -2),
    way("platform", [[8, -40], [8, 60]], -2),
  ],
};
const table = { "4": { short: "4", color: "#00933C", text: "#FFFFFF" }, L: { short: "L", color: "#A7A9AC", text: "#FFFFFF" } };

function info(m: NonNullable<ReturnType<typeof buildStation>>): SignInfo {
  const local = (pts: Array<[number, number]>) => pts.map(([x, y]) => toLocal(m, ...ll(x, y)));
  return {
    stations: [{ name: "14 St-Union Sq", routes: bulletsFor("4 L", table) }],
    // The 4's track runs beside the platform; the L's well away from it.
    lines: [{ route: "4", c: local([[11.5, -60], [11.5, 0], [11.5, 80]]) }, { route: "L", c: local([[150, -60], [150, 80]]) }],
    trim: "#2f6b45",
  };
}

describe("placeSigns", () => {
  const m = buildStation(small)!;
  const signs = placeSigns(m, info(m));
  const platformZ = -10;

  it("hangs name signs along the platform, both sides, with only the lines that stop there", () => {
    const over = signs.filter((s) => s.kind === "name" && s.back);
    expect(over.length).toBeGreaterThanOrEqual(4);
    for (const s of over) {
      expect(s.name).toBe("14 St-Union Sq");
      expect(s.routes.map((b) => b.short)).toEqual(["4"]);
      expect(s.z).toBeCloseTo(platformZ + SIGN_Z, 1);
      // Parallel to the platform, which runs north: the faces look east and west.
      expect(Math.abs(Math.sin(s.angle))).toBeLessThan(0.2);
    }
  });

  it("puts name signs on the walls across the tracks, facing the platform", () => {
    const wall = signs.filter((s) => s.kind === "name" && !s.back && s.z < -5);
    expect(wall.length).toBeGreaterThan(0);
    const [px] = toLocal(m, ...ll(8, 0));
    for (const s of wall) expect(Math.sign(Math.cos(s.angle))).toBe(Math.sign(px - s.x));
  });

  it("says Exit at the foot of each stair, and shows the lines at the top of the one down to the platform", () => {
    expect(signs.filter((s) => s.kind === "exit")).toHaveLength(2);
    const trains = signs.filter((s) => s.kind === "trains");
    expect(trains).toHaveLength(1);
    expect(trains[0].z).toBeCloseTo(-5 + SIGN_Z, 1);
    expect(trains[0].routes.map((b) => b.short)).toEqual(["4"]);
  });

  it("hangs nothing at street level, where the map is drawn instead", () => {
    expect(signs.filter((s) => s.z > -2)).toHaveLength(0);
  });
});

describe("bulletsFor", () => {
  it("draws an express run as its line, once, and skips lines it does not know", () => {
    const t = { ...table, "6": { short: "6", color: "#00933C", text: "#FFFFFF" } };
    expect(bulletsFor("4 6 6X Z", t).map((b) => b.short)).toEqual(["4", "6"]);
  });
});

describe("trimFor", () => {
  it("gives a station the same colour every time", () => {
    expect(trimFor("abc")).toBe(trimFor("abc"));
    expect(trimFor("abc")).toMatch(/^#[0-9a-f]{6}$/);
  });
});
