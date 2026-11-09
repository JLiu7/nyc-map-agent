import type { ExpressionSpecification, Map as MapLibreMap } from "maplibre-gl";
import { ensurePmtilesProtocol } from "./pmtilesProtocol";

/**
 * Textured 3D city (pilot area): NYC footprints with facade patterns picked by
 * building type, plus low-poly props (trees, hydrants, benches, street-light
 * poles) at their real locations. Everything is MapLibre fill-extrusion on one
 * static PMTiles file, so there is no second renderer and no live query.
 * Textures and props only draw from zoom 16 (LOD); tiles stop at z16, which
 * caps how many props a view can hold.
 */
/**
 * Citywide tiles (all five boroughs). PMTiles is range-requested, so a walker
 * only downloads the few z14-16 tiles around them. The file lives in R2 via
 * Octo files (`pnpm publish:city-tiles`) and is served same-origin by
 * /api/city-tiles. `VITE_CITY_TILES_URL` overrides it, e.g. `/tiles/nyc-city.pmtiles`
 * for a local build from `pnpm build:city-tiles`.
 */
export const CITY3D_TILES: string = import.meta.env.VITE_CITY_TILES_URL ?? "/api/city-tiles";

function tilesUrl(): string {
  return /^https?:\/\//.test(CITY3D_TILES) ? CITY3D_TILES : `${window.location.origin}${CITY3D_TILES}`;
}
export const CITY3D_MIN_ZOOM = 16;
export const FACADES = [
  "rowhouse", "brownstone", "walkup", "prewar", "limestone", "castiron", "modern", "tower", "glass", "school", "storefront",
  "rowhouse-2", "rowhouse-3", "walkup-2", "walkup-3", "prewar-2", "prewar-3", "modern-2", "modern-3",
] as const;
const SOURCE = "city3d";
const STOREFRONT_M = 4.5;

export const CITY3D_LAYERS = ["city3d-storefront", "city3d-walls", "city3d-roofs", "city3d-props", "city3d-bridges", "city3d-overpasses", "city3d-signs", "city3d-furniture", "city3d-hydrants", "city3d-landmarks", "city3d-storefront-signs"] as const;

/** Source layers only three.js reads; an invisible style layer keeps them in overzoomed tiles. */
export const KEEP_SOURCE_LAYERS = ["storefronts", "signs"] as const;
/** Basemap source layers read at street level whose only style layers (labels) walking hides. */
export const KEEP_BASEMAP_LAYERS = ["transportation_name"] as const;

async function loadFacades(map: MapLibreMap): Promise<void> {
  await Promise.all(
    FACADES.map(async (name) => {
      const id = `facade-${name}`;
      if (map.hasImage(id)) return;
      const img = await map.loadImage(`/textures/${id}.png`);
      if (!map.hasImage(id)) map.addImage(id, img.data);
    }),
  );
}

/** Roofs read darker than walls (tar, gravel, mechanical decks), as in aerials. */
const ROOF: ExpressionSpecification = [
  "match", ["get", "facade"],
  "glass", "#4e5b66",
  "tower", "#5f6a73",
  "modern", "#6b6e72",
  ["prewar", "limestone"], "#6d665c",
  "school", "#5e4a40",
  "#57534f",
];

const PROP_COLOR: ExpressionSpecification = [
  "match", ["get", "kind"],
  "canopy", "#4f8a3c",
  "trunk", "#6b4a2f",
  "hydrant", "#c8352b",
  "bench", "#7a5a3a",
  "pole", "#5d646b",
  "lamp", "#f2e7b8",
  "tank", "#7a5a3c",
  "tankroof", "#4a3a2c",
  "tankleg", "#3b3b3b",
  "#888888",
];

async function ensureSource(map: MapLibreMap): Promise<void> {
  await ensurePmtilesProtocol();
  if (!map.getSource(SOURCE)) {
    map.addSource(SOURCE, {
      type: "vector",
      url: `pmtiles://${tilesUrl()}`,
      attribution: "NYC Open Data (footprints, PLUTO, DOE schools, trees, hydrants, benches)",
    });
  }
}

/**
 * Distance skyline: towers over 60 m (over 120 m already at z11) from the
 * `skyline` layer that `pnpm build:skyline-tiles` bakes into z11-16 of the city
 * tiles. It fills the zooms below the basemap's own 3D buildings and the
 * hero landmarks (both z14), so Manhattan seen from DUMBO or Long Island City
 * stands up at once instead of popping in late. Independent of the textured-city
 * toggle: it is plain colour, a few hundred kB for the whole city.
 */
