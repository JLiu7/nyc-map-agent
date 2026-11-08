/**
 * Bakes each subway station's insides for the x-ray view into
 * public/transit/xray.json: platforms, stairs, passages and elevators from OSM,
 * with `level` tags turned into depth. Reads a local OSM extract with the
 * osmium CLI (no tile build, no Overpass):
 *
 *   OSM_PBF=/path/new-york-latest.osm.pbf pnpm build:xray
 *
 * Needs public/transit/subway.json (pnpm build:transit) for station points.
 * Output is committed; rerun when OSM coverage improves. Hand-made complexes in
 * scripts/xray-overrides/ replace OSM's (see xray-overrides.ts).
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseLevel, type XrayStation, type XrayWay } from "../src/features/transit/model";
import { applyXrayOverrides, loadOverrides } from "./xray-overrides";

const pbf = process.env.OSM_PBF;
if (!pbf) throw new Error("Set OSM_PBF to a New York OSM extract (e.g. Geofabrik new-york-latest.osm.pbf)");
const dir = mkdtempSync(join(tmpdir(), "xray-"));
const run = (...a: string[]) => execFileSync("osmium", a, { stdio: "inherit" });
run("extract", "-b", "-74.26,40.49,-73.69,40.92", pbf, "-o", join(dir, "nyc.pbf"));
run("tags-filter", join(dir, "nyc.pbf"), "w/railway=platform", "w/public_transport=platform", "w/highway=steps", "w/highway=corridor", "w/highway=footway", "n/highway=elevator", "-o", join(dir, "f.pbf"));
run("export", join(dir, "f.pbf"), "-f", "geojsonseq", "-o", join(dir, "f.geojsonseq"));

type Sub = { stations: { features: Array<{ properties: { id: string }; geometry: { coordinates: [number, number] } }> }; shapes: Record<string, { c: Array<[number, number]>; g: string[] }> };
const sub = JSON.parse(readFileSync("public/transit/subway.json", "utf8")) as Sub;
// A station is underground when the nearest track point (any route) is.
const trackPts = Object.values(sub.shapes).flatMap((s) => s.c.map((p, i) => ({ p, g: s.g[i] })));
const stations = sub.stations.features.map((f) => {
  const p = f.geometry.coordinates;
  let g = "grade", d = Infinity;
  for (const t of trackPts) { const m = Math.abs(t.p[0] - p[0]) + Math.abs(t.p[1] - p[1]); if (m < d) { d = m; g = t.g; } }
  return { id: f.properties.id, p, under: g === "underground" };
}).filter((s) => s.under);
const cell = (p: [number, number]) => `${Math.floor(p[0] * 300)},${Math.floor(p[1] * 300)}`; // ~280 m
const grid = new Map<string, typeof stations>();
for (const s of stations) for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
  const k = `${Math.floor(s.p[0] * 300) + dx},${Math.floor(s.p[1] * 300) + dy}`;
  grid.set(k, [...(grid.get(k) ?? []), s]);
}
const metres = (a: [number, number], b: [number, number]) => Math.hypot((a[0] - b[0]) * 84_300, (a[1] - b[1]) * 111_320);
const nearest = (p: [number, number], within: number) => {
  let best: string | null = null, d = within;
  for (const s of grid.get(cell(p)) ?? []) { const m = metres(p, s.p); if (m < d) { d = m; best = s.id; } }
  return best;
};
const r6 = (n: number) => Math.round(n * 1e6) / 1e6;
const out: Record<string, XrayStation> = {};
const add = (id: string) => (out[id] ??= { ways: [], elevators: [] });
type F = { geometry: { type: string; coordinates: unknown }; properties: Record<string, string> };
for (const line of readFileSync(join(dir, "f.geojsonseq"), "utf8").split("\n")) {
  const s = (line.startsWith(String.fromCharCode(0x1e)) ? line.slice(1) : line).trim(); // RFC 8142 record separator
  if (!s) continue;
  const f = JSON.parse(s) as F, t = f.properties;
  const under = Number(t.layer) <= -2 ? true : t.tunnel === "yes" || t.location === "underground" || Number(t.layer) < 0 || t.indoor === "yes" || t.indoor === "corridor";
  if (f.geometry.type === "Point") {
    const p = f.geometry.coordinates as [number, number];
    const id = nearest(p, 150);
    if (id && (t.level || under)) add(id).elevators.push({ lon: r6(p[0]), lat: r6(p[1]), from: Math.min(parseLevel(t.level, -1)[0], -1) });
    continue;
  }
  const g = f.geometry;
  const raw = (g.type === "MultiPolygon" ? (g.coordinates as number[][][][])[0][0] : g.type === "Polygon" ? (g.coordinates as number[][][])[0] : g.coordinates) as Array<[number, number]>;
  if (!Array.isArray(raw) || raw.length < 2 || typeof raw[0][0] !== "number") continue;
  const mid = raw[Math.floor(raw.length / 2)];
  const platform = t.railway === "platform" || t.public_transport === "platform";
  // Footways only count when they are inside (tunnel / indoor / below-ground level); street sidewalks are not station insides.
  if (t.highway === "footway" && !(under || Number(parseLevel(t.level)[0]) < 0)) continue;
  // Steps without tags are usually the street stairs down to the mezzanine.
  const layer = Number(t.layer) < 0 ? Number(t.layer) : -1;
  const [lo, hi] = parseLevel(t.level, under || platform || t.highway === "steps" ? layer : 0);
  if (platform && lo > -1) continue; // only underground stations are kept, so a level ≥ 0 platform is mis-tagged
  const id = nearest(mid, platform ? 250 : 150);
  if (!id) continue;
  const w: XrayWay = { k: platform ? "platform" : t.highway === "steps" ? "steps" : "corridor", c: raw.map((p) => [r6(p[0]), r6(p[1])]), from: lo, to: t.highway === "steps" ? (hi > lo ? hi : Math.min(lo + 1, 0)) : lo };
  add(id).ways.push(w);
}
// Only stations with platforms below ground are worth an x-ray.
for (const id of Object.keys(out)) if (!out[id].ways.some((w) => w.k === "platform")) delete out[id];
console.log("underground stations", stations.length);
// Hand-made layouts for complexes OSM gets wrong (scripts/xray-overrides/).
applyXrayOverrides(out, loadOverrides());
writeFileSync("public/transit/xray.json", JSON.stringify(out));
const n = Object.values(out);
console.log(`xray: ${n.length} stations, ${n.reduce((a, s) => a + s.ways.length, 0)} ways, ${n.reduce((a, s) => a + s.elevators.length, 0)} elevators`);
