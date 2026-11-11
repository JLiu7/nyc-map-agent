import { describe, expect, it } from "vitest";
import { bulletsFor, trimFor } from "./stationSignWords";
import { guideSigns, inManhattan, placeSigns, runsToward, SIGN_Z, type SignInfo } from "./stationSigns";
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

describe("which way the trains go", () => {
  const m = buildStation(small)!;
  const [px] = toLocal(m, ...ll(8, 0));

  it("says Downtown on a platform whose tracks run along its east side", () => {
    // Trains keep right: with the platform on their right and the track to its east, they head south.
    const ways = placeSigns(m, info(m)).filter((s) => s.kind === "way");
    expect(ways.length).toBeGreaterThan(0);
    for (const s of ways) {
      expect(s.words).toBe("Downtown");
      expect(s.routes.map((b) => b.short)).toEqual(["4"]);
      expect(s.x).toBeGreaterThan(px);
      expect(s.z).toBeCloseTo(-10 + SIGN_Z, 1);
    }
  });

  it("says Uptown on the east edge and Downtown on the west of a platform between two tracks", () => {
    const local = (pts: Array<[number, number]>) => pts.map(([x, y]) => toLocal(m, ...ll(x, y)));
    const island: SignInfo = { ...info(m), lines: [{ route: "4", c: local([[8, -60], [8, 0], [8, 80]]) }] };
    const ways = placeSigns(m, island).filter((s) => s.kind === "way");
    expect(new Set(ways.map((s) => s.words))).toEqual(new Set(["Uptown", "Downtown"]));
    for (const s of ways) expect(s.words).toBe(s.x > px ? "Uptown" : "Downtown");
  });

  it("hangs none outside Manhattan, where Uptown and Downtown mean nothing", () => {
    const queens = { ...m, origin: [-73.945, 40.747] as [number, number] };
    expect(placeSigns(queens, info(m)).filter((s) => s.kind === "way")).toHaveLength(0);
  });

  it("keeps right", () => {
    expect(runsToward([1, 0], false)).toEqual([0, -1]);
    expect(runsToward([1, 0], true)).toEqual([-0, 1]);
  });

  it("knows Manhattan from across the rivers", () => {
    expect(inManhattan([-74.0095, 40.7104])).toBe(true); // Fulton St
    expect(inManhattan([-73.9768, 40.7518])).toBe(true); // Grand Central
    expect(inManhattan([-73.945, 40.747])).toBe(false); // Court Sq, Queens
    expect(inManhattan([-73.9903, 40.6925])).toBe(false); // Borough Hall, Brooklyn
  });
});

describe("exit signs", () => {
  const m = buildStation(small)!;
  it("name the corner the street stair comes up at, and nothing on a stair between floors", () => {
    const exits = placeSigns(m, info(m), () => "Broadway & Fulton St · NW corner").filter((s) => s.kind === "exit");
    expect(exits).toHaveLength(2);
    expect(exits.filter((s) => s.words === "Broadway & Fulton St · NW corner")).toHaveLength(1);
    expect(exits.find((s) => !s.words)!.z).toBeLessThan(exits.find((s) => s.words)!.z);
  });
  it("say Exit alone while the map has no streets yet", () => {
    expect(placeSigns(m, info(m), () => null).filter((s) => s.kind === "exit").every((s) => !s.words)).toBe(true);
  });
});

describe("signs over a trip's way", () => {
  // 20 m east, a left turn, 40 m north, then stairs up.
  const way: Array<[number, number, number]> = [[0, 0, -10], [20, 0, -10], [20, 40, -10], [20, 48, -5]];
  const four = bulletsFor("4", table);

  it("hangs an arrow before the turn, facing the walker, and one ahead on the long straight", () => {
    const signs = guideSigns(way, true, []);
    const left = signs.find((s) => s.arrow === "left")!;
    expect(left.kind).toBe("exit");
    // Three metres before the corner, over the way, looking back west at the walker coming east.
    expect(left.x).toBeGreaterThan(13);
    expect(left.x).toBeLessThan(19);
    expect(Math.cos(left.angle)).toBeCloseTo(-1, 1);
    expect(left.z).toBeCloseTo(-10 + SIGN_Z, 1);
    expect(signs.some((s) => s.arrow === "up" && s.y > 20)).toBe(true);
    expect(signs.some((s) => s.arrow === "right")).toBe(false);
  });

  it("carries the train's line going to it, and hangs nothing on the stairs", () => {
    const signs = guideSigns(way, false, four);
    expect(signs.length).toBeGreaterThan(0);
    for (const s of signs) {
      expect(s.kind).toBe("way");
      expect(s.routes.map((b) => b.short)).toEqual(["4"]);
      expect(s.y).toBeLessThan(41);
    }
  });

  it("hangs nothing on a way too short to turn", () => {
    expect(guideSigns([[0, 0, -5], [4, 0, -5]], true, [])).toEqual([]);
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
