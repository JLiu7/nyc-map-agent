import "@/components/task-screens.css";
import { ArrowLeft, ArrowRight, Navigation, Pause, Play, Search, X } from "lucide-react";
import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import { useCallback, useEffect, useRef, useState } from "react";
import { PullSheet } from "@/components/PullSheet";
import type { SheetLevel } from "@/components/sheetSwipe";
import { onMapInstance } from "@/lib/map/mapInstance";
import { say } from "@/lib/voice/say";
import { countStep, dueAtNext, facingAt, initialSteps, legPath, nearbyFirst, nextStop, placeAt, placeForSign, simTick, stepsToNextStop, type Place } from "./progress";
import { SignScan } from "./SignScan";
import { SIGN_WORDS } from "./signWords";
import { photoUrl, WALK, WRONG_WAYS, type Checkpoint } from "./walks";

const SRC = "walk-guide";
const LAYERS = ["walk-guide-ahead", "walk-guide-done", "walk-guide-stops", "walk-guide-facing", "walk-guide-you"] as const;
/** A simulated trip walks this many steps a second, a few times a real pace, and waits this long at an elevator. */
const SIM_TICK_MS = 160;
const SIM_HOLD_MS = 1400;
/** How far ahead of the dot the facing beam reaches, metres. */
const BEAM_M = 10;
const LEVEL: Record<Checkpoint["level"], string> = { street: "Street", concourse: "Concourse", mezzanine: "Mezzanine", platform: "Platform" };

type MotionCtor = { requestPermission?: () => Promise<"granted" | "denied"> };

/** The walk as map features: the part behind the rider, the part ahead, the elevators and trains, and the rider. */
function features(p: Place): GeoJSON.FeatureCollection {
  const you = placeAt(WALK, p);
  const line = (kind: string, pts: [number, number][]): GeoJSON.Feature[] =>
    pts.length > 1 ? [{ type: "Feature", properties: { kind }, geometry: { type: "LineString", coordinates: pts } }] : [];
  // The ride between the two stations is not a walk: each station's line is drawn apart.
  const station = WALK[p.i].station;
  const here = WALK.map((c, j) => ({ c, j })).filter((x) => x.c.station === station);
  // Each leg with its corners: the legs before this one are behind the rider, the rest ahead.
  const done = here.filter((x) => x.j < p.i).flatMap((x) => legPath(WALK, x.j).slice(0, -1));
  const ahead = here.filter((x) => x.j > p.i).flatMap((x) => (x.j === here[here.length - 1].j ? [x.c.at] : legPath(WALK, x.j).slice(0, -1)));
  // Corners of this leg the rider has not reached yet stay ahead of the dot.
  const leg = legPath(WALK, p.i);
  const share = WALK[p.i].steps > 0 ? Math.min(1, p.walked / WALK[p.i].steps) : 0;
  const mid = leg.slice(1, -1);
  const passed = mid.slice(0, Math.floor(share * (mid.length + 1)));
  const toCome = mid.slice(passed.length);
  const face = facingAt(WALK, p);
  const rad = face === null ? 0 : (face * Math.PI) / 180;
  const tip: [number, number] = [you[0] + (Math.sin(rad) * BEAM_M) / (111_320 * Math.cos((you[1] * Math.PI) / 180)), you[1] + (Math.cos(rad) * BEAM_M) / 110_540];
  return {
    type: "FeatureCollection",
    features: [
      ...line("done", [...done, WALK[p.i].at, ...passed, you]),
      ...line("ahead", [you, ...toCome, ...ahead]),
      ...(face === null ? [] : line("facing", [you, tip])),
      ...here.filter((x) => x.c.by === "elevator").map((x): GeoJSON.Feature => ({ type: "Feature", properties: { kind: "stop" }, geometry: { type: "Point", coordinates: x.c.at } })),
      { type: "Feature", properties: { kind: "you" }, geometry: { type: "Point", coordinates: you } },
    ],
  };
}

