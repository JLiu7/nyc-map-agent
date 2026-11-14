import "@/components/task-screens.css";
import { Pause, Play, RotateCcw } from "lucide-react";
import { Marker, type Map as MapLibreMap } from "maplibre-gl";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { onMapInstance } from "@/lib/map/mapInstance";
import { framePadding, measureCover } from "@/lib/map/mapCover";
import { useLeftCard } from "@/lib/store/leftColumn";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { FILM, FILM_S, frameOf, RIDE, tripAt, WALKED, type Part } from "./trip";

const SRC = "station-replay";
const LAYERS = ["station-replay-ride", "station-replay-walk"] as const;

const LINES: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [
    ...WALKED.map((line): GeoJSON.Feature => ({ type: "Feature", properties: { kind: "walk" }, geometry: { type: "LineString", coordinates: line } })),
    { type: "Feature", properties: { kind: "ride" }, geometry: { type: "LineString", coordinates: RIDE } },
  ],
};

function ensure(map: MapLibreMap): void {
  if (map.getSource(SRC)) return;
  map.addSource(SRC, { type: "geojson", data: LINES });
  map.addLayer({ id: "station-replay-ride", type: "line", source: SRC, filter: ["==", ["get", "kind"], "ride"], layout: { "line-cap": "round" }, paint: { "line-color": "#facc15", "line-width": 4, "line-dasharray": [1, 2] } });
  map.addLayer({ id: "station-replay-walk", type: "line", source: SRC, filter: ["==", ["get", "kind"], "walk"], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#22c55e", "line-width": 5 } });
}

/** The dot and the level label it carries, as one map marker. */
function dotElement(): { el: HTMLElement; label: HTMLElement } {
  const el = document.createElement("div");
  el.dataset.testid = "replay-dot";
  el.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:4px;pointer-events:none;";
  const label = document.createElement("span");
  label.dataset.testid = "replay-level";
  label.style.cssText = "padding:2px 8px;border-radius:999px;background:#0f172a;color:#fff;font:700 13px/1.4 system-ui,sans-serif;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,.4);";
  const dot = document.createElement("span");
  dot.style.cssText = "width:20px;height:20px;border-radius:50%;background:#2563eb;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.5);";
  el.append(label, dot);
  return { el, label };
}

/**
 * The bottom padding that keeps the dot above the chat bar on a phone. The bar is not a map cover there,
 * and the trip starts at the south end of its frame, so a fixed 60 px put the dot under the bar at 375×667.
 * A strip of at least 60 px always stays between the film's panel and the padding, so the frame still fits.
 */
function clearOfChatBar(map: MapLibreMap): number {
  const box = map.getContainer().getBoundingClientRect();
  const bar = document.querySelector("[data-testid=agent-bar]")?.getBoundingClientRect();
  // The bar can mount after the map on a slow machine: allow for its usual height until it does.
  const want = Math.max(60, (bar && bar.height > 0 ? box.bottom - bar.top : 96) + 28);
  const room = box.height - measureCover(map).top - 16 - 60;
  return Math.max(16, Math.min(want, room));
}

/**
 * Station replay (a demo page, off unless `?flags=+stationReplay`): the film of
 * the step-free trip from Cortlandt St to 14 St-Union Sq, and the map with a
 * dot that moves along the walk as the film plays. The dot carries its level.
 * The film is the clock: the dot is placed from the film's own time on every
 * frame, so the two cannot drift apart.
 */
export default function StationReplay() {
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const filmRef = useRef<HTMLVideoElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const dotRef = useRef<{ marker: Marker; label: HTMLElement } | null>(null);
  const tRef = useRef(0);
  const partRef = useRef<Part | null>(null);
  const desktop = useMediaQuery("(min-width: 1024px)");
  const { slot, top } = useLeftCard("station-replay", desktop);

  const frame = useCallback((part: Part, duration = 900) => {
    const map = mapRef.current;
    if (!map) return;
    partRef.current = part;
    try {
      map.fitBounds(frameOf(part), { padding: framePadding(map, { top: 90, bottom: desktop ? 60 : clearOfChatBar(map), left: 60, right: 90 }), maxZoom: 17.5, duration });
    } catch { /* the map is not ready yet: the next move frames it */ }
  }, [desktop]);

  /** Put the dot, its label and the camera where second `at` of the film is. */
  const show = useCallback((at: number) => {
    tRef.current = at;
    const p = tripAt(at);
    const d = dotRef.current;
    if (d) {
      d.marker.setLngLat(p.at);
      if (d.label.textContent !== p.level) d.label.textContent = p.level;
    }
    if (partRef.current !== null && partRef.current !== p.part) frame(p.part);
  }, [frame]);

  useEffect(() => onMapInstance((map) => { mapRef.current = map; setMapReady(!!map); }), []);

  // The dot is a marker, so it stays through the style reloads that take added layers with them.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const { el, label } = dotElement();
    const marker = new Marker({ element: el, anchor: "bottom", offset: [0, 10] }).setLngLat(tripAt(tRef.current).at).addTo(map);
    dotRef.current = { marker, label };
    show(tRef.current);
    return () => { marker.remove(); dotRef.current = null; };
  }, [mapReady, show]);

  // The walked line. The app swaps or reloads the map's style while starting up: put the line back each time.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const draw = () => {
      if (!map.isStyleLoaded()) return;
      try { ensure(map); } catch { /* not ready yet: the next event draws it */ }
    };
    draw();
    map.on("styledata", draw);
    map.on("idle", draw);
    return () => {
      map.off("styledata", draw);
      map.off("idle", draw);
      try {
        for (const id of LAYERS) if (map.getLayer(id)) map.removeLayer(id);
        if (map.getSource(SRC)) map.removeSource(SRC);
      } catch { /* the map has gone */ }
    };
  }, [mapReady]);

  // Frame the station the dot is in. The app's own opening camera runs first; frame after it, and again once the panels have settled.
  useEffect(() => {
    if (!mapReady) return;
    const now = () => frame(tripAt(tRef.current).part);
    const ids = [setTimeout(now, 400), setTimeout(now, 2500)];
    return () => ids.forEach(clearTimeout);
  }, [mapReady, frame, desktop]);

  // While it plays, every screen frame reads the film's time and moves the dot there.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    let shown = -1;
    const tick = (now: number) => {
      const v = filmRef.current;
      // A browser that cannot decode the film (the test browser has no H.264) still plays the trip, on the wall clock.
      const blind = !v || !!v.error || v.networkState === v.NETWORK_NO_SOURCE;
      const at = Math.min(FILM_S, blind ? tRef.current + (now - last) / 1000 : v.currentTime);
      last = now;
      show(at);
      if (Math.abs(at - shown) >= 0.1) { shown = at; setT(at); }
      if (at >= FILM_S || (!blind && v.ended)) { setT(at); setPlaying(false); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, show]);

  const seek = useCallback((at: number) => {
    const to = Math.max(0, Math.min(FILM_S, at));
    const v = filmRef.current;
    try { if (v) v.currentTime = to; } catch { /* the film is not loaded yet */ }
    show(to);
    setT(to);
  }, [show]);

  const play = () => {
    const v = filmRef.current;
    if (playing) { v?.pause(); setPlaying(false); return; }
    if (tRef.current >= FILM_S - 0.05) seek(0);
    void v?.play().catch(() => { /* no film in this browser: the trip still plays */ });
    setPlaying(true);
  };

  // For tests and rehearsals: jump to a second of the film, and read where the dot is.
  useEffect(() => {
    if (!(import.meta.env.DEV || import.meta.env.VITE_E2E)) return;
    const w = window as unknown as { __stationReplay?: unknown };
    w.__stationReplay = {
      seek: (sec: number) => { filmRef.current?.pause(); setPlaying(false); seek(sec); },
      dot: () => tripAt(tRef.current).at,
      time: () => tRef.current,
    };
    return () => { delete w.__stationReplay; };
  }, [seek]);

  const ended = t >= FILM_S - 0.05;
  const film = (
    // The film has its words on screen, so it plays without sound.
    <video ref={filmRef} src={FILM} muted playsInline preload="auto" data-testid="replay-film" aria-label="The film of the trip"
      onEnded={() => setPlaying(false)}
      className={desktop ? "aspect-[9/16] min-h-0 w-full shrink rounded-xl bg-black object-contain" : "mx-auto aspect-[9/16] h-[min(44dvh,calc(100dvh-420px))] shrink-0 rounded-xl bg-black object-contain"} />
  );
  const controls = (
    <div className="flex shrink-0 items-center gap-2.5">
      <button type="button" className="task-action min-h-11 min-w-11 shrink-0 px-3" aria-label={playing ? "Pause" : ended ? "Play again" : "Play"} onClick={play} data-testid="replay-play">
        {playing ? <Pause size={18} aria-hidden /> : ended ? <RotateCcw size={18} aria-hidden /> : <Play size={18} aria-hidden />}
      </button>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[15px] font-bold" data-testid="replay-place">{tripAt(t).place}</span>
        <input type="range" min={0} max={FILM_S} step={0.1} value={t} aria-label="Time in the trip" className="h-7 w-full accent-amber-300" data-testid="replay-scrubber"
          onChange={(e) => seek(Number(e.target.value))} />
      </div>
    </div>
  );

  if (slot) return createPortal(
    <section data-testid="station-replay" aria-label="Station replay" className={`task-panel ${top ? "flex" : "hidden"} min-h-0 flex-col gap-2 rounded-2xl p-3`}>
      {film}
      {controls}
    </section>,
    slot,
  );
  // On a phone the film sits above the map: a panel under the menu row, with the map and the dot below it.
  return (
    <section data-testid="station-replay" aria-label="Station replay" className="task-panel task-top flex flex-col gap-2 rounded-2xl p-2">
      {film}
      {controls}
    </section>
  );
}
