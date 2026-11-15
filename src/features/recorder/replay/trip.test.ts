import { describe, expect, it } from "vitest";
import { FILM_S, frameOf, tripAt, WALKED } from "./trip";

describe("the trip replay follows the film", () => {
  it("starts at the Broadway entrance and ends across from the Climate Clock", () => {
    expect(tripAt(0)).toEqual({ at: [-74.00969, 40.71039], level: "Street", place: "Cortlandt St", part: 0 });
    expect(tripAt(5).at).toEqual(tripAt(0).at);
    expect(tripAt(FILM_S)).toEqual({ at: [-73.98984, 40.73471], level: "Street", place: "14 St-Union Sq", part: 2 });
    expect(tripAt(112).at).toEqual(tripAt(FILM_S).at);
  });

  it("names the level at each step of the film", () => {
    const at = (t: number) => tripAt(t).level;
    expect(at(12)).toBe("Street");
    expect(at(15.5)).toBe("Street");
    expect(at(18.5)).toBe("Concourse");
    expect(at(30)).toBe("Concourse");
    expect(at(47)).toBe("Platform");
    // The film stays on the platform while "Board an R or W train" plays.
    expect(at(52)).toBe("Platform");
    expect(at(60)).toBe("Platform");
    expect(at(68)).toBe("Mezzanine");
    expect(at(95)).toBe("Mezzanine");
    expect(at(107.5)).toBe("Street");
  });

  it("stays at Cortlandt St until the film cuts to 14 St-Union Sq", () => {
    expect(tripAt(30).place).toBe("Cortlandt St");
    expect(tripAt(52)).toMatchObject({ place: "Cortlandt St", part: 0, at: [-74.01065, 40.71122] });
    expect(tripAt(54.9)).toMatchObject({ place: "Cortlandt St", part: 0 });
    expect(tripAt(55)).toMatchObject({ place: "14 St-Union Sq", part: 2 });
    expect(tripAt(80)).toMatchObject({ place: "14 St-Union Sq", part: 2 });
  });

  it("moves the dot a little at a time, with one cut: from the platform to the next station", () => {
    const m = (a: number[], b: number[]) => Math.hypot((b[0] - a[0]) * 111_320 * Math.cos((a[1] * Math.PI) / 180), (b[1] - a[1]) * 110_540);
    for (let t = 0; t < FILM_S; t += 0.1) {
      const a = tripAt(t), b = tripAt(t + 0.1);
      // On foot a tenth of a second is a few metres of this two-minute film at most. The film cuts once, at the ride.
      if (a.part !== b.part) continue;
      expect(m(a.at, b.at)).toBeLessThan(4);
    }
  });

  it("is at a checkpoint when its step of the film starts", () => {
    expect(tripAt(55).at).toEqual([-73.99048, 40.73645]);
    expect(tripAt(64.2).at).toEqual([-73.9908, 40.7353]);
    expect(tripAt(28.3).at).toEqual([-74.01051, 40.71087]);
  });

  it("walks west from the Broadway entrance and turns north at the Church St end", () => {
    const line = WALKED[0];
    // West all the way along the passage: every point is further west than the entrance.
    for (const p of line.slice(1)) expect(p[0]).toBeLessThan(line[0][0]);
    // Part-way through step 4 the dot is still in the passage, east of its Church St end.
    expect(tripAt(30).at[0]).toBeGreaterThan(-74.01078);
    // After the corner the walk goes north, to the turnstiles, the elevator and the platform.
    const corner = line.findIndex((p) => p[0] === -74.01078);
    for (let i = corner + 1; i < line.length; i++) expect(line[i][1]).toBeGreaterThan(line[i - 1][1]);
  });

  it("frames each station by itself and both for the ride", () => {
    const [sw, ne] = frameOf(0);
    for (const p of WALKED[0]) expect(p[0] >= sw[0] && p[0] <= ne[0] && p[1] >= sw[1] && p[1] <= ne[1]).toBe(true);
    expect(frameOf(1)[0][0]).toBe(frameOf(0)[0][0]);
    expect(frameOf(1)[1][1]).toBe(frameOf(2)[1][1]);
  });
});
