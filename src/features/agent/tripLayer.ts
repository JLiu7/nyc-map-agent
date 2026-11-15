import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import type { LngLatTuple, MapPoint, Trip } from "./schema";
import { getAppLang, tr } from "@/lib/i18n/appLang";
import { walkEye } from "@/lib/map/walkEye";

/** The planned trip as MapLibre line/circle layers on one GeoJSON source, plus a moving marker. */
const SRC = "agent-trip";
const MARKER = "agent-marker";
/** The trip's own bus, a box on the road: pulling in to the stop, then carrying the rider. */
const VEHICLE = "agent-vehicle";

/** Official MTA bullet colours (mta.info brand guide), by route id. */
const ROUTE_COLOR: Record<string, string> = {
  "1": "#EE352E", "2": "#EE352E", "3": "#EE352E", "4": "#00933C", "5": "#00933C", "6": "#00933C", "7": "#B933AD",
  A: "#0039A6", C: "#0039A6", E: "#0039A6", B: "#FF6319", D: "#FF6319", F: "#FF6319", M: "#FF6319", G: "#6CBE45",
  J: "#996633", Z: "#996633", L: "#A7A9AC", N: "#FCCC0A", Q: "#FCCC0A", R: "#FCCC0A", W: "#FCCC0A", S: "#808183",
};

function ensure(map: MapLibreMap): void {
  if (map.getSource(SRC)) return;
  map.addSource(SRC, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addSource(MARKER, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addSource(VEHICLE, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addLayer({ id: "agent-walk", type: "line", source: SRC, filter: ["==", ["get", "kind"], "walk"], paint: { "line-color": "#2563eb", "line-width": 4, "line-dasharray": [1, 1.5] } });
  map.addLayer({ id: "agent-drive", type: "line", source: SRC, filter: ["==", ["get", "kind"], "drive"], paint: { "line-color": "#2563eb", "line-width": 6, "line-opacity": 0.85 } });
  map.addLayer({ id: "agent-ride", type: "line", source: SRC, filter: ["==", ["get", "kind"], "ride"], paint: { "line-color": ["get", "color"], "line-width": 6 } });
  map.addLayer({ id: "agent-portal", type: "circle", source: SRC, filter: ["all", ["==", ["geometry-type"], "Point"], ["!", ["has", "note"]]], paint: { "circle-radius": 6, "circle-color": "#ffffff", "circle-stroke-color": "#111827", "circle-stroke-width": 2 } });
  // Where to change trains and stations the trip's lines skip, labelled on the route (#418).
  map.addLayer({ id: "agent-note", type: "circle", source: SRC, filter: ["has", "note"], paint: { "circle-radius": 8, "circle-color": ["match", ["get", "note"], "skip", "#d4183d", "#ffffff"], "circle-stroke-color": ["match", ["get", "note"], "skip", "#ffffff", "#111827"], "circle-stroke-width": 3 } });
  map.addLayer({ id: "agent-note-label", type: "symbol", source: SRC, filter: ["has", "note"], layout: { "text-field": ["get", "label"], "text-font": ["Noto Sans Bold"], "text-size": 12, "text-anchor": "left", "text-offset": [1.1, 0], "text-max-width": 14, "text-optional": true }, paint: { "text-color": "#111827", "text-halo-color": "#ffffff", "text-halo-width": 1.8 } });
  map.addLayer({ id: VEHICLE, type: "fill-extrusion", source: VEHICLE, paint: { "fill-extrusion-color": ["get", "color"], "fill-extrusion-height": 3.2, "fill-extrusion-base": 0.35, "fill-extrusion-opacity": 0.95 } });
  map.addLayer({ id: "agent-marker", type: "circle", source: MARKER, paint: { "circle-radius": 8, "circle-color": ["coalesce", ["get", "color"], "#2563eb"], "circle-stroke-color": "#ffffff", "circle-stroke-width": 3 } });
}

export function tripToGeoJson(trip: Trip): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const l of trip.legs) {
    if (l.kind === "enter" || l.kind === "exit") {
      features.push({ type: "Feature", properties: { kind: l.kind }, geometry: { type: "Point", coordinates: [l.portal.lon, l.portal.lat] } });
    } else {
      const kind = l.kind === "transfer" ? "walk" : l.kind;
      const color = l.kind === "ride" ? ROUTE_COLOR[l.route] ?? "#808183" : null;
      features.push({ type: "Feature", properties: { kind, color }, geometry: { type: "LineString", coordinates: l.coords } });
    }
  }
  const lang = getAppLang();
  const rides = trip.legs.filter((l) => l.kind === "ride");
  rides.slice(1).forEach((l) => {
    const label = `${tr(lang, "changeTo").replace("{r}", l.route)}${l.fromStop ? ` · ${l.fromStop}` : ""}`;
    features.push({ type: "Feature", properties: { note: "transfer", label }, geometry: { type: "Point", coordinates: l.coords[0] } });
  });
  for (const k of trip.skips) {
    features.push({ type: "Feature", properties: { note: "skip", label: `${k.route} · ${tr(lang, "skipped")}: ${k.name}` }, geometry: { type: "Point", coordinates: k.at } });
  }
  return { type: "FeatureCollection", features };
}

/** Draw the trip and fit the camera to it; `fit: false` only redraws (a preview owns the camera). */
export function showTrip(map: MapLibreMap, trip: Trip, { fit = true }: { fit?: boolean } = {}): void {
  ensure(map);
  void (map.getSource(SRC) as GeoJSONSource).setData(tripToGeoJson(trip));
  if (!fit) return;
  const all = trip.legs.flatMap((l) => ("coords" in l ? l.coords : [[l.portal.lon, l.portal.lat] as LngLatTuple]));
  const lons = all.map((c) => c[0]);
  const lats = all.map((c) => c[1]);
  map.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding: 80, pitch: 0, bearing: 0, duration: 800 });
}