const SKYLINE_LAYER = "city3d-skyline";
const SKYLINE_MIN_ZOOM = 11;
const SKYLINE_MAX_ZOOM = 14;

const SKYLINE_COLOR: ExpressionSpecification = [
  "match", ["get", "facade"],
  "glass", "#8a9aa8",
  "limestone", "#c8bca6",
  "#a9aaab",
];

export async function installSkyline(map: MapLibreMap): Promise<void> {
  await ensureSource(map);
  if (map.getLayer(SKYLINE_LAYER)) return;
  const beforeId = map.getStyle().layers?.find((l) => l.type === "symbol")?.id;
  map.addLayer(
    {
      id: SKYLINE_LAYER,
      type: "fill-extrusion",
      source: SOURCE,
      "source-layer": "skyline",
      // No layer maxzoom: MapLibre skips a layer in any tile whose own zoom is past
      // it, and a pitched camera below z14 still draws z14-16 tiles near the eye.
      // The hand-over to the basemap's buildings is an opacity step instead.
      minzoom: SKYLINE_MIN_ZOOM,
      paint: {
        "fill-extrusion-opacity": ["step", ["zoom"], 1, SKYLINE_MAX_ZOOM, 0],
        "fill-extrusion-color": SKYLINE_COLOR,
        "fill-extrusion-height": ["get", "h"],
        "fill-extrusion-base": 0,
        "fill-extrusion-vertical-gradient": true,
      },
    },
    beforeId,
  );
}

export function setSkylineVisible(map: MapLibreMap, on: boolean): void {
  if (map.getLayer(SKYLINE_LAYER)) map.setLayoutProperty(SKYLINE_LAYER, "visibility", on ? "visible" : "none");
}

