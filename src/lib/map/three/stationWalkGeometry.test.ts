import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { DollhouseModel } from "./dollhouse";
import { stationShell } from "./stationShell";
import { toYUp, walkCollider, walkGeometry } from "./stationWalkGeometry";

// Every station model, so one built later is held to the same shell as Fulton St's.
const STATIONS = ["fulton", "barclays", "cityhall"] as const;
const load = (id: string) => JSON.parse(readFileSync(`public/transit/${id}-model.json`, "utf8")) as DollhouseModel;

describe.each(STATIONS)("the %s model's walk geometry", (id) => {
  const model = load(id);
  it("turns the model's z up into three.js's y up without mirroring it", () => {
    expect(toYUp(1, 2, 3)).toEqual([1, 3, -2]);
  });

  // 65 s on a busy CI runner with the A/C level's walks (2026-11-13).
  it("draws every surface and gives the body something to collide with", { timeout: 180_000 }, () => {
    const g = walkGeometry(model);
    expect(g.floors.uv.length / 2).toBe(g.floors.position.length / 3);
    expect(g.colliders.length).toBe(5);
    for (const c of g.colliders) {
      expect(c.vertices.length).toBeGreaterThan(0);
      expect(c.indices.length * 3).toBe(c.vertices.length);
      expect([...c.vertices].every(Number.isFinite)).toBe(true);
    }
    // The floors reach down to the platforms: no walk goes below the lowest of them.
    expect(g.lowest).toBeLessThanOrEqual(Math.min(...model.walks.flatMap((w) => w.path.map((p) => p[2]))) + 0.1);
  });

  it("has a floor or ramp under every point of every walk", { timeout: 180_000 }, () => {
    const parts = walkCollider(model, stationShell(model));
    const tris = [...parts.ground, ...parts.ramps];
    const missing: string[] = [];
    for (const [wi, w] of model.walks.entries()) {
      for (let i = 1; i < w.path.length; i++) {
        const a = w.path[i - 1], b = w.path[i];
        for (let k = 0; k <= 4; k++) {
          const x = a[0] + ((b[0] - a[0]) * k) / 4, y = a[1] + ((b[1] - a[1]) * k) / 4, z = a[2] + ((b[2] - a[2]) * k) / 4;
          let under = false;
          for (let t = 0; t < tris.length && !under; t += 9) {
            const c = (p: number, q: number) => (tris[t + q] - tris[t + p]) * (y - tris[t + p + 1]) - (tris[t + q + 1] - tris[t + p + 1]) * (x - tris[t + p]);
            const d1 = c(0, 3), d2 = c(3, 6), d3 = c(6, 0), A = d1 + d2 + d3;
            if (Math.abs(A) < 1e-9 || !((d1 >= 0 && d2 >= 0 && d3 >= 0) || (d1 <= 0 && d2 <= 0 && d3 <= 0))) continue;
            const h = (d2 * tris[t + 2] + d3 * tris[t + 5] + d1 * tris[t + 8]) / A;
            under = Math.abs(h - z) < 0.6;
          }
          if (!under) missing.push(`walk ${wi} at ${x.toFixed(1)},${y.toFixed(1)},${z.toFixed(1)}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});
