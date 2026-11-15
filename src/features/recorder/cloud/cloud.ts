/**
 * The point cloud on the 3D preview page (/station-3d): what a station could
 * look like once a walk video is turned into 3D. Nothing here reads a video.
 * The points are scattered over the station model the app already has
 * (Project Subway NYC's Fulton St), and they appear in the order a rider
 * walking through would have filmed them.
 */

/** The part of public/transit/fulton-model.json this page reads: metres east, north and up. */
export interface StationModel {
  /** Corner positions, three numbers each. */
  v: number[];
  /** Triangles, three corner numbers each. */
  t: number[];
  walks: { path: number[][] }[];
}

export interface Cloud {
  /** x, y, z for each point, in metres, centred on the middle of the station. */
  xyz: Float32Array;
  /** When each point appears, 0 at the start of the walk and 1 at its end. Points are sorted by this. */
  seen: Float32Array;
  /** How high each point is, 0 at the lowest floor and 1 at the street. */
  height: Float32Array;
  /** The walk the points are revealed along, centred like the points. */
  walk: [number, number, number][];
  /** Half the station's longest side, metres: how far the camera must stand back. */
  reach: number;
}

/** A small repeatable random number source, so the cloud is the same on every visit and in tests. */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = Math.imul(a ^ (a >>> 15), a | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** The walk as points about a metre apart, each with its share of the way along. */
function alongWalk(path: number[][]): { at: number[]; k: number }[] {
  const out: { at: number[]; d: number }[] = [{ at: path[0], d: 0 }];
  let d = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const steps = Math.max(1, Math.ceil(len));
    for (let s = 1; s <= steps; s++) {
      const f = s / steps;
      out.push({ at: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f], d: d + len * f });
    }
    d += len;
  }
  return out.map((p) => ({ at: p.at, k: d > 0 ? p.d / d : 0 }));
}

/** Scatter `count` points evenly over the model's surfaces and order them along its longest walk. */
export function buildCloud(model: StationModel, count: number, seed = 7): Cloud {
  const rand = random(seed);
  const corner = (i: number): [number, number, number] => [model.v[i * 3], model.v[i * 3 + 1], model.v[i * 3 + 2]];
  const tris = model.t.length / 3;
  const area = new Float64Array(tris);
  let total = 0;
  for (let i = 0; i < tris; i++) {
    const a = corner(model.t[i * 3]), b = corner(model.t[i * 3 + 1]), c = corner(model.t[i * 3 + 2]);
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    total += Math.hypot(u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]) / 2;
    area[i] = total;
  }

  const longest = model.walks.reduce((best, w) => (w.path.length > best.length ? w.path : best), model.walks[0]?.path ?? []);
  const walk = longest.length > 1 ? alongWalk(longest) : [];

  const pts: { p: number[]; seen: number; off: number }[] = [];
  for (let n = 0; n < count && total > 0; n++) {
    // The triangle this point lands on, picked by area so big floors get more points than small steps.
    const want = rand() * total;
    let lo = 0, hi = tris - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (area[mid] < want) lo = mid + 1; else hi = mid;
    }
    const a = corner(model.t[lo * 3]), b = corner(model.t[lo * 3 + 1]), c = corner(model.t[lo * 3 + 2]);
    let r1 = rand(), r2 = rand();
    if (r1 + r2 > 1) { r1 = 1 - r1; r2 = 1 - r2; }
    const p = [0, 1, 2].map((j) => a[j] + (b[j] - a[j]) * r1 + (c[j] - a[j]) * r2);
    // A filmed surface is never exact: nudge each point a few centimetres.
    for (let j = 0; j < 3; j++) p[j] += (rand() - 0.5) * 0.12;
    let seen = rand();
    let near = Infinity;
    for (const w of walk) {
      const d = (w.at[0] - p[0]) ** 2 + (w.at[1] - p[1]) ** 2 + ((w.at[2] - p[2]) * 2) ** 2;
      if (d < near) { near = d; seen = w.k; }
    }
    pts.push({ p, seen, off: Number.isFinite(near) ? Math.sqrt(near) : 0 });
  }
  // The part of the walk a point is nearest decides when it appears, and within that the points
  // beside the walk come before the ones across the hall. Then the order is spread evenly over the
  // walk, so the station fills in at a steady rate instead of mostly in the first few steps.
  const farthest = pts.reduce((m, x) => Math.max(m, x.off), 1e-6);
  pts.sort((x, y) => x.seen + 0.15 * (x.off / farthest) - (y.seen + 0.15 * (y.off / farthest)));
  pts.forEach((x, i) => { x.seen = pts.length > 1 ? i / (pts.length - 1) : 0; });

  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const { p } of pts) for (let j = 0; j < 3; j++) { lo[j] = Math.min(lo[j], p[j]); hi[j] = Math.max(hi[j], p[j]); }
  const mid = pts.length ? [0, 1, 2].map((j) => (lo[j] + hi[j]) / 2) : [0, 0, 0];
  const tall = Math.max(hi[2] - lo[2], 1e-6);

  const xyz = new Float32Array(pts.length * 3), seen = new Float32Array(pts.length), height = new Float32Array(pts.length);
  pts.forEach(({ p, seen: s }, i) => {
    for (let j = 0; j < 3; j++) xyz[i * 3 + j] = p[j] - mid[j];
    seen[i] = s;
    height[i] = (p[2] - lo[2]) / tall;
  });
  return {
    xyz, seen, height,
    walk: walk.map((w) => [w.at[0] - mid[0], w.at[1] - mid[1], w.at[2] - mid[2]]),
    reach: pts.length ? Math.max(hi[0] - lo[0], hi[1] - lo[1]) / 2 : 1,
  };
}

/** How many of the sorted points have appeared when the walk is a share `k` (0 to 1) done. */
export function shownCount(seen: Float32Array, k: number): number {
  if (k >= 1) return seen.length;
  let lo = 0, hi = seen.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (seen[mid] <= k) lo = mid + 1; else hi = mid;
  }
  return lo;
}

export interface View { yaw: number; pitch: number; w: number; h: number; reach: number }

/** Where a point lands on a w by h canvas for a camera circling the station: [x, y, scale], or null behind the camera. */
export function project(x: number, y: number, z: number, v: View): [number, number, number] | null {
  const cy = Math.cos(v.yaw), sy = Math.sin(v.yaw);
  const rx = x * cy - y * sy, ry = x * sy + y * cy;
  const cp = Math.cos(v.pitch), sp = Math.sin(v.pitch);
  // Tilt: looking down at the station from in front of it.
  const up = z * cp - ry * sp, depth = ry * cp + z * sp;
  const far = v.reach * 2.3 + depth;
  if (far <= 1) return null;
  const s = (Math.min(v.w, v.h * 1.4) * 1.25) / far;
  return [v.w / 2 + rx * s, v.h / 2 - up * s, s];
}
