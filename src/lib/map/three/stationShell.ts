/**
 * The station as a closed shell to walk inside (owner, 2026-11-13: no holes or gaps in the walls).
 * The model has floors and stairs but no walls, and the walls raised along their edges left three
 * kinds of gap: wedges at corners where two straight walls met, short upright pieces left out, and
 * open space under a stair's side down to the floor below. Here every wall runs a little past both
 * of its ends so corners overlap, and reaches down to the floor below it, so nothing is open.
 *
 * Plain numbers in the model's frame (metres, x east, y north, z up), no three.js: the walk scene
 * draws these and collides with the same shapes, and the tests check them for gaps.
 */
import type { DollhouseModel } from "./dollhouse";

type P3 = [number, number, number];

/** How tall walls stand over the floor they edge, and how thick they are. */
export const SHELL_WALL_M = 3;
export const SHELL_THICK_M = 0.25;
/** How far each wall runs past its ends, so the corner it shares with the next one closes. */
const OVERLAP_M = SHELL_THICK_M;
/** Half the width of a ramp laid where a walk crosses a gap in the model. */
const RAMP_HALF_M = 0.7;
/** Half the width of a doorway cut where a walk passes through a wall. */
const DOOR_HALF_M = 0.6;
/** A doorway is never narrower than this either side of where the walk crosses (a body is 0.6 m wide). */
const DOOR_MIN_HALF_M = 0.45;
/** Along every walk, nothing the body collides with comes nearer the walk's line than this, at body height. */
export const WALK_CLEAR_M = 0.35;
/** A doorway's sill sits this far below the walk (under its floor), its lintel this far above. */
const DOOR_SILL_M = 0.15;
const DOOR_HEAD_M = 2.2;
/** How much of each end of a walk (where it meets the street) is left walled. */
const DOOR_END_M = 0.6;
/** Wall tops and ceilings that pass under another floor are cut into pieces this long to follow it. */
const CAP_PIECE_M = 0.5;
/** With no floor below, a wall still reaches this far down, past the bottom of any view. */
const SKIRT_M = 3;
/** Steeper than this (|normal z| below) a piece of the model is an upright wall, not a floor. */
const UPRIGHT_NZ = 0.3;
/** Flatter than this a walkable piece is a floor; between the two it is a stair. */
export const FLAT_NZ = 0.97;

/**
 * The model's fare gates: upright panels under 2 m long and 1.6 m tall, standing in rows across the
 * walks (163 of its 169 uprights; the rest are the platform edges' faces). Nine numbers, one triangle.
 */
export function isGatePanel(t: ArrayLike<number>): boolean {
  const xs = [t[0], t[3], t[6]], ys = [t[1], t[4], t[7]], zs = [t[2], t[5], t[8]];
  const span = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  return span < 2 && Math.max(...zs) - Math.min(...zs) < 1.6;
}

/** Each fare-gate panel of the model once: the middle of its foot, and the way it runs (atan2 dx, dy). */
export function gatePanels(model: DollhouseModel): Array<{ at: P3; heading: number }> {
  const seen = new Set<string>();
  const out: Array<{ at: P3; heading: number }> = [];
  for (let i = 0; i < model.t.length; i += 3) {
    const t = tri(model.v, model.t, i);
    const nz = normalZ(t);
    if (nz == null || nz >= UPRIGHT_NZ) continue;
    const flat = t.flat();
    if (!isGatePanel(flat)) continue;
    // The panel's two bottom corners: the lowest two of its triangle pair share them.
    const lo = Math.min(t[0][2], t[1][2], t[2][2]);
    const xs = t.map((p) => p[0]), ys = t.map((p) => p[1]);
    const ax = Math.min(...xs), bx = Math.max(...xs), ay = Math.min(...ys), by = Math.max(...ys);
    const key = [ax, bx, ay, by, lo].map((n) => n.toFixed(1)).join();
    if (seen.has(key)) continue;
    seen.add(key);
    // The panel runs between the two corners of its triangle that lie furthest apart seen from above.
    let dx = 0, dy = 0;
    for (const [a, b] of [[0, 1], [1, 2], [0, 2]]) {
      const ex = t[b][0] - t[a][0], ey = t[b][1] - t[a][1];
      if (ex * ex + ey * ey > dx * dx + dy * dy) { dx = ex; dy = ey; }
    }
    out.push({ at: [(ax + bx) / 2, (ay + by) / 2, lo], heading: Math.atan2(dx, dy) });
  }
  return out;
}

/** A wall slab: its centre line from a to b, foot and top heights at each end, and its thickness. */
export type ShellWall = {
  a: [number, number]; b: [number, number]; foot: [number, number]; top: [number, number]; thick: number;
  /** The sill below or the lintel above a doorway a walk passes through. */
  door?: "sill" | "lintel";
};

export type Shell = {
  /** Triangles, nine numbers each (three corners), z up. */
  floors: number[];
  stairs: number[];
  /** The model's own upright pieces, every one kept (the dollhouse leaves out the short ones). */
  uprights: number[];
  walls: ShellWall[];
  /** Strips of floor across the slits where the model's stairs and floors stop short of each other. */
  bridges: number[];
  /** A ceiling over every floor and stair, where nothing else is already overhead. */
  ceiling: number[];
};

