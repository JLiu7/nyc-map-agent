import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildStation, toLocal, walkIn, type WalkStation, type WalkWay } from "./stationWalk";
import { nearestOnLine, routeThrough, type RoutePoint } from "./stationRoute";

const kx = 111_320 * Math.cos((40.71 * Math.PI) / 180);
const ll = (x: number, y: number): [number, number] => [-74.0 + x / kx, 40.71 + y / 111_320];
const way = (k: WalkWay["k"], pts: Array<[number, number]>, from: number, to = from): WalkWay => ({ k, c: pts.map(([x, y]) => ll(x, y)), from, to });

/** A street stair down to a mezzanine passage, a stair to a platform below it. */
const small: WalkStation = {
  ways: [
    way("steps", [[0, 0], [0, -8]], 0, -1),
    way("corridor", [[0, -8], [0, -30]], -1),
    way("steps", [[0, -30], [8, -30]], -1, -2),
    way("platform", [[8, -40], [8, 60]], -2),
  ],
};

/** Walks the route in 0.4 m steps and returns where the walker ends. */
function walkRoute(m: NonNullable<ReturnType<typeof buildStation>>, route: RoutePoint[]) {
  let p = { x: route[0][0], y: route[0][1], z: 0, inside: false };
  for (const [x, y] of route.slice(1)) {
    for (let i = 0; i < 400; i++) {
      const d = Math.hypot(x - p.x, y - p.y);
      if (d < 0.05) break;
      p = walkIn(m, p, ((x - p.x) / d) * Math.min(0.4, d), ((y - p.y) / d) * Math.min(0.4, d));
    }
  }
  return p;
}

describe("routeThrough", () => {
  it("leads from the street entrance down both stairs to where the train stops", () => {
    const m = buildStation(small)!;
    const door = toLocal(m, ...ll(0, 0.5));
    const train = toLocal(m, ...ll(11, 40));
    const route = routeThrough(m, door, train)!;
    expect(route).not.toBeNull();
    expect(route[0][2]).toBe(0);
    const end = route.at(-1)!;
    expect(end[2]).toBe(-10);
    // On the platform near the train's stop, not at the foot of the stair.
    expect(Math.hypot(end[0] - train[0], end[1] - train[1])).toBeLessThan(6);
    // The walker can walk it, wall to wall, and ends on the platform.
    const walked = walkRoute(m, route);
    expect(walked.z).toBe(-10);
    expect(Math.hypot(walked.x - end[0], walked.y - end[1])).toBeLessThan(0.5);
    // Straightened: a few points, not one per cell.
    expect(route.length).toBeLessThan(30);
  });

  it("finds no way in from a door with no stair near it", () => {
    const m = buildStation(small)!;
    expect(routeThrough(m, toLocal(m, ...ll(200, 200)), toLocal(m, ...ll(8, 40)))).toBeNull();
  });

  it("finds the nearest point on a track and its direction", () => {
    const near = nearestOnLine([[0, 0], [10, 0]], [4, 3])!;
    expect(near.at).toEqual([4, 0]);
    expect(near.d).toBe(3);
    expect(near.angle).toBe(0);
  });
});

describe("the committed stations", () => {
  type Sub = { entrances: { features: Array<{ properties: { id: string; kind: string }; geometry: { coordinates: [number, number] } }> }; stops?: unknown };
  const sub = JSON.parse(readFileSync("public/transit/subway.json", "utf8")) as Sub;
  const doors = (id: string) => sub.entrances.features.filter((f) => f.properties.id === id && /Stair|Escalator|Elevator/.test(f.properties.kind)).map((f) => f.geometry.coordinates);

  it("leads from an entrance to a platform at most underground stations", () => {
    const all = JSON.parse(readFileSync("public/transit/xray.json", "utf8")) as Record<string, WalkStation>;
    let tried = 0, found = 0, slowest = 0;
    for (const [id, st] of Object.entries(all)) {
      const plat = st.ways.find((w) => w.k === "platform");
      if (!doors(id).length || !plat) continue;
      const m = buildStation(st, { entrances: doors(id) });
      if (!m) continue;
      tried++;
      const mid = plat.c[Math.floor(plat.c.length / 2)];
      // Many stations have separate entrances for each direction: any entrance with a way down will do.
      for (const door of doors(id)) {
        const t0 = performance.now();
        const route = routeThrough(m, toLocal(m, ...door), toLocal(m, ...mid));
        if (route && route.at(-1)![2] < 0) {
          found++;
          slowest = Math.max(slowest, performance.now() - t0);
          break;
        }
      }
    }
    console.log(`routes: ${found} of ${tried} underground stations; slowest ${slowest.toFixed(0)} ms`);
    expect(tried).toBeGreaterThan(100);
    expect(found / tried).toBeGreaterThan(0.8);
  }, 180_000);
});
