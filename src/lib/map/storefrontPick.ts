/**
 * Which shop a street-level tap lands on. Plain math, no three.js: the sign
 * layer (three/storefronts.ts) draws from the same sizes, so what you can tap
 * is exactly what you can see.
 *
 * A tap used to take the nearest sign within 12 m of wherever its ray entered
 * a building, and only on buildings the city data flags as retail. On Broadway
 * at Fulton Street 27 of 41 shops sit on buildings without that flag, so a tap
 * on them did nothing; a tap on a bare wall opened the shop next door; and a
 * shop upstairs could never be picked (owner, 2026-11-10).
 */
export interface StorefrontSign {
  name: string; cat: string; brg: number; sw: number; fl: number; lng: number; lat: number;
  main?: number; dir?: string; kind?: string; w?: number;
}

export const PLATE_H = 0.8;
export const MAIN_PLATE_H = 1.2;
export const BASE_M = 3.2; // plate centre above the pavement on the ground floor
export const FLOOR_M = 3.5;
export const WALL_GAP_M = 0.15; // clear of the storefront band so depth never hides the plate
export const FACADE_H = 2.9;
/** The small "Directory" board beside a mall's main sign. */
export const BOARD = { w: 1.2, z: 1.6 };

export const plateWidth = (s: { sw: number }) => Math.max(0.8, s.sw);
/** Height of the plate's centre: its floor, never sunk into the pavement. */
const plateZ = (s: { fl: number; main?: number }) => Math.max(BASE_M + s.fl * FLOOR_M, (s.main ? MAIN_PLATE_H : PLATE_H) / 2 + 0.3);
/** Width of the painted shop front under a ground-floor sign. */
export const facadeWidth = (s: { sw: number; w?: number }) => Math.min(Math.max(s.sw + 1.2, 3), Math.max(3, s.w ?? 8), 8);
/** How far along the wall the Directory board sits from its main sign. */
export const boardOffset = (s: { sw: number }) => plateWidth(s) / 2 + 0.9;

/** The flat pieces a sign draws on its wall: offset along the wall, half width, bottom and top (metres). */
function faces(s: StorefrontSign): Array<{ dx: number; half: number; z0: number; z1: number }> {
  const h = s.main ? MAIN_PLATE_H : PLATE_H, zc = plateZ(s);
  const out = [{ dx: 0, half: plateWidth(s) / 2, z0: zc - h / 2, z1: zc + h / 2 }];
  if (!s.fl) out.push({ dx: 0, half: facadeWidth(s) / 2, z0: 0, z1: FACADE_H });
  if (s.main) out.push({ dx: boardOffset(s), half: BOARD.w / 2, z0: BOARD.z - PLATE_H / 2, z1: BOARD.z + PLATE_H / 2 });
  return out;
}

export interface PickRay {
  lng: number; lat: number; alt: number;
  /** Unit direction: east, north, up. */
  dir: [number, number, number];
  /** Camera-to-screen distance in pixels, to turn a finger's width into metres. */
  f?: number;
}

/**
 * The sign whose plate, shop front or directory board the ray passes through
 * first, seen from the front. `maxT` is how far the ray travels before a wall
 * or landmark stops it, so a shop behind a building is not picked through it.
 * Small or distant signs get a 12 px margin so the target is never under 24 px.
 */
export function pickSign<T extends StorefrontSign>(ray: PickRay, signs: readonly T[], maxT = Infinity): T | null {
  const kx = 111_320 * Math.cos((ray.lat * Math.PI) / 180), ky = 111_320;
  const [dx, dy, dz] = ray.dir;
  let best: T | null = null, bestScore = Infinity;
  for (const s of signs) {
    const b = (s.brg * Math.PI) / 180;
    const nx = Math.sin(b), ny = Math.cos(b); // out of the wall
    const tx = -Math.cos(b), ty = Math.sin(b); // along the wall
    const facing = dx * nx + dy * ny;
    if (facing > -0.02) continue; // edge-on, or seen from behind (through the building)
    // The wall plane through the sign, in metres from the camera.
    const px = (s.lng - ray.lng) * kx + nx * WALL_GAP_M, py = (s.lat - ray.lat) * ky + ny * WALL_GAP_M;
    const t = (px * nx + py * ny) / facing;
    if (!(t > 0) || t > maxT) continue;
    const u = (dx * t - px) * tx + (dy * t - py) * ty, z = ray.alt + dz * t;
    const slack = Math.max(0.2, ray.f ? (12 * t) / ray.f : 0);
    for (const f of faces(s)) {
      if (Math.abs(u - f.dx) > f.half + slack || z < f.z0 - slack || z > f.z1 + slack) continue;
      // Nearest wall first; on one wall, the piece whose middle is closest to the tap.
      const score = t + 0.05 * Math.hypot(u - f.dx, z - (f.z0 + f.z1) / 2);
      if (score < bestScore) { best = s; bestScore = score; }
    }
  }
  return best;
}