/** Take the trip off the map: closed, replaced by a new question, or handed to walking guidance. */
export function clearTrip(map: MapLibreMap): void {
  const source = map.getSource(SRC);
  if (source) void (source as GeoJSONSource).setData({ type: "FeatureCollection", features: [] });
}

export function setMarker(map: MapLibreMap, at: LngLatTuple | null, route?: string): void {
  ensure(map);
  void (map.getSource(MARKER) as GeoJSONSource).setData({
    type: "FeatureCollection",
    features: at ? [{ type: "Feature", properties: { color: route ? ROUTE_COLOR[route] ?? null : null }, geometry: { type: "Point", coordinates: at } }] : [],
  });
}

/** A city bus's footprint, metres: long, then wide. */
const BUS = [12.2, 2.6];
/** The bus as a box on the road at `at`, nose along `heading`; null takes it away. */
export function busFootprint(at: LngLatTuple, heading: number): GeoJSON.Polygon {
  const r = (heading * Math.PI) / 180, k = 111_320, kx = k * Math.cos((at[1] * Math.PI) / 180);
  const [fx, fy, rx, ry] = [Math.sin(r), Math.cos(r), Math.cos(r), -Math.sin(r)];
  const pt = (a: number, b: number): LngLatTuple => [at[0] + (fx * a + rx * b) / kx, at[1] + (fy * a + ry * b) / k];
  const [l, w] = [BUS[0] / 2, BUS[1] / 2];
  return { type: "Polygon", coordinates: [[pt(l, -w), pt(l, w), pt(-l, w), pt(-l, -w), pt(l, -w)]] };
}
export function setTripBus(map: MapLibreMap, bus: { at: LngLatTuple; heading: number; color: string } | null): void {
  ensure(map);
  void (map.getSource(VEHICLE) as GeoJSONSource).setData({
    type: "FeatureCollection",
    features: bus ? [{ type: "Feature", properties: { color: bus.color }, geometry: busFootprint(bus.at, bus.heading) }] : [],
  });
}

