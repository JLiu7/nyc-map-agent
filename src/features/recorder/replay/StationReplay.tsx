import "@/components/task-screens.css";
import { Pause, Play, RotateCcw, X } from "lucide-react";
import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PullSheet } from "@/components/PullSheet";
import type { SheetLevel } from "@/components/sheetSwipe";
import { cleanWalk, levelAt, pathAt, type Cleaned, type LonLat } from "@/features/recorder/clean";
import { parseRecording, type Recording } from "@/features/recorder/format";
import { onMapInstance } from "@/lib/map/mapInstance";
import { framePadding } from "@/lib/map/mapCover";
import { keepInView } from "@/lib/map/keepInView";
import { useLeftCard } from "@/lib/store/leftColumn";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { LEVEL_NAME, LevelGraph } from "./LevelGraph";
import { END_S, filmAt, GOOGLE_NO_GPS, LEVELS, LINE, LINE_LEVELS, loadWalk, RIDE_AT, SIGNS, signAt, signTimes, START_S, stillAt, T0 } from "./unionSq";

const SRC = "station-replay";
const LAYERS = ["station-replay-raw", "station-replay-clean", "station-replay-signs", "station-replay-raw-now", "station-replay-now"] as const;
/** Replay seconds per real second: real time first, then faster, as the trip preview offers. */
const SPEEDS = [1, 2, 5, 10, 30] as const;
const TICK_MS = 100;

const clock = (s: number) => new Date(T0 + s * 1000).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit", second: "2-digit" }).toLowerCase();

function features(c: Cleaned, s: number): GeoJSON.FeatureCollection {
  const t = T0 + s * 1000;
  const pt = (kind: string, at: LonLat): GeoJSON.Feature => ({ type: "Feature", properties: { kind }, geometry: { type: "Point", coordinates: at } });
  return {
    type: "FeatureCollection",
    features: [
      ...c.raw.filter((_, i) => i % 2 === 0).map((p) => pt("raw", p.at)),
      ...SIGNS.map((x) => pt("sign", x.at)),
      { type: "Feature", properties: { kind: "clean" }, geometry: { type: "LineString", coordinates: c.clean.map((p) => p.at) } },
      ...(c.raw.length ? [pt("raw-now", pathAt(c.raw, t))] : []),
      ...(c.clean.length ? [pt("now", pathAt(c.clean, t))] : []),
    ],
  };
}