function ensure(map: MapLibreMap): void {
  if (map.getSource(SRC)) return;
  map.addSource(SRC, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addLayer({ id: "walk-guide-ahead", type: "line", source: SRC, filter: ["==", ["get", "kind"], "ahead"], paint: { "line-color": "#FCCC0A", "line-width": 4, "line-dasharray": [1, 1.5] } });
  map.addLayer({ id: "walk-guide-done", type: "line", source: SRC, filter: ["==", ["get", "kind"], "done"], paint: { "line-color": "#FCCC0A", "line-width": 5, "line-opacity": 0.55 } });
  map.addLayer({ id: "walk-guide-stops", type: "circle", source: SRC, filter: ["==", ["get", "kind"], "stop"], paint: { "circle-radius": 7, "circle-color": "#2FB36B", "circle-stroke-color": "#ffffff", "circle-stroke-width": 2 } });
  map.addLayer({ id: "walk-guide-facing", type: "line", source: SRC, filter: ["==", ["get", "kind"], "facing"], layout: { "line-cap": "round" }, paint: { "line-color": "#2563eb", "line-width": 12, "line-opacity": 0.4 } });
  map.addLayer({ id: "walk-guide-you", type: "circle", source: SRC, filter: ["==", ["get", "kind"], "you"], paint: { "circle-radius": 8, "circle-color": "#2563eb", "circle-stroke-color": "#ffffff", "circle-stroke-width": 3 } });
}

/**
 * The walk guide (a prototype, off unless `?flags=+walkGuide`): a filmed
 * step-free walk, one sign at a time, with the rider's dot on the map moved by
 * the phone's step count and put back exactly whenever they name the sign in
 * front of them. The map stays in view above the sheet.
 */
export default function WalkGuide() {
  const [open, setOpen] = useState(true);
  const [level, setLevel] = useState<SheetLevel>(1);
  const [place, setPlace] = useState<Place>({ i: 0, walked: 0 });
  const [started, setStarted] = useState(false);
  const [lost, setLost] = useState(false);
  const [wrong, setWrong] = useState<string | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  // Set once the map exists, so the line is drawn and the camera goes to the walk without waiting for a tap.
  const [mapReady, setMapReady] = useState(false);
  const steps = useRef(initialSteps());
  const stopSay = useRef<(() => void) | null>(null);
  // A simulated trip: the dot walks the route by itself, for showing it away from the station.
  const [sim, setSim] = useState(false);
  const heard = useRef(true);
  const heardTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const arrivedAt = useRef(0);
  const placeRef = useRef(place);
  placeRef.current = place;

  const here = WALK[place.i];
  const next = WALK[place.i + 1] ?? null;
  const stop = nextStop(WALK, place.i);
  const left = stepsToNextStop(WALK, place);
  const due = dueAtNext(WALK, place);

  const speak = useCallback((text: string) => {
    stopSay.current?.();
    heard.current = false;
    clearTimeout(heardTimer.current);
    // A browser with no voice never says it has finished: the line's length stands in.
    heardTimer.current = setTimeout(() => { heard.current = true; }, Math.min(9000, 1500 + text.length * 70));
    stopSay.current = say(text, "en", () => { heard.current = true; clearTimeout(heardTimer.current); });
  }, []);

  const go = useCallback((p: Place, line?: string) => {
    setPlace(p);
    arrivedAt.current = Date.now();
    setLost(false);
    setLevel(1);
    const c = WALK[p.i];
    if (c) speak(line ?? c.say);
  }, [speak]);

  // The line and the dot, drawn on the one map and taken off when this closes.
  useEffect(() => onMapInstance((map) => { mapRef.current = map; setMapReady(!!map); }), []);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !open) return;
    const draw = () => {
      try {
        ensure(map);
        void map.getSource<GeoJSONSource>(SRC)?.setData(features(place));
      } catch { /* the style is still loading: the next change draws it */ }
    };
    if (map.isStyleLoaded()) draw(); else void map.once("idle", draw);
  }, [place, open, mapReady]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !open) return;
    map.easeTo({ center: WALK[place.i].at, zoom: 17.6, duration: 900 });
  }, [place.i, open, mapReady]);
  useEffect(() => () => {
    stopSay.current?.();
    const map = mapRef.current;
    if (!map) return;
    try {
      for (const id of LAYERS) if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(SRC)) map.removeSource(SRC);
    } catch { /* the map has gone */ }
  }, []);

  // Steps from the motion sensor move the dot; they never move it past the next sign.
  useEffect(() => {
    if (!started) return;
    const onMotion = (e: DeviceMotionEvent) => {
      const a = e.accelerationIncludingGravity;
      if (!a || a.x == null || a.y == null || a.z == null) return;
      const before = steps.current.steps;
      steps.current = countStep(steps.current, e.timeStamp / 1000, Math.hypot(a.x, a.y, a.z));
      if (steps.current.steps !== before) setPlace((p) => ({ ...p, walked: p.walked + 1 }));
    };
    window.addEventListener("devicemotion", onMotion);
    return () => window.removeEventListener("devicemotion", onMotion);
  }, [started]);

  // The simulated trip: a few steps each tick, and on to the next sign once this one's line has been heard.
  useEffect(() => {
    if (!sim) return;
    const id = setInterval(() => {
      const p = placeRef.current;
      const ready = heard.current && Date.now() - arrivedAt.current >= SIM_HOLD_MS;
      const nextPlace = simTick(WALK, p, 1, ready);
      if (!nextPlace) { if (heard.current) setSim(false); return; }
      if (nextPlace.i !== p.i) go(nextPlace); else if (nextPlace.walked !== p.walked) setPlace(nextPlace);
    }, SIM_TICK_MS);
    return () => clearInterval(id);
  }, [sim, go]);
  // The camera keeps the dot in view while it walks by itself.
  useEffect(() => {
    const map = mapRef.current;
    // Every few steps is enough to keep it in view, and spares a slow phone.
    if (!sim || !map || !open || place.walked % 4 !== 0) return;
    map.easeTo({ center: placeAt(WALK, place), duration: SIM_TICK_MS * 4 });
  }, [sim, place, open]);

  const simulate = () => {
    if (sim) { setSim(false); stopSay.current?.(); return; }
    setStarted(true);
    setWrong(null);
    const from = place.i >= WALK.length - 1 ? { i: 0, walked: 0 } : place;
    go(from);
    setSim(true);
  };

  const start = () => {
    // iOS only asks for motion inside a tap.
    const M = (globalThis as { DeviceMotionEvent?: MotionCtor }).DeviceMotionEvent;
    void M?.requestPermission?.().catch(() => "denied");
    setStarted(true);
    speak(here.say);
  };

  const pick = (id: string) => {
    const found = placeForSign(WALK, WRONG_WAYS, id);
    if (!found) return;
    setStarted(true);
    setWrong(found.wrong ? found.wrong.say : null);
    go(found.place, found.wrong?.say);
  };

  // For tests and for trying it at a desk: name a sign, or walk some steps.
  useEffect(() => {
    if (!(import.meta.env.DEV || import.meta.env.VITE_E2E)) return;
    const w = window as unknown as { __walkGuide?: unknown };
    w.__walkGuide = { pick: (id: string) => pick(id), walk: (n: number) => setPlace((p) => ({ ...p, walked: p.walked + n })), simulate: () => simulate() };
    return () => { delete w.__walkGuide; };
  });

  const close = () => { stopSay.current?.(); clearTimeout(heardTimer.current); setSim(false); setOpen(false); };
  if (!open) return null;

  const signs = nearbyFirst(WALK, [...WALK, ...WRONG_WAYS], place.i);
  // The camera is offered the words on this station's signs only, nearest first: a sign at the other station cannot be the one in view.
  const stationOf = (s: (typeof signs)[number]) => ("station" in s ? s.station : WALK.find((c) => c.id === s.near)?.station);
  const scanSigns = signs.filter((s) => SIGN_WORDS[s.id] && stationOf(s) === here.station).map((s) => ({ id: s.id, sign: SIGN_WORDS[s.id] }));
  const togo = here.by === "elevator" ? "Elevator" : here.by === "train" ? "Train" : left > 0 ? `About ${Math.max(5, Math.round(left / 5) * 5)} steps to ${stop.by === "train" ? "the train" : stop.by === "elevator" ? "the elevator" : "the way out"}` : "You are here";

  return (
    <PullSheet testId="walk-guide" label="Walk guide" level={level} onLevel={setLevel} onClose={close}
      header={<div className="flex items-center gap-2.5">
        <button type="button" className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left" aria-expanded={level > 0} onClick={() => setLevel((l) => (l === 0 ? 1 : l))}>
          <Navigation size={18} className="shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="task-caption block truncate" data-testid="walk-level">{sim ? "Simulation · " : ""}{here.station} · {LEVEL[here.level]}</span>
            <span className="block truncate text-[15px] font-bold" data-testid="walk-togo">{togo}</span>
          </span>
        </button>
        <button type="button" aria-label="Close" className="task-action task-close" onClick={close}><X size={18} /></button>
      </div>}>
      <section className="pull-sheet-body mt-1 flex flex-col gap-2" aria-label="Walk guide">
        {lost ? <>
          {scanSigns.length ? <SignScan signs={scanSigns} onFound={pick} /> : null}
          <p className="text-sm font-bold">Or tap the one you can see</p>
          <div className="grid shrink-0 auto-rows-max grid-cols-2 gap-2" data-testid="walk-signs">
            {signs.map((s) => (
              <button key={s.id} type="button" className="min-h-28 overflow-hidden rounded-xl bg-slate-900/70 text-left" onClick={() => pick(s.id)}>
                <img src={photoUrl(s.photo)} alt="" className="h-16 w-full object-cover" />
                <span className="block px-2 py-1.5 text-xs font-semibold leading-snug">{s.sign}</span>
              </button>
            ))}
          </div>
          <button type="button" className="task-action min-h-11 px-3" onClick={() => setLost(false)}>Back to the guide</button>
        </> : <>
          {wrong ? <p className="text-xs text-amber-200" role="status" data-testid="walk-wrong">{wrong}</p> : null}
          <p className="text-sm font-bold leading-snug" data-testid="walk-say">{here.say}</p>
          {next && !here.by ? <div className="flex items-center gap-3">
            <img src={photoUrl(next.photo)} alt="" className="h-16 w-24 shrink-0 rounded-lg object-cover" />
            <div className="min-w-0 flex-1">
              <span className="task-caption">{due ? "You should see" : "Look for"}</span>
              <p className="text-sm font-semibold leading-snug" data-testid="walk-next">{next.sign}</p>
            </div>
          </div> : <div className="flex items-center gap-3">
            <img src={photoUrl(here.photo)} alt="" className="h-16 w-24 shrink-0 rounded-lg object-cover" />
            <div className="min-w-0 flex-1">
              <span className="task-caption">This is</span>
              <p className="text-sm font-semibold leading-snug">{here.sign}</p>
            </div>
          </div>}
          <div className="flex gap-2">
            {!started ? <button type="button" className="task-action min-h-11 flex-1 px-3" onClick={start}>Start the guide</button> : null}
            <button type="button" className="task-action min-h-11 flex-1 px-3" onClick={simulate} data-testid="walk-sim">
              <span className="inline-flex items-center gap-1.5">{sim ? <Pause size={16} aria-hidden /> : <Play size={16} aria-hidden />}{sim ? "Pause" : "Simulate the trip"}</span>
            </button>
          </div>
          <div className="flex gap-2">
            <button type="button" aria-label="Previous sign" className="task-action min-h-11 px-3" disabled={place.i === 0} onClick={() => { setWrong(null); go({ i: place.i - 1, walked: 0 }); }}><ArrowLeft size={18} /></button>
            <button type="button" className="task-action min-h-11 flex-1 px-3" disabled={!next} onClick={() => { setWrong(null); setStarted(true); go({ i: place.i + 1, walked: 0 }); }}>
              <span className="inline-flex items-center gap-1.5">{here.by === "elevator" ? "I rode it" : here.by === "train" ? "I got off at 14 St" : "I'm at the next sign"}<ArrowRight size={16} aria-hidden /></span>
            </button>
            <button type="button" className="task-action min-h-11 px-3" onClick={() => setLost(true)}>
              <span className="inline-flex items-center gap-1.5"><Search size={16} aria-hidden />Lost</span>
            </button>
          </div>
        </>}
      </section>
    </PullSheet>
  );
}