/** Route colour by line id; grey for an unknown line. */
export const routeColor = (route: string): string => ROUTE_COLOR[route.replace(/X$/, "")] ?? "#808183";

/** Named spots from an answer button (stops, skipped stations, crash hotspots): one source, replaced on each tap. */
const POINTS = "agent-points";
export function pointsToGeoJson(points: MapPoint[], color: string): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features: points.map((p) => ({ type: "Feature", properties: { name: p.name, color }, geometry: { type: "Point", coordinates: p.at } })) };
}
export function showPoints(map: MapLibreMap, points: MapPoint[], color: string): void {
  if (!map.getSource(POINTS)) {
    map.addSource(POINTS, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    map.addLayer({ id: `${POINTS}-dot`, type: "circle", source: POINTS, paint: { "circle-radius": 7, "circle-color": ["get", "color"], "circle-stroke-color": "#ffffff", "circle-stroke-width": 2 } });
    map.addLayer({ id: `${POINTS}-label`, type: "symbol", source: POINTS, layout: { "text-field": ["get", "name"], "text-font": ["Noto Sans Bold"], "text-size": 11, "text-anchor": "left", "text-offset": [1, 0], "text-optional": true, "text-max-width": 14 }, paint: { "text-color": "#111827", "text-halo-color": "#ffffff", "text-halo-width": 1.5 } });
  }
  void (map.getSource(POINTS) as GeoJSONSource).setData(pointsToGeoJson(points, color));
  // In street view the camera stays at eye level: two restrooms fitted from above flew it
  // off the street at 800×1000 (owner report, 2026-10-29). The pins and the mini map show them.
  if (walkEye()) return;
  if (points.length === 1) { map.flyTo({ center: points[0].at, zoom: Math.max(map.getZoom(), 15), duration: 800 }); return; }
  const lons = points.map((p) => p.at[0]);
  const lats = points.map((p) => p.at[1]);
  map.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding: 80, maxZoom: 16, duration: 800 });
}

/** Drop the marks of the previous answer, so a new question starts on a clean map. */
export function clearPoints(map: MapLibreMap): void {
  const source = map.getSource(POINTS);
  if (source) void (source as GeoJSONSource).setData({ type: "FeatureCollection", features: [] });
}

const saved = new Map<string, unknown>();
/** Ghost / x-ray: fade every extruded-building layer while the preview is underground. */
export function setXray(map: MapLibreMap, on: boolean): void {
  const ids = (map.getStyle()?.layers ?? []).filter((l) => l.type === "fill-extrusion" && /building/i.test(l.id)).map((l) => l.id);
  for (const id of ids) {
    if (on) {
      if (!saved.has(id)) saved.set(id, map.getPaintProperty(id, "fill-extrusion-opacity") ?? 1);
      map.setPaintProperty(id, "fill-extrusion-opacity", 0.18);
    } else if (saved.has(id)) {
      map.setPaintProperty(id, "fill-extrusion-opacity", saved.get(id) as number);
      saved.delete(id);
    }
  }
}

const dimmed = new Map<string, unknown>();
/** While previewing, fade the data columns (not buildings) so the street stays visible. */
export function setPreviewDim(map: MapLibreMap, on: boolean): void {
  const ids = (map.getStyle()?.layers ?? []).filter((l) => l.type === "fill-extrusion" && !/building/i.test(l.id) && l.id !== VEHICLE).map((l) => l.id);
  for (const id of ids) {
    if (on && !dimmed.has(id)) {
      dimmed.set(id, map.getPaintProperty(id, "fill-extrusion-opacity") ?? 1);
      map.setPaintProperty(id, "fill-extrusion-opacity", 0.12);
    } else if (!on && dimmed.has(id)) {
      map.setPaintProperty(id, "fill-extrusion-opacity", dimmed.get(id) as number);
      dimmed.delete(id);
    }
  }
}