/** Adds the source, images and layers (hidden). Safe to call after every style load. */
export async function installCity3d(map: MapLibreMap): Promise<void> {
  await ensureSource(map);
  await loadFacades(map);
  if (map.getLayer("city3d-walls")) return;
  const beforeId = map.getStyle().layers?.find((l) => l.type === "symbol")?.id;
  const common = { source: SOURCE, minzoom: CITY3D_MIN_ZOOM, layout: { visibility: "none" as const } };
  map.addLayer(
    {
      ...common,
      id: "city3d-storefront",
      type: "fill-extrusion",
      "source-layer": "buildings",
      filter: ["==", ["get", "store"], 1],
      paint: {
        "fill-extrusion-pattern": "facade-storefront",
        "fill-extrusion-height": ["min", STOREFRONT_M, ["get", "h"]],
        "fill-extrusion-base": 0,
      },
    },
    beforeId,
  );
  map.addLayer(
    {
      ...common,
      id: "city3d-walls",
      type: "fill-extrusion",
      "source-layer": "buildings",
      paint: {
        // Material variant `v` (2, 3) where the tiles carry one; older tiles have none.
        "fill-extrusion-pattern": ["case", ["has", "v"],
          ["concat", "facade-", ["get", "facade"], "-", ["to-string", ["get", "v"]]],
          ["concat", "facade-", ["get", "facade"]]],
        "fill-extrusion-height": ["get", "h"],
        // OSM building:part setbacks and podiums carry their own base (min_height).
        "fill-extrusion-base": ["case", ["==", ["get", "store"], 1], ["min", STOREFRONT_M, ["get", "h"]], ["coalesce", ["get", "base"], 0]],
      },
    },
    beforeId,
  );
  // Patterns also paint the roof; a thin solid cap keeps roofs plain like Streets GL.
  map.addLayer(
    {
      ...common,
      id: "city3d-roofs",
      type: "fill-extrusion",
      "source-layer": "buildings",
      paint: {
        "fill-extrusion-color": ROOF,
        "fill-extrusion-base": ["get", "h"],
        "fill-extrusion-height": ["+", ["get", "h"], 0.4],
      },
    },
    beforeId,
  );
  // Bridge decks, railings and piers (scripts/bridges.ts): visible from z14,
  // since a bridge is a landmark from afar, unlike street props. Decks no
  // higher than 8 m (overpasses, the BQE and other viaducts) get no piers in
  // the tiles and cut off square at the ends, so from the street they read as
  // grey slabs floating overhead; only piers and the tall spans are drawn.
  map.addLayer(
    {
      ...common,
      id: "city3d-bridges",
      type: "fill-extrusion",
      "source-layer": "bridges",
      minzoom: 14,
      filter: ["any", ["==", ["get", "kind"], "pier"], [">", ["to-number", ["get", "height"]], 8.5]],
      paint: {
        "fill-extrusion-color": ["match", ["get", "kind"], "rail", "#b9bcc0", "pier", "#7b7e82", "#8e9196"],
        "fill-extrusion-base": ["get", "base"],
        "fill-extrusion-height": ["get", "height"],
      },
    },
    beforeId,
  );
  map.addLayer(
    {
      ...common,
      id: "city3d-props",
      type: "fill-extrusion",
      "source-layer": "props",
      paint: {
        "fill-extrusion-color": PROP_COLOR,
        "fill-extrusion-base": ["get", "base"],
        "fill-extrusion-height": ["get", "height"],
      },
    },
    beforeId,
  );
  // Shop signboards and corner names are drawn by three.js, which reads them with
  // querySourceFeatures. Past the tiles' z16 MapLibre slices each tile and keeps
  // only the source layers a style layer uses, so without these the shops right
  // in front of you dropped out of the data. Zero-radius circles: nothing draws.
  for (const sourceLayer of KEEP_SOURCE_LAYERS) {
    map.addLayer(
      {
        id: `city3d-keep-${sourceLayer}`,
        type: "circle",
        source: SOURCE,
        "source-layer": sourceLayer,
        minzoom: CITY3D_MIN_ZOOM,
        paint: { "circle-radius": 0, "circle-opacity": 0, "circle-stroke-width": 0 },
      },
      beforeId,
    );
  }
  // Walking hides the basemap's labels, the only style layers that use street
  // names, so corner signs and exit corners lost them the same way.
  if (map.getSource("openmaptiles")) {
    for (const sourceLayer of KEEP_BASEMAP_LAYERS) {
      map.addLayer(
        {
          id: `city3d-keep-${sourceLayer}`,
          type: "circle",
          source: "openmaptiles",
          "source-layer": sourceLayer,
          minzoom: CITY3D_MIN_ZOOM,
          paint: { "circle-radius": 0, "circle-opacity": 0, "circle-stroke-width": 0 },
        },
        beforeId,
      );
    }
  }
  // Corner street-name signs (three.js custom layer in this canvas); its own chunk.
  const { createStreetSignsLayer } = await import("./threeLayer");
  if (!map.getLayer("city3d-signs")) {
    map.addLayer(createStreetSignsLayer(), beforeId);
    map.setLayoutProperty("city3d-signs", "visibility", "none");
  }
  // Bus stop pole signs and restroom kiosks (three.js, shared layer), street level only.
  const { createFurnitureLayer, FURNITURE_LAYER } = await import("./threeLayer");
  if (!map.getLayer(FURNITURE_LAYER)) {
    map.addLayer(createFurnitureLayer(), beforeId);
    map.setLayoutProperty(FURNITURE_LAYER, "visibility", map.getLayoutProperty("city3d-signs", "visibility") ?? "none");
  }
  // NYC hydrant models (three.js, shared layer); the extruded stubs step aside.
  const { createHydrantLayer, HYDRANTS_3D_LAYER } = await import("./threeLayer");
  if (!map.getLayer(HYDRANTS_3D_LAYER)) {
    map.addLayer(createHydrantLayer(), beforeId);
    map.setLayoutProperty(HYDRANTS_3D_LAYER, "visibility", map.getLayoutProperty("city3d-props", "visibility") ?? "none");
    map.setFilter("city3d-props", ["!=", ["get", "kind"], "hydrant"]);
  }
  // Hero landmarks (glTF), whose footprints the tiles leave out, and motorway
  // and trunk overpasses lifted off the street (the tall decks stay the tiles').
  const { createLandmarksLayer, createOverpassLayer } = await import("./threeLayer");
  for (const [id, make] of [["city3d-landmarks", createLandmarksLayer], ["city3d-overpasses", createOverpassLayer]] as const) {
    if (map.getLayer(id)) continue;
    map.addLayer(make(), beforeId);
    map.setLayoutProperty(id, "visibility", map.getLayoutProperty("city3d-walls", "visibility") ?? "none");
  }
}

