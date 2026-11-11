import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildStreetContext, closeAsk, openAsk } from "@/lib/agent/streetContext";
import { followedTrain, usePreviewEye } from "@/lib/transit/follow";
import { setMapInstance } from "@/lib/map/mapInstance";
import { watchMapCovers } from "@/lib/map/mapCover";
import { DirectionsFromHere } from "@/components/DirectionsFromHere";
import { RestroomDetails } from "@/components/RestroomCard";
import { usePanel, usePanelChip } from "@/lib/store/PanelContext";
import { setAmbient } from "@/lib/ambient";
import { useFlags } from "@/lib/flags";
import { useFeatureToggles } from "@/lib/featureToggles";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { MapCompass } from "./MapCompass";
import { YouMarker } from "./YouMarker";
import { ViewSwitcher } from "./ViewSwitcher";
import { applyReadable, hideShields } from "@/lib/map/readable";
import { busStopAt, busStopIconOpacity, busStopTextOpacity } from "@/lib/map/busStops";
import { applyPlaces, classesFor, placesStale, usePlaces, withQuickPlaces } from "@/lib/map/places";
import { insetFilters } from "@/lib/map/miniStyle";
import { useMapOptions } from "@/lib/map/mapOptions";
import { applyBuildings, cityDetail, mapLevel, wantsFlatBuildings } from "@/lib/map/buildings";
import { focusLandmarks, guideLandmarkNamed, installLandmarkLabels, isLandmarkLayer, landmarkAt } from "@/lib/map/landmarkLabels";
import { landmarkAt as landmarkModelAt } from "@/lib/map/landmarks";
import { LandmarkDetails } from "@/components/LandmarkDetails";
import { STREET_LEVEL_RANGE_M, describeGuide, pickGuideLandmarks } from "@/lib/guide/landmarkGuide";
import { setWalkEye } from "@/lib/map/walkEye";
import { applyMapTheme, buildingEdge, setThemeCoords, usePalette } from "@/lib/theme";
import { sharedCoords } from "@/lib/geo/sharedLocation";