const tri = (v: number[], t: number[], i: number): [P3, P3, P3] => {
  const P = (k: number): P3 => [v[k * 3], v[k * 3 + 1], v[k * 3 + 2]];
  return [P(t[i]), P(t[i + 1]), P(t[i + 2])];
};
const normalZ = ([a, b, c]: [P3, P3, P3]): number | null => {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
  const len = Math.hypot(n[0], n[1], n[2]);
  return len < 1e-9 ? null : Math.abs(n[2]) / len;
};

/** The surface heights in `here` a step of under `rise` away from any height in `from`, without repeats. */
function reachable(from: number[], here: number[], rise: number): number[] {
  const out = new Map<number, number>();
  for (const g of here) if (from.some((h) => Math.abs(g - h) < rise)) out.set(Math.round(g * 100), g);
  return [...out.values()];
}

/** Looks up walkable surfaces (floors and stairs) under a point, through a 2 m grid. */
export function surfaceFinder(tris: Array<[P3, P3, P3]>) {
  const CELL = 2;
  const grid = new Map<string, Array<[P3, P3, P3]>>();
  for (const t of tris) {
    const xs = t.map((p) => p[0]), ys = t.map((p) => p[1]);
    for (let i = Math.floor(Math.min(...xs) / CELL); i <= Math.floor(Math.max(...xs) / CELL); i++)
      for (let j = Math.floor(Math.min(...ys) / CELL); j <= Math.floor(Math.max(...ys) / CELL); j++) {
        const k = `${i},${j}`;
        const list = grid.get(k);
        if (list) list.push(t); else grid.set(k, [t]);
      }
  }
  /** Heights of every surface straight under or over (x, y). */
  return (x: number, y: number, pad = 0.01): number[] => {
    const out: number[] = [];
    for (const [a, b, c] of grid.get(`${Math.floor(x / CELL)},${Math.floor(y / CELL)}`) ?? []) {
      const d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
      if (Math.abs(d) < 1e-9) continue;
      const u = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / d;
      const w = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / d;
      if (u < -pad || w < -pad || u + w > 1 + pad) continue;
      out.push(u * a[2] + w * b[2] + (1 - u - w) * c[2]);
    }
    return out;
  };
}

