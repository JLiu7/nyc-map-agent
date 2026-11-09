import "@/components/task-screens.css";
import { useFlag } from "@/lib/flags";
import { ExitTask } from "./ExitTask";
import { setUndergroundNow } from "@/lib/underground/whereNow";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpFromLine, MessageSquare, TrainFront, X } from "lucide-react";
import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { startSharing, useSharedLocation } from "@/lib/geo/sharedLocation";
import { getMapInstance, onMapInstance } from "@/lib/map/mapInstance";
import { useMapState } from "@/lib/store/MapStateContext";
import { useActiveTrip } from "@/lib/transit/activeTrip";
import type { StreetUnit } from "@/lib/transit/equipment";
import { useFollowed } from "@/lib/transit/follow";
import { setStationHelp, setStationHelpVisible } from "@/lib/underground/stationHelp";
import { LANDMARKS } from "@/lib/map/landmarks";
import { SurfaceCalibration } from "./SurfaceCalibration";
import { SURFACE_CAL_MS, disagreementTrigger, lateOpenTrigger, movementCorrection, openedAfterTrip } from "./surface";
import { angleDiff } from "./exits";
import { compassWord } from "@/lib/map/stairs";
import { arrowState, calibrate, correctedHeading, describePrompt, facingTracksHeading, headingJumped, landmarkLine, pickLandmarks, signText, trainCue, type Calibration } from "./cues";
import { ageLabel, bearing, compassAgrees, exitKind, headingFromMovement, metres, nearestStation, turnHint, type Pt, type Station, type SubwayStatic } from "./exits";
import { initialDetector, stepDetector } from "./motion";
import { canUndo, riding, stepGetOff, type GetOff, type GetOffEvent } from "./getoff";
import { cacheStationTiles, probe, readMap, registerOfflineWorker, watchCompass, watchMotion } from "./offline";
import { buildStore, loadStore, outageLabel, packFor, saveStore, tripStops, walkFromExit, type ExitPack, type PackExit, type PackStore } from "./pack";
import { atChoices, estimate, fromLive, onMotionStop, startProgress, userAt, type Ask, type LiveTrip, type Progress } from "./progress";
import { accuracyWorsened, boardingStation, endedVisits, loadDeclined, promptStale, saveDeclined, stationAtEntrance, stationToAsk } from "./prompt";
import { enqueue, isConnected, markFailed, markSent, nextDue, type Queued } from "./queue";
import { CalibrationStep, ExitPointer, PlatformMap } from "./steps";
import { useT } from "@/lib/i18n/appLang";
import { usePanel } from "@/lib/store/PanelContext";
import { setSelectedLine, useSelectedLine } from "@/lib/transit/selectedLine";
import { whereYouAre } from "./where";
import { dirStep, initialDir, justSurfaced, nextStationAhead, plannedExit, wrongDirectionLine, wrongExit } from "./wrongTrain";
import { useDataView } from "@/lib/store/DataViewContext";
import { speakQueued } from "@/lib/voice/tts";
import { useCssHeight } from "@/lib/useCssHeight";
import { useBasemapReady } from "@/lib/map/basemapReady";

type Mode = "idle" | "ride" | "which" | "station" | "calibrate" | "stairs" | "landmark" | "corner" | "walk";

const QUEUE_KEY = "nyc-map:underground:queue";
const MODE_KEY = "nyc-map:underground:mode";
const read = <T,>(k: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(k);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};
const write = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* storage blocked: kept for this session only */
  }
};

