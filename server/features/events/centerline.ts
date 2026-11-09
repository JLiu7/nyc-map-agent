import { z } from "zod";
import type { EventGeometry, PermittedEventRow } from "./schema";
import { parseBetween } from "./normalize";
import { BOROUGH_CODE, CSCL, CsclRows, Intersections, csclVariants, pt, soqlList, streetKey, type Fetch } from "../../lib/centerline";

export { CsclRows, Intersections, csclVariants, streetKey } from "../../lib/centerline";

/**
 * Geocodes permitted events, which carry only a street description such as
 * "CARROLL STREET between ROGERS AVENUE and NOSTRAND AVENUE".
 *
 * Street blocks: NYC's own street centerline (DCP CSCL, NYC Open Data
 * inkn-q76z). An intersection is a segment endpoint shared by both streets,
 * so the block becomes a LineString between the two cross streets (a Point
 * when only one end resolves). Park locations ("Union Square Park: North
 * Plaza") go to NYC Planning GeoSearch, the geocoder the app already uses.
 * Anything that resolves to neither is skipped.
 */
const GEOSEARCH = "https://geosearch.planninglabs.nyc/v2/search";

/** Loads CSCL segments for every street named in the rows, per borough (small, indexed `in` queries). */
export async function loadIntersections(rows: PermittedEventRow[], fetchJson: Fetch): Promise<Map<string, Intersections>> {
  const wanted = new Map<string, Set<string>>();
  for (const r of rows) {
    const b = parseBetween(r.event_location);
    const code = BOROUGH_CODE[r.event_borough];
    if (!b || !code) continue;
    const set = wanted.get(code) ?? new Set<string>();
    for (const s of [b.on, b.from, b.to]) for (const v of csclVariants(s)) set.add(v);
    wanted.set(code, set);
  }
  const out = new Map<string, Intersections>();
  for (const [code, names] of wanted) {
    const idx = new Intersections();
    const list = [...names];
    for (let i = 0; i < list.length; i += 40) {
      const where = `boroughcode='${code}' AND full_street_name in (${soqlList(list.slice(i, i + 40))})`;
      const q = new URLSearchParams({ $select: "full_street_name,boroughcode,the_geom", $where: where, $limit: "50000" });
      idx.add(CsclRows.parse(await fetchJson(`${CSCL}?${q}`)));
    }
    out.set(code, idx);
  }
  return out;
}

const GeoSearch = z.object({ features: z.array(z.object({ geometry: z.object({ coordinates: z.tuple([z.number(), z.number()]) }) })) });

/** First GeoSearch hit for a place name in a borough. */
export async function geosearch(text: string, fetchJson: Fetch): Promise<[number, number] | null> {
  const data = GeoSearch.parse(await fetchJson(`${GEOSEARCH}?${new URLSearchParams({ text, size: "1" })}`));
  const c = data.features[0]?.geometry.coordinates;
  return c ? pt(c) : null;
}

/** Street block -> LineString / Point from the centerline index; null when neither end resolves. */
export function locateBlock(row: PermittedEventRow, index: Map<string, Intersections>): EventGeometry | null {
  const b = parseBetween(row.event_location);
  const idx = index.get(BOROUGH_CODE[row.event_borough] ?? "");
  if (!b || !idx) return null;
  const on = streetKey(b.on);
  const a = idx.find(on, streetKey(b.from));
  const z2 = idx.find(on, streetKey(b.to));
  if (a && z2 && (a[0] !== z2[0] || a[1] !== z2[1])) return { type: "LineString", coordinates: [a, z2] };
  const one = a ?? z2;
  return one ? { type: "Point", coordinates: one } : null;
}

/** "Union Square Park: North Plaza ,Union Square Park: X" -> "Union Square Park". */
export function parkName(location: string): string | null {
  const m = /^([^:,]+):/.exec(location.trim());
  return m ? m[1].trim() : null;
}