export function stationShell(model: DollhouseModel, onEdge?: (p: P3, q: P3, kind: string) => void): Shell {
  const floors: number[] = [], stairs: number[] = [], uprights: number[] = [];
  const walkable: Array<[P3, P3, P3]> = [];
  for (let i = 0; i < model.t.length; i += 3) {
    const t = tri(model.v, model.t, i);
    const nz = normalZ(t);
    if (nz == null) continue;
    const flat = t.flat();
    if (nz < UPRIGHT_NZ) { uprights.push(...flat); continue; }
    walkable.push(t);
    (nz < FLAT_NZ ? stairs : floors).push(...flat);
  }
  // Where a walk passes over nothing (the model leaves out the bottom of some stairs), lay a ramp
  // 1.4 m wide along it. It counts as floor for everything below, but its own sides are not edges:
  // the model's edges around it decide where walls go.
  const bridges: number[] = [];
  const ramps: Array<[P3, P3, P3]> = [];
  const modelUnder = surfaceFinder(walkable);
  const laid = new Set<string>();
  for (const w of model.walks) for (let i = 1; i < w.path.length; i++) {
    const a = w.path[i - 1], b = w.path[i];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    // Walks share their first and last stretches; lay each stretch's ramp once.
    const seg = [a, b].map((p) => p.map((v) => Math.round(v * 10)).join(",")).sort().join("|");
    if (L < 0.05 || laid.has(seg)) continue;
    laid.add(seg);
    const n = Math.max(2, Math.ceil(L / 0.25));
    const bare = Array.from({ length: n + 1 }, (_, j) => {
      const k = j / n, z = a[2] + (b[2] - a[2]) * k;
      return !modelUnder(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, 0.02).some((h) => Math.abs(h - z) < 0.15);
    });
    const nx = -(b[1] - a[1]) / L * RAMP_HALF_M, ny = (b[0] - a[0]) / L * RAMP_HALF_M;
    for (let j = 0; j < n; j++) {
      if (!bare[j] && !bare[j + 1]) continue;
      let e = j;
      while (e + 1 < n && (bare[e + 1] || bare[e + 2])) e++;
      // One ramp per bare stretch, running a step past each end so it overlaps the floor it leaves.
      const k0 = Math.max(0, (j - 1) / n), k1 = Math.min(1, (e + 2) / n);
      j = e;
      const p0: P3 = [a[0] + (b[0] - a[0]) * k0, a[1] + (b[1] - a[1]) * k0, a[2] + (b[2] - a[2]) * k0];
      const p1: P3 = [a[0] + (b[0] - a[0]) * k1, a[1] + (b[1] - a[1]) * k1, a[2] + (b[2] - a[2]) * k1];
      const c: P3[] = [[p0[0] - nx, p0[1] - ny, p0[2]], [p1[0] - nx, p1[1] - ny, p1[2]], [p1[0] + nx, p1[1] + ny, p1[2]], [p0[0] + nx, p0[1] + ny, p0[2]]];
      for (const t of [[c[0], c[1], c[2]], [c[0], c[2], c[3]]] as Array<[P3, P3, P3]>) {
        if (normalZ(t) == null) continue;
        ramps.push(t);
        bridges.push(...t.flat());
      }
    }
  }
  const under = surfaceFinder([...walkable, ...ramps]);

  // Every open edge of a floor or stair (used by one triangle only) either meets more floor a little
  // way out, and is bridged to it, or it gets a wall. The platform's edge over the track stays open.
  const key = (p: P3) => `${Math.round(p[0] * 20)},${Math.round(p[1] * 20)},${Math.round(p[2] * 20)}`;
  const edgeKey = (p: P3, q: P3) => [key(p), key(q)].sort().join("|");
  const uses = new Map<string, number>();
  for (const t of walkable) for (let e = 0; e < 3; e++) uses.set(edgeKey(t[e], t[(e + 1) % 3]), (uses.get(edgeKey(t[e], t[(e + 1) % 3])) ?? 0) + 1);
  const steps: Array<[P3, P3]> = model.walks.flatMap((w) => w.path.slice(1).map((q, i): [P3, P3] => [w.path[i], q]));
  const side = (a: number[], b: number[], p: number[]) => Math.sign((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]));
  /** Whether a walk steps across the edge p–q (within 1.5 m of its height). */
  const walkedOver = (p: P3, q: P3) => steps.some(([a, b]) => Math.abs((a[2] + b[2]) / 2 - (p[2] + q[2]) / 2) < 1.5
    && side(p, q, a) * side(p, q, b) <= 0 && side(a, b, p) * side(a, b, q) <= 0);
  /** Where walks cross the edge p–q (a walk running alongside it does not count). */
  const crossings = (p: P3, q: P3): P3[] => steps.flatMap(([a, b]): P3[] => {
    const rx = q[0] - p[0], ry = q[1] - p[1], sx = b[0] - a[0], sy = b[1] - a[1];
    const den = rx * sy - ry * sx;
    if (Math.abs(den) < 1e-9) return [];
    const t = ((a[0] - p[0]) * sy - (a[1] - p[1]) * sx) / den, u = ((a[0] - p[0]) * ry - (a[1] - p[1]) * rx) / den;
    if (t < -0.05 || t > 1.05 || u < -0.05 || u > 1.05) return [];
    const z = a[2] + (b[2] - a[2]) * u;
    return Math.abs(z - (p[2] + (q[2] - p[2]) * t)) < 1.5 ? [[p[0] + rx * t, p[1] + ry * t, z]] : [];
  });
  const overTrack = (x: number, y: number, z: number) => model.edges.some(([x1, y1, x2, y2, ez]) => {
    if (Math.abs(z - ez) > 0.5) return false;
    const dx = x2 - x1, dy = y2 - y1, L2 = dx * dx + dy * dy || 1e-9;
    const k = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / L2));
    return Math.hypot(x - (x1 + dx * k), y - (y1 + dy * k)) < 1.2;
  });
  /**
   * How far out from (x, y, z) along (ox, oy) the next floor or stair starts within `tol` of its
   * height, and that height. Tight, so a floor beside a stair's rising side gets a wall, not a strip.
   */
  const across = (x: number, y: number, z: number, ox: number, oy: number, max: number, tol: number): [number, number] | null => {
    for (let d = 0.05; d <= max; d += 0.05) {
      const hs = under(x + ox * d, y + oy * d, 0.005).filter((h) => Math.abs(h - z) < tol);
      if (hs.length) return [d, hs.reduce((m, h) => (Math.abs(h - z) < Math.abs(m - z) ? h : m))];
    }
    return null;
  };
  /** Whether stepping out from c, following floor in steps of under 0.35 m, drops into empty space within 1.5 m. */
  const fallsOff = (c: P3, ox: number, oy: number, rise = 0.35) => {
    let hs = [c[2]];
    for (let d = 0.05; d <= 1.5; d += 0.05) {
      hs = reachable(hs, under(c[0] + ox * d, c[1] + oy * d, 0.02), rise);
      if (!hs.length) return true;
    }
    return false;
  };
  const walls: ShellWall[] = [];
  for (const t of walkable) for (let e = 0; e < 3; e++) {
    const p = t[e], q = t[(e + 1) % 3], o = t[(e + 2) % 3];
    if (uses.get(edgeKey(p, q)) !== 1) continue;
    const L = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (L < 0.02) continue;
    const ux = (q[0] - p[0]) / L, uy = (q[1] - p[1]) / L;
    let ox = -uy, oy = ux;
    const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2, mz = (p[2] + q[2]) / 2;
    if ((o[0] - mx) * ox + (o[1] - my) * oy > 0) { ox = -ox; oy = -oy; }
    if (overTrack(mx, my, mz) && overTrack(p[0], p[1], p[2]) && overTrack(q[0], q[1], q[2])) { onEdge?.(p, q, "track"); continue; }
    const walked = walkedOver(p, q);
    const crossed = walked ? crossings(p, q) : [];
    /** Within 0.8 m of where a walk crosses this edge (a body and a little to spare). */
    const nearWalk = (c: P3) => crossed.some((x) => Math.hypot(x[0] - c[0], x[1] - c[1]) < 0.8 && Math.abs(x[2] - c[2]) < 1);
    const max = walked ? 2.5 : 1.2;
    // Probe every 0.15 m along the edge: a long edge can have floor beyond its ends and a hole between.
    const n = Math.max(2, Math.ceil(L / 0.15));
    const at = (k: number): P3 => [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k, p[2] + (q[2] - p[2]) * k];
    const samples = Array.from({ length: n }, (_, i) => {
      const k = (i + 0.5) / n;
      const c = at(k);
      const r = across(c[0], c[1], c[2], ox, oy, max, walked ? 0.6 : 0.3);
      // Touching floor that runs out into empty space a little further on is only a sliver: wall it.
      // Only the stretch of the edge a walk actually passes through is a way through.
      // Where a walk crosses, a stair's first tread may sit up to 0.6 m above the floor.
      const kind = r == null ? "wall" : r[0] > 0.06 ? "bridge" : fallsOff(c, ox, oy, walked && nearWalk(c) ? 0.6 : 0.35) ? "wall" : "seam";
      return { k, r, kind };
    });
    // Runs of the same kind, each spanning from halfway to its neighbours (the ends of the edge at the ends).
    for (let i = 0; i < n;) {
      let j = i;
      while (j + 1 < n && samples[j + 1].kind === samples[i].kind) j++;
      const k0 = i === 0 ? 0 : (samples[i - 1].k + samples[i].k) / 2, k1 = j === n - 1 ? 1 : (samples[j].k + samples[j + 1].k) / 2;
      const a0 = at(k0), a1 = at(k1), run = samples.slice(i, j + 1), kind = samples[i].kind;
      i = j + 1;
      onEdge?.(a0, a1, kind + (walked ? " (walked)" : ""));
      if (kind === "seam") continue;
      if (kind === "bridge") {
        // A strip of floor from the edge out to the next surface, a hair past it so they overlap.
        const r = Math.max(...run.map((x) => (x.r as [number, number])[0])) + 0.05;
        const h0 = (run[0].r as [number, number])[1], h1 = (run[run.length - 1].r as [number, number])[1];
        bridges.push(...a0, ...a1, a1[0] + ox * r, a1[1] + oy * r, h1, ...a0, a1[0] + ox * r, a1[1] + oy * r, h1, a0[0] + ox * r, a0[1] + oy * r, h0);
        continue;
      }
      // A wall, centred on the edge, running past both ends so the corner with the next wall closes,
      // and down to the highest floor below it (or a skirt), so nothing shows underneath a stair.
      const footAt = (c: P3) => {
        let best = c[2] - SKIRT_M;
        for (const sgn of [1, -1]) for (const h of under(c[0] + ox * sgn * 0.4, c[1] + oy * sgn * 0.4)) if (h < c[2] - 0.05 && h > best) best = h;
        return Math.min(best, c[2] - 0.3);
      };
      walls.push({
        a: [a0[0] - ux * OVERLAP_M, a0[1] - uy * OVERLAP_M],
        b: [a1[0] + ux * OVERLAP_M, a1[1] + uy * OVERLAP_M],
        foot: [footAt(a0), footAt(a1)],
        top: [a0[2] + SHELL_WALL_M, a1[2] + SHELL_WALL_M],
        thick: SHELL_THICK_M,
      });
    }
  }

  // A doorway wherever a walk passes through a wall: the walks are the routes people take, so a wall
  // standing across one is a mistake. The last 0.6 m of a walk, where it meets the street, stays walled,
  // and so does a wall a walk only brushes as it runs alongside (the figure slides along it), or one
  // where the walk cuts a corner over a stairwell (there is no floor on the far side to step onto).
  const doors = new Map<ShellWall, Array<[number, number, number]>>();
  const thresholds = new Set<string>();
  for (const w of model.walks) {
    const at = walkPoints(w.path, 0.1, DOOR_END_M);
    for (const [x, y, z, ux, uy, slope] of at) for (const wall of walls) {
      if (!crossesWall(wall, x, y, z, ux, uy) || !floorBothSides(under, wall, x, y, z)) continue;
      const dx = wall.b[0] - wall.a[0], dy = wall.b[1] - wall.a[1], L = Math.hypot(dx, dy);
      // The doorway runs up to DOOR_HALF_M each way, but only as far as there is floor on both sides.
      const c = ((x - wall.a[0]) * dx + (y - wall.a[1]) * dy) / L;
      const open = (s: number) => floorBothSides(under, wall, wall.a[0] + (dx * s) / L, wall.a[1] + (dy * s) / L, z);
      let lo = c, hi = c;
      while (lo - 0.05 >= c - DOOR_HALF_M && open(lo - 0.05)) lo -= 0.05;
      while (hi + 0.05 <= c + DOOR_HALF_M && open(hi + 0.05)) hi += 0.05;
      // Pull the jambs in a little from where the floor runs out, but never narrower than a body.
      lo = Math.min(c - DOOR_MIN_HALF_M, lo + 0.1);
      hi = Math.max(c + DOOR_MIN_HALF_M, hi - 0.1);
      (doors.get(wall) ?? doors.set(wall, []).get(wall)!).push([lo, hi, z]);
      const sill = `${walls.indexOf(wall)}:${Math.round(c / 0.3)}`;
      if (thresholds.has(sill)) continue;
      thresholds.add(sill);
      // A threshold through the doorway at the walk's height, 0.4 m each way, so no sliver of the
      // stairwell shows between the floors on either side.
      const sx = (dx / L) * ((hi - lo) / 2), sy = (dy / L) * ((hi - lo) / 2);
      const mx = wall.a[0] + (dx * (lo + hi)) / 2 / L - x, my = wall.a[1] + (dy * (lo + hi)) / 2 / L - y;
      const c0: P3 = [x + mx - ux * 0.4, y + my - uy * 0.4, z - slope * 0.4 - 0.02], c1: P3 = [x + mx + ux * 0.4, y + my + uy * 0.4, z + slope * 0.4 - 0.02];
      const q: P3[] = [[c0[0] - sx, c0[1] - sy, c0[2]], [c1[0] - sx, c1[1] - sy, c1[2]], [c1[0] + sx, c1[1] + sy, c1[2]], [c0[0] + sx, c0[1] + sy, c0[2]]];
      bridges.push(...q[0], ...q[1], ...q[2], ...q[0], ...q[2], ...q[3]);
    }
  }
  for (const [wall, cuts] of doors) {
    walls.splice(walls.indexOf(wall), 1);
    walls.push(...cutWall(wall, cuts));
  }

  // A wall's top and a ceiling stand a wall's height over their own floor or stair. Down a stair that
  // passes under another floor, that height comes up through the floor above and shows there as a
  // sliver or a slanted shard (owner, 2026-11-13). Wherever a floor lies overhead, the top is capped
  // just under it; elsewhere (over a stairwell's opening) it stays where it was, so nothing opens.
  const capAt = (x: number, y: number, own: number) => {
    const top = own + SHELL_WALL_M;
    let cap = top;
    for (const h of under(x, y)) if (h > own + 0.5 && h < top + 0.05) cap = Math.min(cap, h - 0.02);
    return cap;
  };
  for (const w of [...walls]) {
    if (w.door) continue;
    const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
    const n = Math.max(1, Math.ceil(L / CAP_PIECE_M));
    const at = (k: number) => [w.a[0] + (w.b[0] - w.a[0]) * k, w.a[1] + (w.b[1] - w.a[1]) * k] as const;
    const caps = Array.from({ length: n + 1 }, (_, i) => {
      const k = i / n, [x, y] = at(k), top = w.top[0] + (w.top[1] - w.top[0]) * k;
      return { k, top, cap: capAt(x, y, top - SHELL_WALL_M) };
    });
    if (caps.every((c) => c.cap >= c.top - 1e-3)) continue;
    walls.splice(walls.indexOf(w), 1);
    const ux = (w.b[0] - w.a[0]) / (L || 1), uy = (w.b[1] - w.a[1]) / (L || 1);
    for (let i = 0; i < n; i++) {
      const [x0, y0] = at(caps[i].k), [x1, y1] = at(caps[i + 1].k);
      const foot = (k: number) => w.foot[0] + (w.foot[1] - w.foot[0]) * k;
      walls.push({
        a: [x0 - ux * 0.03, y0 - uy * 0.03], b: [x1 + ux * 0.03, y1 + uy * 0.03],
        foot: [Math.min(foot(caps[i].k), caps[i].cap - 0.1), Math.min(foot(caps[i + 1].k), caps[i + 1].cap - 0.1)],
        top: [caps[i].cap, caps[i + 1].cap],
        thick: w.thick,
      });
    }
  }

  // The ceiling: each floor and stair raised a wall's height, except where something else is already
  // overhead lower than that (a stair or a floor above is the ceiling there), capped as the walls are.
  const ceiling: number[] = [];
  const roof = (t: [P3, P3, P3]) => {
    const caps = t.map((p) => capAt(p[0], p[1], p[2]));
    const mids: P3[] = [[0, 1], [1, 2], [0, 2]].map(([i, j]) => [(t[i][0] + t[j][0]) / 2, (t[i][1] + t[j][1]) / 2, (t[i][2] + t[j][2]) / 2]);
    const capped = caps.some((c, i) => c < t[i][2] + SHELL_WALL_M - 1e-3) || mids.some((m) => capAt(m[0], m[1], m[2]) < m[2] + SHELL_WALL_M - 1e-3);
    const long = Math.max(...[[0, 1], [1, 2], [0, 2]].map(([i, j]) => Math.hypot(t[i][0] - t[j][0], t[i][1] - t[j][1])));
    if (capped && long > CAP_PIECE_M) {
      // Split across the longest side and cap each half.
      const e = [[0, 1], [1, 2], [0, 2]].reduce((b, [i, j]) => (Math.hypot(t[i][0] - t[j][0], t[i][1] - t[j][1]) > Math.hypot(t[b[0]][0] - t[b[1]][0], t[b[0]][1] - t[b[1]][1]) ? [i, j] : b), [0, 1]);
      const [i, j] = e, k = 3 - i - j;
      const m: P3 = [(t[i][0] + t[j][0]) / 2, (t[i][1] + t[j][1]) / 2, (t[i][2] + t[j][2]) / 2];
      roof([t[i], m, t[k]]);
      roof([m, t[j], t[k]]);
      return;
    }
    for (let q = 0; q < 3; q++) ceiling.push(t[q][0], t[q][1], capped ? caps[q] : t[q][2] + SHELL_WALL_M);
  };
  for (const t of walkable) {
    const cx = (t[0][0] + t[1][0] + t[2][0]) / 3, cy = (t[0][1] + t[1][1] + t[2][1]) / 3, cz = (t[0][2] + t[1][2] + t[2][2]) / 3;
    if (under(cx, cy).some((h) => h > cz + 0.5 && h < cz + SHELL_WALL_M)) continue;
    roof(t);
  }
  return { floors, stairs, uprights, walls, bridges, ceiling };
}

