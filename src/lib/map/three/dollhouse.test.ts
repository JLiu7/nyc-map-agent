import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { alongLine, CAR_M, CARS, carPose, forCells, lineArc, outlineWalls, pickWalk, planSigns, walkAt, walkLength, walkPlaces, type DollhouseModel } from "./dollhouse";

const load = (name: string) => JSON.parse(readFileSync(`public/transit/${name}-model.json`, "utf8")) as DollhouseModel;
const model = load("fulton");
/** Every station model: Fulton St first, then Brooklyn Bridge–City Hall and Atlantic Av–Barclays Ctr. */
const MODELS = (["fulton", "cityhall", "barclays"] as const).map((name) => ({ name, model: load(name) }));

/** Height of the model's surface under (x, y) nearest to `z`, or null where there is none. */
function floorUnder(x: number, y: number, z: number, m: DollhouseModel = model): number | null {
  let best: number | null = null;
  const { v, t } = m;
  for (let i = 0; i < t.length; i += 3) {
    const [a, b, c] = [t[i] * 3, t[i + 1] * 3, t[i + 2] * 3];
    const d = (v[b + 1] - v[c + 1]) * (v[a] - v[c]) + (v[c] - v[b]) * (v[a + 1] - v[c + 1]);
    if (Math.abs(d) < 1e-9) continue;
    const u = ((v[b + 1] - v[c + 1]) * (x - v[c]) + (v[c] - v[b]) * (y - v[c + 1])) / d;
    const w = ((v[c + 1] - v[a + 1]) * (x - v[c]) + (v[a] - v[c]) * (y - v[c + 1])) / d;
    if (u < -0.02 || w < -0.02 || u + w > 1.02) continue;
    const h = u * v[a + 2] + w * v[b + 2] + (1 - u - w) * v[c + 2];
    if (best == null || Math.abs(h - z) < Math.abs(best - z)) best = h;
  }
  return best;
}

/**
 * The trip's exit for "Take the 4 train from Grand Central to Fulton St": the E exit on Fulton Street,
 * east of Nassau St. The model's stair comes up about 33 m short of it, in the same passage.
 */
const NASSAU_EXIT: [number, number] = [-74.0075959, 40.710219];

