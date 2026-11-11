/**
 * The way through a walkable station (stationWalk.ts) from a street entrance to
 * the platform where a train stops: the guide line the trip preview walks and
 * draws on the floor. A shortest path over the floor cells, kept a body's width
 * off the walls, then straightened wherever the walker can walk straight. Pure,
 * so it is tested without WebGL.
 */
import { besideFlight, CELL_M, floorsAt, floorUnder, PLATFORM, STAIR_W, walkIn, type StationModel } from "./stationWalk";

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
  return [[door[0], door[1], 0], ...roundFeet(m, onFlights(m, straighten(m, cells)))];
}

/**
 * How far a point may move onto a stair's line: the half-metre cells' own error, no more. Points further off are
 * where a route steps onto a stair from its side; moved there, its turns grew sharper and walls filled the trip
 * preview's view at two of Fulton St's stairs.
 */
const ON_LINE_M = 0.3;

/**
 * Moves each end of a leg that climbs or drops along a stair onto that stair's line, the middle of its treads as
 * drawn, when it is within `ON_LINE_M` of it. Cells are half a metre, so on a stair at an angle to them the way ran
 * up to a quarter of a metre off the middle. With the stair drawn 2 m wide, the trip preview's eye went down Fulton
 * St's stair to the hall 0.76 m from one wall and 1.22 m from the other, and the near wall filled the view (owner's
 * trip recording, 2026-11-11).
 */
function onFlights(m: StationModel, pts: RoutePoint[]): RoutePoint[] {
  const flights = m.pieces.flatMap((g) => (g.flight && g.flight.line.length > 1 ? [g.flight] : []));
  const on = (f: (typeof flights)[number], p: RoutePoint) => {
    const near = nearestOnLine(f.line, [p[0], p[1]]);
    const onStair = p[2] >= Math.min(f.za, f.zb) - 0.3 && p[2] <= Math.max(f.za, f.zb) + 0.3;
    return near && onStair && near.d <= STAIR_W / 2 + 0.3 ? near : null;
  };
  const out = pts.map((p) => [...p] as RoutePoint);
  for (let i = 1; i < pts.length; i++) {
    const [a, b] = [pts[i - 1], pts[i]];
    if (Math.abs(b[2] - a[2]) < 0.05) continue;
    let best: { f: (typeof flights)[number]; d: number } | null = null;
    for (const f of flights) {
      const [na, nb] = [on(f, a), on(f, b)];
      if (na && nb && (!best || na.d + nb.d < best.d)) best = { f, d: na.d + nb.d };
    }
    if (!best) continue;
    for (const k of [i - 1, i]) {
      const near = nearestOnLine(best.f.line, [pts[k][0], pts[k][1]])!;
      if (near.d > ON_LINE_M) continue;
      out[k] = [near.at[0], near.at[1], pts[k][2]];
    }
  }
  return out;
}

/** A turn onto (or off) a stair at its foot sharper than this, in degrees, is rounded. */
const FOOT_TURN = 30;
/** How far before the foot the rounded turn starts on the floor, and how far up the stair it ends, in metres. */
const FOOT_IN_M = 1.5, FOOT_UP_M = 1;
/** Points along each rounded turn. */
const FOOT_STEPS = 8;

/**
 * Rounds the way's turn where it meets a stair at the stair's foot. At Fulton St the way along the hall reached the
 * foot of the stair to the mezzanine at 97 degrees to it and turned there in one corner: the guide line kinked across
 * the first treads, and the trip preview's eye, easing round, faced the stair's side wall as it began to climb
 * (owner's trip recording, 2026-11-11). The turn now starts `FOOT_IN_M` before the foot and ends `FOOT_UP_M` up the
 * stair, stepping onto the lowest treads from the side, which the scene leaves open (`FOOT_OPEN_M`).
 */