/** A wall slab as closed triangles (12, outward-facing), nine numbers each. */
export function wallTriangles(w: ShellWall): number[] {
  const dx = w.b[0] - w.a[0], dy = w.b[1] - w.a[1], L = Math.hypot(dx, dy) || 1;
  const nx = (-dy / L) * (w.thick / 2), ny = (dx / L) * (w.thick / 2);
  // Corners: a/b ends, left (+n) / right (-n) sides, foot / top.
  const c = (end: 0 | 1, side: 1 | -1, up: 0 | 1): P3 => {
    const [x, y] = end ? w.b : w.a;
    return [x + nx * side, y + ny * side, up ? w.top[end] : w.foot[end]];
  };
  const quads: Array<[P3, P3, P3, P3]> = [
    [c(0, 1, 0), c(1, 1, 0), c(1, 1, 1), c(0, 1, 1)], // left face
    [c(1, -1, 0), c(0, -1, 0), c(0, -1, 1), c(1, -1, 1)], // right face
    [c(0, -1, 0), c(0, 1, 0), c(0, 1, 1), c(0, -1, 1)], // end a
    [c(1, 1, 0), c(1, -1, 0), c(1, -1, 1), c(1, 1, 1)], // end b
    [c(0, 1, 1), c(1, 1, 1), c(1, -1, 1), c(0, -1, 1)], // top
    [c(0, -1, 0), c(1, -1, 0), c(1, 1, 0), c(0, 1, 0)], // foot
  ];
  const out: number[] = [];
  for (const [p, q, r, s] of quads) out.push(...p, ...q, ...r, ...p, ...r, ...s);
  return out;
}

