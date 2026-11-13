/**
 * Puts the dollhouse view of a station walk into the map (#129): the station model as a map layer,
 * one walk per street exit, and a chase camera for the trip preview to follow. Fulton St was first;
 * Brooklyn Bridge–City Hall and Atlantic Av–Barclays Ctr have models too (see stationModels).
 */
import { LngLat, type Map as MaplibreMap } from "maplibre-gl";
import type { DollhouseModel, DollhouseRig, DollhouseState } from "@/lib/map/three/dollhouse";
import type { WalkCallout } from "@/lib/map/three/dollhouseCallouts";
import type { PlaceSign, PlaceWalk, Spot } from "@/lib/map/stationPlace";
import { readMap } from "@/lib/map/mapRead";
import { cornerLine } from "@/lib/map/cornerLine";
import { fultonCorner } from "@/lib/map/fultonCorners";
import { stationModel, type StationModelId } from "@/lib/map/stationModels";

const models = new Map<StationModelId, Promise<DollhouseModel>>();
export function loadModel(id: StationModelId = "fulton"): Promise<DollhouseModel> {
  let model = models.get(id);
  if (!model) {
    model = fetch(stationModel(id).url).then((r) => {
      if (!r.ok) throw new Error(`station model ${r.status}`);
      return r.json() as Promise<DollhouseModel>;
    });
    models.set(id, model);
    model.catch(() => { models.delete(id); });
  }
  return model;
}

/**
 * Fetches what the walk needs before it plays (#132): its code and the station model. Called when a
 * trip that ends with this walk arrives, so Play still works once the signal drops below the street.
 */
export function warmDollhouse(station: StationModelId = "fulton"): Promise<void> {
  return Promise.all([import("@/lib/map/three/dollhouse"), import("@/lib/map/three/dollhouseCallouts"), loadModel(station)]).then(
    () => undefined,
    () => undefined,
  );
}

export type DollhouseView = {
  /** Where the camera goes this frame. */
  rig: (dt: number) => DollhouseRig | null;
  /** The walk's length in metres. */
  lengthM: number;
  /** What to say along the walk, by fraction of it. */
  callouts: WalkCallout[];
  stop: () => void;
};

/**
 * Adds the dollhouse layer for the walk that comes up at `exit` and draws whatever `getState`
 * says. Null when the model has no walk to that exit (the trip then keeps the first-person walk).
 * The exit signs name the exit's street corner as the map reads it, or else `street`.
 */
export async function openDollhouse(
  map: MaplibreMap, exit: [number, number] | null, getState: () => DollhouseState, street: string | null, station: StationModelId = "fulton",
): Promise<DollhouseView | null> {
  const [{ dollhouseLayer, pickWalk, walkLength, DOLLHOUSE_LAYER }, { walkCallouts }, m] = await Promise.all([
    import("@/lib/map/three/dollhouse"), import("@/lib/map/three/dollhouseCallouts"), loadModel(station),
  ]);
  // No exit asked for (the dev hook): the longest walk, through the most of the station.
  const walk = exit ? pickWalk(m, exit) : [...m.walks].sort((a, b) => walkLength(b.path) - walkLength(a.path))[0];
  if (!walk) return null;
  if (map.getLayer(DOLLHOUSE_LAYER)) map.removeLayer(DOLLHOUSE_LAYER);
  let corner: string | null = null;
  try { corner = cornerLine(readMap(map).placeAt(walk.exit)); } catch { corner = null; }
  const exitLine = corner ?? street;
  const view = dollhouseLayer(m, walk, getState, exitLine);
  map.addLayer(view.layer);
  return {
    rig: view.rig,
    lengthM: walkLength(walk.path),
    callouts: walkCallouts(m, walk.path, exitLine),
    stop: () => { if (map.getLayer(DOLLHOUSE_LAYER)) map.removeLayer(DOLLHOUSE_LAYER); },
  };
}

/** Points the map's camera along a dollhouse rig. */
function aimAt(map: MaplibreMap, rig: DollhouseRig): void {
  const cam = map.calculateCameraOptionsFromTo(new LngLat(...rig.eye), rig.eyeAlt, new LngLat(...rig.look), rig.lookAlt);
  map.jumpTo({ center: rig.look, zoom: cam.zoom, pitch: cam.pitch, bearing: cam.bearing, elevation: rig.lookAlt });
}