describe.each(MODELS)("the dollhouse walks in the $name model", ({ name, model }) => {
  /** Each walk's train as the station view builds it: its own track, or the shared one, with the shared centre line. */
  const trainOf = (walk: DollhouseModel["walks"][number]) => {
    const own = walk.track ?? model.track;
    const track = { ...own, line: own.line ?? model.track.line };
    const [sx, sy] = walk.path[0];
    const door = track.line
      ? lineArc(track.line, sx, sy) - lineArc(track.line, track.at[0], track.at[1])
      : (sx - track.at[0]) * Math.cos(track.angle) + (sy - track.at[1]) * Math.sin(track.angle);
    return { track, standing: door + CAR_M * (CARS / 2) };
  };

  it("stands every walk's train in one piece and pulls it out along the track", () => {
    for (const walk of model.walks) {
      const { track, standing } = trainOf(walk);
      for (const front of [standing, standing + 40, standing + 170]) {
        const poses = Array.from({ length: CARS }, (_, i) => carPose(track, front, i));
        for (const p of poses) expect([p.x, p.y, p.angle].every(Number.isFinite)).toBe(true);
        for (let i = 1; i < CARS; i++) expect(Math.abs(Math.hypot(poses[i].x - poses[i - 1].x, poses[i].y - poses[i - 1].y) - CAR_M)).toBeLessThan(1);
      }
    }
  });

  it("leaves no floor or stair inside the standing train: it stands on its track bed, not on a platform", () => {
    const { v, t } = model;
    /** Heights of every face of the model over (x, y). */
    const heights = (x: number, y: number) => {
      const out: number[] = [];
      for (let i = 0; i < t.length; i += 3) {
        const [a, b, c] = [t[i] * 3, t[i + 1] * 3, t[i + 2] * 3];
        const d = (v[b + 1] - v[c + 1]) * (v[a] - v[c]) + (v[c] - v[b]) * (v[a + 1] - v[c + 1]);
        if (Math.abs(d) < 1e-9) continue;
        const u = ((v[b + 1] - v[c + 1]) * (x - v[c]) + (v[c] - v[b]) * (y - v[c + 1])) / d;
        const w = ((v[c + 1] - v[a + 1]) * (x - v[c]) + (v[a] - v[c]) * (y - v[c + 1])) / d;
        if (u < 0 || w < 0 || u + w > 1) continue;
        out.push(u * v[a + 2] + w * v[b + 2] + (1 - u - w) * v[c + 2]);
      }
      return out;
    };
    for (const walk of model.walks) {
      const { track, standing } = trainOf(walk);
      const inside: string[] = [];
      for (let i = 0; i < CARS; i++) {
        const p = carPose(track, standing, i), c = Math.cos(p.angle), s = Math.sin(p.angle);
        // The car body: 15 m long, 2.4 m wide, from 0.4 m over the rail to its roof.
        for (let a = -7; a <= 7; a += 1) for (const b of [-1.2, -0.6, 0, 0.6, 1.2]) {
          const x = p.x + c * a - s * b, y = p.y + s * a + c * b;
          if (heights(x, y).some((h) => h > track.at[2] + 0.4 && h < track.at[2] + 3.4)) inside.push(`${x.toFixed(1)},${y.toFixed(1)}`);
        }
      }
      expect(inside.slice(0, 10), `floor inside the train for the walk to ${walk.exit.join(",")}`).toEqual([]);
    }
  });

  it("has a walk for each exit it reaches, each from the platform to the street", () => {
    expect(model.walks.length).toBeGreaterThanOrEqual(2);
    for (const { path } of model.walks) {
      expect(walkAt(path, 0).z).toBeCloseTo(model.edges[0][4], 1);
      expect(walkAt(path, 1).z).toBeGreaterThan(-0.5);
    }
  });

  it("keeps the figure's feet on a floor or stair the whole way, on every walk", () => {
    model.walks.forEach(({ path, exit }) => {
      for (let i = 0; i <= 200; i++) {
        const p = walkAt(path, i / 200);
        const floor = floorUnder(p.x, p.y, p.z, model);
        expect(floor, `no floor under the figure at ${i / 2}% of the walk to ${exit.join(",")}`).not.toBeNull();
        expect(Math.abs((floor as number) - p.z), `feet off the floor at ${i / 2}% of the walk to ${exit.join(",")}`).toBeLessThan(0.45);
      }
    });
  });

  it("never steps up or down more than a stair's rise between frames", () => {
    for (const { path } of model.walks) {
      const n = Math.ceil(walkLength(path) * 4);
      let prev = walkAt(path, 0);
      for (let i = 1; i <= n; i++) {
        const p = walkAt(path, i / n);
        expect(Math.abs(p.z - prev.z)).toBeLessThan(0.35);
        prev = p;
      }
    }
  });

  it("raises walls along the floors' edges, and no walk passes through one", () => {
    const walls = outlineWalls(model);
    expect(walls.length).toBeGreaterThan(100);
    const side = (ax: number, ay: number, bx: number, by: number, px: number, py: number) => Math.sign((bx - ax) * (py - ay) - (by - ay) * (px - ax));
    // Walls bucketed in a grid by their bounding boxes: each step checks only the walls near it.
    const grid = new Map<string, typeof walls>();
    for (const wall of walls) forCells([wall, wall.slice(3)], (k) => { const list = grid.get(k); if (list) list.push(wall); else grid.set(k, [wall]); });
    for (const { path, exit } of model.walks) {
      const n = Math.ceil(walkLength(path) * 4);
      for (let i = 1; i <= n; i++) {
        const a = walkAt(path, (i - 1) / n), b = walkAt(path, i / n);
        const near = new Set<(typeof walls)[number]>();
        forCells([[a.x, a.y], [b.x, b.y]], (k) => grid.get(k)?.forEach((w) => near.add(w)));
        for (const [x1, y1, z1, x2, y2, z2] of near) {
          // A wall stands from its floor up; only one at the walker's level can be walked through.
          if (Math.abs((z1 + z2) / 2 - b.z) > 1) continue;
          const crosses = side(x1, y1, x2, y2, a.x, a.y) * side(x1, y1, x2, y2, b.x, b.y) < 0 && side(a.x, a.y, b.x, b.y, x1, y1) * side(a.x, a.y, b.x, b.y, x2, y2) < 0;
          expect(crosses, `the walk to ${exit.join(",")} goes through a wall at ${Math.round((i / n) * 100)}%`).toBe(false);
        }
      }
    }
  });

  it("starts every walk a step in from the platform's edge, not on the yellow strip", () => {
    /** How far (x, y) is from an edge, and whether the platform has floor 1.2 m in from it on either side. */
    const nearEdge = (x: number, y: number, [x1, y1, x2, y2, ez]: DollhouseModel["edges"][number]) => {
      const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy);
      const k = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (L * L)));
      const cx = x1 + dx * k, cy = y1 + dy * k, nx = -dy / L, ny = dx / L;
      const room = [1, -1].some((sg) => Math.abs((floorUnder(cx + nx * sg * 1.2, cy + ny * sg * 1.2, ez, model) ?? 99) - ez) < 0.3);
      return { d: Math.hypot(x - cx, y - cy), room };
    };
    for (const { path, exit } of model.walks) path.forEach(([x, y, z], i) => {
      for (const edge of model.edges) {
        if (Math.abs(z - edge[4]) >= 0.5 || nearEdge(x, y, edge).d >= 1) continue;
        // Only along a stretch where the model's platform is a sliver by the edge (no floor a metre
        // in) may a walk keep to it: one walk crosses the uptown platform, which the model lacks.
        const sliver = [path[i - 1], path[i + 1]].some((q) => q && Math.abs(q[2] - edge[4]) < 0.5 && (() => {
          const m = nearEdge((x + q[0]) / 2, (y + q[1]) / 2, edge);
          return m.d < 1 && !m.room;
        })());
        expect(sliver, `point ${i} of the walk to ${exit.join(",")} is on the platform's edge`).toBe(true);
      }
    });
    // Where the figure steps off the train, in particular: on the open platform, well clear of the strip.
    for (const { path } of model.walks) {
      const [x, y] = path[0];
      for (const [x1, y1, x2, y2] of model.edges) {
        const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy);
        const k = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (L * L)));
        expect(Math.hypot(x - (x1 + dx * k), y - (y1 + dy * k))).toBeGreaterThanOrEqual(2.5);
      }
    }
  });

  it("never takes a walk more than a floor below its platform, through another line's track bed", () => {
    // Fulton St's deepest walk goes 8.4 m down to the A/C passage; a model's walk deeper than 10 m
    // is running along a track bed the mesh left as a trench.
    for (const { path, exit } of model.walks) {
      const lowest = Math.min(...path.map((p) => p[2]));
      expect(path[0][2] - lowest, `the walk to ${exit.join(",")}`).toBeLessThanOrEqual(10);
    }
  });

  it("never walks the figure into the train standing at the platform", () => {
    // The car body is 2.7 m wide on the track's line; the figure is about 0.6 m across.
    // On a curved platform the cars follow the track's centre line: measure from that.
    for (const { path, exit, track } of model.walks) {
      const { at: [tx, ty, tz], angle } = track ?? model.track;
      const line = model.track.line;
      const nx = -Math.sin(angle), ny = Math.cos(angle);
      const off = (x: number, y: number) => {
        if (!line) return Math.abs((x - tx) * nx + (y - ty) * ny);
        const q = alongLine(line, lineArc(line, x, y));
        return Math.hypot(x - q.x, y - q.y);
      };
      const n = Math.ceil(walkLength(path) * 4);
      for (let i = 0; i <= n; i++) {
        const p = walkAt(path, i / n);
        if (Math.abs(p.z - tz) > 2) continue;
        expect(off(p.x, p.y), `the walk to ${exit.join(",")} runs into the train at ${Math.round((i / n) * 100)}%`).toBeGreaterThan(1.35 + 0.3);
      }
    }
  });

  it("names its platform and the lines it stops and transfers, with their colours", () => {
    expect(model.lines.length).toBeGreaterThan(0);
    for (const [, colour] of [...model.lines, ...model.transfers]) expect(colour).toMatch(/^#[0-9A-Fa-f]{6}$/);
    const signs = planSigns(model, model.walks[0], null);
    expect(signs[0].lines[0].text).toBe(model.name ?? "Fulton St");
  });

  it("stays small enough to load on a phone", () => {
    expect(readFileSync(`public/transit/${name}-model.json`).byteLength).toBeLessThan(2_000_000);
  });
});