/** Points every `step` metres along a walk, leaving out `trim` metres at each end, with the walk's heading (ux, uy) and slope. */
export function walkPoints(path: P3[], step: number, trim = 0): Array<[number, number, number, number, number, number]> {
  const out: Array<[number, number, number, number, number, number]> = [];
  let total = 0;
  for (let i = 1; i < path.length; i++) total += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
  let run = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 1e-6) continue;
    const n = Math.max(1, Math.ceil(L / step));
    for (let j = 0; j <= n; j++) {
      const d = run + (L * j) / n;
      if (d < trim || d > total - trim) continue;
      const k = j / n;
      out.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, (b[0] - a[0]) / L, (b[1] - a[1]) / L, (b[2] - a[2]) / L]);
    }
    run += L;
  }
  return out;
}

/**
 * The stretch of wall `w` (metres from its start) that stands in the way of a body walking at
 * (x, y, z): where its face is within WALK_CLEAR_M of that point, if it spans body height there.
 * Null when none of it does.
 */
export function inWalkWay(w: ShellWall, x: number, y: number, z: number): [number, number] | null {
  const dx = w.b[0] - w.a[0], dy = w.b[1] - w.a[1], L = Math.hypot(dx, dy);
  if (L < 1e-6) return null;
  const s = Math.max(0, Math.min(L, ((x - w.a[0]) * dx + (y - w.a[1]) * dy) / L));
  const px = w.a[0] + (dx * s) / L, py = w.a[1] + (dy * s) / L;
  const face = Math.hypot(x - px, y - py) - w.thick / 2;
  if (face >= WALK_CLEAR_M) return null;
  const k = s / L, foot = w.foot[0] + (w.foot[1] - w.foot[0]) * k, top = w.top[0] + (w.top[1] - w.top[0]) * k;
  if (top < z + 0.3 || foot > z + 1.8) return null;
  // Every part of the wall within reach: where its centre line comes within WALK_CLEAR_M + half its thickness.
  const along = ((x - w.a[0]) * dx + (y - w.a[1]) * dy) / L, off = Math.abs(((x - w.a[0]) * dy - (y - w.a[1]) * dx) / L);
  const R = WALK_CLEAR_M + w.thick / 2, half = Math.sqrt(Math.max(0, R * R - off * off));
  return [along - half - 0.05, along + half + 0.05];
}

