/**
 * A station you can walk through: its platforms, passages and stairs as floors
 * at real heights, so street view can take you down an entrance stair (or up to
 * an elevated platform) and keep you on the floor. Built from the station's
 * mapped ways (public/transit/xray.json underground, elevated.json above the
 * street), in local metres around the station: x east, y north, z up, the street
 * at z = 0.
 *
 * Each floor is a grid of half-metre cells; a cell holds the floor's height, or
 * nothing where there is no floor. Collision is the grid: a step lands only on
 * a cell whose floor is within a stair riser of your feet, so walls, platform
 * edges and the gaps between levels stop you. Pure, so it is tested without
 * WebGL; three/stationScene.ts draws the same grids.
 *
 * Shapes match XrayWay / XrayStation in the transit feature, which shared code
 * may not import.
 */

export type WalkWay = { k: "platform" | "steps" | "corridor"; c: Array<[number, number]>; from: number; to: number };
export type WalkStation = { ways: WalkWay[] };

/** Cell size in metres. */
export const CELL_M = 0.5;
/** Metres per OSM level (LEVEL_M in the transit model). */
const STOREY_M = 5;
/** The tallest step you can take in one move: a stair riser and then some, never a storey. */
const RISER_M = 0.75;
/** Moves are cut into steps this long, so a fast walk cannot jump a wall. */
const SUBSTEP_M = 0.2;
/** Half-widths: a passage, a platform drawn as a line, a stair, and the landing at a stair's foot. */
const CORRIDOR_R = 1.5;
const PLATFORM_R = 3;
const STAIR_R = 1;
/** A stair's width. */
export const STAIR_W = STAIR_R * 2;
const LANDING_R = 1.8;
/** Pieces of one floor this close are one floor: mezzanines are rarely drawn, only the ways across them. */
const JOIN_M = 45;
/** Stair run per metre of rise, when a stair has to be added. About 32°. */
const RUN_PER_RISE = 1.6;
/** A street entrance with no mapped stair top this close gets a stair of its own. */
const ENTRANCE_M = 15;

const FLOOR = 1;
export const PLATFORM = 2;
type CellKind = typeof FLOOR | typeof PLATFORM;

/** One floor or one flight of stairs: a cell grid in local metres. */
interface Piece {
  /** The floor's level; a stair's is its upper end. */
  level: number;
  stair: boolean;
  x0: number;
  y0: number;
  nx: number;
  ny: number;
  /** Floor height of each cell (NaN where there is none). */
  h: Float32Array;
  /** FLOOR or PLATFORM per cell; 0 where there is no floor. */
  kind: Uint8Array;
  /** A stair's centreline and the heights at its ends, for drawing its steps. */
  flight?: { line: P[]; za: number; zb: number };
}

export interface StationModel {
  /** The local origin, lon/lat. */
  origin: [number, number];
  kx: number;
  pieces: Piece[];
  /** Above the street (an elevated station) or below it. */
  elevated: boolean;
  /** Stairs and passages the data did not have, filled in so every platform can be reached. */
  added: number;
}

const z = (level: number) => level * STOREY_M;
type P = [number, number];

export function toLocal(m: Pick<StationModel, "origin" | "kx">, lon: number, lat: number): P {
  return [(lon - m.origin[0]) * m.kx, (lat - m.origin[1]) * 111_320];
}
export function toLngLat(m: Pick<StationModel, "origin" | "kx">, x: number, y: number): P {
  return [m.origin[0] + x / m.kx, m.origin[1] + y / 111_320];
}

function grid(level: number, stair: boolean, box: [number, number, number, number]): Piece {
  const x0 = Math.floor(box[0] / CELL_M) * CELL_M;
  const y0 = Math.floor(box[1] / CELL_M) * CELL_M;
  const nx = Math.max(1, Math.ceil((box[2] - x0) / CELL_M));
  const ny = Math.max(1, Math.ceil((box[3] - y0) / CELL_M));
  return { level, stair, x0, y0, nx, ny, h: new Float32Array(nx * ny).fill(NaN), kind: new Uint8Array(nx * ny) };
}
const cellAt = (g: Piece, x: number, y: number) => {
  const i = Math.floor((x - g.x0) / CELL_M), j = Math.floor((y - g.y0) / CELL_M);
  return i < 0 || j < 0 || i >= g.nx || j >= g.ny ? -1 : j * g.nx + i;
};
const centre = (g: Piece, c: number): P => [g.x0 + ((c % g.nx) + 0.5) * CELL_M, g.y0 + (Math.floor(c / g.nx) + 0.5) * CELL_M];

/** Distance from p to segment ab, and how far along ab (0..1) the nearest point is. */
function toSegment(p: P, a: P, b: P): [number, number] {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
  return [Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy), t];
}
const closedRing = (c: P[]) => c.length > 3 && c[0][0] === c.at(-1)![0] && c[0][1] === c.at(-1)![1];

