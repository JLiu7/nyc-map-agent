/**
 * The way through a walkable station (stationWalk.ts) from a street entrance to
 * the platform where a train stops: the guide line the trip preview walks and
 * draws on the floor. A shortest path over the floor cells, kept a body's width
 * off the walls, then straightened wherever the walker can walk straight. Pure,
 * so it is tested without WebGL.
 */
import { CELL_M, floorUnder, PLATFORM, walkIn, type StationModel } from "./stationWalk";

type P = [number, number];
/** A point on the way, local metres, z the floor height (0 the street). */
export type RoutePoint = [number, number, number];

/** A stair top this close to the entrance is where the way in starts. */
const START_M = 25;
/** The tallest height change between neighbouring cells: a stair's slope over one cell, with room. */
const STEP_DZ = 0.45;
/** Cells where a body does not fit (beside a wall) cost this many times more, and cells within a metre of one a little more, so the way keeps to the middle. */
const TIGHT_COST = 6;
const NEAR_WALL_COST = 1.6;
const NEAR_WALL_M = 0.6;
/** A platform cell far from where the train stops costs this much per metre. */
const TRAIN_COST = 3;
/** The farthest the straightening looks ahead, in cells. */
const LOOK_CELLS = 160;

const ORTHO: P[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIAG: P[] = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

/** Binary heap of [cost, node]. */
class Heap {
  private a: Array<[number, number]> = [];
  get size() { return this.a.length; }
  push(v: [number, number]) {
    const a = this.a;
    a.push(v);
    for (let i = a.length - 1; i > 0; ) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): [number, number] {
    const a = this.a, top = a[0], last = a.pop()!;
    if (a.length) {
      a[0] = last;
      for (let i = 0; ; ) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

/**
 * The way from the street entrance `door` to the platform nearest `train` (where
 * the train stops), both in the model's local metres. Starts on the street at
 * the door and ends standing on the platform. Null when no stair top is near
 * the door or no platform can be reached from it.
 */
export function routeThrough(m: StationModel, door: P, train: P): RoutePoint[] | null {
  // Every piece's grid is aligned to the same half-metre cells, so a node is (piece, cell) and
  // pieces meet where their cells share a centre at about the same height.
  const offs: number[] = [];
  let n = 0;
  for (const g of m.pieces) { offs.push(n); n += g.h.length; }
  const pieceOf = (id: number) => {
    let k = 0;
    while (k + 1 < offs.length && offs[k + 1] <= id) k++;
    return k;
  };
  const xy = (id: number): P => {
    const k = pieceOf(id), g = m.pieces[k], c = id - offs[k];
    return [g.x0 + ((c % g.nx) + 0.5) * CELL_M, g.y0 + (Math.floor(c / g.nx) + 0.5) * CELL_M];
  };
  const height = (id: number) => { const k = pieceOf(id); return m.pieces[k].h[id - offs[k]]; };
  /** Nodes at (x, y) with floor within STEP_DZ of h. */
  const at = (x: number, y: number, h: number) => {
    const out: number[] = [];
    for (let k = 0; k < m.pieces.length; k++) {
      const g = m.pieces[k];
      const i = Math.floor((x - g.x0) / CELL_M), j = Math.floor((y - g.y0) / CELL_M);
      if (i < 0 || j < 0 || i >= g.nx || j >= g.ny) continue;
      const c = j * g.nx + i;
      if (Math.abs(g.h[c] - h) <= STEP_DZ) out.push(offs[k] + c);
    }
    return out;
  };
  /** What a step onto a cell costs per metre: more beside a wall. */
  const weight = new Map<number, number>();
  const weightOf = (id: number) => {
    let w = weight.get(id);
    if (w === undefined) {
      const [x, y] = xy(id), h = height(id);
      const fits = (dx: number, dy: number) => floorUnder(m, x + dx, y + dy, h, true) !== null;
      w = !fits(0, 0) ? TIGHT_COST : [[NEAR_WALL_M, 0], [-NEAR_WALL_M, 0], [0, NEAR_WALL_M], [0, -NEAR_WALL_M]].every(([dx, dy]) => fits(dx, dy)) ? 1 : NEAR_WALL_COST;
      weight.set(id, w);
    }
    return w;
  };
  const isTight = (id: number) => weightOf(id) === TIGHT_COST;

  // A*: a node's distance to the train is a floor on what is left (a platform cell's score adds
  // TRAIN_COST, at least 1, times its distance to the train), so the search heads that way.
  const toTrain = (x: number, y: number) => Math.hypot(x - train[0], y - train[1]);
  // Sparse: a big station has millions of cells, of which the search visits a few thousand.
  const cost = new Map<number, number>();
  const prev = new Map<number, number>();
  const costOf = (id: number) => cost.get(id) ?? Infinity;
  const heap = new Heap();
  m.pieces.forEach((g, k) => {
    if (!g.stair) return;
    for (let c = 0; c < g.h.length; c++) {
      if (!(Math.abs(g.h[c]) < 0.3)) continue;
      const id = offs[k] + c, [x, y] = xy(id);
      const d = Math.hypot(x - door[0], y - door[1]);
      if (d > START_M || d >= costOf(id)) continue;
      cost.set(id, d);
      heap.push([d + toTrain(x, y), id]);
    }
  });
  if (!heap.size) return null;

  let best = -1, bestScore = Infinity;
  while (heap.size) {
    const [f, u] = heap.pop();
    const k = pieceOf(u), g = m.pieces[k];
    const [x, y] = xy(u), h = height(u);
    const c0 = costOf(u);
    if (f > c0 + toTrain(x, y) + 1e-9) continue;
    if (f >= bestScore) break;
    if (!g.stair && g.kind[u - offs[k]] === PLATFORM) {
      const score = c0 + TRAIN_COST * Math.hypot(x - train[0], y - train[1]);
      if (score < bestScore && !isTight(u)) { bestScore = score; best = u; }
    }
    const step = (dx: number, dy: number, len: number) => {
      for (const v of at(x + dx * CELL_M, y + dy * CELL_M, h)) {
        const c = c0 + len * CELL_M * weightOf(v);
        if (c < costOf(v)) { cost.set(v, c); prev.set(v, u); const [vx, vy] = xy(v); heap.push([c + toTrain(vx, vy), v]); }
      }
    };
    for (const [dx, dy] of ORTHO) step(dx, dy, 1);
    // A diagonal only where both sides are open, so the way never cuts a wall's corner.
    for (const [dx, dy] of DIAG)
      if (at(x + dx * CELL_M, y, h).length && at(x, y + dy * CELL_M, h).length) step(dx, dy, Math.SQRT2);
  }
  if (best < 0) return null;
  const cells: RoutePoint[] = [];
  for (let id = best; id >= 0; id = prev.get(id) ?? -1) cells.unshift([...xy(id), height(id)]);
  return [[door[0], door[1], 0], ...straighten(m, cells)];
}

/** Whether the walker, starting at a, walks straight to b (same floor, not stopped by a wall). */
function straightWalk(m: StationModel, a: RoutePoint, b: RoutePoint): boolean {
  const end = walkIn(m, { x: a[0], y: a[1], z: a[2], inside: true }, b[0] - a[0], b[1] - a[1]);
  return Math.hypot(end.x - b[0], end.y - b[1]) < 0.3 && Math.abs(end.z - b[2]) < 0.3;
}

/**
 * Drops cells the walker can walk straight past: from each kept point, the
 * farthest cell ahead reached in a straight line is the next one. Stairs keep
 * their ends, so the line still follows each flight.
 */
function straighten(m: StationModel, cells: RoutePoint[]): RoutePoint[] {
  if (cells.length < 3) return cells;
  const out: RoutePoint[] = [cells[0]];
  let i = 0;
  while (i < cells.length - 1) {
    let j = i + 1;
    for (let k = Math.min(cells.length - 1, i + LOOK_CELLS); k > i + 1; k--) {
      // A shortcut stays on one floor or runs one way down (or up) one flight: a straight line
      // from a floor onto a stair would cut through the stairwell.
      const run = cells.slice(i, k + 1).map((c) => c[2]);
      const dz = run.slice(1).map((zv, s) => zv - run[s]);
      const flat = dz.every((d) => Math.abs(d) < 0.05);
      const flight = dz.every((d) => d < -0.05) || dz.every((d) => d > 0.05);
      if ((flat || flight) && straightWalk(m, cells[i], cells[k])) { j = k; break; }
    }
    out.push(cells[j]);
    i = j;
  }
  return out;
}

/** The point of a polyline nearest p, the line's direction there (radians from east), and how far off it p is. */
export function nearestOnLine(line: P[], p: P): { at: P; angle: number; d: number } | null {
  let out: { at: P; angle: number; d: number } | null = null;
  for (let s = 1; s < line.length; s++) {
    const [a, b] = [line[s - 1], line[s]];
    const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
    if (!l2) continue;
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
    const at: P = [a[0] + t * dx, a[1] + t * dy];
    const d = Math.hypot(p[0] - at[0], p[1] - at[1]);
    if (!out || d < out.d) out = { at, angle: Math.atan2(dy, dx), d };
  }
  return out;
}