setThemeCoords(sharedCoords);
import { useTransitFocus } from "@/lib/map/transitFocus";
import { useFlag } from "@/lib/flags";
import MapLibreMap, {
  type MapLayerMouseEvent,
  type MapRef,
} from "react-map-gl/maplibre";
import { LngLat, type GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "@/lib/map/maplibreWorker";
import { cameraTransform } from "@/lib/map/cameraTransform";
import type { NtaBoundary } from "@/lib/api/nta";
import { formatCount, formatPercent } from "@/lib/format";
import { blockContaining, blockKey } from "@/lib/geo/blocks";
import { eyePick } from "@/lib/map/eyePick";
import { boroughOutlinesToGeoJson } from "@/lib/geo/boroughs";
import { NtaIndex } from "@/lib/geo/ntaIndex";
import { areasToGeoJson, blockPointsToGeoJson, type AreaDatum } from "@/lib/geo/areas";
import {
  HOME_VIEW,
  LAYER_METRICS,
  type BlockDatum,
  type MapModel,
  type NeighborhoodDatum,
  blockName,
} from "@/lib/layers";
import {
  applyAtmosphere,
  applyStreetPalette,
  loadStreetTextures,
  BASEMAP_STYLE_URL,
  VECTOR_SOURCE,
  installDataLayers,
  warmBasemapFonts,
} from "@/lib/map/basemap";
import { markBasemapReady } from "@/lib/map/basemapReady";
import {
  blockSelectionToGeoJson,
  blocksToGeoJson,
  emphasisToGeoJson,
  neighborhoodsToGeoJson,
} from "@/lib/map/geojson";
import { BLOCK_HEIGHT, LAYER_IDS, SOURCE_IDS, buildFallbackStyle } from "@/lib/map/style";
import { BLOCK_FILL_LAYER, installBlockTiles, pushBlocks, setBlockFillVisible } from "@/lib/map/blockTiles";
import { fetchNearestStreet, type WalkingRoute } from "@/lib/api/routing";
import { useDataView } from "@/lib/store/DataViewContext";
import type { CameraOptions, Map as MaplibreMapInstance } from "maplibre-gl";
import { sendCamera } from "@/lib/map/cameraMode";
import { setStreetSpot, showView, useViewRequest, type ViewRequest } from "@/lib/map/viewChange";
import {
  approachBearing,
  clampLookPitch,
  EYE_HEIGHT_M,
  lookTarget,
  LOOK_DEG_PER_PX,
  poseAlongRoute,
  resolveWalkInput,
  snapToStreet,
  stepPose,
  WALK_IDLE,
  WALK_KEYS,
  WALK_MAX_PITCH,
  WALK_MAX_ZOOM,
  WALK_PITCH,
  WALK_SPEED,
  type WalkInput,
} from "@/lib/map/walk";

/** Basemap road classes a pedestrian can stand in (no motorways, rail or ferries). */
const STREET_CLASSES = new Set(["minor", "service", "tertiary", "secondary", "primary", "trunk", "pedestrian", "living_street"]);

/** A deck drawn above the street (a trunk overpass, or two levels up): you walk on the road under it, not on it. */
function raisedDeck(p: Record<string, unknown>): boolean {
  return p.brunnel === "bridge" && (p.class === "trunk" || (Number(p.layer) || 1) >= 2);
}

/** Street centrelines from the basemap's loaded vector tiles, as [lon, lat] lines. */
function streetLines(map: MaplibreMapInstance): Array<Array<[number, number]>> {
  if (!map.getSource("openmaptiles")) return [];
  const lines: Array<Array<[number, number]>> = [];
  for (const f of map.querySourceFeatures("openmaptiles", { sourceLayer: "transportation" })) {
    if (!STREET_CLASSES.has(String(f.properties?.class)) || f.properties?.brunnel === "tunnel" || raisedDeck(f.properties ?? {})) continue;
    const g = f.geometry;
    if (g.type === "LineString") lines.push(g.coordinates as Array<[number, number]>);
    else if (g.type === "MultiLineString") lines.push(...(g.coordinates as Array<Array<[number, number]>>));
  }
  return lines;
}

/** Named street centrelines (OSM via the basemap's `transportation_name`). */
function namedStreetLines(map: MaplibreMapInstance): NamedLine[] {
  if (!map.getSource("openmaptiles")) return [];
  const out: NamedLine[] = [];
  for (const f of map.querySourceFeatures("openmaptiles", { sourceLayer: "transportation_name" })) {
    const p = f.properties ?? {};
    if (!STREET_CLASSES.has(String(p.class)) || p.brunnel === "tunnel") continue;
    const name = String(p["name:en"] ?? p.name ?? "");
    if (!name) continue;
    const g = f.geometry;
    if (g.type === "LineString") out.push({ name, coords: g.coordinates as Array<[number, number]> });
    else if (g.type === "MultiLineString") for (const c of g.coordinates) out.push({ name, coords: c as Array<[number, number]> });
  }
  return out;
}

/** Metres between two points. A look stays under a street-tile rescan; a short walk does not. */
function movedM(a: { lng: number; lat: number }, b: { lng: number; lat: number }): number {
  const kx = 111_320 * Math.cos((b.lat * Math.PI) / 180);
  return Math.hypot((a.lng - b.lng) * kx, (a.lat - b.lat) * 111_320);
}

/** The walker's eye: where they stand, which way they face, how far they look up or down. */
interface Eye {
  lon: number;
  lat: number;
  bearing: number;
  pitch: number;
  /** Feet height in metres inside a station: below 0 underground, above it on an elevated platform. */
  z?: number;
  /** On a station's stairs and floors rather than the street. */
  inside?: boolean;
}

/** Feet this far below the street and the eye is under it: the station's own view takes over. */
const UNDERGROUND_M = 1.2;

/**
 * Camera options for an eye 1.7 m above the pavement. MapLibre 5 derives the
 * centre, zoom and centre elevation from a camera position, so this is a real
 * pedestrian viewpoint rather than a steep pitch from a rooftop.
 */
function eyeCamera(map: MaplibreMapInstance, eye: Eye): CameraOptions {
  // Aim at a point on the look ray: the pavement when looking down, a point
  // in the air when looking level or up (pitch > 90). The centre is unclamped
  // from the ground while walking, so the aim point can sit above it.
  // On an elevated platform the eye is simply higher; underground the map keeps it at the pavement
  // (MapLibre will not go lower) and StationInside draws the view.
  const eyeAlt = EYE_HEIGHT_M + Math.max(eye.z ?? 0, 0);
  const { ahead, height } = lookTarget(eye.pitch, eyeAlt);
  const rad = (eye.bearing * Math.PI) / 180;
  const cosLat = Math.cos((eye.lat * Math.PI) / 180);
  const to: [number, number] = [
    eye.lon + (ahead * Math.sin(rad)) / (111_320 * cosLat),
    eye.lat + (ahead * Math.cos(rad)) / 111_320,
  ];
  const toAlt = height;
  return map.calculateCameraOptionsFromTo(new LngLat(eye.lon, eye.lat), eyeAlt, new LngLat(to[0], to[1]), toAlt);
}
import { useMapState } from "@/lib/store/MapStateContext";
import { usePrefersReducedMotion } from "@/lib/usePrefersReducedMotion";
import { WalkControls } from "./WalkControls";
import { stationFinder, type NearStation } from "@/lib/map/stationNear";
import { toLngLat, toLocal, walkIn } from "@/lib/map/stationWalk";
// three.js stays out of the boot chunk: the view below the street loads when you first go down.
const StationInside = lazy(() => import("./StationInside").then((m) => ({ default: m.StationInside })));
import { useQuickLayer } from "@/lib/quickLayers";
import { QuickLayers } from "./QuickLayers";
import { MapChrome } from "./MapChrome";
import { BackToStreet, BusesOff, MapViewSwitch } from "./MapViewSwitch";
import { StreetMiniMap } from "./StreetMiniMap";
import { nearestCorner, type CornerSign } from "@/lib/map/corner";
import { pickAt as pickFurniture } from "@/lib/map/streetPick";
import { formatStreetPair, formatStreetText } from "@/lib/streetName";
import { parseAt, streetLabel, streetPosition, type NamedLine } from "@/lib/map/streetPos";
import { MAX_HEIGHT_M, pitchForHeight, STREET_LEVEL_M } from "@/lib/map/cameraHeight";
import { hoverBlocked } from "@/lib/map/hover";
import { FEATURES } from "@/features";
import { hasMapillaryToken, MAPILLARY_TOKEN } from "@/lib/api/mapillary";
import { showCoverage } from "@/lib/map/mapillaryCoverage";

/**
 * How far the camera may tilt — MapLibre's own ceiling. Anything less and walk
 * mode cannot reach eye level, because pitch is the only altitude control the
 * map has besides zoom.
 */
const MAX_PITCH = 85;
/** The one tilt the "3D" button applies — low enough to see the horizon. */
const TILT_PITCH = 62;
/** Tilting from the citywide view drops in to where the buildings are. */
const TILT_MIN_ZOOM = 13.4;
/** Past this many degrees the map counts as tilted — for the button and the camera. */
const TILT_EPSILON = 5;
/**
 * Coming back up from street level lands on a block-scale overhead rather than
 * at `WALK_ZOOM`: a flat map at 21 shows ~50 m of ground, which is no map at
 * all. Only applied when the camera is tighter than this.
 */
/** Leaving street view: close enough to see the block you stood on, centred on you. */
const WALK_EXIT_ZOOM = 16.5;
/** The 3D view: tilted over the buildings around the spot. */
const VIEW_3D_PITCH = 60;
const VIEW_3D_ZOOM = 17;

type Picked =
  | { kind: "neighborhood"; datum: NeighborhoodDatum }
  | { kind: "block"; datum: BlockDatum };

type HoverInfo = Picked & { x: number; y: number };

function initialZoom(): number {
  if (typeof window === "undefined") return HOME_VIEW.neighborhoodZoom;
  if (window.innerWidth < 640) return 9.9;
  if (window.innerWidth < 1024) return 10.5;
  return HOME_VIEW.neighborhoodZoom;
}

function detailForNeighborhood(
  datum: NeighborhoodDatum,
  layer: MapModel["layer"],
): string {
  if (layer === "noise") return `${formatPercent(datum.nightShare)} after 10pm`;
  if (layer === "crashes") {
    return `${formatCount(datum.injured)} injured · ${formatCount(datum.killed)} killed`;
  }
  return `${formatCount(datum.noiseCount)} noise · ${formatCount(datum.crashCount)} crashes`;
}

function detailForBlock(datum: BlockDatum, layer: MapModel["layer"]): string {
  if (layer === "noise") return `${formatCount(datum.nightCount)} after 10pm`;
  if (layer === "crashes") {
    return `${formatCount(datum.injured)} injured · ${formatCount(datum.killed)} killed`;
  }
  return `${formatCount(datum.noiseCount)} noise · ${formatCount(datum.crashCount)} crashes`;
}

/**
 * Phones: the credits start folded behind the "i" toggle; one tap shows them, as the licence asks.
 * MapLibre unfolds them when the first credits arrive, which can be before or long after "load",
 * so every source event checks until they have been folded once (the way a drag of the map does).
 */
let creditsFolded = false;
function foldCredits(map: MaplibreMapInstance) {
  if (creditsFolded || window.innerWidth >= 768) return;
  const attrib = map.getContainer().querySelector(".maplibregl-ctrl-attrib");
  if (!attrib?.classList.contains("maplibregl-compact")) return;
  attrib.classList.remove("maplibregl-compact-show");
  creditsFolded = true;
}

/** Any tap on the map folds the credits again; the "x" on the toggle does too. */
function closeCredits(map: MaplibreMapInstance) {
  map.getContainer().querySelector(".maplibregl-ctrl-attrib.maplibregl-compact-show")?.classList.remove("maplibregl-compact-show");
}

export function MapView({
  model,
  boundaries,
  areas,
  route = null,
}: {
  model: MapModel;
  boundaries: NtaBoundary[] | null;
  /** The model rolled up to the chosen unit (filled-areas view). */
  areas: AreaDatum[];
  /** Walking directions to draw (and optionally follow), if any. */
  route?: WalkingRoute | null;
}) {
  const {
    routeStart,
    routeEnd,
    routePicking,
    setRoutePoint,
    followingRoute,
    setFollowingRoute,
  } = useDataView();
  const routeRef = useRef<WalkingRoute | null>(route);
  const followRef = useRef(followingRoute);
  useEffect(() => {
    routeRef.current = route;
  }, [route]);
  useEffect(() => {
    followRef.current = followingRoute;
  }, [followingRoute]);
  const mapRef = useRef<MapRef | null>(null);
  const [ready, setReady] = useState(false);
  /** Bumped whenever the style (re)loads, so the data is re-applied to fresh sources. */
  const [styleEpoch, setStyleEpoch] = useState(0);
  const fellBack = useRef(false);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  /** Where the walker is standing — the strip names the block, not just "Walking". */
  const [walkPlace, setWalkPlace] = useState<{
    name: string;
    detail: string;
  } | null>(null);
  /** "W 44 St at 8 Av": the nearest corner sign while walking. */
  const [corner, setCorner] = useState<string | null>(null);
  /** "Grand Street & Essex Street": street underfoot and nearest cross street, throttled. */
  const [streetHere, setStreetHere] = useState<string | null>(null);
  /** The street alone and its borough, for the walk card's noise and crash dots. */
  const { showPanel, emptyMapTap, content: panelContent, minimized: panelMinimized, drawerOpen } = usePanel();
  // The hover card is a mouse affordance; on touch / narrow screens the sheet
  // already shows the same numbers.
  const canHover = useMediaQuery("(hover: hover) and (pointer: fine) and (min-width: 1024px)");
  const signsMod = useRef<typeof import("@/lib/map/threeLayer") | null>(null);
  const city3dMod = useRef<typeof import("@/lib/map/city3d") | null>(null);
  const [schoolIcons, setSchoolIcons] = useState(false);
  const toggleSchools = useCallback(() => setSchoolIcons((on) => !on), []);
  const schoolsOn = useFlag("schools");
  // Agent-first home (#370): round buttons at the top right replace the Layers menu and rotate buttons.
  const agentHome = useFlag("agentHome");
  const analyticsFlags = useFlags();
  const analytics = analyticsFlags.noise || analyticsFlags.crashes || analyticsFlags.dataLayers;
  // Businesses are off on the overview but on at street level, where shops are the landmarks.
  const businessesPicked = useQuickLayer("businesses");
  const health = useQuickLayer("health");
  const parksPlaces = useQuickLayer("parksPlaces");
  const citibike = useQuickLayer("citibike");
  const storefrontsFlag = useFlag("storefronts");
  usePanelChip(schoolsOn ? { id: "schools", label: "Schools", active: schoolIcons, onToggle: toggleSchools } : null);
  const restroomsMod = useRef<typeof import("@/lib/map/restrooms") | null>(null);
  /** So leaving walk mode can restore the overhead camera exactly once. */
  const wasWalking = useRef(false);
  /** The view asked for while leaving street view, framed once the walk lets go. */
  const exitView = useRef<ViewRequest | null>(null);
  /** True while the camera eases out of street view. */
  const leaving = useRef(false);
  /** The walker's eye pose; the camera is derived from it every frame. */
  const eyeRef = useRef<Eye | null>(null);
  const getEye = useCallback(() => eyeRef.current, []);
  // Dev-only handle for headless QA: where the walker stands, and how high.
  useEffect(() => {
    if (import.meta.env.DEV || import.meta.env.VITE_E2E) Object.assign(window, { __eye: getEye });
  }, [getEye]);
  /** The station you are walking beside or through, and whether you are under the street in it. */
  const [stationHere, setStationHere] = useState<NearStation | null>(null);
  const [underground, setUnderground] = useState(false);

  const {
    layer,
    scale,
    mapStyle,
    city3d,
    restrooms,
    tilted,
    setTilted,
    walking,
    walkRequest,
    stopWalk,
    startWalk,
    cameraTarget,
    navCommand,
    reportCameraHeight,
    eco,
    highlightedNtaCodes,
    selectedNtaCode,
    selectedBlockKey,
    selectNta,
    selectBlock,
    streetViewOpen,
  } = useMapState();
  const businesses = businessesPicked || walking;
  const storefrontsOn = storefrontsFlag && businesses;
  const reducedMotion = usePrefersReducedMotion();
  /** Held d-pad buttons. A ref, because it changes without needing a render. */
  const walkPad = useRef<WalkInput>(WALK_IDLE);

  const viewState = useMemo(
    () => {
      const at = typeof window === "undefined" ? null : parseAt(new URLSearchParams(window.location.search).get("at"));
      return at
        ? { longitude: at.lon, latitude: at.lat, zoom: 18, pitch: 0, bearing: at.bearing }
        : { longitude: HOME_VIEW.lon, latitude: HOME_VIEW.lat, zoom: initialZoom(), pitch: 0, bearing: 0 };
    },
    [],
  );

  const neighborhoodGeoJson = useMemo(
    () => neighborhoodsToGeoJson(model.neighborhoods),
    [model.neighborhoods],
  );

  const areaGeoJson = useMemo(() => areasToGeoJson(areas), [areas]);
  const blockPointGeoJson = useMemo(() => blockPointsToGeoJson(model.blocks), [model.blocks]);

  const blockGeoJson = useMemo(
    () => blocksToGeoJson(model.blocks),
    [model.blocks],
  );

  /**
   * Borough outlines are derived from the neighborhood rings, not fetched: the
   * edges two neighborhoods of the same borough share are interior, so only the
   * county line survives.
   */
  const boroughGeoJson = useMemo(
    () => boroughOutlinesToGeoJson(boundaries ?? []),
    [boundaries],
  );

  const emphasisGeoJson = useMemo(
    () =>
      emphasisToGeoJson(
        model.neighborhoods,
        highlightedNtaCodes,
        selectedNtaCode,
      ),
    [model.neighborhoods, highlightedNtaCodes, selectedNtaCode],
  );

  const selectionGeoJson = useMemo(
    () =>
      blockSelectionToGeoJson(
        selectedBlockKey
          ? (model.blocks.find((block) => block.key === selectedBlockKey) ??
              null)
          : null,
      ),
    [model.blocks, selectedBlockKey],
  );

  const neighborhoodById = useMemo(() => {
    const map = new Map<string, NeighborhoodDatum>();
    for (const datum of model.neighborhoods) map.set(datum.id, datum);
    return map;
  }, [model.neighborhoods]);

  const neighborhoodByCode = useMemo(() => {
    const map = new Map<string, NeighborhoodDatum>();
    for (const datum of model.neighborhoods) {
      if (!map.has(datum.ntaCode)) map.set(datum.ntaCode, datum);
    }
    return map;
  }, [model.neighborhoods]);

  const blockByKey = useMemo(() => {
    const map = new Map<string, BlockDatum>();
    for (const block of model.blocks) map.set(block.key, block);
    return map;
  }, [model.blocks]);

  const nameByCode = useMemo(() => {
    const map = new Map<string, string>();
    for (const datum of model.neighborhoods) {
      map.set(datum.ntaCode, datum.ntaName);
    }
    return map;
  }, [model.neighborhoods]);

  const ntaIndex = useMemo(
    () => (boundaries ? new NtaIndex(boundaries) : null),
    [boundaries],
  );

  /**
   * What is underfoot. Read from the block grid rather than by ray-casting the
   * boundaries, so walking can call this every time you cross a square edge
   * without paying for a point-in-polygon test.
   */
  const describeAt = useCallback(
    (lat: number, lon: number) => {
      const key = blockKey(lat, lon).key;
      const block = blockByKey.get(key);
      const ntaCode = block?.ntaCode ?? ntaIndex?.assignCode(lat, lon) ?? null;
      const name = ntaCode ? nameByCode.get(ntaCode) : undefined;
      if (!name) return null;
      return {
        name,
        // Quiet blocks say nothing rather than "No records" at every step.
        detail:
          analytics && block && block.value > 0
            ? `${formatCount(block.value)} ${model.view?.unit ?? LAYER_METRICS[layer].unit} in this block`
            : "",
      };
    },
    [blockByKey, ntaIndex, nameByCode, layer, model.view, analytics],
  );

  /**
   * `describeAt` changes identity whenever the data does — a finished
   * aggregation, a layer switch, a new window. Read through a ref so those
   * changes cannot restart the walk: restarting the enter effect would fly the
   * camera back to where the walk began, and restarting the loop would drop
   * whatever keys are held.
   */
  const describeAtRef = useRef(describeAt);
  useEffect(() => {
    describeAtRef.current = describeAt;
  }, [describeAt]);
  /** The block grid, held in a ref for the same reason as `describeAt`. */
  const blocksRef = useRef(model.blocks);
  useEffect(() => {
    blocksRef.current = model.blocks;
  }, [model.blocks]);

  /** Ditto for the picked block — it decides where a walk starts. */
  const selectedKeyRef = useRef(selectedBlockKey);
  useEffect(() => {
    selectedKeyRef.current = selectedBlockKey;
  }, [selectedBlockKey]);

  /**
   * The nearest square that actually has records — where a walk starts when the
   * user pressed the button without picking a block first. Dropping the camera
   * into the middle of the East River is not a street.
   */
  const nearestPopulatedBlock = useCallback(
    (lat: number, lon: number): [number, number] | null => {
      const cosLat = Math.max(Math.cos((lat * Math.PI) / 180), 0.01);
      let best: BlockDatum | null = null;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (const block of blocksRef.current) {
        if (block.value <= 0) continue;
        const dy = block.center.lat - lat;
        const dx = (block.center.lon - lon) * cosLat;
        const distance = dx * dx + dy * dy;
        if (distance < bestDistance) {
          bestDistance = distance;
          best = block;
        }
      }
      return best ? [best.center.lon, best.center.lat] : null;
    },
    [],
  );

  // Layout A (#171): simple pale streets by default (and always in Transit
  // Focus), the chosen theme's land/water/park colours, places only when chosen.
  const [transitFocus] = useTransitFocus();
  const places = usePlaces();
  const opts = useMapOptions();
  const t = usePalette();
  // At street level Flat keeps footprints flat; 3D buildings extrudes the
  // basemap and turns on the textured city. Ignoring Flat during a walk loaded
  // that city under Simple streets too.
  const flatBuildings = wantsFlatBuildings(opts.buildings);
  // Top view is a flat 2D overview (#364). Tilted views are a simple block map;
  // the detailed city above street level is an advanced, off-by-default flag (#363).
  const detailedCity = useFlag("detailedCity");
  // A trip preview at eye level is on the street too, for what the city draws.
  const previewEye = usePreviewEye();
  const level = mapLevel(walking || previewEye, tilted);
  const { extrude, skyline: skylineOn, textured: texturedOn } = cityDetail({ level, flat: flatBuildings, eco, city3d, detailed: detailedCity });
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !ready) return;
    applyMapTheme(map, t);
    // Street view always draws the roads you walk on, even with Hide roads set (owner, 2026-10-27).
    const roads = opts.roads || walking;
    const streetLook = roads ? (opts.streets === "simple" || transitFocus ? "simple" : "full") : "off";
    applyReadable(map, streetLook, { street: t.street, major: t.major, label: t.label_ });
    for (const l of map.getStyle()?.layers ?? []) {
      if (/^highway-name-major$/.test(l.id)) map.setLayoutProperty(l.id, "visibility", roads && opts.streetNames ? "visible" : "none");
      // Transit-first open: neighbourhood / quarter names only with the analytics on.
      if (l.id === "label_other") map.setLayoutProperty(l.id, "visibility", analytics ? "visible" : "none");
      // Bus stop icons from zoom 15, names from 17. The Layers switch hides both.
      if (l.id === "poi_transit") {
        map.setPaintProperty(l.id, "icon-opacity", busStopIconOpacity(opts.busStops) as never);
        map.setPaintProperty(l.id, "text-opacity", busStopTextOpacity(opts.busStops) as never);
      }
    }
    const shownPlaces = withQuickPlaces(places, { businesses, health, parksPlaces, citibike });
    applyPlaces(map, shownPlaces);
    // Block tiles and the 3D city restyle the basemap after this runs; keep
    // its POIs to the person's choice instead of the style's defaults.
    const keep = () => {
      if (placesStale(map, shownPlaces)) applyPlaces(map, shownPlaces);
      hideShields(map);
      if (!analytics && map.getLayer("label_other") && map.getLayoutProperty("label_other", "visibility") !== "none") map.setLayoutProperty("label_other", "visibility", "none");
    };
    map.on("styledata", keep);
    applyBuildings(map, !extrude, t.building, buildingEdge(t), flatBuildings);
    // A few named landmarks so the light map still says where you are (#363).
    installLandmarkLabels(map, t.dark ? "#f1f5f9" : "#1f2937", t.land);
    return () => {
      map.off("styledata", keep);
    };
  }, [ready, styleEpoch, transitFocus, places, businesses, health, parksPlaces, citibike, opts, t, extrude, flatBuildings, analytics, walking]);

  const loaded = useRef(false);
  const handleLoad = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map || loaded.current) return;
    loaded.current = true;
    installDataLayers(map);
    applyAtmosphere(map);
    // "load" waits for the first tiles; onSourceData below covers browsers that never send it.
    markBasemapReady();
    setMapInstance(map);
    watchMapCovers(map);
    setStyleEpoch((epoch) => epoch + 1);
    setReady(true);
    const blockTiles = () =>
      void installBlockTiles(map).then((swapped) => swapped && setStyleEpoch((epoch) => epoch + 1));
    blockTiles();
    // Handle for headless QA (camera placement, fps sampling) in dev and the e2e build only; production compiles it away.
    if (import.meta.env.DEV || import.meta.env.VITE_E2E) (window as unknown as { __map?: unknown }).__map = map;
    // A style swap (the raster fallback) replaces every source, so the data
    // has to be re-attached and re-pushed.
    map.on("style.load", () => {
      installDataLayers(map);
      setStyleEpoch((epoch) => epoch + 1);
      blockTiles();
    });
  }, []);

  /**
   * If the vector basemap cannot be fetched the map would otherwise stay
   * blank, so fall back once to the bundled raster style. Tile errors are
   * survivable; only an unloaded style is not.
   */
  const handleError = useCallback((e: object) => {
    const map = mapRef.current?.getMap();
    if (!map || fellBack.current || map.isStyleLoaded()) return;
    // A tile or data-source error while the style is still loading (a slow
    // phone, one 404 tile, the areas API) is survivable; only a style that
    // never arrived needs the raster fallback. Before this check one such
    // error swapped the whole map to raster, which no style rule can restyle.
    if ("sourceId" in e && e.sourceId) return;
    fellBack.current = true;
    map.setStyle(buildFallbackStyle());
  }, []);

  /**
   * Prefer MapLibre's own 3D picking; fall back to arithmetic when a query
   * comes back empty. Blocks are an exact grid and neighborhoods are indexed,
   * so both fallbacks are O(1) — the map stays clickable even if a layer's
   * render pass yields nothing.
   */
  /** The block or neighborhood under a ground point (no screen query). */
  const areaAt = useCallback(
    (lngLat: { lat: number; lng: number }): Picked | null => {
      if (scale === "blocks") {
        const datum = blockByKey.get(blockKey(lngLat.lat, lngLat.lng).key) ?? blockContaining(blockByKey.values(), lngLat.lng, lngLat.lat);
        return datum ? { kind: "block", datum } : null;
      }
      const code = ntaIndex?.assignCode(lngLat.lat, lngLat.lng) ?? null;
      const datum = code ? neighborhoodByCode.get(code) : undefined;
      return datum ? { kind: "neighborhood", datum } : null;
    },
    [scale, blockByKey, neighborhoodByCode, ntaIndex],
  );

  const pickAt = useCallback(
    (
      x: number,
      y: number,
      lngLat: { lat: number; lng: number },
    ): Picked | null => {
      const map = mapRef.current?.getMap();
      const pickLayer =
        scale === "blocks" ? LAYER_IDS.blocks : LAYER_IDS.neighborhoods;
      // `getLayer` is undefined until the style has loaded, which is also when
      // querying would throw.
      const feature =
        map && map.getLayer(pickLayer)
          ? map.queryRenderedFeatures([x, y], {
              layers: [pickLayer, BLOCK_FILL_LAYER].filter((l) => scale === "blocks" || l === pickLayer).filter((l) => map.getLayer(l)),
            })[0]
          : undefined;
      const id = feature?.id;

      if (id !== undefined && id !== null) {
        const key = String(id);
        if (scale === "blocks") {
          const datum = blockByKey.get(key);
          if (datum) return { kind: "block", datum };
        } else {
          const datum = neighborhoodById.get(key);
          if (datum) return { kind: "neighborhood", datum };
        }
      }

      return areaAt(lngLat);
    },
    [scale, blockByKey, neighborhoodById, areaAt],
  );

  // An open sheet or drawer owns the attention: no hover card over or beside it.
  const sheetOpen = hoverBlocked({ drawerOpen, content: !!panelContent, minimized: panelMinimized, selected: !!(selectedNtaCode || selectedBlockKey) });
  useEffect(() => {
    if (sheetOpen) setHover(null);
  }, [sheetOpen]);
  const handleMoveStart = useCallback(() => setHover(null), []);

  const handleMouseMove = useCallback(
    (event: MapLayerMouseEvent) => {
      // At eye level a hover card would sit on top of the street you are
      // walking down, and the pavement underfoot is the whole point.
      // Complaint / noise hover cards are analytics: Advanced (or a saved view) only.
      if (walking || !canHover || sheetOpen || !analytics) return;
      const picked = pickAt(event.point.x, event.point.y, event.lngLat);
      const map = mapRef.current?.getMap();
      if (map) {
        map.getCanvas().style.cursor = picked ? "pointer" : "";
      }
      setHover((current) => {
        if (!picked) return current ? null : current;
        return { ...picked, x: event.point.x, y: event.point.y };
      });
    },
    [pickAt, walking, canHover, sheetOpen, analytics],
  );

  const handleClick = useCallback(
    (event: MapLayerMouseEvent) => {
      closeCredits(event.target);
      // Picking a route endpoint takes priority over selecting an area.
      if (routePicking) {
        setRoutePoint(routePicking, { lon: event.lngLat.lng, lat: event.lngLat.lat });
        return;
      }
      // Tap priority: transit (train, bus, station, entrance) first, then
      // restrooms, then events and other feature pins; analytics areas last
      // and only in Advanced. An empty tap closes a details sheet. The layers
      // drawer stays open; a train or bus tap closes that.
      const clicked = mapRef.current?.getMap();
      const hitsAny = (ids: string[]) => {
        const live = ids.filter((id) => clicked?.getLayer(id));
        return !!clicked && live.length > 0 && clicked.queryRenderedFeatures([event.point.x, event.point.y], { layers: live }).length > 0;
      };
      const transitIds = FEATURES.filter((f) => f.id === "transit").flatMap((f) => f.clickLayers ?? []);
      if (hitsAny(transitIds)) return;
      // A bus-stop icon (basemap poi_transit, class "bus"): the transit feature
      // opens its routes and next buses, so skip the area pick.
      // From above only: at street level the icon of a stop behind the buildings is under the tap too.
      if (!walking && opts.busStops && analyticsFlags.transit && clicked && busStopAt(clicked, event.point)) return;
      // 3D restroom kiosks at street level: public ones open here, shop/café
      // ones are opened by the place-toilets feature's own click handler.
      const kiosk = walking ? pickFurniture(event.target, event.point.x, event.point.y) : null;
      // Shop restrooms, bus stop signs and subway entrances open from their own features.
      if (kiosk && kiosk.kind !== "restroom") return;
      if (kiosk?.kind === "restroom") {
        const p = kiosk.props;
        const str = (k: string) => (typeof p[k] === "string" && p[k] ? p[k] : null);
        const name = str("name") ?? "Public restroom";
        showPanel({
          id: `restroom:${kiosk.lng.toFixed(5)},${kiosk.lat.toFixed(5)}`,
          title: name,
          subtitle: "Public restroom",
          details: <RestroomDetails restroom={{ name, status: str("status"), hours: str("hours"), accessibility: str("accessibility"), operator: str("operator"), lon: kiosk.lng, lat: kiosk.lat, source: p.source === "openstreetmap" ? "openstreetmap" : "nyc-open-data", asOf: str("asOf") }} />,
        });
        return;
      }
      const hit = restroomsMod.current?.restroomAt(event.target, event.point.x, event.point.y);
      if (hit) {
        showPanel({
          id: `restroom:${hit.lon.toFixed(5)},${hit.lat.toFixed(5)}`,
          title: formatStreetText(hit.name),
          subtitle: "Public restroom",
          details: <RestroomDetails restroom={hit} />,
        });
        return;
      }
      // A landmark badge or name (#325): its picture, so someone can tell where they are.
      const mark = clicked ? landmarkAt(clicked, event.point) : null;
      if (mark) {
        showPanel({ id: `landmark:${mark.id}`, title: mark.name, subtitle: `Landmark · ${mark.borough}`, details: <LandmarkDetails landmark={mark} /> });
        return;
      }
      // The building itself from above (#311): a tap on a landmark model's footprint opens it too.
      const model = walking ? undefined : landmarkModelAt(event.lngLat.lng, event.lngLat.lat);
      const modelGuide = model ? guideLandmarkNamed(model.name) : null;
      if (model && modelGuide) {
        showPanel({ id: `landmark:${model.id}`, title: model.name, subtitle: `Landmark · ${modelGuide.borough}`, details: <LandmarkDetails landmark={modelGuide} /> });
        return;
      }
      // From above only: at eye level the tap's ground point is far behind the facade, so this opened
      // the directory of a mall on another street. There the main sign itself is tapped (below).
      const dir = city3d && !walking ? signsMod.current?.directoryAt(event.target, event.lngLat.lng, event.lngLat.lat) : null;
      if (dir) {
        const shops = (dir.dir ?? "").split("|").filter(Boolean);
        showPanel({
          id: `directory:${dir.lng},${dir.lat}`,
          title: dir.name,
          subtitle: `Directory · ${shops.length} shops · © OpenStreetMap contributors`,
          details: (
            <div className="space-y-2">
              <ul className="space-y-1 text-sm">
                {shops.map((name) => <li key={name}>{name}</li>)}
              </ul>
              <DirectionsFromHere lon={dir.lng} lat={dir.lat} label={dir.name} />
            </div>
          ),
        });
        return;
      }
      // Other feature layers (events, parking…) open their own panel.
      if (hitsAny(FEATURES.filter((f) => f.id !== "transit").flatMap((f) => f.clickLayers ?? []))) return;
      // Eye level: cast the camera ray through the tap and open whatever it
      // hits first (storefront, landmark model, school), like overhead.
      if (walking) {
        const hit = eyePick(event.target, event.point.x, event.point.y);
        // The shop whose sign or window the tap is on, unless a wall or landmark stands in front
        // of it. Signs hang 0.15 m off their wall and the footprints are a metre or two loose.
        const shop = signsMod.current?.storefrontOnRay(event.target, event.point.x, event.point.y, hit && hit.kind !== "ground" ? hit.t + 2 : Infinity);
        if (shop) {
          // The card's code arrives with the first shop tapped, so the boot chunk stays inside its budget.
          void import("@/components/StorefrontCard").then((m) => showPanel(m.storefrontPanel(shop)));
          return;
        }
        if (hit?.kind === "landmark") {
          const guide = guideLandmarkNamed(hit.landmark.name);
          showPanel({
            id: `landmark:${hit.landmark.id}`,
            title: hit.landmark.name,
            subtitle: "Landmark",
            details: guide ? <LandmarkDetails landmark={guide} /> : <DirectionsFromHere lon={hit.landmark.lon} lat={hit.landmark.lat} label={hit.landmark.name} />,
          });
          return;
        }
        if (hit?.kind === "building" && typeof hit.props.school === "string" && hit.props.school) {
          showPanel({
            id: `school:${hit.props.school}`,
            title: hit.props.school,
            subtitle: "School · NYC DOE (LCGMS)",
            details: <DirectionsFromHere lon={hit.lng} lat={hit.lat} label={hit.props.school} />,
          });
          return;
        }
        // Street level never opens the neighbourhood / complaints card: a
        // tap on a facade or the pavement clears a details sheet. The layers
        // drawer stays open.
        emptyMapTap();
        return;
      }
      const school = city3dMod.current?.schoolAt(event.target, event.point.x, event.point.y);
      if (school) {
        showPanel({
          id: `school:${school}`,
          title: school,
          subtitle: "School · NYC DOE (LCGMS)",
          details: <DirectionsFromHere lon={event.lngLat.lng} lat={event.lngLat.lat} />,
        });
        return;
      }
      // Neighbourhood / block complaint picks are analytics: Advanced only.
      const picked = analytics ? pickAt(event.point.x, event.point.y, event.lngLat) : null;
      if (!picked) {
        // An empty-map tap closes a details sheet. The layers drawer stays open.
        emptyMapTap();
        return;
      }
      if (picked.kind === "block") {
        selectBlock({ key: picked.datum.key, ntaCode: picked.datum.ntaCode });
      } else {
        selectNta(picked.datum.ntaCode);
      }
    },
    [opts.busStops, analyticsFlags.transit, pickAt, selectBlock, selectNta, routePicking, setRoutePoint, showPanel, emptyMapTap, city3d, walking, analytics],
  );

  const handleMoveEnd = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    // A walk is always pitched to the ceiling, so it would report the map as
    // "tilted" the whole time and light up the dock's 3D button.
    if (walking || leaving.current) return;
    // Keep the toggle honest when the user tilts with the mouse or touch.
    setTilted(map.getPitch() > TILT_EPSILON);
  }, [walking, setTilted]);

  // Data: one `setData` per scale, plus the layout switch between the two.
  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current?.getMap();
    if (!map) return;
    const showBlocks = scale === "blocks";

    void (map.getSource(SOURCE_IDS.neighborhoods) as GeoJSONSource | undefined)
      ?.setData(neighborhoodGeoJson);
    pushBlocks(map, model.blocks, blockGeoJson);
    void (map.getSource(SOURCE_IDS.boroughs) as GeoJSONSource | undefined)?.setData(
      boroughGeoJson,
    );

    // Walking always stands on the block grid, whatever scale the drawer says,
    // because the neighborhood volumes step aside at eye level.
    map.setLayoutProperty(
      LAYER_IDS.blocks,
      "visibility",
      showBlocks || walking ? "visible" : "none",
    );
    // At eye level a block column is 60–1800 m of wall that you are standing
    // *inside*, so the prisms drop to a painted pavement and the basemap's own
    // buildings supply the city you walk through. A hand's width of height
    // keeps the pavement off the ground plane, where it would z-fight.
    map.setPaintProperty(
      LAYER_IDS.blocks,
      "fill-extrusion-height",
      walking ? 0.5 : BLOCK_HEIGHT,
    );
    map.setPaintProperty(
      LAYER_IDS.blocks,
      "fill-extrusion-opacity",
      walking ? 0.32 : 0.45,
    );
    // The square grid is the block scale's line work, and it has nothing to say
    // while you are standing on one of the squares.
    map.setLayoutProperty(
      LAYER_IDS.blockOutline,
      "visibility",
      showBlocks && !walking ? "visible" : "none",
    );
    // Same for the picked block's rim: a wall standing above the column from
    // above, a painted curb around the block you are walking through.
    map.setPaintProperty(
      LAYER_IDS.blockSelection,
      "fill-extrusion-height",
      walking ? 1.5 : ["get", "height"],
    );
    // With blocks on, neighborhoods drop to a flat glass ground so the block
    // volumes are what carries height. While walking that ground would be
    // coplanar with the flattened blocks and z-fight, so it steps aside
    // entirely — at eye level the neighborhood layer has nothing to say.
    map.setLayoutProperty(
      LAYER_IDS.neighborhoods,
      "visibility",
      walking ? "none" : "visible",
    );
    map.setLayoutProperty(
      LAYER_IDS.neighborhoodOutline,
      "visibility",
      walking ? "none" : "visible",
    );
    map.setLayoutProperty(
      LAYER_IDS.boroughOutline,
      "visibility",
      walking ? "none" : "visible",
    );
    map.setPaintProperty(
      LAYER_IDS.neighborhoods,
      "fill-extrusion-height",
      showBlocks ? 0 : ["get", "height"],
    );
    map.setPaintProperty(
      LAYER_IDS.neighborhoods,
      "fill-extrusion-opacity",
      showBlocks ? 0.14 : 0.35,
    );
    map.setPaintProperty(
      LAYER_IDS.neighborhoodOutline,
      "line-opacity",
      showBlocks ? 0.28 : 1,
    );
    // A block's highlight belongs to the block scale; inside a neighborhood
    // volume it would just be a bright speck buried in the glass.
    for (const id of [LAYER_IDS.blockSelection, LAYER_IDS.blockSelectionEdge]) {
      map.setLayoutProperty(
        id,
        "visibility",
        showBlocks ? "visible" : "none",
      );
    }

    // Unit + style: the classic glass columns cover blocks and neighborhoods;
    // everything else (filled areas, district/borough columns, heatmap) reads
    // from the areas / block-points sources.
    void (map.getSource(SOURCE_IDS.areas) as GeoJSONSource | undefined)?.setData(areaGeoJson);
    void (map.getSource(SOURCE_IDS.blockPoints) as GeoJSONSource | undefined)?.setData(blockPointGeoJson);
    const coarse = scale === "districts" || scale === "boroughs";
    const classic = walking || (mapStyle === "columns" && !coarse);
    const vis = (on: boolean) => (on ? "visible" : "none");
    map.setLayoutProperty(LAYER_IDS.areaFill, "visibility", vis(!walking && mapStyle === "fill"));
    map.setLayoutProperty(LAYER_IDS.areaColumns, "visibility", vis(!walking && mapStyle === "columns" && coarse));
    map.setLayoutProperty(LAYER_IDS.areaOutline, "visibility", vis(!walking && mapStyle !== "heat" && (mapStyle === "fill" || coarse)));
    map.setLayoutProperty(LAYER_IDS.heat, "visibility", vis(!walking && mapStyle === "heat"));
    setBlockFillVisible(map, !walking && mapStyle === "fill" && scale === "blocks");
    if (!classic) {
      for (const id of [
        LAYER_IDS.neighborhoods,
        LAYER_IDS.blocks,
        LAYER_IDS.blockOutline,
        LAYER_IDS.neighborhoodOutline,
        LAYER_IDS.blockSelection,
        LAYER_IDS.blockSelectionEdge,
      ]) {
        map.setLayoutProperty(id, "visibility", "none");
      }
    }
    // Simple mode opens on a plain city map: the noise / crash analytics
    // (blocks, neighborhood volumes, heat) appear only in Advanced or from a
    // saved `view=` link. Walking keeps its painted pavement.
    if (!analytics && !walking) {
      for (const id of [
        LAYER_IDS.neighborhoods,
        LAYER_IDS.blocks,
        LAYER_IDS.blockOutline,
        LAYER_IDS.neighborhoodOutline,
        LAYER_IDS.blockSelection,
        LAYER_IDS.blockSelectionEdge,
        LAYER_IDS.areaFill,
        LAYER_IDS.areaColumns,
        LAYER_IDS.areaOutline,
        LAYER_IDS.heat,
      ]) {
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "none");
      }
      setBlockFillVisible(map, false);
    }
  }, [
    ready,
    styleEpoch,
    neighborhoodGeoJson,
    blockGeoJson,
    boroughGeoJson,
    areaGeoJson,
    blockPointGeoJson,
    scale,
    mapStyle,
    walking,
    analytics,
  ]);

  // Feature modules whose lazy `layers` chunk exports mount(map): mounted while
  // their flag is on, remounted after a style reload, cleaned up otherwise.
  const flags = useFlags();
  const [toggledOn] = useFeatureToggles();
  const inset = useMemo(() => insetFilters({
    placeClasses: classesFor(withQuickPlaces(places, { businesses, health, parksPlaces, citibike })),
    restrooms,
    shops: toggledOn.has("restroomShops"),
    parking: toggledOn.has("parking"),
    events: toggledOn.has("events"),
    ferry: toggledOn.has("ferry"),
    schools: schoolIcons,
  }), [places, businesses, health, parksPlaces, citibike, restrooms, toggledOn, schoolIcons]);
  const mountedKey = FEATURES.filter((f) => f.layers && flags[f.id] && (!f.chip || toggledOn.has(f.chip.id)))
    .map((f) => f.id)
    .join(",");
  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current?.getMap();
    if (!map) return;
    const cleanups: Array<() => void> = [];
    let live = true;
    for (const f of FEATURES) {
      if (!f.layers || !mountedKey.split(",").includes(f.id)) continue;
      f.layers()
        .then((mod) => {
          const m = mod as { mount?: (map: MaplibreMapInstance) => () => void };
          if (live && m.mount) cleanups.push(m.mount(map));
        })
        .catch((err) => console.warn(`${f.id} failed to load`, err));
    }
    return () => {
      live = false;
      cleanups.forEach((c) => c());
    };
  }, [ready, styleEpoch, mountedKey]);

  useEffect(() => setAmbient({ eco }), [eco]);

  // Public restrooms: lazily installed icon layer, toggled from the Layers dropdown.
  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current?.getMap();
    if (!map) return;
    import("@/lib/map/restrooms")
      .then((mod) => {
        restroomsMod.current = mod;
        if (restrooms) mod.installRestrooms(map);
        mod.setRestroomsVisible(map, restrooms);
      })
      .catch((err) => console.warn("restrooms failed to load", err));
  }, [ready, styleEpoch, restrooms]);

  // Textured 3D city: installed lazily the first time it is switched on.
  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current?.getMap();
    if (!map) return;
    let cancelled = false;
    let cleanup: (() => void) | null = null;
    const skyline = skylineOn;
    const city3dOn = texturedOn;
    // Nothing to draw (Top view, flat buildings, no school icons) and nothing
    // loaded yet: skip the chunk, so Top view requests no 3D code (#364).
    if (!skyline && !city3dOn && !schoolIcons && !city3dMod.current) return;
    // Lazy chunk: users who never turn it on never download it.
    import("@/lib/map/city3d")
      .then(async (mod) => {
        const { installCity3d, setCity3dVisible, city3dCoversView } = mod;
        city3dMod.current = mod;
        // Distance skyline (z11-14): on unless low-power mode; tiny and plain colour.
        if (skyline) await mod.installSkyline(map);
        if (cancelled) return;
        mod.setSkylineVisible(map, skyline);
        if (!city3dOn) {
          setCity3dVisible(map, false);
          // School icons need only the tiles source, not the three.js layers.
          await mod.showSchoolIcons(map, schoolIcons);
          return;
        }
        await installCity3d(map);
        if (cancelled) return;
        mod.setSchoolIconsVisible(map, schoolIcons);
        // Storefront signboards: a three.js custom layer, eye level only.
        const signs = await import("@/lib/map/threeLayer");
        if (cancelled) return;
        signsMod.current = signs;
        if (storefrontsOn && !map.getLayer(signs.STOREFRONT_LAYER)) map.addLayer(signs.createStorefrontLayer());
        // Quick Layers > Businesses off takes the sign bands away.
        if (!storefrontsOn && map.getLayer(signs.STOREFRONT_LAYER)) map.removeLayer(signs.STOREFRONT_LAYER);
        // Basemap buildings only step aside where textured tiles exist.
        let covered: boolean | null = null;
        const sync = () => {
          const now = city3dCoversView(map);
          if (now === covered) return;
          covered = now;
          setCity3dVisible(map, true, now);
        };
        setCity3dVisible(map, true, false);
        covered = false;
        map.on("idle", sync);
        cleanup = () => map.off("idle", sync);
      })
      .catch((err) => console.warn("3D city failed to load", err));
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [ready, styleEpoch, skylineOn, texturedOn, schoolIcons, storefrontsOn]);

  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current?.getMap();
    if (!map) return;
    void (map.getSource(SOURCE_IDS.emphasis) as GeoJSONSource | undefined)?.setData(
      emphasisGeoJson,
    );
    void (
      map.getSource(SOURCE_IDS.blockSelection) as GeoJSONSource | undefined
    )?.setData(selectionGeoJson);
  }, [ready, styleEpoch, emphasisGeoJson, selectionGeoJson]);

  // Where street photos exist, while the photo sheet is open (#10).
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!ready || !map || !streetViewOpen || !hasMapillaryToken) return;
    return showCoverage(map, MAPILLARY_TOKEN);
  }, [ready, styleEpoch, streetViewOpen]);

  useEffect(() => {
    if (!ready || !cameraTarget) return;
    const map = mapRef.current?.getMap();
    if (!map) return;
    // The camera keeps whatever tilt and bearing the user chose; only a
    // target that names a pitch or bearing changes it.
    const pitch =
      typeof cameraTarget.pitch === "number"
        ? Math.min(Math.max(cameraTarget.pitch, 0), MAX_PITCH)
        : map.getPitch();
    const camera = {
      center: [cameraTarget.lon, cameraTarget.lat] as [number, number],
      zoom: cameraTarget.zoom ?? 13,
      pitch,
      bearing: cameraTarget.bearing ?? map.getBearing(),
    };
    if (reducedMotion) {
      map.jumpTo(camera);
    } else if (cameraTarget.glide) {
      map.easeTo({ ...camera, duration: 1400, essential: true });
    } else {
      map.flyTo({ ...camera, duration: 1200, essential: true });
    }
  }, [ready, cameraTarget, reducedMotion]);

  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current?.getMap();
    if (!map) return;
    // Only act when the camera disagrees with the requested state, so a
    // `fly_to` that carries its own pitch is not snapped back afterwards.
    const isTilted = map.getPitch() > TILT_EPSILON;
    // Leaving street view frames its own camera; the flag catches up when it lands.
    if (tilted === isTilted || leaving.current) return;
    map.easeTo({
      pitch: tilted ? TILT_PITCH : 0,
      bearing: tilted ? map.getBearing() : 0,
      // From the citywide view a tilt would just be a floating plate; drop in
      // far enough that the buildings and streets carry the perspective.
      zoom: tilted ? Math.max(map.getZoom(), TILT_MIN_ZOOM) : map.getZoom(),
      duration: reducedMotion ? 0 : 900,
    });
  }, [ready, tilted, reducedMotion]);

  // Fog is measured from the camera, so it has to be re-tuned the moment the
  // camera drops from a kilometre up to eye level — otherwise the street is
  // behind an opaque grey wall.
  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current?.getMap();
    if (!map) return;
    // A trip preview through the rider's eyes takes the same street look. It is applied here, after the
    // theme effect above, because applied from the player the theme painted over it (owner, 2026-11-10).
    const street = walking || previewEye;
    applyAtmosphere(map, street);
    // Looking up puts the map centre in the air along the look ray; overhead
    // it stays pinned to the ground as usual.
    map.setCenterClampedToGround(!walking);
    applyStreetPalette(map, street);
    // Flat footprints are already the map option. Re-apply here: this effect
    // runs after the city load, and the street texture arrives a moment later.
    const flat = walking ? flatBuildings : previewEye ? !extrude : flatBuildings;
    applyBuildings(map, flat, t.building, buildingEdge(t));
    // After the street palette, so time-of-day lighting re-tints on top of it.
    setAmbient({ walking: street });
    // The sidewalk texture arrives a moment later; repaint once it has.
    if (street) {
      void loadStreetTextures(map).then(() => {
        applyStreetPalette(map, true);
        applyBuildings(map, flat, t.building, buildingEdge(t));
      }).catch(() => {});
    }
    // At eye level basemap labels stand on the horizon and float in the sky,
    // so they step aside while walking; our own route markers and the
    // landmarks (how you know where you are) stay. Restroom icons keep the
    // filter's own visibility — street view still needs them.
    const own = new Set(Object.keys(SOURCE_IDS).map((k) => SOURCE_IDS[k as keyof typeof SOURCE_IDS] as string));
    for (const layer of map.getStyle().layers ?? []) {
      // Transit layers (station names + route bullets, #186) stand in the 3D scene and stay.
      if (layer.type !== "symbol" || own.has((layer as { source?: string }).source ?? "") || layer.id.startsWith("transit-") || isLandmarkLayer(layer.id)) continue;
      if (layer.id === "restrooms") continue;
      map.setLayoutProperty(layer.id, "visibility", street ? "none" : "visible");
    }
  }, [ready, walking, previewEye, extrude, styleEpoch, flatBuildings, t]);

  // The location card names the nearest corner from the baked sign points.
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!ready || !walking || !map) {
      setCorner(null);
      return;
    }
    let at = { lng: 0, lat: 0 };
    let dirty = true;
    const update = () => {
      if (!map.getSource("city3d")) return;
      const eye = eyeRef.current;
      const here = eye ? { lng: eye.lon, lat: eye.lat } : map.getCenter();
      // jumpTo fires moveend every frame of a look. The corner names do not change until you walk.
      if (!dirty && movedM(here, at) < 15) return;
      dirty = false;
      at = { lng: here.lng, lat: here.lat };
      const signs: CornerSign[] = [];
      for (const f of map.querySourceFeatures("city3d", { sourceLayer: "signs" })) {
        if (f.geometry.type !== "Point") continue;
        const p = f.properties as { a?: string; b?: string };
        if (p.a && p.b) signs.push({ lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], a: p.a, b: p.b });
      }
      const label = nearestCorner(signs, here.lng, here.lat);
      setCorner(label ? formatStreetPair(label) : null);
    };
    // Sign tiles arrive after the walk starts; a custom layer repaints every
    // frame, so "idle" may never fire — listen for the source instead.
    const onData = (e: { sourceId?: string; isSourceLoaded?: boolean }) => {
      if (e.sourceId === "city3d" && e.isSourceLoaded) {
        dirty = true;
        update();
      }
    };
    update();
    map.on("moveend", update);
    map.on("sourcedata", onData);
    return () => {
      map.off("moveend", update);
      map.off("sourcedata", onData);
    };
  }, [ready, walking]);

  // The header names the street underfoot and the cross street, ~3x a second
  // at most, and only when the eye actually moved.
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!ready || !walking || !map) {
      setStreetHere(null);
      return;
    }
    let lines: ReturnType<typeof namedStreetLines> = [];
    let at = { lng: 0, lat: 0 };
    let placed = false;
    const update = () => {
      const eye = eyeRef.current;
      const c = eye ? { lng: eye.lon, lat: eye.lat } : map.getCenter();
      // The street underfoot is stable while you only turn your head. Reread tiles after a short walk.
      if (!placed || movedM(c, at) >= 15) {
        lines = namedStreetLines(map);
        at = { lng: c.lng, lat: c.lat };
        placed = true;
        // Only nearby landmarks on the street-level map, same cap as the header.
        focusLandmarks(map, { lon: c.lng, lat: c.lat });
      }
      // Street, then the landmark you can see: "Grand St & Essex St · Empire State Building ahead".
      const pos = streetPosition(lines, c.lng, c.lat);
      const street = streetLabel(pos);
      const guide = describeGuide(
        pickGuideLandmarks({ lon: c.lng, lat: c.lat }, eye ? eye.bearing : map.getBearing(), { max: 1, maxDistanceM: STREET_LEVEL_RANGE_M }),
      );
      const label = [street, guide].filter(Boolean).join(" · ") || null;
      setStreetHere((prev) => (prev === label ? prev : label));
    };
    update();
    const id = window.setInterval(update, 350);
    const onData = (e: { sourceId?: string; isSourceLoaded?: boolean }) => {
      if (e.sourceId === "openmaptiles" && e.isSourceLoaded) {
        placed = false;
        update();
      }
    };
    map.on("sourcedata", onData);
    return () => {
      window.clearInterval(id);
      map.off("sourcedata", onData);
      // Leaving street level: the whole list again, thinned by zoom.
      focusLandmarks(map, null);
    };
  }, [ready, walking]);

  // Entering walk mode is a camera move, not a mode flag: eye level is the
  // steepest pitch the map allows, at a zoom where buildings have height.
  useEffect(() => {
    if (!ready || !walking) return;
    const map = mapRef.current?.getMap();
    if (!map) return;

    const center = map.getCenter();
    const picked = selectedKeyRef.current
      ? blocksRef.current.find((block) => block.key === selectedKeyRef.current)
      : undefined;
    const target: [number, number] = walkRequest
      ? [walkRequest.lon, walkRequest.lat]
      : picked
        ? [picked.center.lon, picked.center.lat]
        : // Standing in the middle of the East River is not a walk, so fall in
          // on the nearest square that actually has records.
          (nearestPopulatedBlock(center.lat, center.lng) ?? [
            center.lng,
            center.lat,
          ]);

    // Stand in the middle of the nearest street, facing along it: a block
    // centre or the map centre can be inside a building footprint.
    // A heading asked for (the view switch, going back) wins over the street's direction;
    // going back to where you stood skips the snap altogether.
    const heading = walkRequest?.heading;
    const snapped = walkRequest?.exact ? null : snapToStreet(target, streetLines(map), heading ?? map.getBearing());
    const eye: Eye = snapped
      ? { lon: snapped.lon, lat: snapped.lat, bearing: heading ?? snapped.bearing, pitch: WALK_PITCH }
      : { lon: target[0], lat: target[1], bearing: heading ?? map.getBearing(), pitch: WALK_PITCH };
    eyeRef.current = eye;
    setWalkEye(eye);
    map.easeTo({ ...eyeCamera(map, eye), duration: reducedMotion ? 0 : 900 });
    if (!snapped && !walkRequest?.exact) {
      // No road tiles in view yet (e.g. entering from the citywide map): ask OSRM.
      const controller = new AbortController();
      fetchNearestStreet({ lon: target[0], lat: target[1] }, controller.signal)
        .then((p) => {
          if (!p || eyeRef.current !== eye) return;
          eye.lon = p.lon;
          eye.lat = p.lat;
          const aligned = heading == null ? snapToStreet([p.lon, p.lat], streetLines(map), eye.bearing, 30) : null;
          if (aligned) eye.bearing = aligned.bearing;
          map.jumpTo(eyeCamera(map, eye));
        })
        .catch(() => {});
    }
    setWalkPlace(describeAtRef.current(target[1], target[0]));
    // `describeAt` is deliberately read through a ref: its identity changes
    // with the data, and re-running this would yank the camera back.
  }, [ready, walking, walkRequest, reducedMotion, nearestPopulatedBlock]);

  // Leaving a walk must not strand the camera nose-down at 85° over a rooftop,
  // so the pitch comes back up on its own — the tilt flag never went true while
  // walking, so nothing else would restore it.
  useEffect(() => {
    if (walking) {
      wasWalking.current = true;
      return;
    }
    if (!wasWalking.current) return;
    wasWalking.current = false;
    setWalkPlace(null);
    setTilted(false);
    setWalkEye(null);
    const map = mapRef.current?.getMap();
    if (!map || !ready) return;
    // Remember where you stood so the map can show you there and "Back to street view"
    // can put you back, facing the same way.
    const eye = eyeRef.current;
    eyeRef.current = null;
    if (eye) setStreetSpot({ lon: eye.lon, lat: eye.lat, heading: eye.bearing });
    // Leaving street view keeps the layers as they were: it used to turn restrooms on, and they then
    // stayed on after a restroom answer was closed (owner, 2026-10-28). Shops were only on because you walked.
    const asked = exitView.current;
    exitView.current = null;
    const at = asked?.place ?? (eye ? { lon: eye.lon, lat: eye.lat } : null);
    const duration = reducedMotion ? 0 : 700;
    // Mid-way, a "moveend" would still read the walk's pitch as a tilt, and the tilt
    // effect would then flatten the map at the walk's zoom over the top of this.
    leaving.current = !reducedMotion;
    if (asked?.frame) {
      map.fitBounds(asked.frame.bounds, { padding: asked.frame.padding ?? 40, maxZoom: asked.frame.maxZoom ?? WALK_EXIT_ZOOM, pitch: 0, bearing: 0, duration });
    } else {
      map.easeTo({
        ...(at ? { center: [at.lon, at.lat] as [number, number] } : {}),
        pitch: asked?.view === "3d" ? VIEW_3D_PITCH : 0,
        bearing: asked?.view === "3d" ? (asked.heading ?? eye?.bearing ?? 0) : 0,
        elevation: 0,
        zoom: asked?.view === "3d" ? VIEW_3D_ZOOM : Math.min(map.getZoom(), WALK_EXIT_ZOOM),
        duration,
      });
    }
    if (leaving.current) {
      map.once("moveend", () => {
        leaving.current = false;
        setTilted(map.getPitch() > TILT_EPSILON);
      });
    } else setTilted(map.getPitch() > TILT_EPSILON);
  }, [walking, ready, reducedMotion, setTilted]);

  // Map, 3D or Street from the view switch, the mini map or "Back to street view" (showView).
  const viewRequest = useViewRequest();
  useEffect(() => {
    if (!viewRequest || !ready) return;
    const map = mapRef.current?.getMap();
    if (!map) return;
    const here = eyeRef.current;
    const c = map.getCenter();
    if (viewRequest.view === "street") {
      const place = viewRequest.place ?? (here ? { lon: here.lon, lat: here.lat } : { lon: c.lng, lat: c.lat });
      startWalk({ ...place, heading: viewRequest.heading ?? (here?.bearing ?? map.getBearing()), exact: viewRequest.exact });
      return;
    }
    if (walking) {
      // Leaving street view: the exit effect frames it once the walk has let go of the camera.
      exitView.current = viewRequest;
      stopWalk();
      return;
    }
    if (viewRequest.frame) {
      map.fitBounds(viewRequest.frame.bounds, { padding: viewRequest.frame.padding ?? 40, maxZoom: viewRequest.frame.maxZoom ?? WALK_EXIT_ZOOM, pitch: 0, bearing: 0, duration: reducedMotion ? 0 : 700 });
      return;
    }
    const at = viewRequest.place ?? { lon: c.lng, lat: c.lat };
    map.easeTo({
      center: [at.lon, at.lat],
      pitch: viewRequest.view === "3d" ? VIEW_3D_PITCH : 0,
      bearing: viewRequest.view === "3d" ? (viewRequest.heading ?? map.getBearing()) : 0,
      zoom: viewRequest.view === "3d" ? Math.max(map.getZoom(), VIEW_3D_ZOOM - 1) : Math.min(map.getZoom(), WALK_EXIT_ZOOM),
      duration: reducedMotion ? 0 : 700,
    });
    // Only a new request moves the camera; `walking` is read as it is now.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewRequest, ready]);

  // The walk loop. Each frame moves the camera in ground metres along its own
  // bearing, so speed is constant at any zoom and the horizon stays level.
  useEffect(() => {
    if (!ready || !walking) return;
    const map = mapRef.current?.getMap();
    if (!map) return;

    const held = new Set<string>();
    const isTyping = (target: EventTarget | null): boolean => {
      const element = target as HTMLElement | null;
      if (!element) return false;
      return (
        element.tagName === "INPUT" ||
        element.tagName === "TEXTAREA" ||
        element.isContentEditable
      );
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (isTyping(event.target) || event.metaKey || event.ctrlKey) return;
      if (event.key === "Escape") {
        stopWalk();
        return;
      }
      if (!WALK_KEYS.has(event.code)) return;
      // Arrow keys would otherwise pan the map underneath the walk.
      event.preventDefault();
      held.add(event.code);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      held.delete(event.code);
    };
    const onBlur = () => held.clear();

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);

    let frame = 0;
    let last = performance.now();
    // Crossing a block edge is the only thing worth a React update: the strip
    // then says which block you are standing in and what happened there.
    const startEye = eyeRef.current;
    let standingOn = startEye
      ? blockKey(startEye.lat, startEye.lon).key
      : blockKey(map.getCenter().lat, map.getCenter().lng).key;
    // Drag (mouse or one finger) looks around: across turns, up/down tilts the
    // head. Map panning is off while walking, so the drag is ours alone.
    let lookDirty = false;
    let dragFrom: { x: number; y: number; id: number } | null = null;
    const canvas = map.getCanvas();
    // With pan and pinch off, MapLibre drops its touch-action rule, so on a phone the browser took an
    // up/down swipe as a page scroll instead of a look (owner report, 2026-10-27). The swipe is ours.
    const touchAction = canvas.style.touchAction;
    canvas.style.touchAction = "none";
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || dragFrom) return;
      dragFrom = { x: event.clientX, y: event.clientY, id: event.pointerId };
    };
    const onPointerMove = (event: PointerEvent) => {
      const eye = eyeRef.current;
      // One finger looks; a second finger landing must not make the view jump between them.
      if (!dragFrom || !eye || event.pointerId !== dragFrom.id) return;
      const dx = event.clientX - dragFrom.x;
      const dy = event.clientY - dragFrom.y;
      dragFrom = { x: event.clientX, y: event.clientY, id: dragFrom.id };
      // Grab-the-world feel both ways: drag left to turn right, drag up to look down (owner, 2026-10-27).
      eye.bearing = (eye.bearing - dx * LOOK_DEG_PER_PX + 360) % 360;
      eye.pitch = clampLookPitch(eye.pitch + dy * LOOK_DEG_PER_PX);
      lookDirty = true;
    };
    const onPointerUp = (event: PointerEvent) => {
      if (dragFrom?.id === event.pointerId) dragFrom = null;
    };
    canvas.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    let routeDistance = 0;
    const stations = stationFinder();
    let station: NearStation | null = null;
    let below = false;
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const input = resolveWalkInput(held, walkPad.current);
      const followed = followRef.current ? routeRef.current : null;
      const eye = eyeRef.current;
      if (!eye) {
        frame = requestAnimationFrame(tick);
        return;
      }
      let moved = lookDirty;
      lookDirty = false;
      // Standing still beside a station when its model first loads: pick it up now, not one step too late.
      if (!station && eye.z === undefined) {
        const here = stations.near(eye.lon, eye.lat);
        if (here) {
          station = here;
          setStationHere(here);
          eye.z = 0;
          eye.inside = false;
        }
      }
      if (followed) {
        // Following directions: advance along the polyline at walking pace
        // (Shift / sprint still runs), turning smoothly into each segment.
        routeDistance +=
          WALK_SPEED * (input.sprint ? 3 : 1) * Math.min(Math.max(dt, 0), 0.2);
        const pose = poseAlongRoute(followed.coordinates, routeDistance);
        if (pose) {
          eye.lon = pose.lon;
          eye.lat = pose.lat;
          eye.bearing = approachBearing(eye.bearing, pose.bearing, dt);
          moved = true;
          if (pose.done) setFollowingRoute(false);
        }
      } else if (input.forward !== 0 || input.turn !== 0) {
        const next = stepPose(
          { lon: eye.lon, lat: eye.lat, bearing: eye.bearing, zoom: 0 },
          input,
          dt,
        );
        // Beside a station its floors decide where you can stand: onto a stair top takes you down
        // (or up) it, and its walls and platform edges stop you. Inside one, you stay in it.
        const near = eye.inside && station ? station : stations.near(next.lon, next.lat);
        if (near) {
          const m = near.model;
          const [x0, y0] = toLocal(m, eye.lon, eye.lat);
          const [x1, y1] = toLocal(m, next.lon, next.lat);
          const at = walkIn(m, { x: x0, y: y0, z: eye.z ?? 0, inside: eye.inside ?? false }, x1 - x0, y1 - y0);
          [eye.lon, eye.lat] = toLngLat(m, at.x, at.y);
          eye.z = at.z;
          eye.inside = at.inside;
        } else {
          eye.lon = next.lon;
          eye.lat = next.lat;
        }
        eye.bearing = next.bearing;
        if (near !== station) {
          station = near;
          setStationHere(near);
        }
        moved = true;
      }
      const under = (eye.z ?? 0) < -UNDERGROUND_M;
      if (under !== below) {
        below = under;
        setUnderground(under);
      }
      if (moved) {
        // The camera is re-derived from the eye every frame: moving cancels
        // any camera animation in flight, and the eye never drifts upward.
        map.jumpTo(eyeCamera(map, eye));
        const key = blockKey(eye.lat, eye.lon).key;
        if (key !== standingOn) {
          standingOn = key;
          setWalkPlace(describeAtRef.current(eye.lat, eye.lon));
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      setStationHere(null);
      setUnderground(false);
      held.clear();
      walkPad.current = WALK_IDLE;
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      canvas.style.touchAction = touchAction;
      canvas.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
    // `describeAt` comes through a ref so a data refresh cannot tear down the
    // loop and drop the keys the walker is holding.
  }, [ready, walking, stopWalk, followingRoute, setFollowingRoute]);

  // An elevated station is drawn on the map while you walk beside it, so its platform is there to climb to.
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!ready || !map || !stationHere?.model.elevated) return;
    const here = stationHere;
    let id: string | null = null;
    let gone = false;
    void import("@/lib/map/three/stationScene").then(({ createStationLayer, STATION_LAYER }) => {
      if (gone || map.getLayer(STATION_LAYER)) return;
      map.addLayer(createStationLayer(here.model, here.tracks, undefined, here.signs));
      id = STATION_LAYER;
    });
    return () => {
      gone = true;
      if (id && map.getLayer(id)) map.removeLayer(id);
    };
  }, [ready, stationHere]);

  // Walking directions: one GeoJSON source holding the line and both ends.
  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current?.getMap();
    const source = map?.getSource(SOURCE_IDS.route) as GeoJSONSource | undefined;
    if (!source) return;
    const features: GeoJSON.Feature[] = [];
    if (route) {
      features.push({
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: route.coordinates },
      });
    }
    if (routeStart) {
      features.push({
        type: "Feature",
        properties: { end: "start" },
        geometry: { type: "Point", coordinates: [routeStart.lon, routeStart.lat] },
      });
    }
    if (routeEnd) {
      features.push({
        type: "Feature",
        properties: { end: "end" },
        geometry: { type: "Point", coordinates: [routeEnd.lon, routeEnd.lat] },
      });
    }
    void source.setData({ type: "FeatureCollection", features });
  }, [ready, styleEpoch, route, routeStart, routeEnd]);

  // A crosshair cursor says "the next click drops a route point".
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !ready) return;
    map.getCanvas().style.cursor = routePicking ? "crosshair" : "";
  }, [ready, routePicking]);

  useEffect(() => {
    if (!ready || !navCommand) return;
    const map = mapRef.current?.getMap();
    if (!map) return;
    const duration = reducedMotion ? 0 : 260;
    if (navCommand.type === "height") {
      const heightM = navCommand.heightM ?? MAX_HEIGHT_M;
      if (heightM <= STREET_LEVEL_M) {
        if (!walking) startWalk();
        return;
      }
      // A view you picked: leaves the walk, and guidance stops re-tilting the camera.
      sendCamera({ type: "view" });
      const apply = () => {
        // Stand the camera `heightM` up, behind the current centre along the
        // bearing, looking at the centre on the ground, the same way the eye camera does.
        const pitch = navCommand.pitch ?? pitchForHeight(heightM);
        const bearing = map.getBearing();
        const center = map.getCenter();
        const back = Math.max(heightM * Math.tan((pitch * Math.PI) / 180), heightM * 0.01);
        const rad = (bearing * Math.PI) / 180;
        const cosLat = Math.cos((center.lat * Math.PI) / 180);
        const eye = new LngLat(
          center.lng - (back * Math.sin(rad)) / (111_320 * cosLat),
          center.lat - (back * Math.cos(rad)) / 111_320,
        );
        // One scene, smooth moves between levels.
        map.easeTo({ ...map.calculateCameraOptionsFromTo(eye, heightM, center, 0), duration: reducedMotion ? 0 : 900 });
        setTilted(pitch > 0);
      };
      // Leaving the walk animates out first; that exit would undo the jump.
      if (walking) window.setTimeout(apply, reducedMotion ? 0 : 750);
      else apply();
      return;
    }
    if (navCommand.type === "zoom-in") {
      map.zoomIn({ duration });
      return;
    }
    if (navCommand.type === "zoom-out") {
      map.zoomOut({ duration });
      return;
    }
    if (navCommand.type === "north") {
      sendCamera({ type: "view" });
      const apply = () => {
        map.easeTo({ bearing: 0, pitch: 0, duration });
        setTilted(false);
      };
      if (walking) window.setTimeout(apply, reducedMotion ? 0 : 750);
      else apply();
      return;
    }
    map.jumpTo({
      center: [HOME_VIEW.lon, HOME_VIEW.lat],
      zoom: initialZoom(),
      pitch: 0,
      bearing: 0,
    });
    setTilted(false);
    // "Reset view" means the city, not the street you were standing on.
    sendCamera({ type: "reset" });
    // `walking` is read, not a trigger: only a new command moves the camera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, navCommand, reducedMotion, setTilted, startWalk]);

  // The camera-height slider shows where the camera actually is.
  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current?.getMap();
    if (!map) return;
    const report = () => {
      const t = cameraTransform(map);
      if (t) reportCameraHeight(t.getCameraAltitude());
    };
    report();
    map.on("moveend", report);
    return () => {
      map.off("moveend", report);
    };
  }, [ready, reportCameraHeight]);

  useEffect(warmBasemapFonts, []);

  // Eco mode: render at 1x instead of the device pixel ratio.
  useEffect(() => {
    if (!ready) return;
    mapRef.current?.getMap().setPixelRatio(eco ? 1 : window.devicePixelRatio);
  }, [ready, eco]);

  const hoverNtaName =
    hover?.kind === "block"
      ? (nameByCode.get(hover.datum.ntaCode) ?? null)
      : null;

  return (
    <div className="absolute inset-0">
      <MapLibreMap
        ref={mapRef}
        mapStyle={BASEMAP_STYLE_URL}
        initialViewState={viewState}
        // Street level looks past the horizon (MapLibre 5 allows pitch > 85);
        // the overhead map keeps its 85° ceiling.
        attributionControl={{ compact: true }}
        maxPitch={walking ? WALK_MAX_PITCH : MAX_PITCH}
        minZoom={9}
        // An eye 1.7 m up sits around z22; the camera height comes from the
        // eye pose, not from scroll-zoom.
        maxZoom={walking ? WALK_MAX_ZOOM : 22}
        // The built-in arrow-key panning has to stand down while walking, or
        // every keypress would move the camera twice.
        keyboard={!walking}
        // Scroll-zoom stays on while walking (bounded by min/maxZoom above);
        // double-click, pinch-rotate and right-drag stay off so the pitch
        // cannot tip away from the street.
        scrollZoom={!walking}
        dragPan={!walking}
        doubleClickZoom={!walking}
        touchZoomRotate={!walking}
        dragRotate={!walking}
        touchPitch={!walking}
        onLoad={handleLoad}
        onSourceData={(e) => {
          // "load" waits for a moment when every source is loaded at once, and the live trains refresh
          // every few seconds, so on a slow device it may never come: the first basemap tiles run the same
          // setup, or the quick buttons never get the map and panels never move the camera off the train.
          if (e.sourceId === VECTOR_SOURCE && e.isSourceLoaded) { markBasemapReady(); handleLoad(); }
          foldCredits(e.target);
        }}
        onError={handleError}
        onMouseMove={handleMouseMove}
        onMoveStart={handleMoveStart}
        onMouseOut={handleMoveStart}
        onClick={handleClick}
        onMoveEnd={handleMoveEnd}
        style={{ position: "absolute", inset: 0 }}
      >
        <Suspense fallback={null}>
          {FEATURES.map((f) => (f.MapLayer ? <f.MapLayer key={f.id} /> : null))}
        </Suspense>
        <YouMarker />
        {walking || agentHome ? null : <MapCompass />}
        <ViewSwitcher />
      </MapLibreMap>


      {agentHome ? <MapChrome /> : <QuickLayers />}
      {agentHome ? <MapViewSwitch /> : null}
      {agentHome ? <BackToStreet /> : null}
      {agentHome ? <BusesOff /> : null}
      {walking ? (
        <WalkControls
          place={walkPlace}
          street={streetHere}
          corner={corner}
          onInput={(input) => {
            walkPad.current = input;
          }}
          onExit={() => {
            closeAsk();
            stopWalk();
          }}
          onAsk={() => {
            const m = mapRef.current?.getMap();
            if (!m) return;
            const c = m.getCenter();
            openAsk(buildStreetContext({ lon: c.lng, lat: c.lat, heading: m.getBearing(), followedTrain: followedTrain() }));
          }}
        />
      ) : null}
      {walking && underground && stationHere && mapRef.current ? (
        <Suspense fallback={null}>
          <StationInside station={stationHere} getEye={getEye} fov={mapRef.current.getMap().getVerticalFieldOfView()} />
        </Suspense>
      ) : null}
      {walking && ready && mapRef.current ? (
        <StreetMiniMap main={mapRef.current.getMap()} getEye={getEye} onExit={stopWalk} onMap={() => showView("map")} filters={inset} />
      ) : null}

      {hover && !walking && canHover && !sheetOpen && analytics ? (
        <div
          className="pointer-events-none absolute z-20 max-w-[220px] rounded-lg border border-border bg-card/95 px-3 py-2 text-xs shadow-xl backdrop-blur"
          style={{
            left: Math.min(hover.x + 14, window.innerWidth - 240),
            top: Math.max(hover.y - 10, 8),
          }}
        >
          {hover.kind === "neighborhood" ? (
            <>
              <div className="text-[13px] font-semibold text-foreground">
                {hover.datum.ntaName}
              </div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {hover.datum.borough}
              </div>
            </>
          ) : (
            <>
              <div className="text-[13px] font-semibold text-foreground">
                {hoverNtaName ?? "Block"}
              </div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {blockName(hover.datum)}
              </div>
            </>
          )}

          <div className="mt-1.5 flex items-baseline gap-1.5">
            <span className="text-base font-semibold tabular-nums text-foreground">
              {formatCount(hover.datum.value)}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {model.view ? model.view.unit : LAYER_METRICS[layer].unit}
            </span>
          </div>

          <div className="mt-0.5 text-[11px] text-muted-foreground">
            {model.view
              ? model.view.label
              : hover.kind === "neighborhood"
                ? detailForNeighborhood(hover.datum, layer)
                : detailForBlock(hover.datum, layer)}
          </div>

          <div className="mt-1 border-t border-border/60 pt-1 text-[10px] text-muted-foreground/80">
            Click for a quick look
          </div>
        </div>
      ) : null}
    </div>
  );
}