/** Paints a polyline r wide onto a floor at height h. */
function paint(g: Piece, line: P[], r: number, h: number, kind: CellKind) {
  const xs = line.map((p) => p[0]), ys = line.map((p) => p[1]);
  const i0 = Math.max(0, Math.floor((Math.min(...xs) - r - g.x0) / CELL_M)), i1 = Math.min(g.nx - 1, Math.floor((Math.max(...xs) + r - g.x0) / CELL_M));
  const j0 = Math.max(0, Math.floor((Math.min(...ys) - r - g.y0) / CELL_M)), j1 = Math.min(g.ny - 1, Math.floor((Math.max(...ys) + r - g.y0) / CELL_M));
  for (let j = j0; j <= j1; j++)
    for (let i = i0; i <= i1; i++) {
      const c = j * g.nx + i, p = centre(g, c);
      let hit = line.length === 1 && Math.hypot(p[0] - line[0][0], p[1] - line[0][1]) <= r;
      for (let s = 1; !hit && s < line.length; s++) hit = toSegment(p, line[s - 1], line[s])[0] <= r;
      if (hit) set(g, c, h, kind);
    }
}
function set(g: Piece, c: number, h: number, kind: CellKind) {
  g.h[c] = h;
  if (g.kind[c] !== PLATFORM) g.kind[c] = kind;
}
/** Fills a closed polygon, row by row. */
function fill(g: Piece, ring: P[], h: number, kind: CellKind) {
  const ys = ring.map((p) => p[1]);
  const j0 = Math.max(0, Math.floor((Math.min(...ys) - g.y0) / CELL_M)), j1 = Math.min(g.ny - 1, Math.floor((Math.max(...ys) - g.y0) / CELL_M));
  for (let j = j0; j <= j1; j++) {
    const y = g.y0 + (j + 0.5) * CELL_M;
    const xs: number[] = [];
    for (let s = 1; s < ring.length; s++) {
      const [[x1, y1], [x2, y2]] = [ring[s - 1], ring[s]];
      if (y1 > y !== y2 > y) xs.push(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const i0 = Math.max(0, Math.round((xs[k] - g.x0) / CELL_M)), i1 = Math.min(g.nx - 1, Math.round((xs[k + 1] - g.x0) / CELL_M) - 1);
      for (let i = i0; i <= i1; i++) set(g, j * g.nx + i, h, kind);
    }
  }
}

/** A flight of stairs along `line`, from level `a` at its first point to level `b` at its last. */
function stair(line: P[], a: number, b: number): Piece {
  const xs = line.map((p) => p[0]), ys = line.map((p) => p[1]);
  const g = grid(Math.max(a, b), true, [Math.min(...xs) - STAIR_R, Math.min(...ys) - STAIR_R, Math.max(...xs) + STAIR_R, Math.max(...ys) + STAIR_R]);
  const run: number[] = [0];
  for (let s = 1; s < line.length; s++) run.push(run[s - 1] + Math.hypot(line[s][0] - line[s - 1][0], line[s][1] - line[s - 1][1]));
  const total = run.at(-1)! || 1;
  for (let c = 0; c < g.h.length; c++) {
    const p = centre(g, c);
    let best = Infinity, along = 0;
    for (let s = 1; s < line.length; s++) {
      const [d, t] = toSegment(p, line[s - 1], line[s]);
      if (d < best) { best = d; along = run[s - 1] + t * (run[s] - run[s - 1]); }
    }
    if (best > STAIR_R) continue;
    g.h[c] = z(a) + ((z(b) - z(a)) * along) / total;
    g.kind[c] = FLOOR;
  }
  g.flight = { line, za: z(a), zb: z(b) };
  return g;
}

/** Headroom under a floor: a stair passing closer than this to one cuts a stairwell through it. */
const HEADROOM_M = 2.5;
/**
 * Cuts each stair's stairwell out of the floors it passes through, so a stair
 * that starts inside a passage drops away from it instead of running beside it
 * at the wrong height. The floor stays where it meets the stair level.
 */
function cutStairwells(floors: Iterable<Piece>, stairs: Piece[]) {
  for (const g of floors)
    for (const s of stairs)
      for (let c = 0; c < s.h.length; c++) {
        if (Number.isNaN(s.h[c])) continue;
        const k = cellAt(g, ...centre(s, c));
        const d = k < 0 ? 0 : Math.abs(g.h[k] - s.h[c]);
        if (d > 0.3 && d < HEADROOM_M) {
          g.h[k] = NaN;
          g.kind[k] = 0;
        }
      }
}

/** Floor heights under (x, y): one per piece that has a floor there. The street (0) is not listed. */
export function floorsAt(m: StationModel, x: number, y: number): number[] {
  const out: number[] = [];
  for (const g of m.pieces) {
    const c = cellAt(g, x, y);
    if (c >= 0 && !Number.isNaN(g.h[c])) out.push(g.h[c]);
  }
  return out;
}

/**
 * Where you stand after stepping to (x, y) with your feet at `feet`: the
 * station floor nearest your feet within a riser, else the street when you are
 * near it. From the street only a stair's very top takes you in, so walking past
 * a stairwell's side keeps you on the pavement. Null when there is nowhere to
 * stand: a wall.
 */
export function floorUnder(m: StationModel, x: number, y: number, feet: number, inside = feet !== 0): { z: number; inside: boolean } | null {
  let best: number | null = null;
  for (const h of floorsAt(m, x, y)) {
    const d = Math.abs(h - feet);
    if (d <= RISER_M && (best === null || d < Math.abs(best - feet))) best = h;
  }
  if (best !== null && (inside || Math.abs(best) <= STAIR_TOP_M)) return roomAround(m, x, y, best) ? { z: best, inside: true } : null;
  return Math.abs(feet) <= RISER_M ? { z: 0, inside: false } : null;
}

/** How far down (or up) a stair you may step onto it from the street: wider than one walking step covers on a steep flight. */
const STAIR_TOP_M = 0.35;
/** How close the walker's eye may come to a wall. Walls are drawn through the edge cells' centres, so more than half a cell. */
const BODY_M = 0.4;
/** Whether there is floor at height h a body's width round (x, y): the street counts near the street. */
function roomAround(m: StationModel, x: number, y: number, h: number): boolean {
  if (Math.abs(h) <= RISER_M) return true;
  for (const [ox, oy] of [[BODY_M, 0], [-BODY_M, 0], [0, BODY_M], [0, -BODY_M]])
    if (!floorsAt(m, x + ox, y + oy).some((f) => Math.abs(f - h) <= RISER_M)) return false;
  return true;
}

/** Where the walker is: local metres, feet height, and whether they are on the station's floors or the street. */
export type StationPos = { x: number; y: number; z: number; inside: boolean };

/**
 * Walks from `pos` by (dx, dy) metres, in short steps. A step into a wall
 * slides along it (the blocked axis is dropped); a step with nowhere to stand
 * stops there.
 */
export function walkIn(m: StationModel, pos: StationPos, dx: number, dy: number): StationPos {
  const n = Math.max(1, Math.ceil(Math.hypot(dx, dy) / SUBSTEP_M));
  let { x, y, z: feet, inside } = pos;
  for (let s = 0; s < n; s++) {
    const sx = dx / n, sy = dy / n;
    const tries: P[] = [[sx, sy], [sx, 0], [0, sy]];
    let moved = false;
    for (const [tx, ty] of tries) {
      if (!tx && !ty) continue;
      const f = floorUnder(m, x + tx, y + ty, feet, inside);
      if (!f) continue;
      x += tx;
      y += ty;
      feet = f.z;
      inside = f.inside;
      moved = true;
      break;
    }
    if (!moved) break;
  }
  return { x, y, z: feet, inside };
}

// ---- Building the model ----

/** Points every `step` metres along a line, for distance checks. */
function samples(line: P[], step = 2): P[] {
  const out: P[] = [line[0]];
  for (let s = 1; s < line.length; s++) {
    const [a, b] = [line[s - 1], line[s]];
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let k = 1; k <= n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  return out;
}
const dist = (a: P, b: P) => Math.hypot(a[0] - b[0], a[1] - b[1]);
/** At most about n of the points, evenly spread. */
const thin = (pts: P[], n: number) => (pts.length <= n ? pts : pts.filter((_, i) => i % Math.ceil(pts.length / n) === 0));

/** Connected floor regions of one piece (4-neighbour), as a label per cell (-1 where no floor). */
function regions(g: Piece): { label: Int32Array; count: number } {
  const label = new Int32Array(g.h.length).fill(-1);
  let count = 0;
  for (let c0 = 0; c0 < g.h.length; c0++) {
    if (Number.isNaN(g.h[c0]) || label[c0] >= 0) continue;
    const todo = [c0];
    label[c0] = count;
    while (todo.length) {
      const c = todo.pop()!, i = c % g.nx;
      for (const n of [i > 0 ? c - 1 : -1, i < g.nx - 1 ? c + 1 : -1, c - g.nx, c + g.nx]) {
        if (n < 0 || n >= g.h.length || label[n] >= 0 || Number.isNaN(g.h[n])) continue;
        label[n] = count;
        todo.push(n);
      }
    }
    count++;
  }
  return { label, count };
}

/** Cells on a region's edge (some neighbour has no floor), every other one: enough to measure gaps. */
function edgeCells(g: Piece, label: Int32Array, count: number): P[][] {
  const out: P[][] = Array.from({ length: count }, () => []);
  let k = 0;
  for (let c = 0; c < g.h.length; c++) {
    if (label[c] < 0) continue;
    const i = c % g.nx;
    const edge = i === 0 || i === g.nx - 1 || [c - 1, c + 1, c - g.nx, c + g.nx].some((n) => n < 0 || n >= g.h.length || label[n] < 0);
    if (edge && k++ % 2 === 0) out[label[c]].push(centre(g, c));
  }
  return out;
}

/** Joins pieces of one floor that sit within JOIN_M with a passage between their nearest edges. Returns passages added. */
function joinFloor(g: Piece): number {
  const { label, count } = regions(g);
  if (count < 2) return 0;
  const edges = edgeCells(g, label, count).map((e) => thin(e, 400));
  const box = edges.map((e) => [Math.min(...e.map((p) => p[0])), Math.min(...e.map((p) => p[1])), Math.max(...e.map((p) => p[0])), Math.max(...e.map((p) => p[1]))]);
  const pairs: Array<[number, number, number, P, P]> = [];
  for (let a = 0; a < count; a++)
    for (let b = a + 1; b < count; b++) {
      const [A, B] = [box[a], box[b]];
      if (A[0] - B[2] > JOIN_M || B[0] - A[2] > JOIN_M || A[1] - B[3] > JOIN_M || B[1] - A[3] > JOIN_M) continue;
      let best = JOIN_M, pa: P | null = null, pb: P | null = null;
      for (const p of edges[a]) for (const q of edges[b]) { const d = dist(p, q); if (d < best) { best = d; pa = p; pb = q; } }
      if (pa && pb) pairs.push([best, a, b, pa, pb]);
    }
  pairs.sort((u, v) => u[0] - v[0]);
  const root = Array.from({ length: count }, (_, i) => i);
  const find = (i: number): number => (root[i] === i ? i : (root[i] = find(root[i])));
  let added = 0;
  for (const [, a, b, pa, pb] of pairs) {
    if (find(a) === find(b)) continue;
    root[find(a)] = find(b);
    paint(g, [pa, pb], CORRIDOR_R, z(g.level), FLOOR);
    added++;
  }
  return added;
}

interface BuildInput {
  /** The station's street entrances, lon/lat. Stairs are added at any without a mapped one. */
  entrances?: Array<[number, number]>;
}

/** Builds the walkable station from its mapped ways. Returns null when it has no platform. */
export function buildStation(st: WalkStation, input: BuildInput = {}): StationModel | null {
  const all = st.ways.flatMap((w) => w.c);
  if (!all.length || !st.ways.some((w) => w.k === "platform")) return null;
  const lons = all.map((p) => p[0]), lats = all.map((p) => p[1]);
  const origin: P = [(Math.min(...lons) + Math.max(...lons)) / 2, (Math.min(...lats) + Math.max(...lats)) / 2];
  const m: StationModel = { origin, kx: 111_320 * Math.cos((origin[1] * Math.PI) / 180), pieces: [], elevated: false, added: 0 };
  const ways = st.ways.map((w) => ({ ...w, c: w.c.map(([lon, lat]) => toLocal(m, lon, lat)) }));
  const entrances = (input.entrances ?? []).map(([lon, lat]) => toLocal(m, lon, lat));
  m.elevated = ways.filter((w) => w.k === "platform").every((w) => w.from > 0);

  // One grid per level, over every way and entrance with room for added stairs.
  const pts = [...ways.flatMap((w) => w.c), ...entrances];
  const margin = JOIN_M;
  const box: [number, number, number, number] = [Math.min(...pts.map((p) => p[0])) - margin, Math.min(...pts.map((p) => p[1])) - margin, Math.max(...pts.map((p) => p[0])) + margin, Math.max(...pts.map((p) => p[1])) + margin];
  const floors = new Map<number, Piece>();
  const floor = (level: number) => {
    let g = floors.get(level);
    if (!g) floors.set(level, (g = grid(level, false, box)));
    return g;
  };
  // Where each level has mapped floor, for pointing stairs the right way up.
  const onLevel = new Map<number, P[]>();
  for (const w of ways) if (w.k !== "steps" && w.from !== 0) onLevel.set(w.from, [...(onLevel.get(w.from) ?? []), ...samples(w.c, 4)]);
  const near = (p: P, level: number) => {
    const ref = level === 0 ? entrances : onLevel.get(level) ?? [];
    return ref.length ? Math.min(60, ...ref.map((q) => dist(p, q))) : 60;
  };

  for (const w of ways) {
    if (w.k === "steps" || w.from === 0) continue;
    if (w.k === "platform" && closedRing(w.c)) fill(floor(w.from), w.c, z(w.from), PLATFORM);
    else if (w.k === "platform") paint(floor(w.from), w.c, PLATFORM_R, z(w.from), PLATFORM);
    else paint(floor(w.from), w.c, CORRIDOR_R, z(w.from), FLOOR);
  }
  const stairs: Piece[] = [];
  const tops: P[] = [];
  const addFlight = (line: P[], a: number, b: number) => {
    stairs.push(stair(line, a, b));
    for (const [p, l] of [[line[0], a], [line.at(-1)!, b]] as Array<[P, number]>) {
      if (l === 0) tops.push(p);
      else paint(floor(l), [p], LANDING_R, z(l), FLOOR);
    }
  };
  for (const w of ways) {
    if (w.k !== "steps" || w.from === w.to) continue;
    // OSM's step direction is unreliable: the end given `to` is the one nearer that level's floor.
    const [a, b] = [w.c[0], w.c.at(-1)!];
    const flip = near(a, w.to) + near(b, w.from) < near(a, w.from) + near(b, w.to) - 1;
    const [la, lb] = flip ? [w.to, w.from] : [w.from, w.to];
    const runM = Math.abs(z(lb) - z(la)) * RUN_PER_RISE;
    const len = w.c.slice(1).reduce((s, p, i) => s + dist(w.c[i], p), 0);
    if (len >= runM / RUN_PER_RISE) {
      addFlight(w.c, la, lb);
      continue;
    }
    // Steeper than 45°: OSM drew a whole shaft as one short way. Keep its top (the end nearer
    // the street) and its heading, give it a walkable run, and lead its foot back to where it was.
    const topFirst = Math.abs(la) <= Math.abs(lb);
    const [top, foot] = topFirst ? [a, b] : [b, a];
    const [lt, lf] = topFirst ? [la, lb] : [lb, la];
    const d = dist(top, foot) || 1;
    const end: P = [top[0] + ((foot[0] - top[0]) / d) * runM, top[1] + ((foot[1] - top[1]) / d) * runM];
    addFlight([top, end], lt, lf);
    paint(floor(lf), [end, foot], CORRIDOR_R, z(lf), FLOOR);
  }
  for (const g of floors.values()) m.added += joinFloor(g);

  /** A stair from p on level `from` towards floor region `to` (points on level `level`), then a passage onto it. */
  const addStairTowards = (p: P, from: number, target: P[], level: number) => {
    let q = target[0];
    for (const t of target) if (dist(p, t) < dist(p, q)) q = t;
    const runM = Math.abs(z(level) - z(from)) * RUN_PER_RISE;
    let dir: P = dist(p, q) > 0.1 ? [(q[0] - p[0]) / dist(p, q), (q[1] - p[1]) / dist(p, q)] : [1, 0];
    if (dist(p, q) < runM) {
      // Too close to climb straight at it: run along the floor's long side instead.
      const far = target.reduce((f, t) => (dist(q, t) > dist(q, f) ? t : f), q);
      const d = dist(q, far);
      if (d > 1) dir = [(far[0] - q[0]) / d, (far[1] - q[1]) / d];
    }
    const end: P = [p[0] + dir[0] * runM, p[1] + dir[1] * runM];
    addFlight([p, end], from, level);
    let land = target[0];
    for (const t of target) if (dist(end, t) < dist(end, land)) land = t;
    paint(floor(level), [end, land], CORRIDOR_R, z(level), FLOOR);
    m.added++;
  };

  const regionPoints = (g: Piece) => {
    const { label, count } = regions(g);
    const pts: P[][] = Array.from({ length: count }, () => []);
    const platform = new Array<boolean>(count).fill(false);
    for (let c = 0; c < g.h.length; c++) {
      if (label[c] < 0) continue;
      if (c % 3 === 0) pts[label[c]].push(centre(g, c));
      if (g.kind[c] === PLATFORM) platform[label[c]] = true;
    }
    return { label, pts, platform };
  };

  // Street entrances with no mapped stair get one, down (or up) to the nearest floor of the closest level.
  const levels = [...floors.keys()].sort((a, b) => Math.abs(a) - Math.abs(b));
  if (levels.length)
    for (const e of entrances) {
      if (tops.some((t) => dist(t, e) < ENTRANCE_M)) continue;
      const g = floors.get(levels[0])!;
      const target = regionPoints(g).pts.flat();
      if (target.length && Math.min(...target.map((t) => dist(t, e))) < 120) addStairTowards(e, 0, target, g.level);
      tops.push(e);
    }

  // Every platform must be reachable from the street: add a stair from the nearest reachable floor where one is not.
  for (let round = 0; round < 6; round++) {
    cutStairwells(floors.values(), stairs);
    m.pieces = [...floors.values(), ...stairs];
    const info = new Map([...floors.values()].map((g) => [g, regionPoints(g)]));
    const reach = reachable(m, new Map([...info].map(([g, i]) => [g, i.label])));
    let fixed = false;
    for (const g of floors.values()) {
      const { pts: rp, platform } = info.get(g)!;
      for (let r = 0; r < rp.length; r++) {
        if (!platform[r] || !rp[r].length || reach.get(g)!.has(r)) continue;
        const few = thin(rp[r], 150);
        const gap = (p: P) => few.reduce((d, q) => Math.min(d, dist(p, q)), Infinity);
        // The nearest floor you can already reach, on a level nearer the street.
        let best: { p: P; level: number; cost: number } | null = null;
        for (const o of floors.values()) {
          if (Math.abs(o.level) >= Math.abs(g.level) || Math.sign(o.level) !== Math.sign(g.level)) continue;
          const orp = info.get(o)!.pts;
          for (const k of reach.get(o)!) for (const p of thin(orp[k], 300)) {
            const cost = gap(p) + 15 * Math.abs(o.level - g.level);
            if (!best || cost < best.cost) best = { p, level: o.level, cost };
          }
        }
        if (best) addStairTowards(best.p, best.level, rp[r], g.level);
        else if (tops.length) addStairTowards(tops.reduce((a, t) => (gap(t) < gap(a) ? t : a)), 0, rp[r], g.level);
        else continue;
        fixed = true;
      }
    }
    if (!fixed) break;
  }
  cutStairwells(floors.values(), stairs);
  m.pieces = [...floors.values(), ...stairs];
  return m;
}

/** Which regions of each floor you can walk to from the street, through stairs. */
function reachable(m: StationModel, labels?: Map<Piece, Int32Array>): Map<Piece, Set<number>> {
  const floors = m.pieces.filter((g) => !g.stair);
  const lab = labels ?? new Map(floors.map((g) => [g, regions(g).label]));
  const out = new Map(floors.map((g) => [g, new Set<number>()]));
  // A stair's ends: which floor region (or the street) each touches.
  const ends = m.pieces
    .filter((g) => g.stair)
    .map((s) => {
      const touch: Array<[Piece, number] | "street"> = [];
      for (let c = 0; c < s.h.length; c++) {
        if (Number.isNaN(s.h[c])) continue;
        const p = centre(s, c);
        if (Math.abs(s.h[c]) < 0.3) touch.push("street");
        for (const g of floors) {
          if (Math.abs(z(g.level) - s.h[c]) > RISER_M) continue;
          const k = cellAt(g, p[0], p[1]);
          if (k >= 0 && lab.get(g)![k] >= 0) touch.push([g, lab.get(g)![k]]);
        }
      }
      return touch;
    });
  const done = new Set<number>();
  let grew = true;
  while (grew) {
    grew = false;
    ends.forEach((touch, i) => {
      if (done.has(i)) return;
      const open = touch.some((t) => t === "street" || out.get(t[0])!.has(t[1]));
      if (!open) return;
      done.add(i);
      grew = true;
      for (const t of touch) if (t !== "street") out.get(t[0])!.add(t[1]);
    });
  }
  return out;
}

/** Share of a station's platform floor you can walk to from the street (0..1). */
export function reachableShare(m: StationModel): number {
  const reach = reachable(m);
  let all = 0, ok = 0;
  for (const g of m.pieces) {
    if (g.stair) continue;
    const { label } = regions(g);
    for (let c = 0; c < g.h.length; c++) {
      if (g.kind[c] !== PLATFORM) continue;
      all++;
      if (reach.get(g)!.has(label[c])) ok++;
    }
  }
  return all ? ok / all : 0;
}

// ---- What to draw ----

type Run = { x: number; y: number; w: number; z: number; kind: CellKind };
/** Each floor's cells merged into rows: one quad per run of floor along x. */
export function floorRuns(g: Piece): Run[] {
  const out: Run[] = [];
  for (let j = 0; j < g.ny; j++) {
    let i = 0;
    while (i < g.nx) {
      const c = j * g.nx + i;
      if (Number.isNaN(g.h[c])) { i++; continue; }
      const kind = g.kind[c] as CellKind;
      let k = i;
      while (k + 1 < g.nx && !Number.isNaN(g.h[c + k + 1 - i]) && g.kind[c + k + 1 - i] === kind) k++;
      out.push({ x: g.x0 + i * CELL_M, y: g.y0 + j * CELL_M, w: (k - i + 1) * CELL_M, z: g.h[c], kind });
      i = k + 1;
    }
  }
  return out;
}

/** A wall or platform edge from (x1, y1) to (x2, y2), standing on the floor at z1..z2; edges face the track. */
/** A wall's foot from (x1, y1, z1) to (x2, y2, z2). `edge`: a platform's edge, not a wall. `stair`: a stair's side. */
type Wall = { x1: number; y1: number; z1: number; x2: number; y2: number; z2: number; edge: boolean; stair?: boolean };

/** How far a traced outline may stray from the cells when it is straightened. */
const SIMPLIFY_M = 0.4;

/** Douglas-Peucker: drops points within `tol` of the line through their neighbours. */
function simplify(line: P[], tol: number): P[] {
  if (line.length < 3) return line;
  const [a, b] = [line[0], line.at(-1)!];
  let far = 0, at = 0;
  for (let i = 1; i < line.length - 1; i++) {
    const d = toSegment(line[i], a, b)[0];
    if (d > far) { far = d; at = i; }
  }
  if (far <= tol) return [a, b];
  return [...simplify(line.slice(0, at + 1), tol).slice(0, -1), ...simplify(line.slice(at), tol)];
}

/**
 * Where each floor ends with no floor beyond it at the same height: walls, or a
 * platform's edge. The outline is traced between cell centres (marching
 * squares) and straightened, so a platform at an angle to the grid gets one
 * straight edge rather than a staircase. A stair's sides are walls along its
 * flight, sloping with it, open near the street.
 */
export function walls(m: StationModel): Wall[] {
  const out: Wall[] = [];
  for (const g of m.pieces) {
    if (g.stair) {
      const f = g.flight!;
      for (let s = 1; s < f.line.length; s++) {
        const [a, b] = [f.line[s - 1], f.line[s]];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        const [nx, ny] = [-(b[1] - a[1]) / len, (b[0] - a[0]) / len];
        const total = f.line.reduce((t, p, i) => (i ? t + dist(f.line[i - 1], p) : 0), 0) || 1;
        const before = f.line.slice(0, s).reduce((t, p, i, l) => (i ? t + dist(l[i - 1], p) : 0), 0);
        const za = f.za + ((f.zb - f.za) * before) / total, zb = f.za + ((f.zb - f.za) * (before + len)) / total;
        for (const side of [-STAIR_R, STAIR_R]) {
          const w = { x1: a[0] + nx * side, y1: a[1] + ny * side, z1: za, x2: b[0] + nx * side, y2: b[1] + ny * side, z2: zb, edge: false, stair: true };
          // Beside the stair, a floor at the stair's height (a landing, the mezzanine) is open.
          const mid: P = [(w.x1 + w.x2) / 2 + nx * Math.sign(side) * 0.4, (w.y1 + w.y2) / 2 + ny * Math.sign(side) * 0.4];
          const zm = (za + zb) / 2;
          if (Math.abs(zm) <= RISER_M || floorsAt(m, ...mid).some((h) => Math.abs(h - zm) <= RISER_M)) continue;
          out.push(w);
        }
      }
      continue;
    }
    out.push(...outline(g, (look, h) => floorsAt(m, ...look).some((f) => Math.abs(f - h) <= RISER_M)));
  }
  return out;
}

/** One floor's outline, traced between cell centres (marching squares) and straightened. `open` says where a side carries on. */
export function outline(g: Piece, open: (look: P, h: number) => boolean): Wall[] {
  const out: Wall[] = [];
  const h = z(g.level);
  const on = (i: number, j: number) => i >= 0 && j >= 0 && i < g.nx && j < g.ny && !Number.isNaN(g.h[j * g.nx + i]);
  const cx = (i: number) => g.x0 + (i + 0.5) * CELL_M, cy = (j: number) => g.y0 + (j + 0.5) * CELL_M;
  // Segments by kind: 0 wall, 1 platform edge. Open sides (a stair or other floor carries on) are dropped.
  const segs: Array<[P, P, number]> = [];
  for (let j = -1; j < g.ny; j++)
    for (let i = -1; i < g.nx; i++) {
      const [a, b, c, d] = [on(i, j), on(i + 1, j), on(i + 1, j + 1), on(i, j + 1)]; // sw, se, ne, nw
      const n = (a ? 1 : 0) + (b ? 2 : 0) + (c ? 4 : 0) + (d ? 8 : 0);
      if (n === 0 || n === 15) continue;
      const S: P = [cx(i) + CELL_M / 2, cy(j)], E: P = [cx(i + 1), cy(j) + CELL_M / 2], N: P = [cx(i) + CELL_M / 2, cy(j + 1)], W: P = [cx(i), cy(j) + CELL_M / 2];
      const table: Record<number, Array<[P, P]>> = {
        1: [[W, S]], 2: [[S, E]], 3: [[W, E]], 4: [[E, N]], 5: [[W, N], [S, E]], 6: [[S, N]], 7: [[W, N]],
        8: [[N, W]], 9: [[N, S]], 10: [[N, E], [S, W]], 11: [[N, E]], 12: [[E, W]], 13: [[E, S]], 14: [[S, W]],
      };
      const inside = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]].filter(([u, v]) => on(u, v));
      const platform = inside.some(([u, v]) => g.kind[v * g.nx + u] === PLATFORM);
      for (const [p, q] of table[n]) {
        // Look just outside the floor: another floor at this height means the floor carries on.
        const [ox, oy] = inside.reduce(([sx, sy], [u, v]) => [sx + cx(u), sy + cy(v)], [0, 0]).map((v) => v / inside.length);
        const mid: P = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
        const away = Math.hypot(mid[0] - ox, mid[1] - oy) || 1;
        const look: P = [mid[0] + ((mid[0] - ox) / away) * 0.5, mid[1] + ((mid[1] - oy) / away) * 0.5];
        if (open(look, h)) continue;
        segs.push([p, q, platform ? 1 : 0]);
      }
    }
  // Chain segments of one kind into lines, then straighten them.
  const key = (p: P) => `${p[0].toFixed(3)},${p[1].toFixed(3)}`;
  for (const kind of [0, 1]) {
    const from = new Map<string, Array<[P, P]>>();
    const mine = segs.filter((s) => s[2] === kind);
    for (const [p, q] of mine) {
      from.set(key(p), [...(from.get(key(p)) ?? []), [p, q]]);
      from.set(key(q), [...(from.get(key(q)) ?? []), [q, p]]);
    }
    const used = new Set<string>();
    const segKey = (p: P, q: P) => [key(p), key(q)].sort().join("|");
    for (const [p0, q0] of mine) {
      if (used.has(segKey(p0, q0))) continue;
      used.add(segKey(p0, q0));
      const line: P[] = [p0, q0];
      for (const end of [0, 1]) {
        for (;;) {
          const tip = end ? line.at(-1)! : line[0];
          const next = (from.get(key(tip)) ?? []).find(([, q]) => !used.has(segKey(tip, q)));
          if (!next) break;
          used.add(segKey(tip, next[1]));
          if (end) line.push(next[1]);
          else line.unshift(next[1]);
        }
      }
      const straight = simplify(line, SIMPLIFY_M);
      for (let k = 1; k < straight.length; k++) out.push({ x1: straight[k - 1][0], y1: straight[k - 1][1], z1: h, x2: straight[k][0], y2: straight[k][1], z2: h, edge: kind === 1 });
    }
  }
  return out;
}

