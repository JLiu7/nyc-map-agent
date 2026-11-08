/**
 * Bakes each elevated subway station's platforms, stairs and walkways into
 * public/transit/elevated.json, so street view can climb to the platform. Same
 * shape as xray.json (scripts/build-xray.ts), with levels above the street
 * positive: level 1 is usually the mezzanine over the street, level 2 the
 * platform. Reads OpenStreetMap through the Overpass API (no extract needed):
 *
 *   pnpm build:elevated   (OVERPASS_JSON=saved.json to reuse an answer)
 *
 * Needs public/transit/subway.json (pnpm build:transit) for station points and
 * track grades. Output is committed; rerun when OSM coverage improves.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { parseLevel, type XrayStation, type XrayWay } from "../src/features/transit/model";

const OVERPASS = process.env.OVERPASS_URL ?? "https://overpass-api.de/api/interpreter";
const BBOX = "40.49,-74.26,40.92,-73.69";
const QUERY = `[out:json][timeout:160];(
way["railway"="platform"](${BBOX});
way["public_transport"="platform"]["subway"="yes"](${BBOX});
way["highway"~"^(steps|footway|corridor)$"]["level"](${BBOX});
way["highway"="steps"]["bridge"](${BBOX});
node["highway"="elevator"](${BBOX});
);out geom;`;

type Sub = { stations: { features: Array<{ properties: { id: string }; geometry: { coordinates: [number, number] } }> }; shapes: Record<string, { c: Array<[number, number]>; g: string[] }> };
type El = { type: "way" | "node"; tags?: Record<string, string>; lat?: number; lon?: number; geometry?: Array<{ lat: number; lon: number }> };

const metres = (a: [number, number], b: [number, number]) => Math.hypot((a[0] - b[0]) * 84_300, (a[1] - b[1]) * 111_320);
const r6 = (n: number) => Math.round(n * 1e6) / 1e6;
/** OSM writes half levels both ways ("2.5", "2,5"); parseLevel would read "2,5" as 2 and 5. */
const level = (v: string | undefined, fallback: number) => parseLevel(v?.replace(/(\d),(\d)/g, "$1.$2"), fallback);

const sub = JSON.parse(readFileSync("public/transit/subway.json", "utf8")) as Sub;
// A station is elevated when the nearest track point (any route) is.
const trackPts = Object.values(sub.shapes).flatMap((s) => s.c.map((p, i) => ({ p, g: s.g[i] })));
const stations = sub.stations.features
  .map((f) => {
    const p = f.geometry.coordinates;
    let g = "grade", d = Infinity;
    for (const t of trackPts) { const m = Math.abs(t.p[0] - p[0]) + Math.abs(t.p[1] - p[1]); if (m < d) { d = m; g = t.g; } }
    return { id: f.properties.id, p, el: g === "elevated" };
  })
  .filter((s) => s.el);
const nearest = (p: [number, number], within: number) => {
  let best: string | null = null, d = within;
  for (const s of stations) { const m = metres(p, s.p); if (m < d) { d = m; best = s.id; } }
  return best;
};

/** Overpass is busy at times; a saved answer to QUERY (OVERPASS_JSON=path) skips the fetch. */
async function overpass(): Promise<El[]> {
  if (process.env.OVERPASS_JSON) return (JSON.parse(readFileSync(process.env.OVERPASS_JSON, "utf8")) as { elements: El[] }).elements;
  for (let tries = 1; ; tries++) {
    const res = await fetch(OVERPASS, { method: "POST", headers: { "User-Agent": "nyc-map-agent build-elevated" }, body: new URLSearchParams({ data: QUERY }) });
    if (res.ok) return ((await res.json()) as { elements: El[] }).elements;
    if (tries === 3) throw new Error(`Overpass ${res.status}`);
    await new Promise((r) => setTimeout(r, 20_000));
  }
}
const els = await overpass();

const out: Record<string, XrayStation> = {};
const add = (id: string) => (out[id] ??= { ways: [], elevators: [] });
for (const e of els) {
  const t = e.tags ?? {};
  if (e.type === "node") {
    const p: [number, number] = [e.lon!, e.lat!];
    const [, hi] = level(t.level, 0);
    const id = hi > 0 ? nearest(p, 150) : null;
    if (id) add(id).elevators.push({ lon: r6(p[0]), lat: r6(p[1]), from: 0 });
    continue;
  }
  const c = (e.geometry ?? []).map((g) => [r6(g.lon), r6(g.lat)] as [number, number]);
  if (c.length < 2) continue;
  const platform = t.railway === "platform" || t.public_transport === "platform";
  const steps = t.highway === "steps";
  // Platforms on a bridge with no level are one storey up; footways need a level to count.
  const layer = Number(t.layer) > 0 ? Number(t.layer) : t.bridge ? 1 : 0;
  // Stairs with no level climb from the street to their bridge.
  const [lo, hi] = steps && !t.level ? [0, Math.max(layer, 1)] : level(t.level, platform ? layer : 0);
  if (hi <= 0 || lo < 0) continue; // street-level or underground: not an elevated station's
  if (platform && lo < 1) continue;
  const id = nearest(c[Math.floor(c.length / 2)], platform ? 250 : 150);
  if (!id) continue;
  const w: XrayWay = { k: platform ? "platform" : steps ? "steps" : "corridor", c, from: lo, to: steps ? (hi > lo ? hi : lo + 1) : lo };
  add(id).ways.push(w);
}
for (const id of Object.keys(out)) if (!out[id].ways.some((w) => w.k === "platform")) delete out[id];
writeFileSync("public/transit/elevated.json", JSON.stringify(out));
const n = Object.values(out);
console.log(`elevated: ${stations.length} elevated stations, ${n.length} with platforms, ${n.reduce((a, s) => a + s.ways.length, 0)} ways`);
