import { formatStreetText } from "@/lib/streetName";
import { liveProgress } from "./monotonic";
import { BusEstimator } from "./busEstimate";
import { labelledStationIds } from "./stationLabels";
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { Layer, Source, useMap } from "react-map-gl/maplibre";
import { LngLat, type GeoJSONSource, type Map as MaplibreMap, type MapLayerMouseEvent } from "maplibre-gl";
import { Accessibility, Navigation2, Wrench } from "lucide-react";
import { toast } from "sonner";
import {
  estimateTrain,
  stationOf,
  raisedTrack,
  viaductBays,
  entranceInstances,
  dedupeTrackLines,
  splitRaised,
  type StaticSystem,
  type SystemId,
  type Vehicle,
} from "./model";
import { alertedRoutes, type BusArrival, fetchBusCatalog, fetchBusRoutesNear, routesForPage, useAlerts, useBusLines, useBusRoute, useBusSegmentHistory, useBusShapes, useBuses, useStarred, useTransitData, useTransitMeta, useTransitToggles, useXrayData, useSegmentHistory } from "./hooks";
import { sharedCoords } from "@/lib/geo/sharedLocation";
import { useXray, xrayPrims } from "./xray";
import { useMapState } from "@/lib/store/MapStateContext";
import { useFlag } from "@/lib/flags";
import { usePanel, usePanelChip, usePanelMode, usePanelSearch, type SearchProvider } from "@/lib/store/PanelContext";
import { pickRouteVehicle, registerRouteFollower } from "@/lib/transit/routeFollow";
import { ZoomKeeper, followRig, publishFollowPos, rememberFollowOrigin, setBoardedOnFoot, setFollowMode, setFollowed, stableHeading, stopFollowing, takeFollowRestore, useFollowMode, useFollowed } from "./follow";
import { followActionForMapClick } from "./followClick";
import { publishSubway } from "@/lib/agent/streetContext";
import { busesInFocus, busesToShow, clearStopWatch, holdShuttle, watchStopBuses, registerBusToggle, setShuttleBuses, shownVehicles, useBusPins } from "@/lib/transit/busReveal";
import { publishLiveDots } from "@/lib/transit/liveVehicles";
import { heldTrains } from "@/lib/transit/holds";
import { setLinesControl } from "@/lib/transit/linesControl";
import { lineOf, setSelectedLine, useSelectedLine } from "@/lib/transit/selectedLine";
import { useActiveTrip } from "@/lib/transit/activeTrip";
// The line panel loads on the first line picked (own chunk), keeping the transit layers chunk in budget.
const LinePanel = lazy(() => import("./LinePanel").then((m) => ({ default: m.LinePanel })));
import { STREET_XRAY_M, XRAY_VEIL_M, getStreetXray, inStreetXray, setStreetXray, useStreetXray, xrayForFollow, xrayVeilDisc } from "@/lib/transit/streetXray";
import { usePrefersReducedMotion } from "@/lib/usePrefersReducedMotion";

const stopFollow = () => setFollowed(null);
import { SYSTEM_LABELS, cellKey } from "./model";
import { entranceLabels } from "./entranceLabels";
import { readMap } from "@/lib/map/mapRead";
import { showView } from "@/lib/map/viewChange";
import { FollowCard, SkipDetails, StationDetails, stopName } from "./TransitCard";
import { FollowMiniMap } from "./FollowMiniMap";
import { TransitStatusDetails } from "./TransitStatus";
import { alertGeometry, setAlertFocus, stationChanges, useAlertFocus } from "./alertFocus";
import { LinesDrawer } from "./LinesDrawer";
import { BusStopDetails } from "./BusStopDetails";
import { busStopAt } from "@/lib/map/busStops";
import { pickAt as pickStreet, setPickTargets } from "@/lib/map/streetPick";
import { keepInView } from "@/lib/map/keepInView";
import { lineOpacity, useMapOptions } from "@/lib/map/mapOptions";
import { NOTCH_ICON, addBulletImage, lineColor as lineColorOf, stationRowId, bulletId, busBadgeId, busIconSize, busLivery, busPrefix } from "@/lib/transit/bullets";
import { usePalette, type Palette } from "@/lib/theme";
import { RAISED_LIFT_PX, STOP_LIFT_PX, alertCameraAction, paintAboveVehicles, trainIconOffset } from "./layerOrder";
import { FOCUS_OPACITY, FOCUS_VEIL_ID, WORLD, focusVeil, useTransitFocus } from "@/lib/map/transitFocus";
import { framePadding } from "@/lib/map/mapCover";
import { rowBulletAt } from "./rowBullet";
import { TapCycle } from "./tapCycle";
import { liveBranches } from "./liveBranches";
import { lineChoice, type LineChoice } from "./lineChoice";
import { LineChooser } from "./LineChooser";

/** Layers a click on the map should hand to transit instead of the area pick. */
const TRANSIT_CLICK_LAYERS = ["transit-skip", "transit-alert-skipped", "transit-bus-badge-follow", "transit-bullet", "transit-bus-badge", "transit-bus-badge-full", "transit-bus-badge-selected", "transit-vehicle-2d", "transit-vehicle-hit", "transit-vehicle-hit-stop", "transit-vehicle-hit-raised", "transit-access", "transit-entrance", "transit-line-stop", "transit-line-stop-name", "transit-station-label", "transit-station-raised", "transit-station"];

const MAX_VEHICLES = 400;
const RAISED_LIFT_EM = 2.8;
/** In 3D, a train's route bullet sits this far above its point so the box under it stays visible (#366). */
const TAG_LIFT = 20;
/**
 * Tilted-view bullet offset: above the box, plus the viaduct lift when elevated;
 * underground stays on the line. A dwelling train also lifts clear of the station.
 */
function tagOffset(notch: number) {
  const y = (lift: number) => ["literal", [0, -(lift + notch)]];
  const atStop = ["==", ["get", "atStop"], 1];
  return ["case",
    ["all", ["==", ["get", "grade"], "elevated"], atStop], y(RAISED_LIFT_PX + STOP_LIFT_PX + TAG_LIFT),
    ["all", ["==", ["get", "grade"], "underground"], atStop], y(STOP_LIFT_PX),
    atStop, y(STOP_LIFT_PX + TAG_LIFT),
    ["==", ["get", "grade"], "elevated"], y(RAISED_LIFT_PX + TAG_LIFT),
    ["==", ["get", "grade"], "underground"], y(0),
    y(TAG_LIFT)];
}
/** True when a point sits on (or right beside) raised subway track. */
function onRaisedTrack(cells: Set<string>, p: GeoJSON.Position): boolean {
  for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) if (cells.has(cellKey([p[0] + dx / 2400, p[1] + dy / 2400]))) return true;
  return false;
}
/** Street level: live vehicles within this distance of the walker. */
const STREET_RADIUS_M = 600;
/** Street level: station names show within this distance of the walker. */
const STREET_LABEL_M = 220;
/** Street level: trains within this distance of the walker show their route bullet. */
const STREET_TRAIN_M = 300;

function metresBetween(a: { lon: number; lat: number }, b: number[]): number {
  const kx = 111_320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot((b[0] - a.lon) * kx, (b[1] - a.lat) * 111_320);
}
/** X-ray draws underground trains this far below the ground plane. */
const XRAY_DEPTH_M = -12;
/** Where the walker stands: at street level the map centre sits at most ~10 m ahead of the eye. */
const ENTRANCE_LABEL_ZOOM = 17;
/** Street view's camera is at eye level from about this tilt; raised higher, the map reads as overhead. */
const EYE_PITCH = 60;
const EMPTY_FC: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

function streetEye(map: MaplibreMap): { lon: number; lat: number } {
  const c = map.getCenter();
  return { lon: c.lng, lat: c.lat };
}
/** A station counts as under a tap only this close to the tapped ground, in metres. */
const STATION_TAP_M = 120;
/**
 * The subway station drawn under a tap, if any: within a finger's width of it on
 * screen and near the tapped ground. In a tilted street view a few pixels near
 * the horizon span kilometres, so screen distance alone named Union Square at the UN.
 */
function stationNear(map: MaplibreMap, at: { x: number; y: number }, ground: { lon: number; lat: number }, sys: StaticSystem | undefined): { id: string; name: string; routes: string } | undefined {
  let best: { id: string; name: string; routes: string } | undefined;
  let bestD = 24;
  const { width, height } = map.getCanvas().getBoundingClientRect();
  for (const f of sys?.stations.features ?? []) {
    const c = f.geometry.coordinates as [number, number];
    if (metresBetween(ground, c) > STATION_TAP_M) continue;
    const p = map.project(c);
    if (p.x < 0 || p.y < 0 || p.x > width || p.y > height) continue;
    const d = Math.hypot(p.x - at.x, p.y - at.y);
    if (d < bestD) { bestD = d; best = { id: String(f.properties.id), name: String(f.properties.name), routes: String(f.properties.routes ?? "") }; }
  }
  return best;
}

function metresApart(a: { lon: number; lat: number }, b: { lon: number; lat: number }) {
  const k = 111_320;
  return Math.hypot((a.lon - b.lon) * k * Math.cos((a.lat * Math.PI) / 180), (a.lat - b.lat) * k);
}
const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
/** Stable "no buses" result so the draw loop does not restart every render. */
const BUS_OFF = { why: "off" as const, routes: [] as string[] };
const ICONS: Record<string, { node: JSX.Element; sdf: boolean }> = {
  "transit-arrow": { node: <Navigation2 fill="#fff" color="#fff" strokeWidth={1.5} size={48} />, sdf: true },
  "transit-access": { node: <Accessibility color="#2563eb" strokeWidth={2.5} size={40} />, sdf: false },
  "transit-wrench": { node: <Wrench color="#f59e0b" strokeWidth={2.5} size={40} />, sdf: false },
};

/** Skipped-station markers (#253): a full cross-out, or a half strike for one direction. */
function addSkipIcons(map: MaplibreMap) {
  for (const [id, half] of [["transit-skip-x", false], ["transit-skip-half", true]] as const) {
    if (map.hasImage(id)) continue;
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) return;
    ctx.canvas.width = ctx.canvas.height = 40;
    ctx.beginPath(); ctx.arc(20, 20, 15, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff"; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = "#111111"; ctx.stroke();
    ctx.lineCap = "round"; ctx.lineWidth = 4; ctx.strokeStyle = "#d4183d";
    ctx.beginPath(); ctx.moveTo(9, 31); ctx.lineTo(31, 9); ctx.stroke();
    if (!half) { ctx.beginPath(); ctx.moveTo(9, 9); ctx.lineTo(31, 31); ctx.stroke(); }
    map.addImage(id, ctx.getImageData(0, 0, 40, 40), { pixelRatio: 2 });
  }
}

/** Overhead subway entrances (owner, 2026-10-27): a green badge with what it is, not a bare dot. */
function addEntranceIcons(map: MaplibreMap) {
  for (const id of ["transit-entr-stair", "transit-entr-elevator", "transit-entr-escalator", "transit-entr-elevator-out"] as const) {
    if (map.hasImage(id)) continue;
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) return;
    ctx.canvas.width = ctx.canvas.height = 48;
    ctx.beginPath(); ctx.roundRect(4, 4, 40, 40, 10);
    ctx.fillStyle = id.endsWith("-out") ? "#6b7280" : "#15803d"; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = "#ffffff"; ctx.stroke();
    ctx.strokeStyle = "#ffffff"; ctx.fillStyle = "#ffffff"; ctx.lineWidth = 3.5; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath();
    if (id === "transit-entr-stair") {
      // Three steps going down to the right.
      ctx.moveTo(12, 15); ctx.lineTo(19, 15); ctx.lineTo(19, 22); ctx.lineTo(26, 22); ctx.lineTo(26, 29); ctx.lineTo(33, 29); ctx.lineTo(33, 35);
    } else if (id === "transit-entr-escalator") {
      ctx.moveTo(11, 34); ctx.lineTo(18, 34); ctx.lineTo(30, 16); ctx.lineTo(37, 16);
    } else {
      // A cab with up and down arrows.
      ctx.moveTo(19, 21); ctx.lineTo(24, 15); ctx.lineTo(29, 21); ctx.moveTo(19, 27); ctx.lineTo(24, 33); ctx.lineTo(29, 27);
      if (id.endsWith("-out")) { ctx.moveTo(13, 35); ctx.lineTo(35, 13); }
    }
    ctx.stroke();
    map.addImage(id, ctx.getImageData(0, 0, 48, 48), { pixelRatio: 2 });
  }
}

/** SVG markup per icon, rendered once (no server renderer in the bundle). */
const ICON_SVG = new Map<string, string>();
function iconSvg(id: string, node: JSX.Element): string {
  let svg = ICON_SVG.get(id);
  if (svg === undefined) {
    const host = document.createElement("div");
    const root = createRoot(host);
    flushSync(() => root.render(node));
    svg = host.innerHTML;
    root.unmount();
    ICON_SVG.set(id, svg);
  }
  return svg;
}

