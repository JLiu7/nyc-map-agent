/**
 * Builds server/features/agent/data/corners.json: every point where two or
 * more differently named streets meet, per borough, from NYC's street
 * centerline (DCP CSCL, NYC Open Data inkn-q76z). The assistant's place lookup
 * reads it to answer corners ("Fulton Street and Broadway"), which GeoSearch
 * cannot. The live centerline API is too slow and busy to ask per request
 * (4 in 10 calls failed on 2026-11-09), so the table ships with the server.
 *
 * Usage: npx tsx scripts/build-corners.ts [path/to/centerline.csv]
 * Without a path it downloads the bulk CSV (about 55 MB).
 *
 * Output shape: { "<borough code>": { names: string[], nodes: [lonE5, latE5, ...nameIndex][] } }
 * A node is a segment endpoint at one grade level, so a bridge over a street
 * does not count as a corner with it.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const URL_CSV = "https://data.cityofnewyork.us/api/views/inkn-q76z/rows.csv?accessType=DOWNLOAD";
const OUT = "server/features/agent/data/corners.json";

/** One CSV line into fields; the geometry field is quoted and holds commas, never newlines. */
function fields(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

async function main() {
  const path = process.argv[2];
  const text = path ? readFileSync(path, "utf8") : await (await fetch(URL_CSV)).text();
  const lines = text.split(/\r?\n/);
  const head = fields(lines[0]);
  const col = (name: string) => {
    const i = head.indexOf(name);
    if (i < 0) throw new Error(`centerline CSV has no "${name}" column`);
    return i;
  };
  const [GEOM, NAME, BORO, FROM, TO] = ["the_geom", "Full Street Name", "Borough Code", "FROM_LEVEL_CODE", "TO_LEVEL_CODE"].map(col);

  const nodes = new Map<string, Set<string>>();
  for (const line of lines.slice(1)) {
    if (!line) continue;
    const f = fields(line);
    const name = f[NAME].trim().replace(/\s+/g, " ");
    if (!name) continue;
    for (const part of f[GEOM].matchAll(/\(([^()]+)\)/g)) {
      const pts = part[1].split(",").map((p) => p.trim().split(/\s+/).map(Number));
      for (const [p, level] of [[pts[0], f[FROM]], [pts[pts.length - 1], f[TO]]] as const) {
        const key = `${f[BORO]}|${Math.round(p[0] * 1e5)}|${Math.round(p[1] * 1e5)}|${level}`;
        const set = nodes.get(key) ?? new Set<string>();
        set.add(name);
        nodes.set(key, set);
      }
    }
  }

  const out: Record<string, { names: string[]; nodes: number[][] }> = {};
  const index: Record<string, Map<string, number>> = {};
  for (const [key, names] of nodes) {
    if (names.size < 2) continue;
    const [boro, x, y] = key.split("|");
    const b = (out[boro] ??= { names: [], nodes: [] });
    const idx = (index[boro] ??= new Map());
    const ids = [...names].sort().map((n) => {
      if (!idx.has(n)) { idx.set(n, b.names.length); b.names.push(n); }
      return idx.get(n)!;
    });
    b.nodes.push([Number(x), Number(y), ...ids]);
  }
  const sorted = Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(sorted));
  for (const [b, o] of Object.entries(sorted)) console.log(`borough ${b}: ${o.nodes.length} corners, ${o.names.length} streets`);
}

void main();