/** Small "school" disc for DOE school points; drawn once on a canvas. */
function schoolIcon(): ImageData {
  const n = 36;
  const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("no 2d canvas");
  ctx.canvas.width = ctx.canvas.height = n;
  ctx.beginPath();
  ctx.arc(n / 2, n / 2, n / 2 - 3, 0, Math.PI * 2);
  ctx.fillStyle = "#b45309";
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#fff";
  ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.beginPath(); // a simple pediment + body: "schoolhouse"
  ctx.moveTo(n / 2, 9); ctx.lineTo(27, 16); ctx.lineTo(9, 16); ctx.closePath(); ctx.fill();
  ctx.fillRect(11, 16, 14, 10);
  return ctx.getImageData(0, 0, n, n);
}

/** Optional school icons (the "Schools" chip). Needs installCity3d first. */
export function setSchoolIconsVisible(map: MapLibreMap, on: boolean): void {
  if (!map.getSource(SOURCE)) return;
  if (!map.hasImage("school-icon")) map.addImage("school-icon", schoolIcon(), { pixelRatio: 2 });
  if (!map.getLayer("city3d-schools")) {
    map.addLayer({
      id: "city3d-schools", type: "symbol", source: SOURCE, "source-layer": "schools", minzoom: 14,
      layout: { "icon-image": "school-icon", "icon-allow-overlap": true, visibility: "none" },
    });
  }
  map.setLayoutProperty("city3d-schools", "visibility", on ? "visible" : "none");
}

/** School icons on their own: the tiles source only, no textured layers and no three.js. */
export async function showSchoolIcons(map: MapLibreMap, on: boolean): Promise<void> {
  if (on) await ensureSource(map);
  setSchoolIconsVisible(map, on);
}

/** School name under a click: a school-faced building or a school icon. */
export function schoolAt(map: MapLibreMap, x: number, y: number): string | null {
  const layers = ["city3d-schools", "city3d-walls"].filter((id) => map.getLayer(id));
  if (!layers.length) return null;
  for (const f of map.queryRenderedFeatures([[x - 6, y - 6], [x + 6, y + 6]], { layers })) {
    const props = f.properties as Record<string, unknown> | null;
    const name: unknown = f.layer.id === "city3d-schools" ? props?.name : props?.school;
    if (typeof name === "string" && name) return name;
  }
  return null;
}

/** True when the textured city actually has buildings loaded for the current view. */
export function city3dCoversView(map: MapLibreMap): boolean {
  if (!map.getSource(SOURCE) || map.getZoom() < CITY3D_MIN_ZOOM) return false;
  // Only buildings around the map centre count: a pitched camera also loads
  // tiles towards the horizon, and textured towers 4 km away do not cover this
  // street. ~200 m either way of the centre is "here".
  const { lng, lat } = map.getCenter();
  const near = (c: number[]) => Math.abs(c[0] - lng) < 0.0025 && Math.abs(c[1] - lat) < 0.0018;
  return map.querySourceFeatures(SOURCE, { sourceLayer: "buildings" }).some((f) => {
    const g = f.geometry;
    const ring = g.type === "Polygon" ? g.coordinates[0] : g.type === "MultiPolygon" ? g.coordinates[0]?.[0] : undefined;
    return ring?.[0] ? near(ring[0]) : false;
  });
}

/**
 * Basemap 3D buildings stop where the textured ones start, so they never
 * z-fight, but only while the textured tiles really cover the view. Outside
 * coverage (or before the tile file is deployed) the basemap keeps its
 * extrusions, so turning the city on never blanks the street.
 */
export function setCity3dVisible(map: MapLibreMap, on: boolean, covered = on): void {
  for (const id of CITY3D_LAYERS) {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
  }
  for (const layer of map.getStyle().layers ?? []) {
    if (layer.type !== "fill-extrusion" || layer.id.startsWith("city3d-")) continue;
    if (!("source-layer" in layer) || layer["source-layer"] !== "building") continue;
    map.setLayerZoomRange(layer.id, layer.minzoom ?? 0, on && covered ? CITY3D_MIN_ZOOM : 24);
  }
  // Shop/POI labels pile up on the textured storefronts at street level; transit stays.
  for (const layer of map.getStyle().layers ?? []) {
    if (!isPoiLabelLayer(layer)) continue;
    const min = layer.minzoom ?? 0;
    map.setLayerZoomRange(layer.id, min, on ? Math.max(min, POI_LABEL_MAX_ZOOM) : 24);
  }
}

/** Basemap POI labels end at this zoom while the 3D city is on. */
export const POI_LABEL_MAX_ZOOM = 16;

export function isPoiLabelLayer(layer: { id: string; type: string; "source-layer"?: string }): boolean {
  return layer.type === "symbol" && layer["source-layer"] === "poi" && !/transit/.test(layer.id);
}
