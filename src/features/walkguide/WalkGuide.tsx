import "@/components/task-screens.css";
import { ArrowLeft, ArrowRight, Navigation, Search, X } from "lucide-react";
import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import { useCallback, useEffect, useRef, useState } from "react";
import { PullSheet } from "@/components/PullSheet";
import type { SheetLevel } from "@/components/sheetSwipe";
import { onMapInstance } from "@/lib/map/mapInstance";
import { say } from "@/lib/voice/say";
import { countStep, dueAtNext, initialSteps, nearbyFirst, nextStop, placeAt, placeForSign, stepsToNextStop, type Place } from "./progress";
import { photoUrl, WALK, WRONG_WAYS, type Checkpoint } from "./walks";

const SRC = "walk-guide";
const LAYERS = ["walk-guide-ahead", "walk-guide-done", "walk-guide-stops", "walk-guide-you"] as const;
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
  const done = here.filter((x) => x.j <= p.i).map((x) => x.c.at);
  const ahead = here.filter((x) => x.j > p.i).map((x) => x.c.at);
  return {
    type: "FeatureCollection",
    features: [
      ...line("done", [...done, you]),
      ...line("ahead", [you, ...ahead]),
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
  const steps = useRef(initialSteps());
  const stopSay = useRef<(() => void) | null>(null);

  const here = WALK[place.i];
  const next = WALK[place.i + 1] ?? null;
  const stop = nextStop(WALK, place.i);
  const left = stepsToNextStop(WALK, place);
  const due = dueAtNext(WALK, place);

  const speak = useCallback((text: string) => {
    stopSay.current?.();
    stopSay.current = say(text, "en", () => {});
  }, []);

  const go = useCallback((p: Place, line?: string) => {
    setPlace(p);
    setLost(false);
    setLevel(1);
    const c = WALK[p.i];
    if (c) speak(line ?? c.say);
  }, [speak]);

  // The line and the dot, drawn on the one map and taken off when this closes.
  useEffect(() => onMapInstance((map) => { mapRef.current = map; }), []);
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
  }, [place, open]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !open) return;
    map.easeTo({ center: WALK[place.i].at, zoom: 17.6, duration: 900 });
  }, [place.i, open]);
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
    w.__walkGuide = { pick: (id: string) => pick(id), walk: (n: number) => setPlace((p) => ({ ...p, walked: p.walked + n })) };
    return () => { delete w.__walkGuide; };
  });

  const close = () => { stopSay.current?.(); setOpen(false); };
  if (!open) return null;

  const signs = nearbyFirst(WALK, [...WALK, ...WRONG_WAYS], place.i);
  const togo = here.by === "elevator" ? "Elevator" : here.by === "train" ? "Train" : left > 0 ? `About ${Math.max(5, Math.round(left / 5) * 5)} steps to ${stop.by === "train" ? "the train" : stop.by === "elevator" ? "the elevator" : "the way out"}` : "You are here";

  return (
    <PullSheet testId="walk-guide" label="Walk guide" level={level} onLevel={setLevel} onClose={close}
      header={<div className="flex items-center gap-2.5">
        <button type="button" className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left" aria-expanded={level > 0} onClick={() => setLevel((l) => (l === 0 ? 1 : l))}>
          <Navigation size={18} className="shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="task-caption block truncate" data-testid="walk-level">{here.station} · {LEVEL[here.level]}</span>
            <span className="block truncate text-[15px] font-bold" data-testid="walk-togo">{togo}</span>
          </span>
        </button>
        <button type="button" aria-label="Close" className="task-action task-close" onClick={close}><X size={18} /></button>
      </div>}>
      <section className="pull-sheet-body mt-1 flex flex-col gap-2" aria-label="Walk guide">
        {lost ? <>
          <p className="text-sm font-bold">Which of these can you see?</p>
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
          {!started ? <button type="button" className="task-action min-h-11 px-3" onClick={start}>Start the guide</button> : null}
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