/**
 * For checking the view by itself (dev and test builds): the overview of the platform, the train
 * pulling out as the camera comes down, then the figure walks the longest walk in `seconds` with
 * the camera following, and it starts again. `at` (0 to 1) holds the figure at one spot of the
 * walk; `wait` (0 to 1) holds that moment of the wait; `exit` picks the walk to that exit;
 * `station` picks the station model (Fulton St unless said).
 */
export async function showDollhouse(
  map: MaplibreMap, opts: { seconds?: number; at?: number; wait?: number; exit?: [number, number]; street?: string; station?: StationModelId } = {},
): Promise<() => void> {
  const seconds = opts.seconds ?? 60, wait = 6, pause = 2;
  const began = performance.now();
  const state: DollhouseState = { walk: 0, wait: null, street: null };
  const tick = () => {
    if (opts.wait != null) { state.walk = 0; state.wait = opts.wait; return; }
    if (opts.at != null) { state.walk = opts.at; state.wait = null; return; }
    const t = ((performance.now() - began) / 1000) % (wait + seconds + pause);
    state.wait = t < wait ? t / wait : null;
    state.walk = Math.min(Math.max(t - wait, 0) / seconds, 1);
  };
  const maxZoom = map.getMaxZoom();
  map.setMaxZoom(24);
  const station = opts.station ?? "fulton";
  const view = await openDollhouse(map, opts.exit ?? null, () => { tick(); return state; }, opts.street ?? stationModel(station).street, station);
  if (!view) { map.setMaxZoom(maxZoom); return () => {}; }
  let frame = 0, last = performance.now();
  const step = (now: number) => {
    const rig = view.rig(Math.min((now - last) / 1000, 0.1));
    last = now;
    if (rig) aimAt(map, rig);
    frame = requestAnimationFrame(step);
  };
  frame = requestAnimationFrame(step);
  return () => { cancelAnimationFrame(frame); view.stop(); map.setMaxZoom(maxZoom); };
}

/** What placing someone inside Fulton St needs (#143): the walks, their signs, the spots, and the way out. */
export type StationPlaceKit = {
  walks: PlaceWalk[];
  signs: PlaceSign[];
  spots: Spot[];
  /** The walk index that comes up at `exit`, or null. */
  walkTo: (exit: [number, number] | null) => number | null;
  /** The street corner each walk comes up at, as the map reads it. */
  corners: Array<string | null>;
  /** The lines at the platform the walks start from: "4/5". */
  lines: string;
  /** The walk's directions from `fromM` metres along it to the street, in English. */
  steps: (walk: number, fromM: number) => string[];
};

/**
 * Loads the station model and lays out its spots and signs for the where-am-I questions. The model,
 * three.js and the sign planner load only here, when someone at Fulton St asks where they are.
 */
export async function loadStationPlace(map: MaplibreMap | null): Promise<StationPlaceKit> {
  const [{ planSigns, walkPlaces, walkLength, pickWalk }, { walkCallouts }, place, m] = await Promise.all([
    import("@/lib/map/three/dollhouse"), import("@/lib/map/three/dollhouseCallouts"), import("@/lib/map/stationPlace"), loadModel(),
  ]);
  const corners = m.walks.map((w) => {
    let line: string | null = null;
    try { line = map ? cornerLine(readMap(map).placeAt(w.exit)) : null; } catch { /* no tiles */ }
    // The map may be far from Fulton St with its streets not loaded: fall back to the corners kept for it.
    return line ?? fultonCorner(w.exit);
  });
  const signs = place.signsFromPlans(m.walks.flatMap((w, i) => planSigns(m, w, corners[i])));
  const gates = m.walks.flatMap((w, i) => { const g = walkPlaces(w.path).gates; return g ? [{ walk: i, at: g.at }] : []; });
  return {
    walks: m.walks,
    signs,
    spots: place.stationSpots(m.walks, signs, gates),
    corners,
    lines: m.lines.map((l) => l[0]).join("/"),
    walkTo: (exit) => {
      const w = exit ? pickWalk(m, exit) : null;
      return w ? m.walks.indexOf(w) : null;
    },
    steps: (walk, fromM) => {
      const path = m.walks[walk].path, len = walkLength(path);
      return walkCallouts(m, path, corners[walk]).filter((c) => !c.wait && c.f * len >= fromM - 1).map((c) => c.text);
    },
  };
}
