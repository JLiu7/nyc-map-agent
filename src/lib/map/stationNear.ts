/**
 * Which station the walker is beside, built into a walkable model on first
 * approach. Loads the station insides (xray.json below the street,
 * elevated.json above it) and the subway's entrances and track shapes once,
 * the first time street view asks.
 */
import { bulletsFor, trimFor, type SignInfo } from "./stationSignWords";
import { buildStation, toLocal, type StationModel, type WalkStation } from "./stationWalk";

type P = [number, number];
type Sub = {
  entrances: { features: Array<{ properties: { id: string; kind: string }; geometry: { coordinates: P } }> };
  shapes: Record<string, { c: P[]; g: string[] }>;
  stations?: { features: Array<{ properties: { id: string; name: string; routes: string } }> };
  routes?: Record<string, { short: string; color: string; text: string }>;
};
type Entry = { key: string; ids: string[]; box: [number, number, number, number]; st: WalkStation; elevated: boolean };

/** How far outside its mapped ways a station's model is built: enough to reach the entrances first. */
const NEAR_M = 80;

export interface NearStation {
  key: string;
  model: StationModel;
  /** Track centrelines through the station, in the model's local metres. */
  tracks: P[][];
  /** What the station's signs say: its name, its lines and where their tracks run. */
  signs: SignInfo;
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

/**
 * Track centrelines inside the model's floors' extent, split where they leave it. Only the station's kind of track.
 * `lines` keeps each line's own runs (express runs under their line), so a platform's signs can name the lines beside it.
 */
function tracksFor(m: StationModel, sub: Sub): { tracks: P[][]; lines: SignInfo["lines"] } {
  const xs = m.pieces.flatMap((g) => [g.x0, g.x0 + g.nx * 0.5]), ys = m.pieces.flatMap((g) => [g.y0, g.y0 + g.ny * 0.5]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const out: P[][] = [];
  const lines: SignInfo["lines"] = [];
  const seen = new Set<string>();
  for (const [route, s] of Object.entries(sub.shapes ?? {})) {
    let run: P[] = [];
    const flush = () => {
      const key = run.length > 1 ? `${run[0].map((v) => v.toFixed(0)).join()}|${run.at(-1)!.map((v) => v.toFixed(0)).join()}` : "";
      if (run.length > 1) lines.push({ route: /^[0-9A-Z]X$/.test(route) ? route[0] : route, c: run });
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
  return { tracks: out, lines };
}

/** The signs' words for the stations `ids` share a model with. */
function signsFor(key: string, ids: string[], sub: Sub, lines: SignInfo["lines"]): SignInfo {
  const byId = new Map((sub.stations?.features ?? []).map((f) => [f.properties.id, f.properties]));
  const stations = ids.flatMap((id) => {
    const s = byId.get(id);
    return s ? [{ name: s.name, routes: bulletsFor(s.routes, sub.routes ?? {}) }] : [];
  });
  return { stations, lines, trim: trimFor(key) };
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
    if (!model) built.set(e.key, null);
    else {
      const { tracks, lines } = tracksFor(model, data.sub);
      built.set(e.key, { key: e.key, model, tracks, signs: signsFor(e.key, e.ids, data.sub, lines) });
    }
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
