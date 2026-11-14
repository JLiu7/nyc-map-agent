import { describe, expect, it } from "vitest";
import { buildCloud, project, shownCount, type StationModel } from "./cloud";

/** Two floors 10 m by 10 m, one at the street and one 6 m down, and a walk from the top one to the bottom one. */
const model: StationModel = {
  v: [0, 0, 0, 10, 0, 0, 10, 10, 0, 0, 10, 0, 0, 0, -6, 10, 0, -6, 10, 10, -6, 0, 10, -6],
  t: [0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7],
  walks: [{ path: [[1, 1, 0], [9, 9, 0], [9, 9, -6], [1, 1, -6]] }],
};

describe("the station point cloud", () => {
  it("scatters the points over both floors and keeps them inside the station", () => {
    const c = buildCloud(model, 2000);
    expect(c.xyz).toHaveLength(6000);
    let top = 0;
    for (let i = 0; i < 2000; i++) {
      expect(Math.abs(c.xyz[i * 3])).toBeLessThan(5.2);
      expect(Math.abs(c.xyz[i * 3 + 1])).toBeLessThan(5.2);
      if (c.height[i] > 0.5) top++;
    }
    // Equal floors get about equal shares.
    expect(top).toBeGreaterThan(850);
    expect(top).toBeLessThan(1150);
  });

  it("is the same cloud every time", () => {
    expect(Array.from(buildCloud(model, 300).xyz)).toEqual(Array.from(buildCloud(model, 300).xyz));
  });

  it("shows the floor the walk starts on before the floor it ends on", () => {
    const c = buildCloud(model, 2000);
    for (let i = 1; i < c.seen.length; i++) expect(c.seen[i]).toBeGreaterThanOrEqual(c.seen[i - 1]);
    const early = shownCount(c.seen, 0.3);
    let topEarly = 0;
    for (let i = 0; i < early; i++) if (c.height[i] > 0.5) topEarly++;
    expect(early).toBeGreaterThan(100);
    expect(topEarly).toBe(early);
    expect(shownCount(c.seen, 0)).toBeLessThan(200);
    expect(shownCount(c.seen, 1)).toBe(2000);
  });

  it("puts the middle of the station in the middle of the screen, and nearer points larger", () => {
    const v = { yaw: 0, pitch: 0.6, w: 400, h: 300, reach: 10 };
    const mid = project(0, 0, 0, v)!;
    expect(mid[0]).toBeCloseTo(200);
    expect(mid[1]).toBeCloseTo(150);
    expect(project(0, -8, 0, v)![2]).toBeGreaterThan(project(0, 8, 0, v)![2]);
    expect(project(0, -1000, 0, v)).toBeNull();
  });
});