/** Each stair's steps: centre, height, direction (radians from east) and width, one box per step. */
export function treads(m: StationModel): Array<{ x: number; y: number; z: number; angle: number; run: number }> {
  const out: Array<{ x: number; y: number; z: number; angle: number; run: number }> = [];
  for (const g of m.pieces) {
    if (!g.flight) continue;
    const { line, za, zb } = g.flight;
    const total = line.reduce((t, p, i) => (i ? t + dist(line[i - 1], p) : 0), 0) || 1;
    const steps = Math.max(2, Math.round(Math.abs(zb - za) / 0.18));
    const run = total / steps;
    for (let k = 0; k < steps; k++) {
      let along = (k + 0.5) * run;
      for (let s = 1; s < line.length; s++) {
        const len = dist(line[s - 1], line[s]);
        if (along > len && s < line.length - 1) { along -= len; continue; }
        const t = Math.min(1, along / (len || 1));
        const [a, b] = [line[s - 1], line[s]];
        out.push({ x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, z: za + ((zb - za) * (k + 0.5)) / steps, angle: Math.atan2(b[1] - a[1], b[0] - a[0]), run });
        break;
      }
    }
  }
  return out;
}

/** How far past a platform's edge the trainway runs: two tracks' worth. */
const TRAINWAY_M = 5;