function ensure(map: MapLibreMap): void {
  if (map.getSource(SRC)) return;
  map.addSource(SRC, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addLayer({ id: "station-replay-raw", type: "circle", source: SRC, filter: ["==", ["get", "kind"], "raw"], paint: { "circle-radius": 2.6, "circle-color": "#9ca3af", "circle-opacity": 0.8 } });
  map.addLayer({ id: "station-replay-clean", type: "line", source: SRC, filter: ["==", ["get", "kind"], "clean"], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#22c55e", "line-width": 5 } });
  map.addLayer({ id: "station-replay-signs", type: "circle", source: SRC, filter: ["==", ["get", "kind"], "sign"], paint: { "circle-radius": 5, "circle-color": "#ffffff", "circle-stroke-color": "#0f172a", "circle-stroke-width": 2 } });
  map.addLayer({ id: "station-replay-raw-now", type: "circle", source: SRC, filter: ["==", ["get", "kind"], "raw-now"], paint: { "circle-radius": 6, "circle-color": "#9ca3af", "circle-stroke-color": "#ffffff", "circle-stroke-width": 2 } });
  map.addLayer({ id: "station-replay-now", type: "circle", source: SRC, filter: ["==", ["get", "kind"], "now"], paint: { "circle-radius": 9, "circle-color": "#2563eb", "circle-stroke-color": "#ffffff", "circle-stroke-width": 3 } });
}

/**
 * Station replay (a demo page, off unless `?flags=+stationReplay`): Friday's
 * real walk out of 14 St-Union Sq played back on the map, beside its three
 * levels from the barometer and the same phone's Google Maps saying "No GPS
 * signal". Grey dots are steps and turns alone; the green line is the same walk
 * pinned to the elevators and the phone's good fixes, then snapped to the walk line.
 */
export default function StationReplay() {
  const [open, setOpen] = useState(true);
  const [level, setLevel] = useState<SheetLevel>(1);
  const [rec, setRec] = useState<Recording | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [s, setS] = useState(START_S);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<number>(1);
  const filmRef = useRef<HTMLVideoElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const desktop = useMediaQuery("(min-width: 1024px)");
  const { slot, top } = useLeftCard("station-replay", desktop && open);

  useEffect(() => {
    let live = true;
    loadWalk().then((json) => {
      const p = parseRecording(json);
      if (!live) return;
      if (p.ok) setRec(p.recording); else setFailed(p.errors[0] ?? "The recording did not load.");
    }).catch(() => live && setFailed("The recording did not load."));
    return () => { live = false; };
  }, []);

  const cleaned = useMemo(() => (rec ? cleanWalk(rec, { levels: LEVELS, rideAt: RIDE_AT, line: LINE, lineLevels: LINE_LEVELS, snapFrom: T0, snapTo: T0 + GOOGLE_NO_GPS.to * 1000 }) : null), [rec]);

  const times = useMemo(() => (rec && cleaned ? signTimes(rec.steps, cleaned.rides) : null), [rec, cleaned]);

  // The film of the trip follows the replay clock: played at the matching rate where it can be, stepped frame by frame where it runs too slow.
  useEffect(() => {
    const v = filmRef.current;
    if (!v || !times) return;
    const { at, rate } = filmAt(times, s);
    const want = rate * speed;
    try {
      if (playing && want >= 0.25 && want <= 16) {
        v.playbackRate = want;
        if (Math.abs(v.currentTime - at) > 0.6) v.currentTime = at;
        if (v.paused) void v.play().catch(() => {});
      } else {
        if (!v.paused) v.pause();
        if (Math.abs(v.currentTime - at) > 0.15) v.currentTime = at;
      }
    } catch { /* the film is not loaded yet */ }
  }, [s, playing, speed, times]);

  useEffect(() => onMapInstance((map) => { mapRef.current = map; setMapReady(!!map); }), []);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !open || !cleaned) return;
    const draw = () => {
      try {
        ensure(map);
        void map.getSource<GeoJSONSource>(SRC)?.setData(features(cleaned, s));
      } catch { /* the style is still loading: the next tick draws it */ }
    };
    if (map.isStyleLoaded()) draw(); else void map.once("idle", draw);
  }, [cleaned, s, open, mapReady]);
  // The app swaps or reloads the map's style while starting up, which takes added layers with it: put them back.
  const sRef = useRef(s);
  sRef.current = s;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !open || !cleaned) return;
    const again = () => {
      if (map.getSource(SRC) || !map.isStyleLoaded()) return;
      try {
        ensure(map);
        void map.getSource<GeoJSONSource>(SRC)?.setData(features(cleaned, sRef.current));
      } catch { /* not ready yet */ }
    };
    map.on("styledata", again);
    map.on("idle", again);
    return () => { map.off("styledata", again); map.off("idle", again); };
  }, [cleaned, open, mapReady]);
  // Frame the walk once it is loaded, clear of the card or the sheet.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !open || !cleaned?.clean.length) return;
    const pts = cleaned.clean.map((p) => p.at);
    const lons = pts.map((p) => p[0]), lats = pts.map((p) => p[1]);
    const frame = () => map.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding: framePadding(map, { top: 90, bottom: 40, left: 40, right: 90 }), maxZoom: 17.5, duration: 900 });
    // The app's own opening camera runs first; frame the walk after it, and again once the panels have settled.
    const ids = [setTimeout(frame, 400), setTimeout(frame, 2500)];
    return () => ids.forEach(clearTimeout);
  }, [cleaned, open, mapReady]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !open || !cleaned?.clean.length || !playing) return;
    keepInView(map, pathAt(cleaned.clean, T0 + s * 1000));
  }, [s, playing, cleaned, open]);
  useEffect(() => () => {
    const map = mapRef.current;
    if (!map) return;
    try {
      for (const id of LAYERS) if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(SRC)) map.removeSource(SRC);
    } catch { /* the map has gone */ }
  }, []);

  const speedRef = useRef(speed);
  speedRef.current = speed;
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setS((v) => {
      const next = v + (speedRef.current * TICK_MS) / 1000;
      if (next >= END_S) { setPlaying(false); return END_S; }
      return next;
    }), TICK_MS);
    return () => clearInterval(id);
  }, [playing]);

  // For tests and rehearsals: jump to a moment, and read where the dot is.
  useEffect(() => {
    if (!(import.meta.env.DEV || import.meta.env.VITE_E2E)) return;
    const w = window as unknown as { __stationReplay?: unknown };
    w.__stationReplay = {
      seek: (sec: number) => { setPlaying(false); setS(sec); },
      dot: () => (cleaned?.clean.length ? pathAt(cleaned.clean, T0 + s * 1000) : null),
    };
    return () => { delete w.__stationReplay; };
  });

  if (!open) return null;
  const close = () => { setPlaying(false); setOpen(false); };
  const lv = cleaned?.spans ? levelAt(cleaned.spans, T0 + s * 1000) : null;
  const where = lv === "ride" ? "Elevator" : lv ? LEVEL_NAME[lv] ?? lv : "";
  const still = stillAt(s);
  const noGps = s >= GOOGLE_NO_GPS.from && s <= GOOGLE_NO_GPS.to;
  const sign = times ? SIGNS[signAt(times, s)] : null;
  const play = () => { if (s >= END_S) setS(START_S); setPlaying((p) => !p); };

  const header = (
    <div className="flex items-center gap-2.5">
      <button type="button" className="task-action min-h-11 min-w-11 px-3" aria-label={playing ? "Pause" : s >= END_S ? "Play again" : "Play"} onClick={play} data-testid="replay-play">
        {playing ? <Pause size={18} aria-hidden /> : s >= END_S ? <RotateCcw size={18} aria-hidden /> : <Play size={18} aria-hidden />}
      </button>
      <button type="button" className="flex min-h-11 min-w-0 flex-1 flex-col justify-center text-left" aria-expanded={level > 0} onClick={() => setLevel((l) => (l === 0 ? 1 : l))}>
        <span className="task-caption block truncate">Fri · 14 St-Union Sq</span>
        <span className="block truncate text-[15px] font-bold" data-testid="replay-now">{clock(s)}{where ? ` · ${where}` : ""}</span>
      </button>
      <label className="sr-only" htmlFor="replay-speed">Speed</label>
      <select id="replay-speed" value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="task-action min-h-11 rounded-xl px-2 text-sm font-bold" data-testid="replay-speed">
        {SPEEDS.map((x) => <option key={x} value={x}>{x}×</option>)}
      </select>
      <button type="button" aria-label="Close" className="task-action task-close" onClick={close}><X size={18} /></button>
    </div>
  );

  const body = (
    <div className="pull-sheet-body mt-2 flex flex-col gap-2" data-testid="replay-body">
      <input type="range" min={START_S} max={END_S} step={1} value={Math.round(s)} aria-label="Time in the walk" className="h-8 w-full shrink-0 accent-amber-300"
        onChange={(e) => { setPlaying(false); setS(Number(e.target.value)); }} />
      {failed ? <p className="text-sm text-amber-200" role="status">{failed}</p> : null}
      {cleaned?.gaps.length ? <p className="text-xs text-amber-200" role="status" data-testid="replay-gaps">{cleaned.gaps.join(" ")}</p> : null}
      {cleaned?.spans ? <LevelGraph baro={rec!.baro} spans={cleaned.spans} rides={cleaned.rides} rideNames={RIDE_AT.map((r) => r.name)} from={START_S} to={END_S} now={s} noGps={GOOGLE_NO_GPS} t0={T0} /> : null}
      {sign ? (
        <div className="flex shrink-0 items-center gap-2.5 rounded-xl bg-black/30 p-2" data-testid="replay-sign" aria-live="polite">
          <img src={`/walks/${sign.photo}.jpg`} alt={sign.sign} className="h-16 w-16 shrink-0 rounded-lg object-cover" />
          <div className="min-w-0 text-[13px] leading-snug">
            <p className="truncate font-bold">{sign.sign}</p>
            <p className="text-slate-200">{sign.say}</p>
          </div>
        </div>
      ) : null}
      <div className="flex shrink-0 gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="task-caption">Our walk</span>
          <figure className="relative flex h-[min(340px,38vh)] w-full items-center justify-center overflow-hidden rounded-xl bg-black" data-testid="replay-film">
            <video ref={filmRef} src="/walks/trip.mp4" muted playsInline preload="auto" className="max-h-full max-w-full object-contain" aria-label="The film of the walk at this moment" />
          </figure>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="task-caption">Google Maps</span>
          <figure className="relative flex h-[min(340px,38vh)] w-full items-center justify-center overflow-hidden rounded-xl bg-black" data-testid="replay-google">
            <img src={still.src} alt="Google Maps on the same phone at this moment" className="max-h-full max-w-full object-contain" />
            {noGps ? <figcaption className="absolute bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-red-600/90 px-2 py-0.5 text-center text-xs font-bold">No GPS signal</figcaption> : null}
          </figure>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 shrink-0 rounded-full border-2 border-white bg-blue-600" aria-hidden />Now</span>
        <span className="flex items-center gap-1.5"><span className="h-1.5 w-6 shrink-0 rounded bg-green-500" aria-hidden />Cleaned</span>
        <span className="flex items-center gap-1.5"><span className="flex w-6 shrink-0 justify-between" aria-hidden>{[0, 1, 2].map((k) => <span key={k} className="h-1.5 w-1.5 rounded-full bg-gray-400" />)}</span>Steps + turns</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 shrink-0 rounded-full border-2 border-slate-900 bg-white" aria-hidden />Sign</span>
      </div>
    </div>
  );

  if (slot) return createPortal(
    <section data-testid="station-replay" aria-label="Station replay" className={`task-panel ${top ? "flex" : "hidden"} min-h-0 flex-col overflow-y-auto rounded-2xl p-3`}>
      {header}
      {body}
    </section>,
    slot,
  );
  return (
    <PullSheet testId="station-replay" label="Station replay" level={level} onLevel={setLevel} onClose={close} header={header}>
      {body}
    </PullSheet>
  );
}