/** Whether a walk at (x, y, z) heading (ux, uy) goes through wall `w` at waist height, not just along it. */
export function crossesWall(w: ShellWall, x: number, y: number, z: number, ux: number, uy: number): boolean {
  if (!inWall(w, x, y, z + 1, -0.02)) return false;
  const dx = w.b[0] - w.a[0], dy = w.b[1] - w.a[1];
  return Math.abs(ux * dy - uy * dx) / Math.hypot(dx, dy) > 0.3;
}

/**
 * Whether floor within 0.6 m of height z runs unbroken through wall `w` and 0.2 m past each face,
 * level with (x, y): a doorway there opens onto floor, not onto a stairwell.
 */
export function floorBothSides(under: (x: number, y: number, pad?: number) => number[], w: ShellWall, x: number, y: number, z: number): boolean {
  const dx = w.b[0] - w.a[0], dy = w.b[1] - w.a[1], L = Math.hypot(dx, dy);
  const nx = -dy / L, ny = dx / L, across = (x - w.a[0]) * nx + (y - w.a[1]) * ny;
  const reach = w.thick / 2 + 0.2;
  for (let d = -reach; d <= reach + 1e-9; d += 0.05) {
    const k = d - across;
    if (!under(x + nx * k, y + ny * k, 0.02).some((h) => Math.abs(h - z) < 0.6)) return false;
  }
  return true;
}