/**
 * The room around each underground floor: the floor itself plus the trainway
 * beside its platforms, where the tracks run. Drawn only (a ceiling, walls,
 * the track bed); you can't walk in it. One grid per floor piece; NaN outside.
 */
export function rooms(m: StationModel): Piece[] {
  if (m.elevated) return [];
  const reach = Math.round(TRAINWAY_M / CELL_M);
  return m.pieces
    .filter((g) => !g.stair)
    .map((g) => {
      const room: Piece = { ...g, stair: false, h: new Float32Array(g.h.length).fill(NaN), kind: new Uint8Array(g.h.length) };
      // Breadth-first from the platform cells, out to the trainway's width.
      const depth = new Int16Array(g.h.length).fill(-1);
      const todo: number[] = [];
      for (let c = 0; c < g.h.length; c++) {
        if (Number.isNaN(g.h[c])) continue;
        room.h[c] = g.h[c];
        room.kind[c] = g.kind[c];
        if (g.kind[c] === PLATFORM) { depth[c] = 0; todo.push(c); }
      }
      for (let k = 0; k < todo.length; k++) {
        const c = todo[k], i = c % g.nx;
        if (depth[c] >= reach) continue;
        for (const n of [i > 0 ? c - 1 : -1, i < g.nx - 1 ? c + 1 : -1, c - g.nx, c + g.nx]) {
          if (n < 0 || n >= g.h.length || depth[n] >= 0) continue;
          depth[n] = depth[c] + 1;
          todo.push(n);
          if (Number.isNaN(room.h[n])) room.h[n] = z(g.level);
        }
      }
      return room;
    });
}

/** The trainway's cells of a room (room, not floor): where the track bed goes. */
export function trainway(room: Piece, floor: Piece): Run[] {
  const bed: Piece = { ...room, h: room.h.map((h, c) => (Number.isNaN(floor.h[c]) ? h : NaN)), kind: room.kind.map((_, c) => (Number.isNaN(floor.h[c]) ? FLOOR : 0)) };
  return floorRuns(bed);
}

/** Where to stand at a street entrance: its stair top. Null when the station has none. */
export function streetTops(m: StationModel): P[] {
  const out: P[] = [];
  for (const g of m.pieces) {
    if (!g.stair) continue;
    for (let c = 0; c < g.h.length; c++) if (Math.abs(g.h[c]) < 0.15) out.push(centre(g, c));
  }
  return out;
}