/** navigator.onLine plus what our own requests saw (onLine lies on flaky and captive networks). */
function useConnectivity() {
  const [nav, setNav] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  const [seen, setSeen] = useState<{ ok: number | null; fail: number | null }>({ ok: null, fail: null });
  useEffect(() => {
    const up = () => setNav(true);
    const down = () => setNav(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);
  const report = useCallback((ok: boolean) => setSeen((s) => (ok ? { ...s, ok: Date.now() } : { ...s, fail: Date.now() })), []);
  return { online: isConnected({ navigatorOnLine: nav, lastOkAt: seen.ok, lastFailAt: seen.fail }), navOnline: nav, report };
}

/** Map centre and zoom, updated when the camera settles. */
function useMapCenter(): { at: Pt; zoom: number } | null {
  const [c, setC] = useState<{ at: Pt; zoom: number } | null>(null);
  useEffect(() => {
    let off: (() => void) | null = null;
    const unsub = onMapInstance((map) => {
      off?.();
      off = null;
      if (!map) return;
      const r = () => {
        const m = map.getCenter();
        setC({ at: [m.lng, m.lat], zoom: map.getZoom() });
      };
      r();
      map.on("moveend", r);
      off = () => map.off("moveend", r);
    });
    return () => {
      off?.();
      unsub();
    };
  }, []);
  return c;
}

const SRC = "underground-exits";
const LAYERS = ["underground-you", "underground-walk", "underground-train", "underground-exits-dot", "underground-exits-best", "underground-exits-label"];
/** Station, every exit with its corner name, the chosen one highlighted, and the train's direction. Works on cached tiles offline. */
function drawOnMap(map: MapLibreMap, pack: ExitPack, chosen: number, walk: Pt[] | null, you: Pt | null): void {
  const [lon, lat] = pack.station.at;
  const features: GeoJSON.Feature[] = pack.exits.map((e, i) => ({
    type: "Feature",
    properties: { best: i === chosen ? 1 : 0, label: signText(e.streets, e.corner)?.replace(/^Exit · /, "") ?? `Exit ${i + 1}` },
    geometry: { type: "Point", coordinates: e.at },
  }));
  // The walk from the chosen exit to where they are going, like the video's route to the entrance (#418).
  if (walk && walk.length >= 2) features.unshift({ type: "Feature", properties: { walk: 1 }, geometry: { type: "LineString", coordinates: walk } });
  // From you to the chosen exit, once your shared location puts you at this station.
  const exitAt = pack.exits[chosen]?.at;
  if (you && exitAt) features.unshift({ type: "Feature", properties: { you: 1 }, geometry: { type: "LineString", coordinates: [you, exitAt] } });
  if (pack.trackBearing !== null) {
    // A 60 m arrow shaft through the station along the train's direction.
    const r = (pack.trackBearing * Math.PI) / 180;
    const kx = 111_320 * Math.cos((lat * Math.PI) / 180);
    const d = (m: number): Pt => [lon + (Math.sin(r) * m) / kx, lat + (Math.cos(r) * m) / 111_320];
    features.push({ type: "Feature", properties: { train: 1 }, geometry: { type: "LineString", coordinates: [d(-30), d(30)] } });
  }
  const data: GeoJSON.FeatureCollection = { type: "FeatureCollection", features };
  if (!map.isStyleLoaded()) return;
  const src = map.getSource<GeoJSONSource>(SRC);
  if (src) return void src.setData(data);
  map.addSource(SRC, { type: "geojson", data });
  map.addLayer({ id: LAYERS[0], type: "line", source: SRC, filter: ["==", ["get", "you"], 1], layout: { "line-cap": "round" }, paint: { "line-color": "#16a34a", "line-width": 5, "line-opacity": 0.9, "line-dasharray": [0.1, 1.8] } });
  map.addLayer({ id: LAYERS[1], type: "line", source: SRC, filter: ["==", ["get", "walk"], 1], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#2563eb", "line-width": 5, "line-opacity": 0.9, "line-dasharray": [0.1, 1.8] } });
  map.addLayer({ id: LAYERS[2], type: "line", source: SRC, filter: ["==", ["get", "train"], 1], paint: { "line-color": "#0f172a", "line-width": 5, "line-opacity": 0.6 } });
  map.addLayer({ id: LAYERS[3], type: "circle", source: SRC, filter: ["==", ["geometry-type"], "Point"], paint: { "circle-radius": 6, "circle-color": "#ffffff", "circle-stroke-color": "#0f172a", "circle-stroke-width": 2 } });
  map.addLayer({ id: LAYERS[4], type: "circle", source: SRC, filter: ["==", ["get", "best"], 1], paint: { "circle-radius": 9, "circle-color": "#16a34a", "circle-stroke-color": "#ffffff", "circle-stroke-width": 3 } });
  map.addLayer({
    id: LAYERS[5],
    type: "symbol",
    source: SRC,
    filter: ["==", ["geometry-type"], "Point"],
    layout: { "text-field": ["get", "label"], "text-size": 12, "text-offset": [0, 1.3], "text-anchor": "top", "text-font": ["Noto Sans Regular"] },
    paint: { "text-color": "#0f172a", "text-halo-color": "#ffffff", "text-halo-width": 1.5 },
  });
}
function clearMap(map: MapLibreMap | null): void {
  if (!map?.style) return;
  for (const id of LAYERS) if (map.getLayer(id)) map.removeLayer(id);
  if (map.getSource(SRC)) map.removeSource(SRC);
}

/** The exit as the station signs show it; never compass words of our own. */
function exitName(e: PackExit, i: number, n: number): string {
  return signText(e.streets, e.corner) ?? `Exit ${i + 1} of ${n} (${exitKind(e.kind)}; street names were not saved)`;
}

const card = "task-panel task-bottom text-sm";

/**
 * Underground help: station exits and the ride there, from data saved on the
 * phone before the signal goes. It never uses GPS underground; trip progress
 * is the last confirmed station plus an honest, widening estimate.
 */
export default function Underground() {
  const t = useT();
  const home = useFlag("agentHome");
  const { online, navOnline, report } = useConnectivity();
  const trip = useActiveTrip();
  const followed = useFollowed();
  const center = useMapCenter();
  const shared = useSharedLocation();
  const { seedChat, setChatOpen, chatOpen } = useMapState();
  const [store, setStore] = useState<PackStore | null>(() => loadStore());
  const [mode, setModeRaw] = useState<Mode>(() => read<Mode>(MODE_KEY, "idle"));
  const setMode = (m: Mode) => {
    setModeRaw(m);
    write(MODE_KEY, m === "calibrate" || m === "stairs" || m === "landmark" || m === "corner" || m === "walk" ? "station" : m);
  };
  const [stationId, setStationId] = useState<string | null>(() => read<string | null>(`${MODE_KEY}:station`, null));
  const [chosen, setChosen] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [more, setMore] = useState(false);
  // The station you said you are at ("I'm here"); your word wins over a stale fix underground.
  const [confirmed, setConfirmed] = useState<string | null>(null);
  const { closeAll, content: panelContent } = usePanel();
  const line = useSelectedLine();

  useEffect(() => {
    setStationHelpVisible(mode !== "idle");
    return () => setStationHelpVisible(false);
  }, [mode]);

  // One-time "Are you in the station?" (above ground only).
  const [ask, setAsk] = useState<Station | null>(null);
  const [declined, setDeclined] = useState<Set<string>>(() => loadDeclined());
  const asked = useRef(new Map<string, Pt>());
  const baseline = useRef<number | null>(null);
  const [nearStation, setNearStation] = useState<Station | null>(null);

  // Ride progress, motion stops, and "Did you get off at…?".
  const [progress, setProgress] = useState<Progress | null>(null);
  const [getOff, setGetOff] = useState<GetOff>(riding);
  const sendGetOff = (e: GetOffEvent) => setGetOff((s) => stepGetOff(s, e));
  const [motionAsk, setMotionAsk] = useState<Ask>(null);
  const [motionOn, setMotionOn] = useState<"off" | "on" | "unavailable">("off");
  const stopMotion = useRef<(() => void) | null>(null);
  const detector = useRef(initialDetector());

  // Compass: only after a platform calibration, and above ground only when it agrees with walking.
  const [raw, setRaw] = useState<number | null>(null);
  const [cal, setCal] = useState<Calibration | null>(null);
  const [interfered, setInterfered] = useState(false);
  const [pointerSeen, setPointerSeen] = useState(false);
  const [waitingCompass, setWaitingCompass] = useState(false);
  const lastRaw = useRef<{ deg: number; at: number } | null>(null);
  const stopCompass = useRef<(() => void) | null>(null);
  const fixes = useRef<Array<{ at: Pt; accuracy: number | null }>>([]);
  const [moveHeading, setMoveHeading] = useState<number | null>(null);

  // "Describe what you see", queued while offline.
  const [describe, setDescribe] = useState<string | null>(null);

  // Above-ground calibration: offered by a banner, sensors only from a tap.
  const [surface, setSurface] = useState<"off" | "banner" | "open">("off");
  const [surfaceCal, setSurfaceCal] = useState<Calibration | null>(null);
  const surfaceDismissed = useRef(false);
  const gps = useRef<{ lastAt: number | null; gapMs: number | null; recoveredAt: number | null }>({ lastAt: null, gapMs: null, recoveredAt: null });
  const surfaceFixes = useRef<Array<{ t: number; at: Pt; accuracy: number | null }>>([]);
  const disagreeSamples = useRef<Array<{ t: number; compass: number; movement: number }>>([]);
  const [openedStore] = useState(() => loadStore());
  const [queue, setQueue] = useState<Queued[]>(() => read<Queued[]>(QUEUE_KEY, []));

  useEffect(() => registerOfflineWorker(), []);
  useEffect(() => write(`${MODE_KEY}:station`, stationId), [stationId]);
  useEffect(() => write(QUEUE_KEY, queue), [queue]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), cal || getOff.kind === "confirmed" ? 1000 : 15_000);
    return () => clearInterval(t);
  }, [cal, getOff.kind]);
  useEffect(
    () => () => {
      stopCompass.current?.();
      stopMotion.current?.();
      clearMap(getMapInstance());
    },
    [],
  );

  // Static data: same query key as the transit feature, so subway.json is fetched once (and the worker keeps it).
  const mapShown = useBasemapReady();
  const { data: sys } = useQuery({
    queryKey: ["transit", "static", "subway"],
    queryFn: async () => (await (await fetch("/transit/subway.json")).json()) as SubwayStatic,
    staleTime: Infinity,
    enabled: mapShown,
  });
  const { data: units = [] } = useQuery({
    queryKey: ["underground", "equipment"],
    queryFn: async () => ((await (await fetch("/transit/equipment.json")).json()) as { units: StreetUnit[] }).units,
    staleTime: Infinity,
  });

  const subwayTrip = !!trip?.legs.some((l) => l.kind === "ride" && (l.mode ?? "subway") === "subway");
  const nearby = useMemo(() => (sys && center && center.zoom >= 15 ? nearestStation(sys, center.at) : null), [sys, center]);
  const stops = useMemo(() => (sys && trip && subwayTrip ? tripStops(sys, trip) : []), [sys, trip, subwayTrip]);

  // On a subway trip: the wrong direction, or coming up at another exit (then the walk is planned again from there).
  const { setRoutePoint, setFollowingRoute } = useDataView();
  const dir = useRef(initialDir);
  const accuracies = useRef<Array<number | null>>([]);
  const [tripWarn, setTripWarn] = useState<string | null>(null);
  // The round map buttons step above the warning, as they do above other bottom cards.
  const warnCard = useCssHeight("--task-bottom-h");
  useEffect(() => { dir.current = initialDir; accuracies.current = []; setTripWarn(null); }, [trip?.id]);
  useEffect(() => {
    const c = shared.status === "on" ? shared.coords : null;
    if (!sys || !trip || stops.length < 2 || !c) return;
    const here: Pt = [c.lon, c.lat];
    const acc = shared.accuracy ?? null;
    accuracies.current = [...accuracies.current.slice(-20), acc];
    const wasWrong = dir.current.wrong;
    dir.current = dirStep(dir.current, stops[0].at, stops[stops.length - 1].at, here, acc);
    if (dir.current.wrong && !wasWrong) {
      const route = trip.legs.find((l) => l.kind === "ride" && (l.mode ?? "subway") === "subway")?.route;
      const next = route && dir.current.travel !== null ? nextStationAhead(sys, route, here, dir.current.travel) : null;
      setTripWarn(wrongDirectionLine(dir.current.travel, next?.name ?? null));
    } else if (wasWrong && !dir.current.wrong) setTripWarn(null);
    else if (dir.current.boarded && justSurfaced(accuracies.current) && metres(here, stops[stops.length - 1].at) < 600 && wrongExit(plannedExit(trip), here) !== null) {
      setRoutePoint("start", { lon: c.lon, lat: c.lat });
      setRoutePoint("end", { lon: trip.destination.at[0], lat: trip.destination.at[1] });
      setFollowingRoute(true);
      setTripWarn(`You came up at a different exit. New walk to ${trip.destination.label}.`);
    }
  }, [shared]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!tripWarn || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    try { speakQueued(window.speechSynthesis, tripWarn, () => {}); } catch { /* no voice: the line still shows */ }
  }, [tripWarn]);
  // The warning owns the bottom of the map like the station view: the home's task row steps aside.
  useEffect(() => setStationHelpVisible(mode !== "idle" || tripWarn !== null), [mode, tripWarn]);

  const persist = (s: PackStore | null) => {
    saveStore(s);
    setStore(s);
  };
  /** Cache each station area's basemap tiles and record the size per station in its pack. */
  const saveTiles = async (s: PackStore) => {
    const sizes = new Map<string, { count: number; bytes: number; at: number }>();
    for (const p of s.packs) {
      const r = await cacheStationTiles(getMapInstance(), [p.station.at, ...p.exits.map((e) => e.at)]);
      if (r) sizes.set(p.station.id, { count: r.tiles, bytes: r.bytes, at: Date.now() });
    }
    if (!sizes.size) return;
    setStore((cur) => {
      if (!cur) return cur;
      const next = { ...cur, packs: cur.packs.map((p) => (sizes.has(p.station.id) ? { ...p, tiles: sizes.get(p.station.id) } : p)) };
      saveStore(next);
      return next;
    });
  };

  // Prefetch: a subway trip on screen, while online → exit packs for every station it gets off at.
  useEffect(() => {
    if (!sys || !trip || !subwayTrip || !online) return;
    const s = buildStore(sys, units, { trip, near: null, ...readMap(getMapInstance()), status: store?.status ?? null });
    if (s) {
      persist(s);
      void saveTiles(s);
    }
    // store.status is carried over, not a trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sys, units, trip, subwayTrip, online]);

  // Outage status: refreshed opportunistically when online; the probe also tells us whether we really are.
  useEffect(() => {
    if (mode === "idle" && !store) return;
    let alive = true;
    const tick = async () => {
      if (!navOnline) return report(false);
      const r = await probe<{ at: number; outages: Array<{ id: string }> }>();
      if (!alive) return;
      report(r.ok);
      if (r.ok && r.body) {
        const status = { at: (r.body.at ?? Date.now() / 1000) * 1000, out: r.body.outages.map((o) => o.id) };
        setStore((s) => {
          const next = s ? { ...s, status } : s;
          saveStore(next);
          return next;
        });
      }
    };
    void tick();
    const t = setInterval(() => void tick(), 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [mode, navOnline, report, store === null]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live feed for the followed train while riding; a newer tap still wins (fromLive).
  useEffect(() => {
    if (mode !== "ride" || !online || !followed?.startsWith("subway:")) return;
    const id = followed.slice("subway:".length);
    let alive = true;
    const tick = async () => {
      const r = await probe<{ at: number; trips: Array<{ id: string; stops: LiveTrip["stops"]; at?: string }> }>("/api/transit/subway");
      if (!alive) return;
      report(r.ok);
      const t = r.body?.trips.find((x) => x.id === id);
      if (t && r.body) setProgress((p) => (p ? fromLive(p, { stops: t.stops, atStop: t.at }, r.body!.at * 1000, Date.now()) : p));
    };
    void tick();
    const t = setInterval(() => void tick(), 30_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [mode, online, followed, report]);

  // Send queued "what I see" questions when the connection is really back (online event + retry).
  // One check at a time: the clock ticks every second while calibrating, and a check can take
  // 6 s, so without this the same question went out once per tick.
  const sending = useRef<string | null>(null);
  useEffect(() => {
    const due = nextDue(queue, online, now);
    if (!due || sending.current) return;
    sending.current = due.id;
    void probe().then((r) => {
      sending.current = null;
      report(r.ok);
      if (r.ok) {
        seedChat(due.text);
        setChatOpen(true);
        setQueue((q) => markSent(q, due.id));
      } else setQueue((q) => markFailed(q, due.id, Date.now()));
    });
  }, [queue, online, now, report, seedChat, setChatOpen]);

  // Signals for the one-time question: GPS is read only while not underground.
  const here: Pt | null = mode === "idle" && shared.status === "on" && shared.coords ? [shared.coords.lon, shared.coords.lat] : null;
  const accuracy = shared.status === "on" ? (shared.accuracy ?? null) : null;
  useEffect(() => {
    if (mode !== "idle" || !sys) return;
    for (const id of endedVisits(asked.current, here)) asked.current.delete(id);
    if (here && !accuracyWorsened(baseline.current, accuracy)) {
      if (accuracy !== null) baseline.current = Math.min(baseline.current ?? accuracy, accuracy);
      const st = stationAtEntrance(sys, here);
      setNearStation((prev) => (prev?.id === st?.id ? prev : st));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shared, mode, sys]);
  // Any fix will do here, even a poor one below ground: a stale question is worse than none.
  const anyHere: Pt | null = shared.status === "on" && shared.coords ? [shared.coords.lon, shared.coords.lat] : null;
  useEffect(() => {
    if (promptStale(ask, anyHere)) setAsk(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shared, ask]);
  useEffect(() => {
    if (mode !== "idle" || ask) return;
    const st = stationToAsk({ nearStation, online, baselineAccuracy: baseline.current, accuracy, here, boarding: boardingStation(trip), asked: new Set(asked.current.keys()), declined });
    if (!st) return;
    asked.current.set(st.id, st.at);
    setAsk(st);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nearStation, online, shared, trip, declined, mode, ask]);

  const pack = packFor(store, stationId);
  const exit = pack?.exits[chosen] ?? null;
  // Before pointing at an exit, check you are at this station (your shared location, or your "I'm here").
  const me: Pt | null = shared.status === "on" && shared.coords ? [shared.coords.lon, shared.coords.lat] : null;
  const nearMe = useMemo(() => (sys && me ? nearestStation(sys, me, 400) : null), [sys, me?.[0], me?.[1]]); // eslint-disable-line react-hooks/exhaustive-deps
  const where = home && pack ? whereYouAre({ station: pack.station, exitAt: exit?.at ?? null, shared, confirmed: confirmed === pack.station.id, nearest: nearMe }) : undefined;
  const you = where?.kind === "here" ? where.from : null;
  const youKey = you ? `${you[0].toFixed(5)},${you[1].toFixed(5)}` : "";
  // Tell the agent where the person is underground, so "which exit?" or "where am I?" has an answer.
  const exitSign = exit ? signText(exit.streets, exit.corner) ?? `Exit ${chosen + 1}` : null;
  useEffect(() => {
    const stage = mode === "ride" ? "riding" : mode === "idle" ? null : "at-station";
    setUndergroundNow(stage && pack ? { stage, station: pack.station.name, exit: exitSign } : null);
  }, [mode, pack?.station.name, exitSign]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => setUndergroundNow(null), []);
  const dest = store?.destination ?? null;
  const target = exit && dest ? bearing(exit.at, dest.at) : null;

  // Exits on the map; offline it draws on the station area's saved tiles (pinch zoom works as usual).
  useEffect(() => {
    let clear: (() => void) | undefined;
    const unsubscribe = onMapInstance((map) => {
      clear?.();
      if (!map) return;
      const show = !!pack && mode !== "idle" && mode !== "ride" && mode !== "which";
      const walk = show && pack.exits[chosen] ? walkFromExit(store, pack, pack.exits[chosen].at) : null;
      const draw = () => {
        if (show) drawOnMap(map, pack, chosen, walk, you);
        else clearMap(map);
      };
      // The style can be mid-load or swapped by a view change; once the map settles, put the exits back if they went missing.
      const ensure = () => { if (show && !map.getSource(SRC)) draw(); };
      draw();
      map.on("idle", ensure);
      clear = () => { map.off("idle", ensure); clearMap(map); };
    });
    return () => { unsubscribe(); clear?.(); };
  }, [pack, mode, chosen, store, youKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!home || mode !== "station" || !pack) return;
    return onMapInstance((map) => {
      const to = pack.exits[chosen]?.at;
      // Once you are placed at the station, frame you and your exit; otherwise the station.
      if (map && you && to) map.fitBounds([[Math.min(you[0], to[0]), Math.min(you[1], to[1])], [Math.max(you[0], to[0]), Math.max(you[1], to[1])]], { padding: { top: 300, bottom: 200, left: 60, right: 90 }, maxZoom: 18, pitch: 0, bearing: 0, duration: 600 });
      else map?.easeTo({ center: pack.station.at, zoom: 17, pitch: 0, bearing: 0, offset: [0, 100], duration: 600 });
    });
  }, [home, mode, pack?.station.id, chosen, !!you]); // eslint-disable-line react-hooks/exhaustive-deps

  // The safety line stays with the pointer for its first 10 seconds.
  useEffect(() => {
    if (!cal || pointerSeen) return;
    const t = setTimeout(() => setPointerSeen(true), 10_000);
    return () => clearTimeout(t);
  }, [cal, pointerSeen]);

  // Above ground after the facing check: the first ~12 m of walking give the heading.
  useEffect(() => {
    if (mode !== "walk" || shared.status !== "on" || !shared.coords) return;
    fixes.current.push({ at: [shared.coords.lon, shared.coords.lat], accuracy });
    const h = headingFromMovement(fixes.current);
    if (h !== null) setMoveHeading(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shared, mode]);
  useEffect(() => {
    if (mode !== "walk" || moveHeading === null) return;
    getMapInstance()?.easeTo({ bearing: compassAgrees(raw, moveHeading) && raw !== null ? raw : moveHeading, duration: 300 });
  }, [mode, moveHeading, raw]);

  const startCompass = async (): Promise<boolean> => {
    if (stopCompass.current) return true;
    const stop = await watchCompass((deg) => {
      const t = Date.now();
      if (deg !== null && headingJumped(lastRaw.current, { deg, at: t })) setInterfered(true);
      lastRaw.current = deg === null ? null : { deg, at: t };
      setRaw(deg === null ? null : Math.round(deg));
    });
    stopCompass.current = stop;
    return !!stop;
  };
  const stopAllCompass = () => {
    stopCompass.current?.();
    stopCompass.current = null;
    setRaw(null);
    setCal(null);
  };

  // ---------- above-ground calibration (late open, or no platform calibration) ----------
  const aboveGround = mode === "idle" || mode === "walk";
  const fix: Pt | null = shared.status === "on" && shared.coords ? [shared.coords.lon, shared.coords.lat] : null;
  useEffect(() => {
    if (!aboveGround || !fix) return;
    const t = Date.now();
    const g = gps.current;
    const good = accuracy === null || accuracy <= 50;
    if (good) {
      if (g.lastAt !== null && t - g.lastAt >= 60_000) {
        g.gapMs = t - g.lastAt;
        g.recoveredAt = t;
      }
      g.lastAt = t;
    }
    // Heading from the last ~20 s of good walking fixes; trusted over the compass when they disagree.
    surfaceFixes.current = [...surfaceFixes.current.filter((f) => t - f.t < 20_000), { t, at: fix, accuracy }];
    const move = headingFromMovement(surfaceFixes.current, 12, 20);
    if (move !== null && raw !== null) {
      const corrected = surfaceCal ? correctedHeading(surfaceCal, raw, t, SURFACE_CAL_MS) : null;
      const c = corrected ?? raw;
      disagreeSamples.current = [...disagreeSamples.current.filter((s) => t - s.t < 15_000), { t, compass: c, movement: move }];
      if (movementCorrection(c, move).disagree) setSurfaceCal(calibrate(move, raw, t));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shared, aboveGround]);
  useEffect(() => {
    if (!aboveGround || surface !== "off" || ask) return;
    const g = gps.current;
    const t = Date.now();
    const offeredKey = "nyc-map:underground:surface-offered";
    const firstOpen = openedAfterTrip(openedStore?.savedAt ?? null, !!openedStore?.destination && !!openedStore.packs.length, read<number | null>(offeredKey, null) === openedStore?.savedAt, t);
    const reason = lateOpenTrigger({
      gpsGapMs: g.gapMs,
      recoveredAgoMs: g.recoveredAt === null ? null : t - g.recoveredAt,
      entranceM: fix && sys ? (stationAtEntrance(sys, fix, 150) ? 0 : null) : null,
      compassDisagrees: disagreementTrigger(disagreeSamples.current, t),
      firstOpenAfterTrip: mode === "idle" && firstOpen,
      dismissed: surfaceDismissed.current,
    });
    if (!reason) return;
    if (reason === "after-subway-trip") write(offeredKey, openedStore?.savedAt ?? null);
    setSurface("banner");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shared, now, aboveGround, surface, ask, sys]);
  // While the above-ground correction is fresh, the map turns with the corrected compass.
  useEffect(() => {
    if (!aboveGround || raw === null || !surfaceCal) return;
    const h = correctedHeading(surfaceCal, raw, Date.now(), SURFACE_CAL_MS);
    const m = getMapInstance();
    if (h === null || !m || Math.abs(angleDiff(m.getBearing(), h)) < 4) return;
    m.jumpTo({ bearing: h });
  }, [raw, surfaceCal, aboveGround]);
  const closeSurface = () => {
    surfaceDismissed.current = true;
    setSurface("off");
    if (!surfaceCal && mode === "idle") {
      stopCompass.current?.();
      stopCompass.current = null;
      setRaw(null);
    }
  };
  const surfaceLines = useMemo(() => (surface === "open" ? [...readMap(getMapInstance()).lines, ...(store?.packs.flatMap((p) => p.sketch) ?? [])] : []), [surface, store]);

  const showStation = (id: string) => {
    setStationId(id);
    setChosen(0);
    setMore(false);
    setMode("station");
  };

  /** "I'm in the station" or Yes: switch to the exit list (and the ride, on a subway trip). Never tracks. */
  const enterStation = (at?: Pt, stationOnly = false) => {
    setAsk(null);
    const near = at ?? nearby?.at ?? center?.at ?? null;
    if (sys && (!store || (!trip && online))) {
      const s = buildStore(sys, units, { trip: subwayTrip ? trip : null, near, ...readMap(getMapInstance()), status: store?.status ?? null });
      if (s) {
        persist(s);
        if (online) void saveTiles(s);
      }
    }
    if (!stationOnly && stops.length && sys) {
      const here = near ? stops.reduce((b, s, i) => (metres(s.at, near) < metres(stops[b].at, near) ? i : b), 0) : 0;
      setProgress(startProgress(stops, Date.now(), here));
      setMode("ride");
      return;
    }
    const st = near && sys ? nearestStation(sys, near) : null;
    if (st) showStation(st.id);
    else if (store?.packs[0]) showStation(store.packs[0].station.id);
  };
  // The home's Find exit button opens the same station view as "I'm in the station".
  const openStationHelp = (id?: string) => {
    const st = id && sys ? sys.stations.features.find((f) => String(f.properties.id) === id) : null;
    if (st && sys) {
      const near = st.geometry.coordinates as Pt;
      if (!packFor(store, id!)) {
        const next = buildStore(sys, units, { trip: null, near, ...readMap(getMapInstance()), status: store?.status ?? null });
        if (next) persist({ ...next, destination: store?.destination ?? null, packs: [...(store?.packs ?? []), ...next.packs] });
      }
      showStation(id!);
    } else enterStation(undefined, true);
  };
  const enterRef = useRef(openStationHelp);
  enterRef.current = openStationHelp;
  useEffect(() => {
    setStationHelp((id) => enterRef.current(id));
    return () => setStationHelp(null);
  }, []);

  const answerNo = () => {
    if (!ask) return;
    const next = new Set(declined).add(ask.id);
    saveDeclined(next);
    setDeclined(next);
    setAsk(null);
  };

  const leave = () => {
    stopAllCompass();
    stopMotion.current?.();
    stopMotion.current = null;
    setMotionOn("off");
    fixes.current = [];
    setMoveHeading(null);
    setProgress(null);
    setMotionAsk(null);
    setGetOff(riding());
    setStationId(null);
    setConfirmed(null);
    setMode("idle");
  };

  // One thing at a time (#361): opening station help closes the place and line panels under it,
  // and tapping a place or a line afterwards closes station help.
  const helpUp = home && mode !== "idle" && mode !== "ride";
  useEffect(() => {
    if (!helpUp) return;
    closeAll();
    setSelectedLine(null);
  }, [helpUp]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (helpUp && (panelContent || line)) leave();
  }, [panelContent, line]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleMotion = async () => {
    if (stopMotion.current) {
      stopMotion.current();
      stopMotion.current = null;
      setMotionOn("off");
      return;
    }
    detector.current = initialDetector();
    const stop = await watchMotion((t, mag) => {
      const r = stepDetector(detector.current, { t, mag });
      detector.current = r.state;
      const ev = r.event;
      if (!ev) return;
      setProgress((p) => {
        if (!p) return p;
        const res = onMotionStop(p, ev, Date.now());
        setMotionAsk(res.ask);
        return res.progress;
      });
    });
    stopMotion.current = stop;
    setMotionOn(stop ? "on" : "unavailable");
  };

  const tapAt = (i: number) => {
    setProgress((p) => (p ? userAt(p, i, Date.now()) : p));
    setMotionAsk(null);
  };

  const gettingOff = () => {
    if (!progress) return setMode("which");
    const est = estimate(progress, Date.now(), online);
    if (est.uncertain || est.kind !== "at") return sendGetOff({ type: "other" });
    const i = progress.stops.findIndex((s) => s.id === est.from.id);
    setGetOff({ kind: "askOff", stop: i, dismissed: getOff.dismissed });
  };

  // As the estimate reaches a station the trip gets off at, ask once "Did you get off at …?".
  const getOffStops = useMemo(() => (progress ? progress.stops.map((s, i) => (packFor(store, s.id) ? i : -1)).filter((i) => i >= 0) : []), [progress, store]);
  useEffect(() => {
    if (mode !== "ride" || !progress) return;
    const est = estimate(progress, now, online);
    for (const st of [est.from, est.to]) {
      const i = st ? progress.stops.findIndex((s) => s.id === st.id) : -1;
      if (i > progress.idx - 1) sendGetOff({ type: "near", stop: i, getOffStops });
    }
  }, [mode, progress, now, online, getOffStops]);
  // Confirmed on the platform: that station's exits.
  useEffect(() => {
    if (getOff.kind !== "confirmed" || !progress || mode !== "ride") return;
    setProgress((p) => (p ? userAt(p, getOff.stop, Date.now()) : p));
    showStation(progress.stops[getOff.stop].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getOff]);

  const surfaced = () => {
    stopAllCompass(); // a platform calibration does not survive the stairs
    // Up mapped stairs, you face the way they climb: one tap settles your direction (owner, 2026-10-27).
    if (exit?.up != null) return setMode("stairs");
    const cues = exit && target !== null ? pickLandmarks(exit.at, target, exit.landmarks) : [];
    setMode(cues.length ? "landmark" : "corner");
  };

  /** Up this exit's stairs: you stand at its top facing the way they climb; the map turns to match. */
  const cameUpStairs = () => {
    if (!exit || exit.up == null) return;
    getMapInstance()?.easeTo({ center: exit.at, zoom: 18, bearing: exit.up, pitch: 0, duration: online ? 800 : 0 });
    fixes.current = [];
    setMoveHeading(exit.up);
    setMode("walk");
  };

  const otherExit = () => {
    const cues = exit && target !== null ? pickLandmarks(exit.at, target, exit.landmarks) : [];
    setMode(cues.length ? "landmark" : "corner");
  };

  /** One tap on a landmark or corner: that exit's corner is where you stand; face the destination. */
  const facingConfirmed = (i: number) => {
    setChosen(i);
    const e = pack?.exits[i];
    const map = getMapInstance();
    const b = e && dest ? bearing(e.at, dest.at) : null;
    if (e && map) map.easeTo({ center: e.at, zoom: 18, bearing: b ?? map.getBearing(), pitch: 0, duration: online ? 800 : 0 });
    fixes.current = [];
    setMoveHeading(null);
    setMode("walk");
  };

  const sendDescription = () => {
    if (!describe?.trim()) return;
    const text = describePrompt({ station: pack?.station.name ?? "a subway station", sign: exit ? signText(exit.streets, exit.corner) : null, destination: dest?.label ?? null, seen: describe });
    setQueue((q) => enqueue(q, text, Date.now()));
    setDescribe(null);
  };

  if (home && chatOpen) return null;

  if (tripWarn) {
    return (
      <section ref={warnCard} className={card} aria-label="Trip warning">
        <div className="flex items-start gap-2">
          <p className="min-w-0 flex-1 font-semibold" role="alert" data-testid="trip-warning">{tripWarn}</p>
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" aria-label="Dismiss" onClick={() => setTripWarn(null)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </section>
    );
  }

  // ---------- idle ----------
  if (mode === "idle") {
    if (surface === "open") {
      return (
        <section className={card} aria-label="Fix my direction">
          <SurfaceCalibration
            at={fix}
            lines={surfaceLines}
            landmarks={LANDMARKS.map((l) => ({ name: l.name, at: [l.lon, l.lat] }))}
            raw={raw}
            startCompass={startCompass}
            onCalibrated={(expected, mean) => setSurfaceCal(calibrate(expected, mean, Date.now()))}
            onFacing={(h) => {
              if (raw !== null) setSurfaceCal(calibrate(h, raw, Date.now()));
              getMapInstance()?.easeTo({ bearing: h, duration: 500 });
            }}
            onShareLocation={() => void startSharing()}
            onClose={closeSurface}
          />
        </section>
      );
    }
    // Agent-first home: Find exit and Exit help open the station view; no extra chips over the task panels.
    if (home && !ask) return null;
    if (surface === "banner" && !ask) {
      return (
        <div className="pointer-events-auto absolute bottom-[8.5rem] left-3 z-40 flex items-center gap-1 rounded-full border bg-card/95 py-1 pl-3 pr-1 text-sm shadow-md" role="status">
          Map facing the wrong way?
          <Button type="button" size="sm" variant="secondary" className="h-7 rounded-full px-3" onClick={() => setSurface("open")}>
            Fix direction
          </Button>
          <Button type="button" size="icon" variant="ghost" className="h-7 w-7" aria-label="Dismiss" onClick={closeSurface}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      );
    }
    if (ask) {
      return (
        <section className={card} aria-label={t("inStation")}>
          <p className="mb-2 font-medium">{t("inStation")} ({ask.name})</p>
          <div className="flex gap-2">
            <Button type="button" size="sm" className="flex-1" onClick={() => enterStation(ask.at)}>
              {t("yes")}
            </Button>
            <Button type="button" size="sm" variant="outline" className="flex-1" onClick={answerNo}>
              {t("no")}
            </Button>
          </div>
        </section>
      );
    }
    if (!nearby && !subwayTrip) return null;
    return (
      <div className="pointer-events-auto absolute bottom-[calc(10rem+var(--playback-h,0px))] left-3 z-40">
        <Button type="button" size="sm" variant="secondary" className="shadow-md" onClick={() => enterStation()}>
          <TrainFront className="mr-1.5 h-4 w-4" aria-hidden />
          I'm in the station{!subwayTrip && nearby ? ` (${nearby.name})` : ""}
        </Button>
      </div>
    );
  }

  const header = (title: string) => (
    <div className="mb-2 flex items-start gap-2">
      <div className="min-w-0 flex-1">
        <h2 className="truncate font-semibold">{title}</h2>
        <p className="text-xs text-muted-foreground">
          {store ? `Saved on this phone ${ageLabel(store.savedAt, now)}` : "Nothing saved yet"}
          {online ? "" : " · no signal"}
          {dest ? ` · to ${dest.label}` : ""}
        </p>
      </div>
      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label="Close underground help" onClick={leave}>
        <X className="h-4 w-4" />
      </Button>
    </div>
  );

  const describeBox = (
    <div className="mt-2 border-t pt-2">
      {queue.length > 0 && <p className="mb-1 text-xs">Your question is saved. I'll answer when you have signal; until then, follow the signs above.</p>}
      {describe === null ? (
        <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setDescribe("")}>
          <MessageSquare className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          Describe what you see
        </Button>
      ) : (
        <div className="space-y-1">
          <textarea className="w-full rounded-md border bg-background px-2 py-1 text-sm" rows={2} placeholder="Signs, shops, the street name…" value={describe} onChange={(e) => setDescribe(e.target.value)} aria-label="Describe what you see" />
          <Button type="button" size="sm" className="w-full" disabled={!describe.trim()} onClick={sendDescription}>
            {online ? "Ask the assistant" : "Save and ask when there is signal"}
          </Button>
        </div>
      )}
    </div>
  );

  // ---------- riding ----------
  if (mode === "ride" || mode === "which") {
    const est = progress ? estimate(progress, now, online) : null;
    const choices = progress ? atChoices(progress) : stops.map((_, i) => i);
    return (
      <section className={card} aria-label="Trip progress">
        {header(dest ? `To ${dest.label}` : "On the train")}
        {mode === "which" ? (
          <p className="mb-1 font-medium">Which station are you at?</p>
        ) : (
          <>
            <p className="font-medium" aria-live="polite">
              {est?.label ?? "Tap the station you are at."}
            </p>
            {motionAsk?.kind === "confirm" && progress && <p className="mt-1">Are we at {progress.stops[motionAsk.stop].name}?</p>}
            {motionAsk?.kind === "between" && progress && (
              <p className="mt-1">
                Long or unusual stop: between {progress.stops[motionAsk.from].name} and {progress.stops[motionAsk.to].name}. Where are you?
              </p>
            )}
            {getOff.kind === "askOff" && progress && (
              <div className="mt-2 space-y-1 rounded-md border border-primary p-2">
                <p className="font-medium">Did you get off at {progress.stops[getOff.stop].name}?</p>
                <div className="flex flex-wrap gap-1">
                  <Button type="button" size="sm" onClick={() => sendGetOff({ type: "yes", now: Date.now() })}>
                    Yes
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => sendGetOff({ type: "no" })}>
                    No
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => sendGetOff({ type: "other" })}>
                    I got off at a different stop
                  </Button>
                </div>
              </div>
            )}
            {getOff.kind === "askPlatform" && progress && (
              <div className="mt-2 space-y-1 rounded-md border border-primary p-2">
                <p className="font-medium">{progress.stops[getOff.stop].name}: are you on the platform?</p>
                <div className="flex gap-1">
                  <Button type="button" size="sm" onClick={() => sendGetOff({ type: "yes", now: Date.now() })}>
                    Yes, I'm on the platform
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => sendGetOff({ type: "undo", now: Date.now() })}>
                    Undo
                  </Button>
                </div>
              </div>
            )}
            {getOff.kind === "pickOther" && progress && (
              <div className="mt-2 space-y-1 rounded-md border p-2">
                <p className="font-medium">Where did you get off?</p>
                <div className="flex flex-wrap gap-1">
                  {atChoices(progress).map((i) => (
                    <Button key={progress.stops[i].id} type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => sendGetOff({ type: "pick", stop: i })}>
                      {progress.stops[i].name}
                    </Button>
                  ))}
                  <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => sendGetOff({ type: "no" })}>
                    Still on the train
                  </Button>
                </div>
              </div>
            )}
            <p className="mt-1 text-xs text-muted-foreground">I'm at…</p>
          </>
        )}
        <div className="mt-1 flex flex-wrap gap-1">
          {(progress ? choices : []).map((i) => (
            <Button
              key={progress!.stops[i].id}
              type="button"
              size="sm"
              variant={motionAsk?.kind === "confirm" && motionAsk.stop === i ? "default" : "outline"}
              className="h-7 px-2 text-xs"
              onClick={() => {
                tapAt(i);
                if (mode === "which") showStation(progress!.stops[i].id);
              }}
            >
              {motionAsk?.kind === "confirm" && motionAsk.stop === i ? `Yes, ${progress!.stops[i].name}` : progress!.stops[i].name}
            </Button>
          ))}
        </div>
        {mode === "ride" && (
          <>
            <div className="mt-2 flex gap-2">
              <Button type="button" size="sm" className="flex-1" onClick={gettingOff}>
                I'm getting off
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => void toggleMotion()} disabled={motionOn === "unavailable"}>
                {motionOn === "on" ? "Stop counting stops" : motionOn === "unavailable" ? "No motion sensor" : "Count stops from motion"}
              </Button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Approximate. {followed?.startsWith("subway:") ? "Live train data is used when there is signal. " : "Follow your train on the map to use live data when there is signal. "}
              Counting stops from motion works only while this screen is on and the app is open; your phone stops sensor events when locked. Motion data stays on this phone.
            </p>
          </>
        )}
        {describeBox}
      </section>
    );
  }

  // ---------- station and surfacing ----------
  if (!pack) {
    return (
      <section className={card} aria-label="Station exits">
        {header("Station exits")}
        <p>Exits for this station were not saved before the signal went.</p>
        <p className="mt-1 text-xs text-muted-foreground">Follow the station's exit signs. With a subway trip on screen, exits are saved ahead for every station you get off at.</p>
        {stops.length > 0 && (
          <Button type="button" size="sm" className="mt-2 w-full" onClick={() => setMode("ride")}>
            I'm on the train
          </Button>
        )}
        {describeBox}
      </section>
    );
  }

  const n = pack.exits.length;
  const distM = exit ? Math.round(metres(pack.station.at, exit.at)) : null;
  const pointer = arrowState({ cal, rawHeading: raw, interfered, exitBearing: exit ? bearing(pack.station.at, exit.at) : null, now });
  const canCalibrate = pack.trackBearing !== null && typeof window !== "undefined" && "DeviceOrientationEvent" in window;
  const cues = exit && target !== null ? pickLandmarks(exit.at, target, exit.landmarks) : [];
  const cornerChoices = pack.exits.map((e, i) => ({ i, label: signText(e.streets, e.corner) })).filter((c, k, all): c is { i: number; label: string } => !!c.label && all.findIndex((x) => x.label === c.label) === k);
  const outage = exit ? outageLabel(store?.status ?? null, exit.unit?.id ?? null, now) : null;
  const beginCalibration = () => {
    setWaitingCompass(true);
    setMode("calibrate");
    void startCompass().then((ok) => {
      setWaitingCompass(false);
      if (!ok) setMode("station"); // no compass or permission refused: skip this step
    });
  };
  const finishCalibration = (expected: number | null, meanHeading: number) => {
    setCal(calibrate(expected, meanHeading, Date.now()));
    setPointerSeen(false);
    setInterfered(false);
    setMode("station");
  };

  if (home && mode === "station") return <ExitTask
    key={pack.station.id} pack={pack} chosen={chosen} online={online}
    rotation={pointer.show ? pointer.rotation : null} distanceM={distM}
    onChoose={setChosen} onOut={surfaced} onClose={leave}
    onCalibrate={canCalibrate ? beginCalibration : undefined}
    where={where}
    onShare={() => void startSharing()}
    onHere={() => setConfirmed(pack.station.id)}
    onWalkThere={() => seedChat(`Walk me to ${pack.station.name} subway station.`)}
    onPickStation={(id) => openStationHelp(id)}
  />;

  return (
    <section className={`${card} max-h-[75vh] overflow-y-auto`} aria-label="Station exits">
      {header(pack.station.name)}
      {canUndo(getOff, now) && (
        <p className="mb-2 flex items-center justify-between rounded-md border px-2 py-1 text-xs">
          You got off here.
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-xs"
            onClick={() => {
              sendGetOff({ type: "undo", now: Date.now() });
              setMode("ride");
            }}
          >
            Undo
          </Button>
        </p>
      )}

      {(mode === "station" || mode === "calibrate") && exit && (
        <>
          <p className="rounded-md bg-primary/10 px-2 py-2 text-center text-lg font-semibold leading-snug" aria-live="polite">
            {exitName(exit, chosen, n)}
          </p>
          {exit.cornerApprox && <p className="mt-0.5 text-center text-xs text-muted-foreground">Corner worked out from the map (approximate); check the sign.</p>}
          {mode === "calibrate" ? (
            <div className="mt-2">
              <CalibrationStep
                raw={raw}
                waiting={waitingCompass}
                onDone={(heading, went) => {
                  // Option A: the phone points the way the train went. Option B: it faces the tracks.
                  const expected = pack.trackBearing === null ? null : went === "front" ? pack.trackBearing : facingTracksHeading(pack.trackBearing, went);
                  finishCalibration(expected, heading);
                }}
                onSkip={() => {
                  stopAllCompass();
                  setMode("station");
                }}
              />
            </div>
          ) : cal ? (
            <div>
              <ExitPointer
                rotation={pointer.show ? pointer.rotation : 0}
                visible={pointer.show}
                distanceM={distM}
                firstTime={!pointerSeen}
                hiddenReason={pointer.show ? null : pointer.reason === "interference" ? "Pointer off: the compass is disturbed here. Follow the signs." : pointer.reason === "no-compass" ? "Pointer off: no compass reading. Follow the signs." : "Pointer off after 2 minutes. Follow the signs."}
              />
            </div>
          ) : canCalibrate ? (
            <Button type="button" variant="outline" className="mt-2 h-auto w-full whitespace-normal py-2" onClick={beginCalibration}>
              Point your phone toward the front of the train to get an approximate pointer
            </Button>
          ) : null}
          {mode === "station" && !online && !pack.tiles && <PlatformMap alongM={exit.alongM} />}
          {mode === "station" && (
            <>
              <Button type="button" size="sm" className="mt-2 w-full" onClick={surfaced}>
                <ArrowUpFromLine className="mr-1.5 h-4 w-4" aria-hidden />
                I'm out
              </Button>
              <Button type="button" size="sm" variant="ghost" className="mt-1 h-7 w-full text-xs" aria-expanded={more} onClick={() => setMore((m) => !m)}>
                {more ? "Less help" : "More help"}
              </Button>
              {more && (
                <div className="space-y-2 border-t pt-2">
                  {trainCue(exit.trainEnd) && <p>{trainCue(exit.trainEnd)}</p>}
                  <PlatformMap alongM={exit.alongM} />
                  {exit.unit && <p className="text-xs">MTA: {exit.unit.serving}</p>}
                  {outage && <p className="text-xs">{outage}</p>}
                  <p className="text-xs text-muted-foreground">
                    {pack.tiles ? `Offline map of this station area saved (${pack.tiles.count} ${pack.tiles.count === 1 ? "tile" : "tiles"},${Math.round(pack.tiles.bytes / 1024)} kB).` : "No offline map saved for this station area; the platform sketch stands in."}
                  </p>
                  {cal && pointer.show && <p className="text-xs text-muted-foreground">Pointer: approximate, from the middle of the station.</p>}
                  <ol className="space-y-1" aria-label="Other exits">
                    {pack.exits.map((e, i) => (
                      <li key={`${e.at[0]},${e.at[1]}`}>
                        <button type="button" className={`w-full rounded-md border px-2 py-1 text-left text-xs ${i === chosen ? "border-primary bg-primary/10" : "border-transparent hover:bg-accent"}`} aria-pressed={i === chosen} onClick={() => setChosen(i)}>
                          <span className="font-medium">{exitName(e, i, n)}</span>
                          {e.toDestM !== null && <span className="block text-muted-foreground">{i === 0 ? "Closest to where you are going · " : ""}about {e.toDestM} m from it</span>}
                        </button>
                      </li>
                    ))}
                  </ol>
                  {!dest && <p className="text-xs text-muted-foreground">No destination saved, so no exit is marked closest.</p>}
                  {describeBox}
                </div>
              )}
            </>
          )}
        </>
      )}
      {(mode === "station" || mode === "calibrate") && !exit && <p className="text-xs text-muted-foreground">No street exits are listed for this station in the MTA data. Follow the station signs.</p>}

      {mode === "stairs" && exit && exit.up != null && (
        <div className="space-y-2" data-testid="stairs-facing">
          <p className="font-medium">Came up the {exitKind(exit.kind)}{exitSign ? ` at ${exitSign.replace(/^Exit · /, "")}` : ""}?</p>
          <p>Then you're facing {compassWord(exit.up)}{target !== null ? `. ${turnHint(exit.up, target)}` : ""}.</p>
          <div className="flex gap-2">
            <Button type="button" size="sm" className="flex-1" onClick={cameUpStairs}>
              Yes
            </Button>
            <Button type="button" size="sm" variant="outline" className="flex-1" onClick={otherExit}>
              Different exit
            </Button>
          </div>
        </div>
      )}

      {mode === "landmark" && exit && cues.length > 0 && (
        <div className="space-y-2">
          {cues.map((c) => (
            <p key={c.name}>{landmarkLine(c)}</p>
          ))}
          <div className="flex gap-2">
            <Button type="button" size="sm" className="flex-1" onClick={() => facingConfirmed(chosen)}>
              I see it
            </Button>
            <Button type="button" size="sm" variant="outline" className="flex-1" onClick={() => setMode("corner")}>
              I don't
            </Button>
          </div>
        </div>
      )}

      {mode === "corner" && (
        <div className="space-y-1">
          <p className="mb-1 font-medium">{cornerChoices.length ? "Which corner are you on?" : "Which exit did you come up?"}</p>
          {(cornerChoices.length ? cornerChoices : pack.exits.map((e, i) => ({ i, label: exitName(e, i, n) }))).map((c) => (
            <Button key={c.i} type="button" size="sm" variant={c.i === chosen ? "default" : "outline"} className="h-auto w-full justify-start whitespace-normal py-1.5 text-left" onClick={() => facingConfirmed(c.i)}>
              {c.label}
            </Button>
          ))}
        </div>
      )}

      {mode === "walk" && exit && (
        <div className="space-y-1">
          <p>
            {target === null
              ? "The map is centred on your exit."
              : moveHeading === null
                ? `The map now faces ${dest?.label}. Start walking that way; we'll confirm your direction in a few steps.`
                : `${turnHint(moveHeading, target)}.`}
          </p>
          {target !== null && shared.status !== "on" && (
            <Button type="button" size="sm" variant="outline" onClick={() => void startSharing()}>
              Use my location to confirm the direction
            </Button>
          )}
          <Button type="button" size="sm" variant="outline" className="w-full" onClick={leave}>
            Done
          </Button>
          {describeBox}
        </div>
      )}
    </section>
  );
}