function roundFeet(m: StationModel, pts: RoutePoint[]): RoutePoint[] {
  const flights = m.pieces.flatMap((g) => (g.flight && g.flight.line.length > 1 ? [g.flight] : []));
  let out = pts.map((p) => [...p] as RoutePoint);
  const flat = (u: RoutePoint, v: RoutePoint) => Math.abs(u[2] - v[2]) < 0.05;
  for (let k = out.length - 2; k >= 1; k--) {
    for (const dir of [-1, 1] as const) {
      // The floor is on side `dir` of the junction k, the stair on the other.
      const [fl, st] = [out[k + dir], out[k - dir]];
      if (!fl || !st || !flat(fl, out[k]) || flat(st, out[k])) continue;
      const z0 = out[k][2];
      const f = flights.find((g) => {
        const b = besideFlight(g, st[0], st[1]);
        return Math.abs(z0 - Math.min(g.za, g.zb)) < 0.3 && st[2] > z0 && b.beside && b.d <= STAIR_W / 2;
      });
      if (!f) continue;
      const [lo, hi] = [Math.min(f.za, f.zb), Math.max(f.za, f.zb)];
      const [foot, head] = f.za <= f.zb ? [f.line[0], f.line.at(-1)!] : [f.line.at(-1)!, f.line[0]];
      const span = Math.hypot(head[0] - foot[0], head[1] - foot[1]) || 1;
      const up: P = [(head[0] - foot[0]) / span, (head[1] - foot[1]) / span];
      const il = Math.hypot(out[k][0] - fl[0], out[k][1] - fl[1]);
      if (il < 0.3) continue;
      const inn: P = [(out[k][0] - fl[0]) / il, (out[k][1] - fl[1]) / il];
      const turn = (Math.acos(Math.max(-1, Math.min(1, up[0] * inn[0] + up[1] * inn[1]))) * 180) / Math.PI;
      if (turn <= FOOT_TURN || turn > 150) continue;
      // Where the way coming in along the floor meets the stair's middle line: the corner to round.
      const cross = inn[0] * up[1] - inn[1] * up[0];
      const [rx, ry] = [foot[0] - out[k][0], foot[1] - out[k][1]];
      // Metres up the stair's line from its foot to the corner.
      const t = (rx * inn[1] - ry * inn[0]) / cross;
      if (t < -0.5 || t > span / 2) continue;
      const c: P = [foot[0] + up[0] * t, foot[1] + up[1] * t];
      const a: RoutePoint = [c[0] - inn[0] * FOOT_IN_M, c[1] - inn[1] * FOOT_IN_M, z0];
      const tb = Math.min(span - 0.5, Math.max(0, t) + FOOT_UP_M);
      const b: RoutePoint = [foot[0] + up[0] * tb, foot[1] + up[1] * tb, lo + ((hi - lo) * tb) / span];
      if (!floorsAt(m, a[0], a[1]).some((h) => Math.abs(h - z0) < 0.3)) continue;
      const curve: RoutePoint[] = [];
      let ok = true;
      for (let s = 1; s < FOOT_STEPS; s++) {
        const q = s / FOOT_STEPS, [u, v, w] = [(1 - q) * (1 - q), 2 * q * (1 - q), q * q];
        const [x, y] = [u * a[0] + v * c[0] + w * b[0], u * a[1] + v * c[1] + w * b[1]];
        const on = besideFlight(f, x, y);
        const z = on.beside && on.d <= STAIR_W / 2 ? Math.max(z0, Math.min(hi, Math.max(lo, on.z))) : z0;
        // Off the stair the turn must stay on the floor.
        if (z === z0 && !floorsAt(m, x, y).some((h) => Math.abs(h - z0) < 0.3)) ok = false;
        curve.push([x, y, z]);
      }
      if (!ok) continue;
      // Drop the way's own points from `FOOT_IN_M` before the corner on the floor to past `b` up the stair.
      const metresUp = (p: RoutePoint) => (p[0] - foot[0]) * up[0] + (p[1] - foot[1]) * up[1];
      let i = k;
      while (out[i + dir] && flat(out[i + dir], out[k]) && Math.hypot(out[i + dir][0] - c[0], out[i + dir][1] - c[1]) < FOOT_IN_M) i += dir;
      let j = k;
      while (out[j - dir] && !flat(out[j - dir], out[k]) && besideFlight(f, out[j - dir][0], out[j - dir][1]).d <= STAIR_W / 2 && metresUp(out[j - dir]) <= tb + 0.05) j -= dir;
      const seq = [a, ...curve, b];
      const [from, to] = dir === -1 ? [i - 1, j + 1] : [j - 1, i + 1];
      out = [...out.slice(0, from + 1), ...(dir === -1 ? seq : seq.reverse()), ...out.slice(to)];
      break;
    }
  }
  return out;
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
