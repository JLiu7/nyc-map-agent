/**
 * Where a station's signs hang, in the MTA's style (owner, 2026-11-09): the
 * station's name and its lines along each platform and on the walls across the
 * tracks, the lines at the top of each stair down to a platform, "Exit" at the
 * foot of each stair up. Only
 * what the data says: which lines stop at a platform comes from the tracks
 * beside it, not from the real signs.
 */
import type { Bullet, SignInfo } from "./stationSignWords";
import { CELL_M, floorsAt, outline, PLATFORM, rooms, type StationModel } from "./stationWalk";

export type { Bullet, SignInfo } from "./stationSignWords";

type P = [number, number];
type Piece = StationModel["pieces"][number];

/**
 * One sign: its middle, the way its face looks (radians from east), and what it
 * says. `back`: it hangs free and has a face on both sides; otherwise it is on a wall.
 */
export type Sign = { kind: "name" | "exit" | "trains"; x: number; y: number; z: number; angle: number; back: boolean; name: string; routes: Bullet[] };

/** Height of a sign's middle above the floor it hangs over. */
export const SIGN_Z = 2.45;
/** Name signs along a platform, and on the wall across the tracks. */
const PLATFORM_EVERY_M = 20;
const WALL_EVERY_M = 15;
/** A line stops at a platform when its track passes this close. */
const SERVES_M = 9;
/** More signs than this are left out (a big complex would draw hundreds): wall signs go first, then those along platforms. */
const MAX_SIGNS = 240;

/** Each platform's cells, joined where they touch, per floor. */
function platforms(m: StationModel): Array<{ g: Piece; cells: number[] }> {
  const out: Array<{ g: Piece; cells: number[] }> = [];
  for (const g of m.pieces) {
    if (g.stair) continue;
    const seen = new Uint8Array(g.h.length);
    for (let c0 = 0; c0 < g.h.length; c0++) {
      if (seen[c0] || g.kind[c0] !== PLATFORM) continue;
      const cells = [c0];
      seen[c0] = 1;
      for (let k = 0; k < cells.length; k++) {
        const c = cells[k], i = c % g.nx;
        for (const n of [i > 0 ? c - 1 : -1, i < g.nx - 1 ? c + 1 : -1, c - g.nx, c + g.nx]) {
          if (n < 0 || n >= g.h.length || seen[n] || g.kind[n] !== PLATFORM) continue;
          seen[n] = 1;
          cells.push(n);
        }
      }
      if (cells.length >= 8) out.push({ g, cells });
    }
  }
  return out;
}

const centre = (g: Piece, c: number): P => [g.x0 + ((c % g.nx) + 0.5) * CELL_M, g.y0 + (Math.floor(c / g.nx) + 0.5) * CELL_M];

/** The station a platform belongs to and the lines stopping there: those whose track runs beside it. */
function served(info: SignInfo, pts: P[]): { name: string; routes: Bullet[] } {
  const near = new Set<string>();
  for (const l of info.lines) {
    if (near.has(l.route)) continue;
    if (l.c.some((q) => pts.some((p) => Math.abs(p[0] - q[0]) < SERVES_M && Math.abs(p[1] - q[1]) < SERVES_M && Math.hypot(p[0] - q[0], p[1] - q[1]) < SERVES_M))) near.add(l.route);
  }
  let best = info.stations[0], most = 0;
  for (const s of info.stations) {
    const n = s.routes.filter((r) => near.has(r.route)).length;
    if (n > most) { best = s; most = n; }
  }
  if (!best) return { name: "", routes: [] };
  const routes = best.routes.filter((r) => near.has(r.route));
  return { name: best.name, routes: routes.length ? routes : best.routes };
}