function addIcon(map: MaplibreMap, id: string) {
  const def = ICONS[id];
  if (!def || map.hasImage(id)) return;
  // MapLibre can raise styleimagemissing while React is committing (a <Layer> mounting);
  // rendering a React root synchronously there trips React's flushSync warning, so wait a tick.
  queueMicrotask(() => {
    if (map.hasImage(id)) return;
    const img = new Image(48, 48);
    img.onload = () => { if (!map.hasImage(id)) map.addImage(id, img, { sdf: def.sdf, pixelRatio: 2 }); };
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(iconSvg(id, def.node))}`;
  });
}

/** The latest render's values the draw loop reads (the loop itself never re-renders). */
type FrameInputs = {
  map: MaplibreMap | undefined;
  three: boolean;
  xrayOn: boolean;
  followedKey: string | null | undefined;
  followMode: Parameters<typeof followRig>[0];
  reducedMotion: boolean;
  hide: boolean;
  /** Street level: only the subway trains near the walker keep their bullets. */
  walking: boolean;
  alerted: Set<string>;
  theme: Palette;
};

/** Map features for the drawn vehicles: route bullets, bus badges, rail arrows. */
function vehicleCollection(list: Vehicle[], alerted: Set<string>, theme: Palette, followedKey: string | null | undefined): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: list.map((v) => {
      const alert = alerted.has(v.route);
      let bullet = "", badge = "", badgeFull = "";
      if (v.system === "subway") bullet = bulletId(v.route, v.color, alert);
      if (v.system === "bus") {
        const p = busPrefix(v.route);
        const c = p.express ? theme.busExpress : theme.bus;
        badge = busBadgeId(p.text, c); // the tiny prefix badge stays plain; the "!" rides the full badge
        badgeFull = busBadgeId(v.route, c, alert);
      }
      // A held train says so next to its bullet, in the trouble amber (src/lib/transit/holds.ts).
      const held = v.held ? `Held ${Math.max(1, Math.floor((Date.now() / 1000 - v.held.since) / 60))} min` : "";
      return { type: "Feature", properties: { key: v.key, color: v.color, bearing: v.bearing, grade: v.grade, label: v.label, system: v.system, route: v.route, bullet, badge, badgeFull, alpha: v.alpha ?? 1, atStop: v.stopped ? 1 : 0, followed: v.key === followedKey ? 1 : 0, held }, geometry: { type: "Point", coordinates: [v.lon, v.lat] } };
    }),
  };
}

/** Slice of a route shape between two stops, for marking planned work on the exact segment. */
function shapeSlice(sys: StaticSystem, route: string, stops: string[]): GeoJSON.Position[] | null {
  const shape = sys.shapes[route], sm = sys.stopM[route];
  if (!shape || !sm) return null;
  const ms = stops.map((s) => sm[stationOf(sys.system, s)]).filter((m): m is number => m !== undefined);
  if (ms.length < 2) return null;
  const lo = Math.min(...ms), hi = Math.max(...ms);
  const c = shape.c.filter((_, i) => shape.m[i] >= lo && shape.m[i] <= hi);
  return c.length > 1 ? c : null;
}

const AGENCY: Record<string, SystemId> = { MTASBWY: "subway", LI: "lirr", MNR: "mnr" };

/**
 * Live MTA transit, drawn by MapLibre itself: lines (underground runs glow,
 * elevated runs get a viaduct deck in 3D), stations, street entrances at
 * street level, planned-work wrenches, and vehicles — oriented arrows in 2D,
 * extruded bodies in 3D (on the viaduct when elevated, x-ray when underground).
 */
export default function TransitLayer() {
  const enabled = useFlag("transit");
  const { current } = useMap();
  const map = current?.getMap();
  const { tilted, walking, startWalk, stopWalk, setTilted } = useMapState();
  const reducedMotion = usePrefersReducedMotion();
  const three = tilted || walking;
  // Street level: where the walker stands, refreshed as they move (~25 m steps), for the station-name filter.
  const [eyeAt, setEyeAt] = useState<[number, number] | null>(null);
  useEffect(() => {
    if (!map || !walking) { setEyeAt(null); return; }
    const sync = () => {
      const e = streetEye(map);
      const q = (v: number) => Math.round(v * 4000) / 4000;
      setEyeAt((p) => (p && p[0] === q(e.lon) && p[1] === q(e.lat) ? p : [q(e.lon), q(e.lat)]));
    };
    sync();
    map.on("moveend", sync);
    return () => { map.off("moveend", sync); };
  }, [map, walking]);
  // Dev-only: lets headless QA enter street level at a point.
  useEffect(() => {
    if (import.meta.env.DEV) (window as unknown as { __walk?: unknown }).__walk = startWalk;
  }, [startWalk]);
  const { on, set, panelOpen, setPanelOpen, busPage, busLines: pickedLines, busNear, busCap, setBusLines } = useTransitToggles();
  const { content, showPanel, setDrawerOpen, setSnap, drawerOpen } = usePanel();
  const meta = useTransitMeta();
  const rail = (["subway", "lirr", "mnr"] as SystemId[]).filter((s) => on.has(s));
  const alertFocus = useAlertFocus();
  const pins = useBusPins();
  const busLines = useBusLines(Boolean(busPage) || drawerOpen);
  const lineList = useMemo(() => (pickedLines.length ? pickedLines : routesForPage(busLines.data?.groups, busPage)), [pickedLines, busLines.data, busPage]);
  // `on` is a new Set every render. The boolean and the pin snapshot are what actually change.
  const busWanted = on.has("bus");
  const busOnRef = useRef(busWanted);
  busOnRef.current = busWanted;
  const show = useMemo(
    () => (busWanted ? busesToShow(lineList, pins) : BUS_OFF),
    [busWanted, lineList, pins],
  );
  const busOn = meta.data?.bus === true && show.routes.length > 0;
  // The draw loop reads this, so a stale timer cannot keep a bus after Live buses turns off.
  const busRoutesRef = useRef<string[]>([]);
  busRoutesRef.current = show.routes;
  const data = useTransitData(rail);
  const subwayRoutes = useMemo(() => [...new Set((data.subway?.live?.trips ?? []).map((t) => t.route))].sort(), [data.subway?.live]);
  const history = useSegmentHistory(subwayRoutes);
  const buses = useBuses(busOn, show.routes);
  const alerts = useAlerts(rail.length > 0 || panelOpen);
  // Routes with an active delay or detour: their trains may really be held, so the vehicle report is trusted there.
  const troubleRoutes = useMemo(() => alertedRoutes(alerts.data?.alerts), [alerts.data]);
  const stars = useStarred();
  // The panel owns what is open; a vehicle stays "selected" while its panel is up.
  const selectedKey = content?.id.startsWith("transit:vehicle:") ? content.id.slice(16) : undefined;
  const followedKey = useFollowed();
  useEffect(() => {
    if (!show.routes.length && followedKey?.startsWith("bus:")) setFollowed(null);
  }, [show.routes.length, followedKey]);
  const display = useRef(new Map<string, Vehicle>());
  // Buses: snapped to their route shape and dead-reckoned between 30 s GPS reports.
  const busEst = useRef(new BusEstimator());
  const busShapes = useBusShapes(show.routes);
  const busHistory = useBusSegmentHistory(show.routes);
  useEffect(() => busEst.current.setHistory(busHistory), [busHistory]);
  // Lines found around you (not picked), and every bus but the one you follow, are out of
  // focus: only their buses near you draw. Picked lines, a trip and a shuttle are in focus.
  const busNearOnly = (busNear && show.why === "page") || Boolean(followedKey?.startsWith("bus:"));
  // A watched stop shows a few more buses per line, nearest the stop: the ones coming to it.
  const busFocusRef = useRef({ busNearOnly, busCap, followedKey, walking, watchAt: pins.watch?.at });
  busFocusRef.current = { busNearOnly, busCap: show.why === "watch" ? Math.max(busCap, 5) : busCap, followedKey, walking, watchAt: show.why === "watch" ? pins.watch?.at : undefined };
  /** Where "near" is: the bus you follow, else you, else where you stand in street view, else the map centre. */
  const busNearPoint = useCallback((list: readonly { id: string; lon: number; lat: number }[]) => {
    const { followedKey: fk, walking: w, watchAt } = busFocusRef.current;
    const fb = fk?.startsWith("bus:") ? list.find((b) => b.id === fk.slice(4)) : undefined;
    if (fb) return { lon: fb.lon, lat: fb.lat };
    if (watchAt) return watchAt;
    if (!map) return sharedCoords();
    const c = map.getCenter();
    return sharedCoords() ?? (w ? streetEye(map) : { lon: c.lng, lat: c.lat });
  }, [map]);
  const focusedBuses = useCallback(<T extends { id: string; route: string; lon: number; lat: number }>(list: readonly T[], keep: (string | undefined)[]) => {
    const f = busFocusRef.current;
    const ids = new Set(keep.filter((k): k is string => Boolean(k?.startsWith("bus:"))).map((k) => k.slice(4)));
    return busesInFocus(list, { routes: busRoutesRef.current, nearOnly: f.busNearOnly, cap: f.busCap, near: busNearPoint(list), keep: ids });
  }, [busNearPoint]);
  useEffect(() => {
    for (const g of busShapes) busEst.current.setRoute(g);
    // Buses per line: the nearest, plus the one being followed so Follow never loses its bus.
    const list = focusedBuses(buses.data?.buses ?? [], [followedKey ?? undefined]);
    for (const b of list) busEst.current.report(b);
    busEst.current.retain(new Set(list.map((b) => b.id)));
    // The map is read once per refresh, not on every move: re-running on `map` would reshuffle buses as you pan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buses.data, busShapes, show.routes, show.why, busCap, busNearOnly]);
  // The followed vehicle as React sees it: refreshed only when what its card shows changes.
  const [followed, setFollowedVehicle] = useState<Vehicle | undefined>(undefined);

  // A bus stop's next buses, and a way to watch them come on the map from above.
  // Both put the stop's routes in focus around the stop until its card closes; your own lines come back after.
  const openBusStop = useCallback((lon: number, lat: number, name: string) => {
    const panelId = `busstop:${lon.toFixed(5)},${lat.toFixed(5)}`;
    const watch = (routes: string[]) => {
      if (!routes.length) return;
      setFollowed(null);
      watchStopBuses({ routes, at: { lon, lat }, panelId });
      showView("map", { lon, lat });
    };
    const follow = (a: BusArrival) => {
      watchStopBuses({ routes: [a.route], at: { lon, lat }, panelId });
      if (a.vehicle) setFollowed(`bus:${a.vehicle}`); else showView("map", { lon, lat });
    };
    showPanel({ id: panelId, title: formatStreetText(name), subtitle: "Bus stop", details: <BusStopDetails lon={lon} lat={lat} onWatch={watch} onFollow={follow} /> });
  }, [showPanel]);
  // Closing the stop's card (or opening anything but a vehicle) ends the watch.
  const watchPanel = pins.watch?.panelId;
  const watchShown = useRef(false);
  useEffect(() => {
    if (!watchPanel) { watchShown.current = false; return; }
    if (content?.id === watchPanel) watchShown.current = true;
    else if (watchShown.current && !content?.id.startsWith("transit:vehicle:")) { watchShown.current = false; clearStopWatch(); }
  }, [content?.id, watchPanel]);
  const openStation = useCallback(
    (system: SystemId, id: string, name: string) =>
      showPanel({ id: `transit:station:${system}:${id}`, title: name, subtitle: `${SYSTEM_LABELS[system]} station`, details: <StationDetails system={system} id={id} /> }),
    [showPanel],
  );
  useEffect(() => {
    if (!panelOpen) return;
    showPanel({ id: "transit:status", title: "Service status", subtitle: "Live MTA feeds, refreshed every 15 s", details: <TransitStatusDetails /> });
    setPanelOpen(false);
  }, [panelOpen, showPanel, setPanelOpen]);
  const anyOn = on.size > 0;
  const toggleChip = useCallback(() => {
    if (anyOn) {
      holdShuttle(alertFocus?.id ?? null);
      (["subway", "lirr", "mnr", "bus"] as const).forEach((id) => set(id, false));
    } else set("subway", true);
  }, [anyOn, set, alertFocus]);
  usePanelChip({ id: "transit", label: "Transit", active: anyOn, onToggle: toggleChip });
  const [focus, setFocus] = useTransitFocus();
  const toggleFocus = useCallback(() => {
    if (!focus && !anyOn) set("subway", true);
    setFocus(!focus);
  }, [focus, anyOn, set, setFocus]);
  const opts = useMapOptions();
  // A tapped or chosen line is shown alone, with its notices panel (#370). The old layout too: its Lines
  // list picked a line and nothing happened (owner report, 2026-10-28).
  const home = useFlag("agentHome");
  const selected = useSelectedLine();
  const lineSel = selected ? lineOf(selected.route) : null;
  const isoRoutes = useMemo(() => (lineSel ? [lineSel, `${lineSel}X`] : opts.routes), [lineSel, opts.routes]);
  // The lines of the trip on screen: their trains stay bright, the others fade.
  const activeTrip = useActiveTrip();
  const tripRoutes = useMemo(() => [...new Set((activeTrip?.legs ?? []).filter((l) => l.kind === "ride" && l.route).flatMap((l) => [l.route!, `${l.route!}X`]))], [activeTrip]);
  // A picked line is drawn by its own layers (in use, faded, detour), so the shared drawing leaves it out.
  const lineAlpha = (lineSel ? ["case", ["in", ["get", "route"], ["literal", isoRoutes]], 0, 0.12] : lineOpacity(isoRoutes, focus)) as number;
  // `on` is a new Set every render: depending on it re-registered the chip on every render,
  // which re-rendered this layer through the panel context ("Maximum update depth exceeded").
  const trainsOn = on.has("subway");
  const toggleTrains = useCallback(() => set("subway", !trainsOn), [trainsOn, set]);
  // Why Live buses showed nothing, under its switch; cleared once routes show.
  const [busNote, setBusNote] = useState<string | null>(null);
  const busPoint = useCallback(() => {
    const c = map?.getCenter();
    return sharedCoords() ?? (c ? { lon: c.lng, lat: c.lat } : null);
  }, [map]);
  const toggleBuses = useCallback(() => {
    if (show.routes.length > 0) { holdShuttle(alertFocus?.id ?? null); set("bus", false); return; }
    // Agent-first home: switch on the buses around you (or the map centre) instead of
    // opening the full line picker; the picker stays in More layers.
    const point = busPoint();
    if (home && point) {
      setBusNote(null);
      void fetchBusRoutesNear(point)
        .then((routes) => { if (routes.length) setBusLines(routes, { near: true }); else setBusNote("No buses near here. Pick a route below."); })
        .catch(() => setBusNote("Couldn't load buses. Try again, or pick a route below."));
      return;
    }
    setDrawerOpen(true);
  }, [show.routes.length, alertFocus, set, setDrawerOpen, home, busPoint, setBusLines]);
  useEffect(() => { if (show.routes.length) setBusNote(null); }, [show.routes.length]);
  const suggestBuses = useCallback(async () => {
    const point = busPoint();
    return point ? fetchBusRoutesNear(point, 10) : [];
  }, [busPoint]);
  // Street view: live trains, the buses around you and x-ray of the tunnels near you come on
  // (owner, 2026-10-27). Leaving puts back what this turned on, unless you changed it meanwhile.
  const streetAuto = useRef<{ xray: boolean; trains: boolean; buses: string[] | null } | null>(null);
  const autoState = useRef({ trainsOn, routes: show.routes, set, setBusLines });
  autoState.current = { trainsOn, routes: show.routes, set, setBusLines };
  useEffect(() => {
    if (!map) return;
    if (!walking) {
      const auto = streetAuto.current;
      streetAuto.current = null;
      if (!auto) return;
      setStreetXray(auto.xray);
      const now = autoState.current;
      if (auto.buses && now.routes.join(",") === auto.buses.join(",")) now.set("bus", false);
      if (auto.trains && now.trainsOn) now.set("subway", false);
      return;
    }
    const auto = { xray: getStreetXray(), trains: !autoState.current.trainsOn, buses: null as string[] | null };
    streetAuto.current = auto;
    setStreetXray(true);
    if (auto.trains) autoState.current.set("subway", true);
    if (autoState.current.routes.length) return;
    // Where you stand once the camera lands, not where it flew from.
    const pick = () => {
      const e = streetEye(map);
      void fetchBusRoutesNear({ lon: e.lon, lat: e.lat }).then((routes) => {
        if (streetAuto.current !== auto || !routes.length || autoState.current.routes.length) return;
        auto.buses = routes;
        autoState.current.setBusLines(routes, { near: true });
      }).catch(() => {});
    };
    if (map.isMoving()) map.once("moveend", pick); else pick();
  }, [map, walking]);
  usePanelChip({ id: "liveTrains", label: "Live trains", active: trainsOn, onToggle: toggleTrains });
  usePanelChip(meta.data?.bus === true ? { id: "liveBuses", label: "Live buses", active: show.routes.length > 0, onToggle: toggleBuses, routes: show.routes, setRoutes: setBusLines, suggest: suggestBuses, catalog: fetchBusCatalog, note: busNote } : null);
  usePanelChip({ id: "transitFocus", label: "Transit Focus", active: focus && anyOn, onToggle: toggleFocus });

  // Icons, including after a style swap.
  useEffect(() => {
    if (!map) return;
    const missing = (e: { id: string }) => { addIcon(map, e.id); addBulletImage(map, e.id); };
    Object.keys(ICONS).forEach((id) => addIcon(map, id));
    const skipIcons = () => { addSkipIcons(map); addEntranceIcons(map); };
    skipIcons();
    map.on("styleimagemissing", missing);
    map.on("styledata", skipIcons);
    return () => { map.off("styleimagemissing", missing); map.off("styledata", skipIcons); };
  }, [map]);

  const statics = rail.map((s) => data[s]?.stat).filter((s): s is StaticSystem => Boolean(s));
  const staticKey = statics.map((s) => s.system).join(",");
  publishSubway(statics.find((s) => s.system === "subway") ?? null);
  // Raised subway track (viaducts, portal ramps, bridge decks) from the height profiles.
  const raised = useMemo(() => {
    const sub = statics.find((s) => s.system === "subway");
    return sub ? raisedTrack(sub) : { decks: EMPTY as GeoJSON.FeatureCollection<GeoJSON.Polygon>, piers: EMPTY as GeoJSON.FeatureCollection<GeoJSON.Polygon>, raisedCells: new Set<string>() };
  }, [staticKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const lines = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: "FeatureCollection",
    // Commuter rail is drawn at grade; subway ground lines step aside under raised track.
    // Branch shapes share a trunk, so collapse them before the dash can stack.
    features: statics.flatMap((s) => {
      const fs = dedupeTrackLines(s.lines.features.map((f) => ({ ...f, properties: { ...f.properties, system: s.system, grade: s.system !== "subway" ? ("grade" as const) : f.properties.grade } })));
      return s.system === "subway" ? splitRaised(fs, raised.raisedCells) : fs;
    }),
  }), [staticKey, raised]); // eslint-disable-line react-hooks/exhaustive-deps
  // The picked line drawn from its own shapes, whole and solid. The deduped drawing gives a shared trunk to
  // whichever same-colour route came first (the N's Broadway run is labelled Q or R), so dimming the other
  // routes left gaps in the picked one (#419).
  // An open subway station with no line picked highlights every line that stops there (owner, 2026-10-25);
  // its line bullets then isolate one.
  const stationOpen = !lineSel && content?.id.startsWith("transit:station:subway:") ? content.id.split(":").pop() ?? "" : "";
  const stationRoutes = useMemo(() => {
    const sub = statics.find((s) => s.system === "subway");
    const f = stationOpen && sub ? sub.stations.features.find((x) => String(x.properties.id) === stationOpen) : undefined;
    return f ? String(f.properties.routes ?? "").split(/[\s,]+/).filter(Boolean) : [];
  }, [staticKey, stationOpen]); // eslint-disable-line react-hooks/exhaustive-deps
  const shownRoutes = lineSel ? isoRoutes : stationRoutes;
  // Which of the picked line's tracks its trains are on right now (src/features/transit/liveBranches.ts):
  // in use bold, the rest faded, a run off the line's own track dashed as a detour.
  const subLive = data.subway?.live;
  const picked = useMemo(() => {
    const sub = statics.find((s) => s.system === "subway");
    const none: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
    if (!shownRoutes.length || !sub) return { used: none, unused: none, detour: none };
    const used: GeoJSON.Feature[] = [];
    const unused: GeoJSON.Feature[] = [];
    const detour: GeoJSON.Feature[] = [];
    for (const r of [...new Set(shownRoutes.map(lineOf))]) {
      const b = liveBranches(r, sub, subLive?.trips ?? []);
      if (b) { used.push(...b.used); unused.push(...b.unused); detour.push(...b.detour); continue; }
      used.push(...sub.lines.features.filter((f) => lineOf(String(f.properties.route)) === r));
    }
    const fc = (features: GeoJSON.Feature[]): GeoJSON.FeatureCollection => ({ type: "FeatureCollection", features });
    return { used: fc(used), unused: fc(unused), detour: fc(detour) };
  }, [staticKey, shownRoutes, subLive]); // eslint-disable-line react-hooks/exhaustive-deps
  const stations = useMemo<GeoJSON.FeatureCollection>(() => {
    // One name per station complex: same-name neighbours would stack the label twice (#312).
    const labelled = labelledStationIds(statics.flatMap((s) => s.system !== "subway" ? [] : s.stations.features.map((f) => ({ id: String(f.properties.id), name: String(f.properties.name ?? ""), lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] }))));
    return {
    type: "FeatureCollection",
    features: statics.flatMap((s) => s.stations.features.map((f) => {
      // Subway stations carry a compact row of route bullets for their label (#177).
      const routes = s.system === "subway" ? String(f.properties.routes ?? "").split(/[\s,]+/).filter((r) => r && !r.endsWith("X")) : [];
      // Raised (elevated / viaduct) stations: their labels float above the platform in 3D.
      const raisedSt = s.system === "subway" && onRaisedTrack(raised.raisedCells, f.geometry.coordinates);
      return { ...f, properties: { ...f.properties, system: s.system, raised: raisedSt, row: routes.length ? stationRowId([...new Set(routes)]) : "", labelled: s.system !== "subway" || labelled.has(String(f.properties.id)),
        // Four or more lines: a hub people navigate by, named from zoom 14 (#186).
        major: new Set(routes).size >= 4 } };
    })),
    };
  }, [staticKey, raised]); // eslint-disable-line react-hooks/exhaustive-deps
  const viaduct = raised.decks;
  const piers = raised.piers;
  const entrances = data.subway?.stat?.entrances ?? EMPTY;

  // Planned work: wrenches on affected stations; reroutes and planned work get an
  // amber overlay on the exact segment and a ring on each skipped stop.
  // Elevator / escalator outages get an accessibility marker on the station.
  const work = useMemo(() => {
    const points: GeoJSON.Feature[] = [], segs: GeoJSON.Feature[] = [], skips: GeoJSON.Feature[] = [], access: GeoJSON.Feature[] = [];
    const stationPos = new Map(stations.features.map((f) => [`${f.properties!.system}:${f.properties!.id}`, f]));
    for (const a of alerts.data?.alerts ?? []) {
      if (a.kind !== "planned" && !a.reroute) continue;
      const sys = statics.find((s) => s.system === AGENCY[a.agency]);
      if (!sys) continue;
      const seen = new Set<string>();
      for (const stop of a.stops) {
        const key = `${sys.system}:${stationOf(sys.system, stop)}`;
        const st = stationPos.get(key);
        if (!st || seen.has(key)) continue;
        seen.add(key);
        if (a.kind === "planned") points.push({ type: "Feature", properties: { id: a.id, routes: ` ${a.routes.join(" ")} ` }, geometry: st.geometry });
      }
      for (const r of a.routes) {
        const c = shapeSlice(sys, r, a.stops);
        if (c) segs.push({ type: "Feature", properties: { id: a.id, route: r }, geometry: { type: "LineString", coordinates: c } });
      }
    }
    // Skipped stations (direction-aware): full cross when skipped both ways, half strike + label for one direction.
    const sub = statics.find((s) => s.system === "subway");
    if (sub) {
      for (const [id, c] of stationChanges(alerts.data?.alerts ?? [], sub)) {
        const st = stationPos.get(`subway:${id}`);
        if (!st || !c.skips.length) continue;
        const both = c.skips.some((k) => k.end === null);
        skips.push({ type: "Feature", properties: { ...st.properties, skipRoutes: ` ${[...new Set(c.skips.map((k) => k.route))].join(" ")} `, icon: both ? "transit-skip-x" : "transit-skip-half", label: both ? "Skipped" : `Skipped ${c.skips[0].toward}-bound`, alertId: c.skips[0].alertId }, geometry: st.geometry });
      }
    }
    const accessSeen = new Set<string>();
    for (const o of alerts.data?.outages ?? []) {
      for (const stop of o.stops) {
        const st = stationPos.get(`subway:${stationOf("subway", stop)}`);
        if (!st || accessSeen.has(String(st.properties!.id))) continue;
        accessSeen.add(String(st.properties!.id));
        access.push({ type: "Feature", properties: { ...st.properties }, geometry: st.geometry });
      }
    }
    const fc = (features: GeoJSON.Feature[]): GeoJSON.FeatureCollection => ({ type: "FeatureCollection", features });
    return { points: fc(points), segs: fc(segs), skips: fc(skips), access: fc(access) };
  }, [alerts.data, stations, staticKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Alert focus (#253): fly to the affected stretch, dim the rest, Back restores the camera.
  // A shuttle named by the alert replaces every other bus on the map.
  useEffect(() => {
    const routes = alertFocus?.replacement ?? [];
    const applied = setShuttleBuses(alertFocus?.id ?? null, routes);
    if (applied && routes.length && !busWanted) set("bus", true);
  }, [alertFocus, busWanted, set]);
  const alertGeo = useMemo(() => {
    const sub = statics.find((s) => s.system === "subway");
    return alertFocus && sub ? alertGeometry(alertFocus, sub) : null;
  }, [alertFocus, staticKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const alertFc = useMemo(() => {
    const fc = (features: GeoJSON.Feature[]): GeoJSON.FeatureCollection => ({ type: "FeatureCollection", features });
    const oneWay = alertFocus?.changes?.find((c) => c.kind === "skip" && c.toward)?.toward ?? null;
    const line = (coords: GeoJSON.Position[], route: string): GeoJSON.Feature => ({ type: "Feature", properties: { route, color: lineColorOf(route) }, geometry: { type: "LineString", coordinates: coords } });
    return {
      affected: fc((alertGeo?.affected ?? []).map((x) => line(x.coords, x.route))),
      reroute: fc((alertGeo?.reroute ?? []).map((x) => line(x.coords, alertFocus?.routes[0] ?? x.route))),
      skipped: fc((alertGeo?.skipped ?? []).map((x) => ({ type: "Feature", properties: { id: x.id, name: oneWay ? `${x.name} · ${oneWay}-bound skipped` : x.name, icon: oneWay ? "transit-skip-half" : "transit-skip-x" }, geometry: { type: "Point", coordinates: x.coord } }))),
      // Where a suspension ends: take the shuttle from here, or at least know the trains stop here.
      ends: fc((alertGeo?.ends ?? []).map((x) => {
        const bus = alertFocus?.replacement ?? [];
        const label = bus.length ? `Take the ${bus.join(" or ")} bus here` : `No ${alertFocus?.routes[0] ?? ""} past here`;
        return { type: "Feature", properties: { label }, geometry: { type: "Point", coordinates: x.coord } };
      })),
    };
  }, [alertGeo, alertFocus]);  
  const followedRef = useRef(followedKey);
  // A selected line's panel covers the top (phone) or right (desktop): frame alerts around it.
  const lineSelRef = useRef(false);
  lineSelRef.current = Boolean(lineSel);
  const walkingRef = useRef(walking);
  walkingRef.current = walking;
  const threeRef = useRef(three);
  threeRef.current = three;
  followedRef.current = followedKey;
  const savedCam = useRef<{ center: [number, number]; zoom: number; bearing: number; pitch: number } | null>(null);
  useEffect(() => {
    if (!map) return;
    const act = alertCameraAction({ hasBounds: Boolean(alertGeo?.bounds), hasFocus: Boolean(alertFocus), hasSaved: Boolean(savedCam.current), following: Boolean(followedRef.current) });
    if (act === "fit" && alertGeo?.bounds && walkingRef.current) {
      // Street view: the flat map framed on the notice; "Back to street view" resumes the walk.
      const wide = window.innerWidth >= 768;
      showView("map", null, null, { frame: { bounds: alertGeo.bounds, maxZoom: 15.5, padding: framePadding(map, lineSelRef.current ? (wide ? { top: 90, bottom: 120, left: 80, right: 460 } : { top: 140, bottom: 24, left: 30, right: 72 }) : wide ? { top: 90, bottom: 60, left: 440, right: 80 } : { top: 90, bottom: Math.round(window.innerHeight * 0.45), left: 30, right: 30 }) } });
    } else if (act === "fit" && alertGeo?.bounds) {
      if (!savedCam.current) { const c = map.getCenter(); savedCam.current = { center: [c.lng, c.lat], zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() }; }
      const wide = window.innerWidth >= 768;
      // A phone's line sheet sits at the bottom and is a map cover, so the map's own padding already clears it.
      map.fitBounds(alertGeo.bounds, { padding: framePadding(map, lineSelRef.current ? (wide ? { top: 90, bottom: 120, left: 80, right: 460 } : { top: 90, bottom: 24, left: 30, right: 72 }) : wide ? { top: 90, bottom: 60, left: 440, right: 80 } : { top: 90, bottom: Math.round(window.innerHeight * 0.45), left: 30, right: 30 }), maxZoom: 15.5, duration: 900, bearing: 0, pitch: 0 });
    } else if (act === "restore" && savedCam.current) {
      map.easeTo({ ...savedCam.current, duration: 700 });
      savedCam.current = null;
    } else if (act === "drop" && !alertFocus) {
      savedCam.current = null;
    }
  }, [map, alertGeo, alertFocus]);
  // The alert card owns the focus: once it leaves the panel (Back, Esc, another pick), clear it.
  const shownAlert = useRef<string | null>(null);
  useEffect(() => {
    if (!alertFocus) { shownAlert.current = null; return; }
    const want = `transit:alert:${alertFocus.id}`;
    if (content?.id === want) shownAlert.current = want;
    else if (shownAlert.current === want) setAlertFocus(null);
  }, [content?.id, alertFocus]);
  const openLines = useCallback(() => showPanel({ id: "transit:lines", title: "Lines", subtitle: "Tap a line for its trains and notices", details: <LinesDrawer />, snap: "half" }), [showPanel]);
  useEffect(() => {
    if (!enabled) return;
    setLinesControl(openLines);
    return () => setLinesControl(null);
  }, [enabled, openLines]);
  useEffect(() => {
    registerBusToggle((want) => {
      if (busOnRef.current === want) return false;
      set("bus", want);
      return true;
    });
    return () => registerBusToggle(null);
  }, [set]);

  const searchStations = useCallback<SearchProvider>(
    (q) => {
      const needle = q.trim().toLowerCase();
      if (needle.length < 2) return [];
      return stations.features
        .filter((f) => String(f.properties!.name).toLowerCase().includes(needle))
        .slice(0, 6)
        .map((f) => {
          const p = f.properties!;
          const system = p.system as SystemId;
          return {
            id: `transit:${system}:${p.id}`,
            label: `${p.name} (${system === "subway" ? p.routes : SYSTEM_LABELS[system]})`,
            kind: "Station",
            onSelect: () => {
              map?.flyTo({ center: (f.geometry as GeoJSON.Point).coordinates as [number, number], zoom: Math.max(map.getZoom(), 15) });
              openStation(system, String(p.id), String(p.name));
            },
          };
        });
    },
    [stations, map, openStation],
  );
  usePanelSearch("transit-stations", rail.length ? searchStations : null);

  // Targets: recompute estimated positions once a second (they are a function of time),
  // culled to the padded viewport and capped.
  const targets = useRef<Vehicle[]>([]);
  useEffect(() => {
    if (!map) return;
    const tick = () => {
      const now = Date.now() / 1000;
      // Street level: the viewport bounds at max zoom and pitch are a few metres
      // wide, so cull by distance from the walker instead.
      const eye = walking ? streetEye(map) : null;
      const b = map.getBounds();
      const padLon = (b.getEast() - b.getWest()) * 0.2, padLat = (b.getNorth() - b.getSouth()) * 0.2;
      const inView = eye
        ? (v: Vehicle) => metresApart(eye, v) <= STREET_RADIUS_M
        : (v: Vehicle) => v.lon > b.getWest() - padLon && v.lon < b.getEast() + padLon && v.lat > b.getSouth() - padLat && v.lat < b.getNorth() + padLat;
      const out: Vehicle[] = [];
      for (const s of rail) {
        const st = data[s]?.stat, lv = data[s]?.live;
        if (!st || !lv) continue;
        const held = s === "subway" ? heldTrains(lv) : undefined;
        for (const trip of lv.trips) {
          const est = estimateTrain(st, trip, now, liveProgress, s === "subway" ? history : undefined, { troubled: troubleRoutes.has(trip.route) || !!held?.has(trip.id) });
          const h = held?.get(trip.id);
          const v = est && s !== "subway" ? { ...est, grade: "grade" as const } : est && h ? { ...est, held: { since: h.since, stop: h.stop, stopped: h.stopped } } : est;
          if (v && (inView(v) || v.key === selectedKey || v.key === followedKey)) out.push(v);
        }
      }
      for (const bus of busRoutesRef.current.length ? focusedBuses(buses.data?.buses ?? [], [selectedKey, followedKey ?? undefined]) : []) {
        const v: Vehicle = { key: `bus:${bus.id}`, system: "bus", route: bus.route, label: bus.route, color: "#0039A6", lon: bus.lon, lat: bus.lat, bearing: bus.bearing ?? 0, grade: "grade", dir: bus.dir, nextStop: bus.next ?? undefined };
        if (inView(v) || v.key === selectedKey || v.key === followedKey) out.push(v);
      }
      const c = eye ?? { lon: map.getCenter().lng, lat: map.getCenter().lat };
      out.sort((a, z) => Math.hypot(a.lon - c.lon, a.lat - c.lat) - Math.hypot(z.lon - c.lon, z.lat - c.lat));
      targets.current = out.slice(0, MAX_VEHICLES);
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [map, rail.join(","), data, buses.data, selectedKey, followedKey, history, walking, show.routes, troubleRoutes]); // eslint-disable-line react-hooks/exhaustive-deps

  // What the draw loop needs from the latest render; assigned on every render below.
  const frame = useRef<FrameInputs | null>(null);
  const followSig = useRef("");
  // One pose per displayed vehicle. A fresh glide every update piled up and
  // fought the trip preview. A heading that flips almost backward waits out.
  const headingKey = useRef<string | null>(null);
  const headingHold = useRef({ bearing: 0, streak: 0 });
  const lastPosAt = useRef(0);
  /** The vehicle the flat follow camera has already framed once. */
  const followFramed = useRef<string | null>(null);
  // Positions go straight to MapLibre (GeoJSON source) and the three.js layer, never through
  // React state: a per-frame setState re-rendered this whole layer ~15 times a second (#365).
  const drawFrame = useCallback((list: Vehicle[]) => {
    const f = frame.current;
    const m = f?.map;
    if (!f || !m) return;
    const src = m.getSource<GeoJSONSource>("transit-vehicles");
    const fc = vehicleCollection(list, f.alerted, f.theme, f.followedKey);
    // Street level keeps only the nearby trains' bullets, so you can tell which line is passing.
    const walker = f.walking ? streetEye(m) : null;
    const bearing = m.getBearing();
    const near = walker ? { ...fc, features: fc.features.filter((x) => x.properties?.system === "subway" && x.geometry.type === "Point" && metresBetween(walker, x.geometry.coordinates) < STREET_TRAIN_M) } : fc;
    void src?.setData(f.hide ? EMPTY : near);
    // Street level empties the vehicle source of buses; the followed bus keeps its badge in its own source.
    void m.getSource<GeoJSONSource>("transit-followed-bus")?.setData({ type: "FeatureCollection", features: fc.features.filter((x) => x.properties?.followed === 1 && x.properties?.system === "bus") });
    if (f.three) {
      v3d.current?.update(
        list
          // The followed (boarded) train always draws, whatever its grade.
          .filter((v) => v.key === f.followedKey || v.grade !== "underground" || (f.xrayOn && (!walker || inStreetXray(walker, bearing, v.lon, v.lat))))
          .map((v) => {
            const ghost = v.grade === "underground";
            return { lon: v.lon, lat: v.lat, bearing: v.bearing, z: ghost ? XRAY_DEPTH_M : v.z ?? 0, color: v.color, kind: v.system === "bus" ? "bus" : v.system === "subway" ? "subway" : "rail", livery: v.system === "bus" ? busLivery(v.route) : undefined, ghost };
          }),
      );
    }
    // Follow: the card re-renders only when what it shows changes; the camera rides every frame.
    const fv = f.followedKey ? list.find((v) => v.key === f.followedKey) : undefined;
    const sig = fv ? [fv.key, fv.route, fv.grade, fv.nextStop, fv.eta, fv.stopped?.kind, fv.stopped?.stop].join("|") : "";
    if (sig !== followSig.current) {
      followSig.current = sig;
      setFollowedVehicle(fv);
    }
    if (!fv) { if (lastPosAt.current) { lastPosAt.current = 0; publishFollowPos(null); } return; }
    if (headingKey.current !== fv.key) {
      headingKey.current = fv.key;
      headingHold.current = stableHeading(null, fv.bearing, 0);
    } else {
      headingHold.current = stableHeading(headingHold.current.bearing, fv.bearing, headingHold.current.streak);
    }
    const nowMs = performance.now();
    if (nowMs - lastPosAt.current > 500) { lastPosAt.current = nowMs; publishFollowPos({ lon: fv.lon, lat: fv.lat, bearing: headingHold.current.bearing }); }
    // Your own zoom stays on top of the follow camera, in every mode.
    if (followZoomKey.current !== fv.key) { followZoomKey.current = fv.key; followZoom.current.reset(); }
    if (f.followMode === "map") {
      // Top-down and north up. One glide frames a new vehicle; after that the map stays
      // still and re-centres only when the vehicle nears the edge, never every frame.
      if (followFramed.current !== fv.key) {
        followFramed.current = fv.key;
        m.easeTo({ center: [fv.lon, fv.lat], zoom: fv.system === "bus" ? 15.5 : 14.8, pitch: 0, bearing: 0, duration: f.reducedMotion ? 0 : 800 });
        return;
      }
      keepInView(m, [fv.lon, fv.lat]);
      return;
    }
    followFramed.current = null;
    const { eye, look } = followRig(f.followMode, headingHold.current.bearing, fv.z ?? 0, window.innerWidth < 640);
    const at = (dx: number, dy: number) => new LngLat(fv.lon + dx / (111_320 * Math.cos((fv.lat * Math.PI) / 180)), fv.lat + dy / 111_320);
    const cam = m.calculateCameraOptionsFromTo(at(eye[0], eye[1]), eye[2], at(look[0], look[1]), look[2]);
    m.jumpTo(cam.zoom === undefined ? cam : { ...cam, zoom: followZoom.current.next(cam.zoom, m.getZoom()) });
  }, []);

  // Tween displayed positions and headings toward the targets (~15 fps).
  useEffect(() => {
    let raf = 0, last = 0;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      if (t - last < 66) return;
      last = t;
      const next = new Map<string, Vehicle>();
      const nowS = Date.now() / 1000;
      if (!busRoutesRef.current.length) busEst.current.retain(new Set());
      for (const v of shownVehicles(targets.current, busRoutesRef.current)) {
        if (v.system === "bus") {
          const f = busEst.current.frame(v.key.slice(4), nowS);
          if (f) { next.set(v.key, { ...v, lon: f.lon, lat: f.lat, bearing: f.bearing, alpha: f.alpha }); continue; }
        }
        const d = display.current.get(v.key);
        if (!d || Math.hypot(d.lon - v.lon, d.lat - v.lat) > 0.01) { next.set(v.key, v); continue; }
        let db = ((v.bearing - d.bearing + 540) % 360) - 180;
        if (Math.abs(db) > 150) db = 0; // shape end flip
        next.set(v.key, { ...v, lon: d.lon + (v.lon - d.lon) * 0.15, lat: d.lat + (v.lat - d.lat) * 0.15, bearing: (d.bearing + db * 0.2 + 360) % 360 });
      }
      display.current = next;
      drawFrame([...next.values()]);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [drawFrame]);

  // Dev-only: lets headless QA read the drawn vehicles.
  useEffect(() => {
    if (import.meta.env.DEV) Object.assign(window, { __vehicles: () => [...display.current.values()] });
  }, []);
  // 3D click targets only need ~1 Hz accuracy; re-tiling them every frame is wasted work.
  // Written straight to the source, like the vehicles themselves.
  useEffect(() => {
    if (!map || !three) return;
    const hits = () => map.getSource<GeoJSONSource>("transit-vehicle-hits");
    const id = window.setInterval(() => { void hits()?.setData({ type: "FeatureCollection", features: [...display.current.values()].map((v) => ({ type: "Feature", properties: { key: v.key, label: v.label, grade: v.grade, atStop: v.stopped ? 1 : 0 }, geometry: { type: "Point", coordinates: [v.lon, v.lat] } })) }); }, 1000);
    return () => { window.clearInterval(id); void hits()?.setData(EMPTY); };
  }, [map, three]);
  const theme = usePalette();
  // Street level: publish the drawn vehicles once a second for the mini map.
  useEffect(() => {
    if (!walking) { publishLiveDots([]); return; }
    const push = () => publishLiveDots(shownVehicles([...display.current.values()], busRoutesRef.current).map((v) => ({ key: v.key, lon: v.lon, lat: v.lat, color: v.system === "bus" ? theme.bus : v.color, bus: v.system === "bus", underground: v.grade === "underground", label: v.label })));
    push();
    const id = window.setInterval(push, 1000);
    return () => { window.clearInterval(id); publishLiveDots([]); };
  }, [walking, theme.bus]);
  const [hoverStation, setHoverStation] = useState("");
  const openStationId = content?.id.startsWith("transit:station:") ? content.id.split(":").pop() ?? "" : "";
  useEffect(() => {
    if (!map) return;
    const move = (e: MapLayerMouseEvent) => {
      const stationLayers = ["transit-station-raised", "transit-station"].filter((id) => map.getLayer(id));
      const f = stationLayers.length ? map.queryRenderedFeatures(e.point, { layers: stationLayers })[0] : undefined;
      setHoverStation(f?.properties?.system === "subway" ? String(f.properties.id) : "");
    };
    map.on("mousemove", move);
    return () => { map.off("mousemove", move); };
  }, [map]);
  const alerted = troubleRoutes;
  // The selected bus's route comes from the feed, not the animated positions, so it changes only with data.
  const busKey = followedKey?.startsWith("bus:") ? followedKey : selectedKey;
  const selBusId = show.routes.length && busKey?.startsWith("bus:") ? busKey.slice(4) : "";
  const selBusFeedRoute = selBusId ? buses.data?.buses.find((b) => b.id === selBusId)?.route : undefined;
  const selBusRoute = selBusFeedRoute && show.routes.some((r) => r.toUpperCase() === selBusFeedRoute.toUpperCase()) ? selBusFeedRoute : "";
  const busRoute = useBusRoute(selBusRoute || undefined);
  const busRouteFc = useMemo<GeoJSON.FeatureCollection>(() => {
    const features: GeoJSON.Feature[] = [];
    if (!show.routes.length) return { type: "FeatureCollection", features };
    const drawn = selBusRoute ? busRoute.data : undefined;
    if (drawn) {
      features.push(
        ...drawn.lines.map((l): GeoJSON.Feature => ({ type: "Feature", properties: { kind: "line", route: drawn.route }, geometry: { type: "LineString", coordinates: l } })),
        ...drawn.stops.map((st): GeoJSON.Feature => ({ type: "Feature", properties: { kind: "stop", name: formatStreetText(st.name) }, geometry: { type: "Point", coordinates: [st.lon, st.lat] } })),
      );
    }
    // The replacement shuttle, and a watched stop's routes, are drawn before a bus is tapped, so they have a road.
    if (show.why === "shuttle" || show.why === "watch") {
      for (const g of busShapes) {
        if (g.route === selBusRoute) continue;
        for (const l of g.lines) features.push({ type: "Feature", properties: { kind: "line", route: g.route }, geometry: { type: "LineString", coordinates: l } });
      }
    }
    return { type: "FeatureCollection", features };
  }, [busRoute.data, selBusRoute, show.why, show.routes.length, busShapes]);
  // 3D: one three.js custom layer in the map's canvas, loaded on first tilt.
  const entr = useRef<ReturnType<typeof entranceInstances>>([]);
  const bays = useRef<ReturnType<typeof viaductBays>>([]);
  useEffect(() => {
    const sub = statics.find((s) => s.system === "subway");
    bays.current = sub ? viaductBays(sub) : [];
    v3d.current?.setStructure(bays.current);
  }, [staticKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const v3d = useRef<ReturnType<typeof import("@/lib/map/threeLayer").createVehicleLayer> | null>(null);
  useEffect(() => {
    if (!map || !three) return;
    let cancelled = false;
    const ensure = () => {
      if (cancelled || !v3d.current || map.getLayer(v3d.current.layer.id)) return;
      try { map.addLayer(v3d.current.layer); } catch { /* style mid-swap; retried on the next styledata */ }
    };
    void import("@/lib/map/threeLayer").then(({ createVehicleLayer }) => {
      v3d.current ??= createVehicleLayer();
      v3d.current.setStructure(bays.current);
      v3d.current.setEntrances(entr.current);
      if (import.meta.env.DEV) Object.assign(window, { __v3d: v3d.current, __entr: entr });
      ensure();
    });
    map.on("styledata", ensure);
    return () => {
      cancelled = true;
      map.off("styledata", ensure);
      if (v3d.current && map.getLayer(v3d.current.layer.id)) map.removeLayer(v3d.current.layer.id);
    };
  }, [map, three]);
  // Street level: the 3D entrance kit within ~300 m of the camera; elevator entrances gray when out.
  const outKey = work.access.features.map((f) => String(f.properties?.id)).sort().join(",");
  const outStations = useMemo(() => new Set(outKey ? outKey.split(",") : []), [outKey]);
  const [entrLabels, setEntrLabels] = useState<GeoJSON.FeatureCollection>(EMPTY_FC);
  // Street labels may overlap only at eye level: raised overhead in street view, they stacked on each other.
  const [eyeLevel, setEyeLevel] = useState(false);
  useEffect(() => {
    if (!map) return;
    const sync = () => {
      const sub = statics.find((s) => s.system === "subway");
      const c = map.getCenter();
      // The tiles' street lines lay each stair along its curb when OpenStreetMap has no mapped steps for it.
      const read = walking && sub ? readMap(map) : null;
      entr.current = read && sub ? entranceInstances(sub, outStations, [c.lng, c.lat], 300, read.lines) : [];
      v3d.current?.setEntrances(entr.current);
      // A tap on a stair or elevator opens its station and next trains (owner, 2026-10-27).
      setPickTargets(entr.current.map((e) => ({ kind: "entrance" as const, id: e.id, lng: e.lon, lat: e.lat, h: 3, props: { name: e.name } })), "entrances");
      // Each nearby entrance's corner and kind.
      const phone = window.matchMedia("(max-width: 639px)").matches;
      // Overhead and close in, each nearby entrance says what it is, one-way or not, and its corner, not just "Stairs" (owner, 2026-10-27).
      const eye = walking && map.getPitch() >= EYE_PITCH;
      setEyeLevel(eye);
      const close = !eye && map.getZoom() >= ENTRANCE_LABEL_ZOOM;
      setEntrLabels(!sub ? EMPTY_FC
        : eye ? entranceLabels(sub, outStations, [c.lng, c.lat], (read ?? readMap(map)).placeAt, { max: phone ? 2 : 4, phone })
        : close ? entranceLabels(sub, outStations, [c.lng, c.lat], readMap(map).placeAt, { max: phone ? 4 : 8, phone, radiusM: 300, overhead: true })
        : EMPTY_FC);
      // Over the 3D storefronts and kiosks, which are added after it and would hide it.
      if (walking && map.getLayer("transit-entrance-label")) map.moveLayer("transit-entrance-label");
    };
    sync();
    map.on("moveend", sync);
    return () => { map.off("moveend", sync); setPickTargets([], "entrances"); };
  }, [map, walking, outStations, staticKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // X-ray: a station's insides through a dimmed ground; the camera tilts in so the 3D layer is on.
  const xrayId = useXray();
  const xrayData = useXrayData(Boolean(xrayId)).data;
  const xrayStation = useMemo(() => {
    const sub = statics.find((s) => s.system === "subway");
    const st = xrayId ? sub?.stations.features.find((f) => String(f.properties.id) === xrayId) : undefined;
    const inside = xrayId ? xrayData?.[xrayId] : undefined;
    if (!st || !inside) return null;
    const ents = (sub?.entrances?.features ?? []).filter((e) => String(e.properties.id) === xrayId).map((e) => e.geometry.coordinates as [number, number]);
    return { center: st.geometry.coordinates as [number, number], prims: xrayPrims(inside, ents, outStations.has(xrayId!)) };
  }, [xrayId, xrayData, outStations, staticKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!map || !xrayStation) return;
    map.easeTo({ center: xrayStation.center, zoom: Math.max(map.getZoom(), 17.3), pitch: Math.max(map.getPitch(), 55), duration: 800 });
  }, [map, xrayStation]);
  useEffect(() => {
    const push = () => v3d.current?.setXray(xrayStation?.center ?? null, xrayStation?.prims ?? []);
    push();
    const id = window.setTimeout(push, 1200); // the three layer loads on the first tilt
    return () => window.clearTimeout(id);
  }, [xrayStation, three]);
  // Underground trains draw in 3D only with X-ray on (their route bullets always show);
  // then they glow below a see-through ground and buildings, at every level.
  const xrayOn = useStreetXray();
  const flatVeilKey = useRef("");
  const [flatVeil, setFlatVeil] = useState(EMPTY);
  useEffect(() => {
    if (!map || three || !xrayOn) return;
    const sync = () => {
      const e = streetEye(map);
      const key = `${e.lon.toFixed(3)},${e.lat.toFixed(3)}`;
      if (key === flatVeilKey.current) return;
      flatVeilKey.current = key;
      setFlatVeil(xrayVeilDisc(e.lon, e.lat));
    };
    sync();
    map.on("moveend", sync);
    return () => {
      map.off("moveend", sync);
    };
  }, [map, three, xrayOn]);
  useEffect(() => {
    if (!map || !three || !xrayOn) { v3d.current?.setGroundVeil(null); return; }
    const sync = () => {
      const v = v3d.current;
      if (!v) return;
      // Draw after the city layers, whose pavement and walls would otherwise paint over the glow.
      // Station names and the followed bus badge stay above that vehicle layer.
      paintAboveVehicles(map, v.layer.id);
      const e = streetEye(map);
      // Street view sees a short way ahead; higher views keep the wider patch.
      v.setGroundVeil([e.lon, e.lat], walking ? STREET_XRAY_M : XRAY_VEIL_M);
    };
    sync();
    const late = window.setTimeout(sync, 1200); // the three layer loads on the first tilt
    map.on("move", sync);
    return () => { window.clearTimeout(late); map.off("move", sync); v3d.current?.setGroundVeil(null); };
  }, [map, three, walking, xrayOn]);

  // Follow mode: tap a train or bus (map or street level) and the camera rides along.
  const followMode = useFollowMode();
  // The follow mini map: the followed route's own track, and its next station.
  const followRoute = followed && followed.system !== "bus" ? `${followed.system}:${followed.route}` : "";
  const followTrack = useMemo<GeoJSON.FeatureCollection>(() => {
    const [sys, route] = followRoute.split(":");
    const st = statics.find((s) => s.system === sys);
    return { type: "FeatureCollection", features: st ? st.lines.features.filter((f) => String(f.properties.route) === route) : [] };
  }, [followRoute, staticKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const followStop = followed?.stopped?.kind === "at" ? followed.stopped.stop : followed?.nextStop;
  const followNext = followed ? (stopName(data, followed.system, followStop) ?? null) : null;
  const following = Boolean(followedKey);
  // X-ray matches the track under the train you boarded, and turns off when you step off.
  const followedUnder = followed ? followed.grade === "underground" : null;
  const wasFollowing = useRef(false);
  useEffect(() => {
    const next = xrayForFollow(wasFollowing.current, Boolean(followedKey), followedUnder);
    wasFollowing.current = Boolean(followedKey);
    if (next !== null) setStreetXray(next);
  }, [followedKey, followedUnder]);
  // Following leaves street level (one scene, the camera just moves) and stays flat: the follow camera is top-down.
  useEffect(() => {
    if (!following) return;
    if (walking) stopWalk();
    setTilted(false);
  }, [following]); // eslint-disable-line react-hooks/exhaustive-deps
  // Snapshot the view before the chase camera moves it. Stop following eases back here.
  useEffect(() => {
    if (!map || !followedKey) return;
    const c = map.getCenter();
    rememberFollowOrigin({ center: [c.lng, c.lat], zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() });
  }, [map, followedKey]);
  useEffect(() => {
    if (!map || followedKey) return;
    const back = takeFollowRestore();
    if (!back.restore) return;
    const c = map.getCenter();
    const cam = back.cam ?? { center: [c.lng, c.lat] as [number, number], zoom: Math.min(map.getZoom(), 13), bearing: 0, pitch: 0 };
    map.easeTo({ center: cam.center, zoom: cam.zoom, bearing: cam.bearing, pitch: cam.pitch, duration: reducedMotion ? 0 : 700 });
  }, [map, followedKey, reducedMotion]);
  useEffect(() => {
    if (!map || !following) return;
    // Esc and Back go through the panel slot (top panel first, then Follow).
    const stop = () => setFollowed(null);
    map.on("dragstart", stop);
    return () => { map.off("dragstart", stop); };
  }, [map, following]);
  usePanelMode("follow", following ? stopFollow : null);
  // Skip labels, station names, and the followed bus badge paint above the 3D vehicles.
  useEffect(() => {
    if (!map) return;
    const lift = () => paintAboveVehicles(map, v3d.current?.layer.id);
    // One check per frame, not one per move event.
    let raf = 0;
    const soon = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; lift(); }); };
    lift();
    map.on("move", soon);
    map.on("styledata", lift);
    return () => { if (raf) cancelAnimationFrame(raf); map.off("move", soon); map.off("styledata", lift); };
  }, [map]);

  const homeRef = useRef(home);
  homeRef.current = home;
  const followZoom = useRef(new ZoomKeeper());
  const followZoomKey = useRef<string | null>(null);
  const tapCycle = useRef(new TapCycle());
  const [choice, setChoice] = useState<{ at: [number, number]; choice: LineChoice } | null>(null);
  const closeChoice = useCallback(() => setChoice(null), []);
  // A chooser belongs to the view it was asked in: entering or leaving street view closes it.
  useEffect(() => setChoice(null), [walking]);
  // ...and so does any camera move (an answer, a flight) that takes the tapped spot off screen.
  useEffect(() => {
    if (!map || !choice) return;
    const check = () => {
      const p = map.project(choice.at);
      const { width, height } = map.getCanvas().getBoundingClientRect();
      if (p.x < 0 || p.y < 0 || p.x > width || p.y > height) setChoice(null);
    };
    map.on("moveend", check);
    return () => { map.off("moveend", check); };
  }, [map, choice]);
  const subwayRef = useRef<StaticSystem | undefined>(undefined);
  subwayRef.current = statics.find((s) => s.system === "subway");
  // A train or bus starts Follow. Any other map click, including empty map, drops it in place.
  useEffect(() => {
    if (!map) return;
    const onClick = (e: MapLayerMouseEvent) => {
      setChoice(null);
      const layers = TRANSIT_CLICK_LAYERS.filter((id) => map.getLayer(id));
      const all = layers.length ? map.queryRenderedFeatures(e.point, { layers }) : [];
      // Street view: a bus stop sign or a subway entrance under the tap, when no train or bus is.
      const kit = walkingRef.current && !all.length ? pickStreet(map, e.point.x, e.point.y) : null;
      if (kit?.kind === "busstop") { openBusStop(kit.lng, kit.lat, typeof kit.props.name === "string" ? kit.props.name : "Bus stop"); return; }
      if (kit?.kind === "entrance") { openStation("subway", kit.id, typeof kit.props.name === "string" ? kit.props.name : "Station"); return; }
      // A bullet in a station's route row: that station with only that line, even when a train sits on top.
      const label = all.find((h) => h.layer.id === "transit-station-label" && typeof h.properties?.row === "string" && h.properties.row);
      if (label?.geometry.type === "Point" && !(threeRef.current && label.properties.raised)) {
        const z = map.getZoom();
        const size = walkingRef.current ? 1.35 : z <= 13 ? 0.8 : z >= 17 ? 1 : 0.8 + ((z - 13) / 4) * 0.2;
        const route = rowBulletAt(String(label.properties.row), map.project(label.geometry.coordinates as [number, number]), e.point, size);
        if (route) {
          openStation("subway", String(label.properties.id), String(label.properties.name));
          setSelectedLine(lineOf(route));
          return;
        }
      }
      const f = tapCycle.current.next(e.point, all);
      if (f?.properties && (f.layer.id === "transit-skip" || f.layer.id === "transit-alert-skipped")) {
        const id = String(f.properties.id ?? "");
        if (!id) return;
        showPanel({ id: `transit:skip:${id}`, title: "Skipped", subtitle: String(f.properties.name ?? "Station"), details: <SkipDetails stationId={id} /> });
        setSnap("half");
        return;
      }
      const decision = followActionForMapClick(f?.properties ? { layerId: f.layer.id, key: f.properties.key } : null, followedRef.current);
      if (decision.action === "release") { stopFollowing(); return; }
      // Street view: a passing train or bus is one to board. The chase camera rides it; Get off walks again.
      if (walkingRef.current && decision.action === "start") {
        setDrawerOpen(false);
        setFollowMode("chase");
        setFollowed(decision.key);
        setBoardedOnFoot(true);
        return;
      }
      // Home: a subway train or a line opens that line instead of riding along.
      if (homeRef.current) {
        const key = decision.action === "start" ? decision.key : "";
        const train = key.startsWith("subway:") ? display.current.get(key) : undefined;
        if (train) { setSelectedLine(lineOf(train.route), key); return; }
        if (!f) {
          const lineLayers = ["transit-line", "transit-line-under"].filter((id) => map.getLayer(id));
          const pad = 8;
          const hits = lineLayers.length ? map.queryRenderedFeatures([[e.point.x - pad, e.point.y - pad], [e.point.x + pad, e.point.y + pad]], { layers: lineLayers }).filter((x) => x.properties?.system === "subway" && x.properties?.route) : [];
          // Where several lines meet, ask which one (src/features/transit/lineChoice.ts) instead of opening whichever is on top.
          const station = hits.length ? stationNear(map, e.point, { lon: e.lngLat.lng, lat: e.lngLat.lat }, subwayRef.current) : undefined;
          const pick = lineChoice(hits.map((x) => String(x.properties.route)), station);
          if (typeof pick === "string") { setSelectedLine(pick); return; }
          if (pick) { setChoice({ at: [e.lngLat.lng, e.lngLat.lat], choice: pick }); return; }
        }
      }
      if (decision.action === "start") {
        setDrawerOpen(false);
        setFollowMode("map");
        setFollowed(decision.key);
        return;
      }
      if (f?.properties) {
        // Entrances carry the station's GTFS id, so they open the same card.
        const system = (f.layer.id === "transit-entrance" ? "subway" : f.properties.system) as SystemId;
        openStation(system, String(f.properties.id), String(f.properties.name));
      }
      setFollowed(null);
    };
    map.on("click", onClick);
    return () => { map.off("click", onClick); };
  }, [map, openStation, openBusStop, setDrawerOpen, showPanel, setSnap]);

  // A basemap bus-stop icon shows its routes and next buses (transit features win).
  const busStopsShown = opts.busStops;
  useEffect(() => {
    if (!map || !busStopsShown) return;
    const onClick = (e: MapLayerMouseEvent) => {
      const layers = TRANSIT_CLICK_LAYERS.filter((id) => map.getLayer(id));
      if (layers.length && map.queryRenderedFeatures(e.point, { layers }).length) return;
      const stop = busStopAt(map, e.point);
      if (!stop) return;
      const { lng, lat } = e.lngLat;
      openBusStop(lng, lat, stop.name);
    };
    map.on("click", onClick);
    return () => { map.off("click", onClick); };
  }, [map, busStopsShown, openBusStop]);

  // Notices for alerts touching starred lines or stations (in-app + optional browser).
  const notified = useRef(new Set<string>());
  useEffect(() => {
    if (!alerts.data || !stars.starred.length) return;
    for (const a of alerts.data.alerts) {
      const sys = AGENCY[a.agency];
      if (!sys || a.kind === "notice" || notified.current.has(a.id)) continue;
      const hit = a.routes.some((r) => stars.isStarred(`${sys}:line:${r}`)) || a.stops.some((s) => stars.isStarred(`${sys}:station:${stationOf(sys, s)}`));
      if (!hit) continue;
      notified.current.add(a.id);
      toast(a.kind === "planned" ? "Planned work on a starred line" : "Delay on a starred line", { description: a.text });
      if (stars.notify && "Notification" in window && Notification.permission === "granted") new Notification("NYC transit", { body: a.text });
    }
  }, [alerts.data, stars]);

  useEffect(() => {
    registerRouteFollower((request) => {
      const pick = pickRouteVehicle([...display.current.values()], request);
      if (!pick) return false;
      setDrawerOpen(false);
      setSelectedLine(request.system === "subway" ? lineOf(request.route) : null, pick.key);
      setFollowMode("map");
      setFollowed(pick.key);
      return true;
    });
    return () => registerRouteFollower(null);
  }, [setDrawerOpen]);

  // "Follow a train" on the line panel: the tapped train, else the one nearest the map centre.
  const followLine = useCallback(() => {
    if (!map || !selected) return;
    const route = lineOf(selected.route);
    const shown = [...display.current.values()].filter((v) => v.system === "subway" && lineOf(v.route) === route);
    const c = map.getCenter();
    const pick = shown.find((v) => v.key === selected.train) ?? shown.sort((a, z) => Math.hypot(a.lon - c.lng, a.lat - c.lat) - Math.hypot(z.lon - c.lng, z.lat - c.lat))[0];
    if (!pick) { toast(`No ${route} train on the map right now`); return; }
    setDrawerOpen(false);
    setFollowMode("map");
    setFollowed(pick.key);
  }, [map, selected, setDrawerOpen]);
  // The line panel's arrow keys step between these trains and the stations (useLineKeys.ts).
  const trainsNow = useCallback(() => [...display.current.values()], []);
  // A line chosen from More layers that is not on screen: bring its whole length into view.
  useEffect(() => {
    if (!map || !lineSel || selected?.train) return;
    const sub = statics.find((s) => s.system === "subway");
    const shape = sub?.shapes[lineSel]?.c;
    if (!shape?.length) return;
    // Street level always goes to the flat map on the line: its tilted view "contains" half the city,
    // and framing it there left the line as a strip on the horizon (owner report, 2026-10-28).
    const street = walkingRef.current;
    const b = map.getBounds();
    if (!street && shape.some((p) => b.contains(p))) return;
    const xs = shape.map((p) => p[0]), ys = shape.map((p) => p[1]);
    // Frame it once the line panel is open, between the panel and the chat bar. Fitting first let the
    // panel's padding slide in afterwards and push the line's far end under the chat bar (owner report, 2026-10-25).
    const t = window.setTimeout(() => {
      const chatBar = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--chat-bar-h"), 10) || 0;
      const bounds: [[number, number], [number, number]] = [[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]];
      const padding = framePadding(map, { top: 140, bottom: Math.max(140, chatBar + 32), left: 40, right: 40 });
      // "Back to street view" then puts you back where you stood.
      if (street) showView("map", null, null, { frame: { bounds, padding, maxZoom: 15 } });
      else map.fitBounds(bounds, { padding, duration: 800, pitch: 0, bearing: 0 });
    }, 300);
    return () => window.clearTimeout(t);
  }, [map, lineSel, staticKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Route bullets stay on in every view but street level: symbols draw above the 3D
  // buildings, so a train is never lost behind a tower or under the ground when tilted.
  frame.current = { map, three, xrayOn, followedKey, followMode, reducedMotion, hide: Boolean(opts.stationsOnly), walking, alerted, theme };

  if (!enabled || (!rail.length && !busOn)) return null;

  // Street level: a station name, work wrench, skip or elevator badge is useful only near the walker; far ones
  // stood in a row on the horizon (owner report, 2026-10-29).
  const nearEye: unknown[] = walking && eyeAt ? [["<", ["distance", { type: "Point", coordinates: eyeAt }], STREET_LABEL_M]] : [];
  const brightRoutes = alertFocus ? alertFocus.routes : isoRoutes.length ? [...isoRoutes] : tripRoutes;
  const bright: unknown = ["in", ["get", "route"], ["literal", brightRoutes]];
  const trainAlpha: unknown = brightRoutes.length ? ["case", bright, 1, 0.15] : 1;
  // Zoomed out, a bullet per train buried the city in circles, and a dot per train still did
  // (owner canvas note, 2026-10-24): no trains until z11.5, then bullets. A picked line, an
  // alert's lines or the trip's lines keep their trains throughout, as dots and then bullets.
  const fadeIn = (alpha: unknown) => ["interpolate", ["linear"], ["zoom"], 11.5, brightRoutes.length ? ["case", bright, alpha, 0] : 0, 12.5, alpha] as unknown as number;
  const bulletAlpha = fadeIn(trainAlpha);
  const dotAlpha = (brightRoutes.length ? ["interpolate", ["linear"], ["zoom"], 11.5, ["case", bright, 1, 0], 12.5, 0] : 0) as unknown as number;
  const dimLines = (alertFocus || stationRoutes.length ? 0.12 : lineAlpha);
  // Isolated lines: their stations stay, the rest fade.
  const stationAlpha = (isoRoutes.length ? ["case", ["any", ...isoRoutes.map((r) => ["in", ` ${r} `, ["concat", " ", ["get", "routes"], " "]])], 1, 0.15] : 1) as number;
  // Underground dashes keep their width (#336); a selected line is drawn by its own layers, the others fade.
  const underAlpha = (lineSel ? ["case", ["in", ["get", "route"], ["literal", isoRoutes]], 0, 0.08] : stationRoutes.length ? 0.08 : 0.75) as number;
  // The selected line's trains read larger than the dimmed rest.
  const bulletScale = (lineSel ? ["case", ["in", ["get", "route"], ["literal", isoRoutes]], 1.3, 1] : 1) as unknown;
  // No line picked: match nothing. A legacy ["==", 1, 0] filter is a style error, and one
  // during load made MapView swap the whole basemap to the raster fallback.
  const onLine = (lineSel ? ["all", ["==", ["get", "system"], "subway"], ["in", ` ${lineSel} `, ["concat", " ", ["get", "routes"], " "]]] : ["boolean", false]) as never;
  // An open notice names its skipped stations itself (transit-alert-skipped): the line's own label skips them, so each name shows once.
  const namedByAlert = (alertGeo?.skipped ?? []).map((x) => String(x.id));
  const lineStopName = (namedByAlert.length ? ["all", onLine, ["!", ["in", ["to-string", ["get", "id"]], ["literal", namedByAlert]]]] : onLine) as never;
  return (
    <>
      {followed ? <FollowCard vehicle={followed} /> : null}
      {choice && map ? (
        <LineChooser map={map} at={choice.at} choice={choice.choice} onClose={closeChoice}
          onLine={(r) => { setChoice(null); setSelectedLine(r); }}
          onStation={() => { const st = choice.choice.station; setChoice(null); if (st) openStation("subway", st.id, st.name); }} />
      ) : null}
      {followed && followMode !== "map" && map ? <FollowMiniMap main={map} vehicle={followed} line={followTrack} nextName={followNext} /> : null}
      {lineSel && !followedKey ? <Suspense fallback={null}><LinePanel map={map} route={lineSel} onFollow={followLine} trains={trainsNow} /></Suspense> : null}
      <Source id="transit-lines" type="geojson" data={lines}>
        {/* X-ray on stays a solid glow. Off: solid too (owner, 2026-10-25: dashes read as a broken line), nearly as wide as the at-grade stroke, opacity 0.75. */}
        <Layer id="transit-line-under" type="line" filter={["==", ["get", "grade"], "underground"]} layout={{ "line-cap": "round", "line-join": "round" }}
          paint={xrayOn
            ? { "line-color": ["get", "color"], "line-width": ["interpolate", ["linear"], ["zoom"], 10, 2, 16, 6], "line-opacity": 0.95, "line-blur": 1 }
            : { "line-color": ["get", "color"], "line-width": ["interpolate", ["linear"], ["zoom"], 10, 2.4, 16, 5], "line-opacity": underAlpha }} />
        <Layer id="transit-line" type="line" filter={three ? ["==", ["get", "grade"], "grade"] : ["!=", ["get", "grade"], "underground"]}
          layout={{ "line-cap": "round", "line-join": "round" }}
          paint={{ "line-color": ["get", "color"], "line-width": ["interpolate", ["linear"], ["zoom"], 10, focus ? 3 : 2.6, 16, focus ? 5.8 : 5], "line-opacity": dimLines }} />
      </Source>
      <Source id="transit-line-picked-unused" type="geojson" data={picked.unused}>
        <Layer id="transit-line-picked-unused" type="line" layout={{ "line-cap": "round", "line-join": "round" }}
          paint={{ "line-color": ["get", "color"], "line-width": ["interpolate", ["linear"], ["zoom"], 10, 2.4, 16, 5], "line-opacity": 0.22 }} />
      </Source>
      <Source id="transit-line-picked" type="geojson" data={picked.used}>
        <Layer id="transit-line-picked" type="line" layout={{ "line-cap": "round", "line-join": "round" }}
          paint={{ "line-color": ["get", "color"], "line-width": ["interpolate", ["linear"], ["zoom"], 10, 3.2, 16, 6.5], "line-opacity": 1 }} />
      </Source>
      {/* A detour: white under the line's colour in dashes, so it reads as the same trains on another track. */}
      <Source id="transit-line-picked-detour" type="geojson" data={picked.detour}>
        <Layer id="transit-line-picked-detour-casing" type="line" layout={{ "line-cap": "round", "line-join": "round" }}
          paint={{ "line-color": "#ffffff", "line-width": ["interpolate", ["linear"], ["zoom"], 10, 5, 16, 9.5], "line-opacity": 0.95 }} />
        <Layer id="transit-line-picked-detour" type="line" layout={{ "line-join": "round" }}
          paint={{ "line-color": ["get", "color"], "line-width": ["interpolate", ["linear"], ["zoom"], 10, 3.2, 16, 6.5], "line-dasharray": [1.6, 1.1] }} />
      </Source>
      {xrayOn && !three ? (
        // Top-down X-ray: the ground and buildings fade so the tunnels below read through.
        <Source id="transit-xray-veil" type="geojson" data={flatVeil}>
          <Layer id="transit-xray-veil" type="fill" beforeId="transit-line-under" paint={{ "fill-color": "#0b1220", "fill-opacity": 0.15 }} />
        </Source>
      ) : null}
      {focus ? (
        <Source id={FOCUS_VEIL_ID} type="geojson" data={WORLD}>
          <Layer id={FOCUS_VEIL_ID} type="fill" beforeId="transit-line-under"
            paint={{ "fill-color": focusVeil(theme), "fill-opacity": FOCUS_OPACITY }} />
        </Source>
      ) : null}
      <Source id="transit-work-segs" type="geojson" data={work.segs}>
        {/* A picked line shows only its own planned work; other lines' repairs are noise there.
            Unpicked, repairs wait until street zoom: at city zoom the amber dashes read as dashed train lines (owner, 2026-10-25). */}
        <Layer id="transit-work-line" type="line" minzoom={lineSel ? 0 : 13} filter={(lineSel ? ["in", ["get", "route"], ["literal", isoRoutes]] : ["boolean", true]) as never}
          paint={{ "line-color": "#f59e0b", "line-width": ["interpolate", ["linear"], ["zoom"], 10, 2, 16, 6], "line-dasharray": [1, 1.5], "line-opacity": 0.85 }} />
      </Source>
      <Source id="transit-viaduct" type="geojson" data={three ? viaduct : EMPTY}>
        <Layer id="transit-viaduct" type="fill-extrusion" minzoom={13} filter={["any", ["get", "bridge"], ["<", ["zoom"], 15]]}
          paint={{ "fill-extrusion-color": ["get", "color"], "fill-extrusion-base": ["-", ["get", "top"], 1.2], "fill-extrusion-height": ["get", "top"], "fill-extrusion-opacity": 0.9 }} />
      </Source>
      <Source id="transit-piers" type="geojson" data={three ? piers : EMPTY}>
        <Layer id="transit-pier" type="fill-extrusion" minzoom={14} maxzoom={15}
          paint={{ "fill-extrusion-color": "#6b7280", "fill-extrusion-base": 0, "fill-extrusion-height": ["-", ["get", "top"], 1.2], "fill-extrusion-opacity": 0.9 }} />
      </Source>
      <Source id="transit-stations" type="geojson" data={stations}>
        <Layer id="transit-station" type="circle" minzoom={13}
          {...(three ? { filter: ["!=", ["get", "raised"], true] as ["!=", ["get", "raised"], true] } : {})}
          paint={{ "circle-color": "#ffffff", "circle-stroke-color": "#6b6a66", "circle-stroke-width": 1, "circle-radius": ["interpolate", ["linear"], ["zoom"], 13, 2, 14, 2.5, 16, 4], "circle-opacity": stationAlpha, "circle-stroke-opacity": stationAlpha }} />
        {three ? (
          // The white station dot is the click target. On a viaduct it has to sit with the label, or the tap lands on the street underneath.
          <Layer id="transit-station-raised" type="circle" minzoom={14}
            filter={["==", ["get", "raised"], true]}
            paint={{ "circle-color": "#ffffff", "circle-stroke-color": "#6b6a66", "circle-stroke-width": 1, "circle-radius": ["interpolate", ["linear"], ["zoom"], 14, 2.5, 16, 4], "circle-pitch-alignment": "viewport", "circle-translate-anchor": "viewport", "circle-translate": [0, -RAISED_LIFT_PX], "circle-opacity": stationAlpha, "circle-stroke-opacity": stationAlpha }} />
        ) : null}
        {/* Name + route bullets: hubs from z14, every station from z15, or the hovered / open one at any zoom.
            Collision detection drops overlapping labels so they never pile up. */}
        <Layer id="transit-station-label" type="symbol" minzoom={11}
          filter={["all", ["==", ["get", "system"], "subway"], ...nearEye, ...(lineSel ? [["!", onLine]] : []), ["any", ["all", [">=", ["zoom"], 15], ["==", ["get", "labelled"], true]], ["all", [">=", ["zoom"], 14], ["==", ["get", "major"], true], ["==", ["get", "labelled"], true]], ["==", ["get", "id"], hoverStation], ["==", ["get", "id"], openStationId]]] as never}
          layout={{ "icon-image": ["get", "row"], "icon-size": walking ? 1.35 : ["interpolate", ["linear"], ["zoom"], 13, 0.8, 17, 1], "icon-anchor": "top",
            // At eye level the camera is nearly flat, so collision boxes squash together and would drop the name; only the walker's nearby stations draw, so let them overlap.
            "text-allow-overlap": eyeLevel, "icon-allow-overlap": eyeLevel, "text-pitch-alignment": "viewport",
            "icon-offset": (three ? ["case", ["get", "raised"], ["literal", [0, -RAISED_LIFT_PX]], ["literal", [0, 6]]] : [0, 6]) as [number, number],
            "text-field": ["get", "name"], "text-font": ["Noto Sans Bold"], "text-size": walking ? 15 : 11, "text-anchor": "bottom",
            "text-offset": (three ? ["case", ["get", "raised"], ["literal", [0, -RAISED_LIFT_EM]], ["literal", [0, -0.6]]] : [0, -0.6]) as [number, number], "text-max-width": 9,
            "symbol-sort-key": ["case", ["any", ["==", ["get", "id"], hoverStation], ["==", ["get", "id"], openStationId]], 0, 1] }}
          paint={{ "text-color": theme.dark ? "#f2f1ed" : "#111111", "text-halo-color": theme.land, "text-halo-width": 1.6 }} />
        {/* Selected line (#370): its stations ringed and named at every zoom. */}
        <Layer id="transit-line-stop" type="circle" minzoom={9} filter={onLine} layout={{ visibility: lineSel ? "visible" : "none" }}
          paint={{ "circle-color": "#0e1726", "circle-stroke-color": "#ffffff", "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 10, 1.5, 15, 3], "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 3, 15, 7], "circle-pitch-alignment": "map" }} />
        <Layer id="transit-line-stop-name" type="symbol" minzoom={10} filter={lineStopName} layout={{ visibility: lineSel ? "visible" : "none",
            "text-field": ["get", "name"], "text-font": ["Noto Sans Bold"], "text-size": 12, "text-anchor": "right", "text-offset": [-1.1, 0], "text-optional": true, "text-max-width": 12, "text-pitch-alignment": "viewport" }}
          paint={{ "text-color": "#e2e8f0", "text-halo-color": "rgba(14,23,38,0.85)", "text-halo-width": 2.5 }} />
      </Source>
      <Source id="transit-entrance-labels" type="geojson" data={entrLabels}>
        {/* Street level: the corner first, then stairs, elevator or escalator, over the nearest entrances. */}
        <Layer id="transit-entrance-label" type="symbol"
          layout={{ "text-field": ["get", "label"], "text-font": ["Noto Sans Bold"], "text-size": 14, "text-anchor": "bottom",
            // Above the stair's railing: a near stair stands tall on screen, a far one short.
            "text-offset": eyeLevel ? ["interpolate", ["linear"], ["get", "d"], 5, ["literal", [0, -7]], 20, ["literal", [0, -4]], 60, ["literal", [0, -2]], 180, ["literal", [0, -1]]] as unknown as [number, number] : [0, -1.3],
            // Overhead the labels give way to each other; at street level the nearest few always show.
            "text-max-width": 16, "text-line-height": 1.25, "text-pitch-alignment": "viewport", "text-allow-overlap": eyeLevel, "symbol-sort-key": ["get", "d"] }}
          paint={{ "text-color": "#ffffff", "text-halo-color": "rgba(14,23,38,0.95)", "text-halo-width": 3 }} />
      </Source>
      <Source id="transit-entrances" type="geojson" data={entrances}>
        {/* Overhead: a badge saying stairs, elevator or escalator, named when close. Street level: the 3D kit draws it.
            The circle is only the tap target, bigger than the badge so it is easy to hit (owner, 2026-10-27). */}
        <Layer id="transit-entrance" type="circle" minzoom={16}
          paint={{ "circle-color": "#16a34a", "circle-radius": walking ? 14 : ["interpolate", ["linear"], ["zoom"], 16, 9, 19, 18], "circle-opacity": 0.01 }} />
        {walking ? null : (
          <Layer id="transit-entrance-icon" type="symbol" minzoom={16} filter={["!", ["in", "assage", ["get", "kind"]]] as never}
            layout={{ "icon-image": ["case",
                ["in", "levator", ["get", "kind"]], ["case", ["in", ["get", "id"], ["literal", [...outStations]]], "transit-entr-elevator-out", "transit-entr-elevator"],
                ["in", "scalator", ["get", "kind"]], "transit-entr-escalator", "transit-entr-stair"],
              "icon-size": ["interpolate", ["linear"], ["zoom"], 16, 0.55, 19, 1], "icon-allow-overlap": true,
              // Stairs, elevators and escalators get the fuller label (transit-entrance-label: kind, one-way, corner);
              // only an entrance through a building is named on its badge.
              "text-field": ["step", ["zoom"], "", 17.5, ["case", ["in", "asement", ["get", "kind"]], "Through a building", ""]],
              "text-font": ["Noto Sans Bold"], "text-size": 12, "text-anchor": "left", "text-offset": [1.3, 0], "text-optional": true }}
            paint={{ "text-color": theme.dark ? "#f2f1ed" : "#14532d", "text-halo-color": theme.land, "text-halo-width": 1.6 }} />
        )}
      </Source>
      <Source id="transit-work-points" type="geojson" data={work.points}>
        <Layer id="transit-work" type="symbol" minzoom={11} filter={["all", lineSel ? ["in", ` ${lineSel} `, ["get", "routes"]] : ["boolean", true], ...nearEye] as never}
          layout={{ "icon-image": "transit-wrench", "icon-size": ["interpolate", ["linear"], ["zoom"], 11, 0.35, 16, 0.6], "icon-offset": [18, -18], "icon-allow-overlap": true }} />
      </Source>
      <Source id="transit-skips" type="geojson" data={work.skips}>
        <Layer id="transit-skip" type="symbol" minzoom={11} filter={["all", lineSel ? ["in", ` ${lineSel} `, ["get", "skipRoutes"]] : ["boolean", true], ...nearEye] as never}
          layout={{ "icon-image": ["get", "icon"], "icon-size": ["interpolate", ["linear"], ["zoom"], 11, 0.5, 16, 0.9], "icon-allow-overlap": true, "icon-ignore-placement": true,
            "icon-offset": [18, -18],
            "text-field": ["step", ["zoom"], "", 13.5, ["get", "label"]], "text-font": ["Noto Sans Bold"], "text-size": 11, "text-anchor": "left", "text-offset": [1.1, 0], "text-optional": true }}
          paint={{ "text-color": "#d4183d", "text-halo-color": theme.land, "text-halo-width": 1.6 }} />
      </Source>
      {alertFocus ? (
        <>
          <Source id="transit-alert-veil" type="geojson" data={WORLD}>
            <Layer id="transit-alert-veil" type="fill" beforeId="transit-line-under" paint={{ "fill-color": focusVeil(theme), "fill-opacity": 0.55 }} />
          </Source>
          {alertGeo?.suspended ? (
            // No trains on this stretch (owner report, 2026-10-25): the line is cut under the replacement
            // shuttle and thin dashes ride on top, so both the broken link and the bus read.
            <Source key="gap" id="transit-alert-affected" type="geojson" data={alertFc.affected}>
              <Layer id="transit-alert-gap" type="line" beforeId="transit-bus-route-line" layout={{ "line-cap": "butt", "line-join": "round" }}
                paint={{ "line-color": theme.land, "line-width": ["interpolate", ["linear"], ["zoom"], 10, 6, 16, 12] }} />
              <Layer id="transit-alert-affected" type="line" layout={{ "line-cap": "butt", "line-join": "round" }}
                paint={{ "line-color": ["get", "color"], "line-width": ["interpolate", ["linear"], ["zoom"], 10, 2, 16, 4], "line-dasharray": [1.2, 1.6], "line-opacity": 0.9 }} />
            </Source>
          ) : (
            <Source key="bar" id="transit-alert-affected" type="geojson" data={alertFc.affected}>
              <Layer id="transit-alert-affected" type="line" layout={{ "line-cap": "round", "line-join": "round" }}
                paint={{ "line-color": ["get", "color"], "line-width": ["interpolate", ["linear"], ["zoom"], 10, 5, 16, 11], "line-opacity": 0.95 }} />
            </Source>
          )}
          <Source id="transit-alert-ends" type="geojson" data={alertFc.ends}>
            <Layer id="transit-alert-end" type="symbol"
              layout={{ "text-field": ["get", "label"], "text-font": ["Noto Sans Bold"], "text-size": 12, "text-anchor": "top", "text-offset": [0, 1.1], "text-allow-overlap": true, "text-max-width": 14 }}
              paint={{ "text-color": theme.dark ? "#7dd3fc" : "#0369a1", "text-halo-color": theme.land, "text-halo-width": 2 }} />
          </Source>
          <Source id="transit-alert-reroute" type="geojson" data={alertFc.reroute}>
            <Layer id="transit-alert-reroute" type="line" layout={{ "line-join": "round" }}
              paint={{ "line-color": ["get", "color"], "line-width": ["interpolate", ["linear"], ["zoom"], 10, 3, 16, 7], "line-dasharray": [1.4, 1.2] }} />
          </Source>
          <Source id="transit-alert-skipped" type="geojson" data={alertFc.skipped}>
            <Layer id="transit-alert-skipped" type="symbol"
              layout={{ "icon-image": ["get", "icon"], "icon-size": ["interpolate", ["linear"], ["zoom"], 10, 0.6, 16, 1], "icon-allow-overlap": true, "icon-ignore-placement": true,
                "icon-offset": [18, -18],
                // With a line picked, the notice's own ring tags name each skip and its direction (LinePanel); a second name here overlapped them.
                "text-field": lineSel ? "" : ["get", "name"], "text-font": ["Noto Sans Bold"], "text-size": 11, "text-anchor": "left", "text-offset": [1.2, 0], "text-optional": true }}
              paint={{ "text-color": theme.dark ? "#f2f1ed" : "#111111", "text-halo-color": theme.land, "text-halo-width": 1.6 }} />
          </Source>
        </>
      ) : null}
      <Source id="transit-access" type="geojson" data={work.access}>
        <Layer id="transit-access" type="symbol" minzoom={14} filter={["all", ["boolean", true], ...nearEye] as never}
          layout={{ "icon-image": "transit-access", "icon-size": ["interpolate", ["linear"], ["zoom"], 14, 0.45, 16, 0.6], "icon-offset": [-18, -18], "icon-allow-overlap": true }} />
      </Source>
      {/* Data is written by the hit-target timer, never from render. */}
      <Source id="transit-vehicle-hits" type="geojson" data={EMPTY}>
        <Layer id="transit-vehicle-hit" type="circle" filter={["!=", ["get", "atStop"], 1]} paint={{ "circle-radius": 14, "circle-opacity": 0, "circle-pitch-alignment": "map" }} />
        {/* In 3D a dwelling train's tap target lifts with its bullet; flat, it stays on the track with it. */}
        <Layer id="transit-vehicle-hit-stop" type="circle"
          filter={three ? ["all", ["==", ["get", "atStop"], 1], ["!=", ["get", "grade"], "elevated"]] : ["==", ["get", "atStop"], 1]}
          paint={{ "circle-radius": 14, "circle-opacity": 0, "circle-pitch-alignment": "viewport", "circle-translate-anchor": "viewport", "circle-translate": [0, three ? -STOP_LIFT_PX : 0] }} />
        {three ? (
          <Layer id="transit-vehicle-hit-raised" type="circle"
            filter={["all", ["==", ["get", "atStop"], 1], ["==", ["get", "grade"], "elevated"]]}
            paint={{ "circle-radius": 14, "circle-opacity": 0, "circle-pitch-alignment": "viewport", "circle-translate-anchor": "viewport", "circle-translate": [0, -(RAISED_LIFT_PX + STOP_LIFT_PX)] }} />
        ) : null}
      </Source>
      <Source id="transit-bus-route" type="geojson" data={busRouteFc}>
        <Layer id="transit-bus-route-line" type="line" filter={["==", ["get", "kind"], "line"]} layout={{ "line-cap": "round", "line-join": "round" }}
          paint={{ "line-color": home ? "#0ea5e9" : theme.bus, "line-width": home ? 8 : ["interpolate", ["linear"], ["zoom"], 11, 2.5, 16, 5], "line-opacity": 0.85 }} />
        <Layer id="transit-bus-route-stop" type="circle" filter={["==", ["get", "kind"], "stop"]}
          paint={{ "circle-radius": home ? 7 : ["interpolate", ["linear"], ["zoom"], 11, 2, 16, 4.5], "circle-color": home ? "#0e1726" : "#ffffff", "circle-stroke-color": home ? "#ffffff" : theme.bus, "circle-stroke-width": home ? 3 : 1.5 }} />
        <Layer id="transit-bus-route-stop-name" type="symbol" minzoom={15} filter={["==", ["get", "kind"], "stop"]}
          layout={{ "text-field": ["get", "name"], "text-size": 10, "text-font": ["Noto Sans Regular"], "text-offset": [0, 1], "text-anchor": "top", "text-optional": true }}
          paint={{ "text-color": theme.label_, "text-halo-color": theme.land, "text-halo-width": 1.5 }} />
      </Source>
      {/* Data is written by the draw loop (drawFrame), never from render. */}
      <Source id="transit-vehicles" type="geojson" data={EMPTY}>
        {/* Rail (LIRR, Metro-North) keeps heading arrows. */}
        <Layer id="transit-vehicle-2d" type="symbol"
          filter={["in", ["get", "system"], ["literal", ["lirr", "mnr"]]]}
          layout={{ "icon-image": "transit-arrow", "icon-rotate": ["get", "bearing"], "icon-rotation-alignment": "map", "icon-allow-overlap": true, "icon-size": ["interpolate", ["linear"], ["zoom"], 10, 0.45, 16, 0.9] }}
          paint={{ "icon-color": ["get", "color"], "icon-halo-color": "#111827", "icon-halo-width": 1, "icon-opacity": ["case", ["==", ["get", "grade"], "underground"], 0.55, 1] }} />
        {/* Subway trains zoomed out: a small dot in the line's colour. */}
        <Layer id="transit-train-dot" type="circle" maxzoom={12.5} filter={["==", ["get", "system"], "subway"]}
          paint={{ "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 2, 12, 3.5], "circle-color": ["get", "color"], "circle-stroke-color": "#ffffff", "circle-stroke-width": 1,
            "circle-opacity": dotAlpha, "circle-stroke-opacity": dotAlpha }} />
        {/* Subway trains: route bullets with a heading notch on the rim. */}
        <Layer id="transit-bullet-notch" type="symbol" filter={["==", ["get", "system"], "subway"]}
          layout={{ "icon-image": NOTCH_ICON, "icon-rotate": ["get", "bearing"], "icon-rotation-alignment": "map", "icon-allow-overlap": true, "icon-ignore-placement": true,
            "icon-size": ["interpolate", ["linear"], ["zoom"], 10, 0.5, 16, 0.8],
            "icon-offset": (three ? tagOffset(26) : trainIconOffset(false, 26)) as [number, number] }}
          paint={{ "icon-opacity": bulletAlpha }} />
        <Layer id="transit-bullet" type="symbol" filter={["==", ["get", "system"], "subway"]}
          layout={{ "icon-image": ["get", "bullet"], "icon-allow-overlap": true, "icon-ignore-placement": true,
            // Elevated trains float above the viaduct; in 3D the tag sits above the box. A train at a station lifts clear of the name.
            "icon-offset": (three ? tagOffset(0) : trainIconOffset(false, 0)) as [number, number], "icon-size": ["interpolate", ["linear"], ["zoom"], 10, ["*", bulletScale, 0.55], 14, ["*", bulletScale, 0.75], 17, ["*", bulletScale, 0.95]] as unknown as number }}
          paint={{ "icon-opacity": fadeIn(["*", trainAlpha, ["case", ["==", ["get", "grade"], "underground"], xrayOn ? 1 : 0.7, 1]]) }} />
        {/* A held train: "Held 4 min" beside its bullet, from the live feed alone. */}
        <Layer id="transit-held" type="symbol" filter={["all", ["==", ["get", "system"], "subway"], ["!=", ["get", "held"], ""]]}
          layout={{ "text-field": ["get", "held"], "text-font": ["Noto Sans Bold"], "text-size": 11, "text-anchor": "left", "text-allow-overlap": true, "text-ignore-placement": true,
            "text-offset": ["case", ["==", ["get", "atStop"], 1], ["literal", [1.3, three ? -STOP_LIFT_PX / 11 : 0]], ["literal", [1.3, 0]]] as unknown as [number, number] }}
          paint={{ "text-color": "#f59e0b", "text-halo-color": "#111827", "text-halo-width": 1.5, "text-opacity": bulletAlpha }} />
        {/* Buses: SQUARE badges, so they never read as round subway bullets. Zoomed out
            only the borough prefix (all shown, so each heading notch has its badge); from z15 or for the
            selected route the badge widens to the full route. Every bus always draws: collision detection
            hid them as you zoomed in, right when you wanted to tap one (owner report, 2026-10-24).
            A borough filter keeps the count down, so the badge matches a subway bullet. */}
        <Layer id="transit-bus-notch" type="symbol" filter={["all", ["==", ["get", "system"], "bus"], ["!=", ["get", "followed"], 1]]}
          layout={{ "icon-image": NOTCH_ICON, "icon-rotate": ["get", "bearing"], "icon-rotation-alignment": "map", "icon-allow-overlap": true, "icon-ignore-placement": true,
            "icon-size": busIconSize("notch"), "icon-offset": [0, -17] }}
          paint={{ "icon-opacity": ["interpolate", ["linear"], ["zoom"], 12.5, 0, 13.5, ["*", 0.8, ["get", "alpha"]]] }} />
        <Layer id="transit-bus-badge" type="symbol" maxzoom={15} filter={["all", ["==", ["get", "system"], "bus"], ["!=", ["get", "route"], selBusRoute], ["!=", ["get", "followed"], 1]]}
          layout={{ "icon-image": ["get", "badge"], "icon-allow-overlap": true, "icon-ignore-placement": true, "icon-size": busIconSize("prefix") }}
          paint={{ "icon-opacity": ["*", selBusRoute ? 0.4 : 0.85, ["get", "alpha"]] }} />
        <Layer id="transit-bus-badge-full" type="symbol" minzoom={15} filter={["all", ["==", ["get", "system"], "bus"], ["!=", ["get", "route"], selBusRoute], ["!=", ["get", "followed"], 1]]}
          layout={{ "icon-image": ["get", "badgeFull"], "icon-allow-overlap": true, "icon-ignore-placement": true, "icon-padding": 1, "icon-size": busIconSize("full") }}
          paint={{ "icon-opacity": ["*", selBusRoute ? 0.45 : 1, ["get", "alpha"]] }} />
        <Layer id="transit-bus-badge-selected" type="symbol" filter={["all", ["==", ["get", "system"], "bus"], ["==", ["get", "route"], selBusRoute], ["!=", ["get", "followed"], 1]]}
          layout={{ "icon-image": ["get", "badgeFull"], "icon-allow-overlap": true, "symbol-sort-key": 1, "icon-size": busIconSize("selected") }}
          paint={{ "icon-opacity": ["get", "alpha"] }} />
      </Source>
      {/* Street level empties the vehicle source. This one stays, so the followed bus keeps its badge. */}
      {/* Data is written by the draw loop (drawFrame), never from render. */}
      <Source id="transit-followed-bus" type="geojson" data={EMPTY}>
        <Layer id="transit-bus-badge-follow" type="symbol" filter={["==", ["get", "followed"], 1]}
          layout={{ "icon-image": ["get", "badgeFull"], "icon-allow-overlap": true, "icon-ignore-placement": true, "icon-offset": [0, -42],
            "icon-size": busIconSize("selected") }}
          paint={{ "icon-opacity": ["get", "alpha"] }} />
      </Source>
    </>
  );
}