/**
 * Wall `w` with a doorway in each stretch of `cuts` ([from, to, floor height], distances from its end
 * a). Below the floor and above head height the wall stays, so it still closes any other level it covers.
 */
export function cutWall(w: ShellWall, cuts: Array<[number, number, number]>): ShellWall[] {
  const dx = w.b[0] - w.a[0], dy = w.b[1] - w.a[1], L = Math.hypot(dx, dy);
  // Overlapping doorways merge, keeping the lowest floor and the highest head.
  const gaps: Array<[number, number, number, number]> = [];
  for (const [g0, g1, z] of cuts.slice().sort((u, v) => u[0] - v[0])) {
    const last = gaps[gaps.length - 1];
    if (last && g0 <= last[1]) { last[1] = Math.max(last[1], g1); last[2] = Math.min(last[2], z); last[3] = Math.max(last[3], z); }
    else gaps.push([g0, g1, z, z]);
  }
  const keep: Array<[number, number]> = [];
  let from = 0;
  for (const [g0, g1] of gaps) {
    if (g0 > from) keep.push([from, Math.min(g0, L)]);
    from = Math.max(from, g1);
  }
  if (from < L) keep.push([from, L]);
  const lerp = (v: [number, number], k: number) => v[0] + (v[1] - v[0]) * k;
  const piece = (s0: number, s1: number, foot?: number, top?: number, door?: ShellWall["door"]): ShellWall => {
    const k0 = Math.max(0, s0) / L, k1 = Math.min(L, s1) / L;
    return {
      a: [w.a[0] + dx * k0, w.a[1] + dy * k0],
      b: [w.a[0] + dx * k1, w.a[1] + dy * k1],
      foot: foot == null ? [lerp(w.foot, k0), lerp(w.foot, k1)] : [foot, foot],
      top: top == null ? [lerp(w.top, k0), lerp(w.top, k1)] : [top, top],
      thick: w.thick,
      ...(door ? { door } : {}),
    };
  };
  const out = keep.filter(([s0, s1]) => s1 - s0 > w.thick).map(([s0, s1]) => piece(s0, s1));
  for (const [g0, g1, zLow, zHigh] of gaps) {
    const k = (Math.max(0, g0) + Math.min(L, g1)) / 2 / L;
    const foot = Math.min(lerp(w.foot, 0), lerp(w.foot, 1)), top = Math.max(lerp(w.top, 0), lerp(w.top, 1));
    if (zLow - DOOR_SILL_M - foot > 0.05) out.push(piece(g0, g1, Math.min(lerp(w.foot, k), zLow - DOOR_SILL_M - 0.05), zLow - DOOR_SILL_M, "sill"));
    if (top - (zHigh + DOOR_HEAD_M) > 0.05) out.push(piece(g0, g1, zHigh + DOOR_HEAD_M, Math.max(lerp(w.top, k), zHigh + DOOR_HEAD_M + 0.05), "lintel"));
  }
  return out;
}

/** Whether point (x, y, z) is inside wall `w`, with `slack` metres to spare on its faces and ends. */
export function inWall(w: ShellWall, x: number, y: number, z: number, slack = 0.02): boolean {
  const dx = w.b[0] - w.a[0], dy = w.b[1] - w.a[1], L = Math.hypot(dx, dy);
  const along = ((x - w.a[0]) * dx + (y - w.a[1]) * dy) / L;
  const across = (-(x - w.a[0]) * dy + (y - w.a[1]) * dx) / L;
  if (along < -slack || along > L + slack || Math.abs(across) > w.thick / 2 + slack) return false;
  const k = Math.min(Math.max(along / L, 0), 1);
  return z >= w.foot[0] + (w.foot[1] - w.foot[0]) * k - slack && z <= w.top[0] + (w.top[1] - w.top[0]) * k + slack;
}