/** Every sign in the station. */
export function placeSigns(m: StationModel, info: SignInfo): Sign[] {
  const [out, onWalls, atStairs]: Sign[][] = [[], [], []];
  const home = info.stations[0] ?? { name: "", routes: [] };
  if (!home.name) return out;

  // Along each platform: name signs hanging over its middle, parallel to the tracks.
  const plats = platforms(m).map((p) => {
    const pts = p.cells.map((c) => centre(p.g, c));
    const [mx, my] = pts.reduce(([sx, sy], q) => [sx + q[0], sy + q[1]], [0, 0]).map((v) => v / pts.length);
    let [sxx, sxy, syy] = [0, 0, 0];
    for (const [x, y] of pts) { sxx += (x - mx) ** 2; sxy += (x - mx) * (y - my); syy += (y - my) ** 2; }
    const axis = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    const [ux, uy] = [Math.cos(axis), Math.sin(axis)];
    const ts = pts.map(([x, y]) => (x - mx) * ux + (y - my) * uy);
    const sample = pts.filter((_, k) => k % 3 === 0);
    return { ...p, pts, mx, my, ux, uy, axis, t0: Math.min(...ts), t1: Math.max(...ts), ...served(info, sample) };
  });
  for (const p of plats) {
    const len = p.t1 - p.t0, n = Math.max(1, Math.floor(len / PLATFORM_EVERY_M));
    for (let k = 0; k < n; k++) {
      const t = p.t0 + (len * (k + 0.5)) / n;
      const [tx, ty] = [p.mx + p.ux * t, p.my + p.uy * t];
      // The platform cell nearest that point along its middle.
      let best = 0, bd = Infinity;
      p.pts.forEach(([x, y], i) => { const d = (x - tx) ** 2 + (y - ty) ** 2; if (d < bd) { bd = d; best = i; } });
      const c = p.cells[best];
      out.push({ kind: "name", x: p.pts[best][0], y: p.pts[best][1], z: p.g.h[c] + SIGN_Z, angle: p.axis + Math.PI / 2, back: true, name: p.name, routes: p.routes });
    }
  }

  // On the walls across the tracks, facing the platform.
  rooms(m).forEach((room) => {
    const at = (x: number, y: number) => {
      const i = Math.floor((x - room.x0) / CELL_M), j = Math.floor((y - room.y0) / CELL_M);
      return i >= 0 && j >= 0 && i < room.nx && j < room.ny ? j * room.nx + i : -1;
    };
    const trackside = (x: number, y: number) => { const c = at(x, y); return c >= 0 && !Number.isNaN(room.h[c]) && room.kind[c] === 0; };
    for (const w of outline(room, (look, h) => floorsAt(m, ...look).some((f) => Math.abs(f - h) <= 0.75))) {
      const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
      if (len < 8) continue;
      const [ux, uy] = [(w.x2 - w.x1) / len, (w.y2 - w.y1) / len];
      const [mx, my] = [(w.x1 + w.x2) / 2, (w.y1 + w.y2) / 2];
      const n = [[-uy, ux], [uy, -ux]].find(([nx, ny]) => trackside(mx + nx * 0.75, my + ny * 0.75));
      if (!n) continue;
      const near = plats.filter((p) => p.g.level === room.level).sort((a, b) => Math.hypot(a.mx - mx, a.my - my) - Math.hypot(b.mx - mx, b.my - my))[0];
      const k = Math.max(1, Math.floor(len / WALL_EVERY_M));
      for (let s = 0; s < k; s++) {
        const t = (len * (s + 0.5)) / k;
        onWalls.push({ kind: "name", x: w.x1 + ux * t + n[0] * 0.06, y: w.y1 + uy * t + n[1] * 0.06, z: w.z1 + SIGN_Z - 0.6, angle: Math.atan2(n[1], n[0]), back: false, name: near?.name ?? home.name, routes: near?.routes ?? home.routes });
      }
    }
  });

  // At each stair: "Exit" at the end away from the street; at the other end, when it leads down to a platform, that platform's lines.
  const platformAt = (x: number, y: number, z: number) =>
    plats.find((p) => Math.abs(p.g.h[p.cells[0]] - z) <= 0.75 && p.pts.some(([px, py]) => Math.abs(px - x) <= CELL_M && Math.abs(py - y) <= CELL_M));
  for (const g of m.pieces) {
    const f = g.flight;
    if (!f || f.line.length < 2) continue;
    const ends = [
      { at: f.line[0], prev: f.line[1], z: f.za },
      { at: f.line.at(-1)!, prev: f.line.at(-2)!, z: f.zb },
    ];
    const [near, far] = Math.abs(ends[0].z) <= Math.abs(ends[1].z) ? ends : [ends[1], ends[0]];
    const out1 = (e: (typeof ends)[number]): P => {
      const d = Math.hypot(e.at[0] - e.prev[0], e.at[1] - e.prev[1]) || 1;
      return [(e.at[0] - e.prev[0]) / d, (e.at[1] - e.prev[1]) / d];
    };
    const [fx, fy] = out1(far), [nx, ny] = out1(near);
    // A street stair's top is on the map, which this scene does not draw.
    const street = Math.abs(near.z) <= 0.5;
    if (Math.abs(far.z) > 0.5) atStairs.push({ kind: "exit", x: far.at[0], y: far.at[1], z: far.z + SIGN_Z, angle: Math.atan2(fy, fx), back: false, name: "", routes: [] });
    const below = platformAt(far.at[0] + fx, far.at[1] + fy, far.z);
    if (below && !street) atStairs.push({ kind: "trains", x: near.at[0], y: near.at[1], z: near.z + SIGN_Z, angle: Math.atan2(ny, nx), back: false, name: below.name, routes: below.routes });
  }
  return [...atStairs, ...out, ...onWalls].slice(0, MAX_SIGNS);
}