describe("the dollhouse walks at Fulton St", () => {
  it("takes the trip to Fulton St the long way, under Fulton St to the exit at Nassau St", () => {
    const walk = pickWalk(model, NASSAU_EXIT);
    expect(walk).not.toBeNull();
    expect(walkLength(walk!.path)).toBeGreaterThan(150);
    expect(Math.min(...walk!.path.map((p) => p[2]))).toBeLessThan(-10);
    const { signs, gates } = walkPlaces(walk!.path);
    expect(gates).not.toBeNull();
    expect(signs.some((s) => s.last && s.up)).toBe(true);
  });

  it("has no walk for an exit it does not reach, so that trip keeps the first-person walk", () => {
    expect(pickWalk(model, [-74.0066, 40.7095])).toBeNull();
  });

  it("knows the platform's lines and the lines it transfers to, with their colours", () => {
    expect(model.lines.map(([r]) => r)).toEqual(["4", "5"]);
    expect(model.transfers.map(([r]) => r).sort()).toEqual(["2", "3", "A", "C", "J", "Z"]);
    for (const [, colour] of [...model.lines, ...model.transfers]) expect(colour).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it("signs the way as the MTA does: the platform's name, exits up, transfers down, the corner at the last stair", () => {
    const walk = pickWalk(model, NASSAU_EXIT)!;
    const corner = "Fulton St & Nassau St · NE corner";
    const signs = planSigns(model, walk, corner);
    const words = (l: { text?: string } | null) => l?.text ?? "";
    expect(words(signs[0].lines[0])).toBe("Fulton St");
    expect(signs[0].lines[0].bullets?.map(([r]) => r)).toEqual(["4", "5"]);
    expect(words(signs[0].lines[1])).toBe("Downtown & Brooklyn");
    for (const { lines: [first, second] } of signs) {
      if (first.arrow === "down") {
        expect(first.text).toBe("Exit & transfer");
        expect(words(second)).not.toMatch(/street|St\b/i);
      }
      if (first.arrow === "up") expect(first.text).toBe("Exit");
    }
    expect(signs.some(({ lines: [first, second] }) => first.arrow === "up" && words(second) === corner)).toBe(true);
    expect(signs.some(({ small, lines: [first] }) => small && first.text === "Exit")).toBe(true);
  });
});

describe("a curved track's centre line", () => {
  const line: Array<[number, number]> = [[0, 0], [10, 0], [20, 10]];
  it("finds how far along it a point lies, and the point that far along", () => {
    expect(lineArc(line, 5, 3)).toBeCloseTo(5);
    expect(lineArc(line, 15, 5)).toBeCloseTo(10 + Math.hypot(5, 5));
    const p = alongLine(line, 10 + Math.hypot(5, 5));
    expect(p.x).toBeCloseTo(15);
    expect(p.y).toBeCloseTo(5);
    expect(p.angle).toBeCloseTo(Math.PI / 4);
  });
  it("carries on straight past either end, so a long train still stands in line", () => {
    expect(alongLine(line, -4)).toMatchObject({ x: -4, y: 0 });
    const end = alongLine(line, 10 + Math.hypot(10, 10) + Math.SQRT2);
    expect(end.x).toBeCloseTo(21);
    expect(end.y).toBeCloseTo(11);
  });
});