/**
 * Every open edge of a floor or stair, walked in 0.15 m steps: a body standing at the edge and
 * stepping out must meet a wall (at knee, waist and head height) before it meets empty space. The
 * only edges left open on purpose are the platform's, over the track.
 */
export function shellOpenings(model: DollhouseModel, shell: Shell): Array<{ at: P3; why: string }> {
  const trisOf = (lists: number[][]) => {
    const out: Array<[P3, P3, P3]> = [];
    for (const list of lists) for (let i = 0; i < list.length; i += 9) {
      out.push([[list[i], list[i + 1], list[i + 2]], [list[i + 3], list[i + 4], list[i + 5]], [list[i + 6], list[i + 7], list[i + 8]]]);
    }
    return out;
  };
  // The model's own floors and stairs are checked; the bridges count as floor to step onto.
  const tris = trisOf([shell.floors, shell.stairs]);
  const under = surfaceFinder(trisOf([shell.floors, shell.stairs, shell.bridges]));
  const key = (p: P3) => `${Math.round(p[0] * 20)},${Math.round(p[1] * 20)},${Math.round(p[2] * 20)}`;
  const uses = new Map<string, number>();
  const ek = (p: P3, q: P3) => [key(p), key(q)].sort().join("|");
  for (const t of tris) for (let e = 0; e < 3; e++) uses.set(ek(t[e], t[(e + 1) % 3]), (uses.get(ek(t[e], t[(e + 1) % 3])) ?? 0) + 1);
  const overTrack = (x: number, y: number, z: number) => model.edges.some(([x1, y1, x2, y2, ez]) => {
    if (Math.abs(z - ez) > 0.5) return false;
    const dx = x2 - x1, dy = y2 - y1, L2 = dx * dx + dy * dy;
    const k = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / L2));
    return Math.hypot(x - (x1 + dx * k), y - (y1 + dy * k)) < 1.2;
  });
  const steps: Array<[P3, P3]> = model.walks.flatMap((w) => w.path.slice(1).map((q, i): [P3, P3] => [w.path[i], q]));
  const onWalk = (x: number, y: number, z: number) => steps.some(([a, b]) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1e-9;
    const k = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / L2));
    return Math.hypot(x - (a[0] + dx * k), y - (a[1] + dy * k)) < 0.8 && Math.abs(a[2] + (b[2] - a[2]) * k - z) < 1;
  });
  const out: Array<{ at: P3; why: string }> = [];
  for (const t of tris) for (let e = 0; e < 3; e++) {
    const p = t[e], q = t[(e + 1) % 3], o = t[(e + 2) % 3];
    if (uses.get(ek(p, q)) !== 1) continue;
    const L = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (L < 0.05) continue;
    let ox = -(q[1] - p[1]) / L, oy = (q[0] - p[0]) / L;
    const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
    if ((o[0] - mx) * ox + (o[1] - my) * oy > 0) { ox = -ox; oy = -oy; }
    const n = Math.max(1, Math.ceil(L / 0.15));
    for (let i = 0; i <= n; i++) {
      const s = i / n;
      const x = p[0] + (q[0] - p[0]) * s, y = p[1] + (q[1] - p[1]) * s, z = p[2] + (q[2] - p[2]) * s;
      if (overTrack(x, y, z)) continue;
      // Step out from the edge 5 cm at a time, following any floor there (a seam, a thin strip, the
      // first steps of a stair dropping away), until a wall stops a body at knee, waist and head
      // height. Stepping off into empty space first is an opening.
      // Every height reachable so far: a ramp beside the floor is followed as well as the floor.
      let hs = [z];
      let h = z;
      for (let d = 0.02; d <= 1.5; d += 0.05) {
        const px = x + ox * d, py = y + oy * d;
        if ([0.4, 1.0, 1.7].every((up) => shell.walls.some((w) => inWall(w, px, py, h + up)))) break;
        // A doorway's sill in front of the shins with floor just beyond it, level or higher (up to head
        // height, as where one flight of a stair passes over the side of the next), is not a drop.
        if ([0.2, 0.4].some((up) => shell.walls.some((w) => inWall(w, px, py, h + up)))
          && [0.1, 0.2, 0.3, 0.4, 0.5, 0.6].some((k) => under(px + ox * k, py + oy * k, 0.02).some((g) => g > h - 0.05 && g < h + 1.8))) break;
        // Where a walk goes the model's steps run up to 0.6 m (a stair's first tread set low).
        hs = reachable(hs, under(px, py, 0.02), onWalk(px, py, h) ? 0.6 : 0.35);
        if (!hs.length) {
          out.push({ at: [+x.toFixed(2), +y.toFixed(2), +z.toFixed(2)], why: `open ${d.toFixed(2)} m out` });
          break;
        }
        h = hs.reduce((m, g) => (Math.abs(g - z) < Math.abs(m - z) ? g : m));
      }
    }
  }
  return out;
}

