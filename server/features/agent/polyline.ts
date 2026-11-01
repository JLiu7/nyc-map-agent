import type { LngLatTuple } from "../../../src/features/agent/schema";

/** Google encoded polyline → [lon, lat][]. */
export function decodePolyline(s: string, precision = 5): LngLatTuple[] {
  const out: LngLatTuple[] = [];
  let i = 0, lat = 0, lon = 0;
  const next = () => { let r = 0, sh = 0, b: number; do { b = s.charCodeAt(i++) - 63; r |= (b & 0x1f) << sh; sh += 5; } while (b >= 0x20); return r & 1 ? ~(r >> 1) : r >> 1; };
  while (i < s.length) { lat += next(); lon += next(); out.push([lon / 10 ** precision, lat / 10 ** precision]); }
  return out;
}
