/**
 * Hand-made station insides for the x-ray view, for complexes where OSM's are wrong or thin: platforms
 * filed under the wrong station, a level off, passages missing. Each scripts/xray-overrides/*.json names
 * the GTFS station ids of one complex and replaces their OSM insides in public/transit/xray.json with the
 * same layout, so opening any line's station shows the whole complex. Layouts start from the OSM ways
 * and are corrected against reference models and a LiDAR-traced station map.
 *
 * Every platform in an override must be reachable from the street on foot (street stairs, then stairs
 * and passages that meet on the same level); the build fails otherwise.
 *
 *   pnpm build:xray-overrides   (also run at the end of pnpm build:xray)
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { XrayStation, XrayWay } from "../src/features/transit/model";

export type XrayOverride = XrayStation & { name: string; ids: string[] };
type Pt = [number, number];

/** Two ends closer than this on the same level count as joined. */
export const JOIN_M = 6;
const metres = (a: Pt, b: Pt) => Math.hypot((a[0] - b[0]) * 84_300, (a[1] - b[1]) * 111_320);

/** The level-tagged points where you can step onto or off a way. Stairs join both their levels at either end (OSM direction is unreliable). */
function touchPoints(w: XrayWay): Array<[number, Pt]> {
  if (w.k === "steps") {
    const ends = [w.c[0], w.c.at(-1)!];
    return [...new Set([w.from, w.to])].flatMap((l) => ends.map((p) => [l, p] as [number, Pt]));
  }
  const out: Array<[number, Pt]> = [];
  for (let i = 1; i < w.c.length; i++) {
    const [a, b] = [w.c[i - 1], w.c[i]];
    const n = Math.max(1, Math.floor(metres(a, b) / 4));
    for (let s = 0; s <= n; s++) out.push([w.from, [a[0] + ((b[0] - a[0]) * s) / n, a[1] + ((b[1] - a[1]) * s) / n]]);
  }
  return out;
}

/** A platform or a room (a corridor traced as its outline): standing anywhere inside it counts as on it. */
const closed = (w: XrayWay) => w.k !== "steps" && w.c.length > 3 && w.c[0][0] === w.c.at(-1)![0] && w.c[0][1] === w.c.at(-1)![1];
function inside([x, y]: Pt, ring: Pt[]): boolean {
  let r = false;
  for (let i = 1; i < ring.length; i++) {
    const [[x1, y1], [x2, y2]] = [ring[i - 1], ring[i]];
    if (y1 > y !== y2 > y && x < x1 + ((y - y1) * (x2 - x1)) / (y2 - y1)) r = !r;
  }
  return r;
}

/** Indices of platforms you cannot walk to from the street. Empty when every platform is reachable. Pure. */
export function unreachablePlatforms(st: XrayStation, joinM = JOIN_M): number[] {
  const pts = st.ways.map(touchPoints);
  const joined = (i: number, j: number) =>
    pts[i].some(([l, p]) => pts[j].some(([m, q]) => l === m && metres(p, q) < joinM)) ||
    [[i, j], [j, i]].some(([a, b]) => closed(st.ways[b]) && pts[a].some(([l, p]) => l === st.ways[b].from && inside(p, st.ways[b].c)));
  const seen = new Set(st.ways.flatMap((w, i) => (w.k === "steps" && (w.from === 0 || w.to === 0) ? [i] : [])));
  const todo = [...seen];
  while (todo.length) {
    const i = todo.pop()!;
    for (let j = 0; j < st.ways.length; j++) {
      if (seen.has(j) || !joined(i, j)) continue;
      seen.add(j);
      todo.push(j);
    }
  }
  return st.ways.flatMap((w, i) => (w.k === "platform" && !seen.has(i) ? [i] : []));
}

export function loadOverrides(dir = "scripts/xray-overrides"): XrayOverride[] {
  return readdirSync(dir).filter((f) => f.endsWith(".json")).sort().map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as XrayOverride);
}

/** Puts each override's layout under every one of its station ids. Throws when a platform can't be reached from the street. */
export function applyXrayOverrides(out: Record<string, XrayStation>, overrides: XrayOverride[]): Record<string, XrayStation> {
  for (const o of overrides) {
    const lost = unreachablePlatforms(o);
    if (lost.length) throw new Error(`${o.name}: platforms ${lost.join(", ")} can't be reached from the street`);
    for (const id of o.ids) out[id] = { ways: o.ways, elevators: o.elevators };
  }
  return out;
}

if (process.argv[1]?.endsWith("xray-overrides.ts")) {
  const file = "public/transit/xray.json";
  const os = loadOverrides();
  writeFileSync(file, JSON.stringify(applyXrayOverrides(JSON.parse(readFileSync(file, "utf8")) as Record<string, XrayStation>, os)));
  console.log(`xray overrides: ${os.map((o) => `${o.name} (${o.ids.join(" ")})`).join(", ")}`);
}
