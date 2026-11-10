import type { ExitPlace, Pt } from "@/lib/map/mapRead";
import { cornerLine } from "@/lib/map/cornerLine";

export { cornerLine, shortStreet } from "@/lib/map/cornerLine";
import type { StaticSystem } from "./model";

/**
 * Street level: a label over each nearby subway entrance, the station and its
 * trains first ("47-50 Sts-Rockefeller Ctr · B D F M"), then what it is and the
 * corner ("Stairs · 6 Av & W 47 St · SE corner"). The name over the station itself can be a
 * block away, so each stair says which station it is (owner, 2026-10-27).
 * Only the nearest few get one; on a phone, the station alone until you are close.
 */
export interface EntranceLabelOpts {
  /** How many of the nearest entrances get a label. */
  max: number;
  /** Phones: the second line only within `closeM`. */
  phone: boolean;
  closeM?: number;
  radiusM?: number;
  /** Overhead: the station's own label is on the map already, so just what it is and the corner. */
  overhead?: boolean;
}

/** What the entrance is, in words; null for passages and station houses (no kit, no label). */
export function entranceKind(kind: string, out: boolean, way?: string): string | null {
  // One-way entrances say so: an exit-only stair is no way in (owner, 2026-10-27).
  const only = way === "in" ? " · entry only" : way === "out" ? " · exit only" : "";
  if (/elevator/i.test(kind)) return out ? "Elevator · out of service" : `Elevator${only}`;
  if (/escalator/i.test(kind)) return `Escalator${only}`;
  if (/stair/i.test(kind)) return `Stairs${only}`;
  return null;
}


const ROUTES = new WeakMap<StaticSystem, Map<string, string>>();
function routesById(sys: StaticSystem): Map<string, string> {
  let m = ROUTES.get(sys);
  if (!m) {
    m = new Map((sys.stations?.features ?? []).map((f) => [String(f.properties.id), f.properties.routes ?? ""]));
    ROUTES.set(sys, m);
  }
  return m;
}

function metresBetween(a: Pt, b: Pt): number {
  const kx = 111_320 * Math.cos((((a[1] + b[1]) / 2) * Math.PI) / 180);
  return Math.hypot((a[0] - b[0]) * kx, (a[1] - b[1]) * 111_320);
}

export function entranceLabels(
  sys: StaticSystem,
  outStations: Set<string>,
  eye: Pt,
  placeAt: (at: Pt) => ExitPlace,
  { max, phone, closeM = 60, radiusM = 180, overhead = false }: EntranceLabelOpts,
): GeoJSON.FeatureCollection<GeoJSON.Point, { label: string; d: number }> {
  const routes = routesById(sys);
  const near: Array<{ at: Pt; kind: string; name: string; trains: string; d: number }> = [];
  for (const f of sys.entrances?.features ?? []) {
    const at = f.geometry.coordinates as Pt;
    const d = metresBetween(at, eye);
    if (d > radiusM) continue;
    const kind = entranceKind(f.properties.kind, outStations.has(String(f.properties.id)), f.properties.way);
    // A shared mezzanine lists both stations ("A12; D13"): their trains together.
    const trains = [...new Set(String(f.properties.id).split(/;\s*/).flatMap((id) => (routes.get(id) ?? "").split(" ").filter(Boolean)))].join(" ");
    if (kind) near.push({ at, kind, name: String(f.properties.name ?? ""), trains, d });
  }
  near.sort((a, b) => a.d - b.d);
  const features: GeoJSON.Feature<GeoJSON.Point, { label: string; d: number }>[] = [];
  const shown = new Set<string>();
  for (const e of near) {
    if (features.length >= max) break;
    const corner = cornerLine(placeAt(e.at));
    // Two stairs on one corner read the same; the nearer one speaks for both.
    const key = `${corner ?? ""}|${e.kind}`;
    if (shown.has(key)) continue;
    shown.add(key);
    const head = [e.name, e.trains].filter(Boolean).join(" · ");
    const what = corner ? `${e.kind} · ${corner}` : e.kind;
    const lines = overhead ? (corner ? [e.kind, corner] : [e.kind]) : phone && e.d > closeM ? [head || corner || e.kind] : head ? [head, what] : [what];
    features.push({ type: "Feature", geometry: { type: "Point", coordinates: e.at }, properties: { label: lines.join("\n"), d: Math.round(e.d) } });
  }
  return { type: "FeatureCollection", features };
}
