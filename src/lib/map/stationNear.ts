/**
 * Which station the walker is beside, built into a walkable model on first
 * approach. Loads the station insides (xray.json below the street,
 * elevated.json above it) and the subway's entrances and track shapes once,
 * the first time street view asks.
 */
import { buildStation, toLocal, type StationModel, type WalkStation } from "./stationWalk";

type P = [number, number];
type Sub = {
  entrances: { features: Array<{ properties: { id: string; kind: string }; geometry: { coordinates: P } }> };
  shapes: Record<string, { c: P[]; g: string[] }>;
};
type Entry = { key: string; ids: string[]; box: [number, number, number, number]; st: WalkStation; elevated: boolean };

/** How far outside its mapped ways a station's model is built: enough to reach the entrances first. */
const NEAR_M = 80;

export interface NearStation {
  key: string;
  model: StationModel;
  /** Track centrelines through the station, in the model's local metres. */
  tracks: P[][];
}

let loading: Promise<{ entries: Entry[]; sub: Sub }> | null = null;
function load() {
  return (loading ??= Promise.all(
    ["/transit/xray.json", "/transit/elevated.json", "/transit/subway.json"].map((u) => fetch(u).then((r) => (r.ok ? r.json() : {}))),
  ).then(([under, over, sub]) => {
    const entries = new Map<string, Entry>();
    for (const [all, elevated] of [[under, false], [over, true]] as Array<[Record<string, WalkStation>, boolean]>)
      for (const [id, st] of Object.entries(all)) {
        const first = st.ways[0]?.c[0];
        if (!first) continue;
        // A complex's stations share one layout (scripts/xray-overrides/): one model for all.
        const key = `${first.join()}:${st.ways.length}`;
        const had = entries.get(key);
        if (had) { had.ids.push(id); continue; }
        const pts = st.ways.flatMap((w) => w.c);
        const lat = pts[0][1], dLon = NEAR_M / (111_320 * Math.cos((lat * Math.PI) / 180)), dLat = NEAR_M / 111_320;
        const box: Entry["box"] = [Math.min(...pts.map((p) => p[0])) - dLon, Math.min(...pts.map((p) => p[1])) - dLat, Math.max(...pts.map((p) => p[0])) + dLon, Math.max(...pts.map((p) => p[1])) + dLat];
        entries.set(key, { key, ids: [id], box, st, elevated });
      }
    return { entries: [...entries.values()], sub: sub as Sub };
  }));
}

/** Track centrelines inside the model's floors' extent, split where they leave it. Only the station's kind of track. */
function tracksFor(m: StationModel, sub: Sub): P[][] {
  const xs = m.pieces.flatMap((g) => [g.x0, g.x0 + g.nx * 0.5]), ys = m.pieces.flatMap((g) => [g.y0, g.y0 + g.ny * 0.5]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const out: P[][] = [];
  const seen = new Set<string>();
  for (const s of Object.values(sub.shapes ?? {})) {
    let run: P[] = [];
    const flush = () => {
      const key = run.length > 1 ? `${run[0].map((v) => v.toFixed(0)).join()}|${run.at(-1)!.map((v) => v.toFixed(0)).join()}` : "";
      if (key && !seen.has(key)) { seen.add(key); out.push(run); }
      run = [];
    };
    s.c.forEach((p, i) => {
      const [x, y] = toLocal(m, p[0], p[1]);
      const kind = (s.g[i] === "elevated") === m.elevated;
      if (kind && x >= x0 && x <= x1 && y >= y0 && y <= y1) run.push([x, y]);
      else flush();
    });
    flush();
  }
  return out;
}

const built = new Map<string, NearStation | null>();
/** The station whose box holds (lon, lat), built once and shared by every caller. */
function find(data: { entries: Entry[]; sub: Sub }, lon: number, lat: number): NearStation | null {
  const e = data.entries.find((s) => lon >= s.box[0] && lon <= s.box[2] && lat >= s.box[1] && lat <= s.box[3]);
  if (!e) return null;
  if (!built.has(e.key)) {
    const ids = new Set(e.ids);
    const doors = data.sub.entrances?.features.filter((f) => ids.has(f.properties.id) && /Stair|Escalator|Elevator/.test(f.properties.kind)).map((f) => f.geometry.coordinates) ?? [];
    const model = buildStation(e.st, { entrances: doors });
    built.set(e.key, model ? { key: e.key, model, tracks: tracksFor(model, data.sub) } : null);
  }
  return built.get(e.key) ?? null;
}

/** A finder that answers synchronously: the station at (lon, lat), or null while loading or away from every station. */
export function stationFinder() {
  let data: { entries: Entry[]; sub: Sub } | null = null;
  void load().then((d) => (data = d)).catch(() => {});
  return {
    near(lon: number, lat: number): NearStation | null {
      return data ? find(data, lon, lat) : null;
    },
  };
}

/** The station at (lon, lat) once the data is in; null away from every station or when it cannot load. */
export function stationAt(lon: number, lat: number): Promise<NearStation | null> {
  return load().then((d) => find(d, lon, lat)).catch(() => null);
}
