import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { usePullSheetUp } from "@/lib/store/pullSheet";
import { Move, MoveDiagonal2 } from "lucide-react";
import "@/lib/map/maplibreWorker";
import { Map as MapLibreMapCtor, type GeoJSONSource, type Map as MapLibreMap } from "maplibre-gl";
import { RestroomDetails } from "@/components/RestroomCard";
import { useLeftColumn } from "@/lib/store/leftColumn";
import type { RestroomInfo } from "@/lib/map/restrooms";
import { RestroomIcon } from "@/components/LiveLayerRows";
import { installLandmarkLabels, LANDMARK_LABELS_LAYER } from "@/lib/map/landmarkLabels";
import { applyInsetFilters, bearingTo, coneRotation, distanceLabel, facingLabel, miniStyle, refreshInsetSource, syncInsetOverlays, whereLabel, type InsetFilters } from "@/lib/map/miniStyle";
import { metresBetween } from "@/lib/map/walk";
import { pushPanel } from "@/lib/store/PanelContext";
import { dotsNear, useLiveDots } from "@/lib/transit/liveVehicles";

const DOTS = "mini-live-vehicles";
/** Live vehicles drawn on the inset: about what it shows at z15.5. */
const DOTS_RADIUS_M = 900;

interface NearestRestroom { info: RestroomInfo; metres: number; bearing: number }

/** Where the inset floats and how big it is, kept per browser. Offsets are from the bottom-right corner. */
interface Placement { size: number; right: number | null; bottom: number | null }
const PLACEMENT_KEY = "nyc.streetMiniMap";
const MIN_SIZE = 120;
/** Tapping the resize handle steps through these; dragging it sizes freely. */
const STEPS = [160, 240, 340];

function maxSize(): number {
  return Math.max(MIN_SIZE, Math.min(480, window.innerWidth - 24, Math.round(window.innerHeight * 0.6)));
}

function clampSize(size: number): number {
  return Math.round(Math.min(maxSize(), Math.max(MIN_SIZE, size)));
}

function readPlacement(): Placement {
  const fallback: Placement = { size: window.innerWidth >= 1024 ? 240 : 170, right: null, bottom: null };
  try {
    const raw = JSON.parse(localStorage.getItem(PLACEMENT_KEY) ?? "null") as Partial<Placement> | null;
    if (!raw || typeof raw.size !== "number") return fallback;
    const at = (v: unknown) => (typeof v === "number" && v >= 0 ? v : null);
    return { size: clampSize(raw.size), right: at(raw.right), bottom: at(raw.bottom) };
  } catch {
    return fallback;
  }
}

function savePlacement(p: Placement): void {
  try {
    localStorage.setItem(PLACEMENT_KEY, JSON.stringify(p));
  } catch {
    /* private mode */
  }
}

/** Pointer drag on a handle: moves report the offset from the press; a press without movement is a tap. */
function useDrag(onStart: () => void, onMove: (dx: number, dy: number) => void, onEnd: (moved: boolean) => void) {
  const start = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  return {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      start.current = { x: e.clientX, y: e.clientY, moved: false };
      onStart();
    },
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
      const s = start.current;
      if (!s) return;
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      if (!s.moved && Math.hypot(dx, dy) < 4) return;
      s.moved = true;
      onMove(dx, dy);
    },
    onPointerUp: (e: ReactPointerEvent<HTMLElement>) => {
      const s = start.current;
      start.current = null;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
      if (s) onEnd(s.moved);
    },
    onPointerCancel: () => {
      start.current = null;
    },
  };
}

function openRestroom(info: RestroomInfo, distanceLabel?: string): void {
  pushPanel({
    id: `restroom:${info.lon.toFixed(5)},${info.lat.toFixed(5)}`,
    title: info.name,
    subtitle: distanceLabel ?? "Public restroom",
    details: <RestroomDetails restroom={info} distanceLabel={distanceLabel} />,
  });
}

/**
 * Street-level mini map: a small north-up inset, bottom right by default, left
 * of the Map · 3D · Street and locate stack on wider screens. It floats: drag
 * the move handle to place it anywhere, drag the corner handle to size it, or
 * tap that handle to step through three sizes (owner, 2026-10-27); both are
 * remembered. Flat footprints, streets and their names, stations, bus stops,
 * shops, landmarks, the trip you are on, a "You" dot and a heading cone that
 * turns with the camera. Live trains and buses show as line-coloured dots.
 * Point layers for Layers switches that are on are copied from the main map.
 * Public restrooms are one tappable layer of its own (`mini-restrooms`).
 * "Leave" stands you back up; a tap on the map opens the flat map centred on you.
 */
export function StreetMiniMap({ main, getEye, onExit, onMap, filters }: {
  main: MapLibreMap;
  getEye: () => { lon: number; lat: number; bearing: number } | null;
  onExit: () => void;
  /** A tap on the map itself: the flat map, centred on you, with a way back. */
  onMap: () => void;
  filters: InsetFilters;
}) {
  const box = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState(readPlacement);
  const placeRef = useRef(place);
  placeRef.current = place;
  const grab = useRef<Placement | null>(null);
  const [bearing, setBearing] = useState(0);
  const miniRef = useRef<MapLibreMap | null>(null);
  // The closest restroom to the eye, even when it is past the inset's edge.
  const [nearest, setNearest] = useState<NearestRestroom | null>(null);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const dots = useLiveDots();
  const facing = facingLabel(bearing);
  const filtersKey = `${filters.placeClasses.join(",")}|${[...filters.on].join(",")}`;

  useEffect(() => {
    if (!box.current) return;
    const eye = getEye();
    const c = main.getCenter();
    const full = main.getStyle() ?? { version: 8 as const, sources: {}, layers: [] };
    const mini = new MapLibreMapCtor({
      container: box.current,
      style: miniStyle(full, filtersRef.current),
      center: eye ? [eye.lon, eye.lat] : [c.lng, c.lat],
      zoom: 15.5,
      bearing: 0,
      pitch: 0,
      interactive: false,
      attributionControl: false,
      fadeDuration: 0,
    });
    miniRef.current = mini;
    let shown = "";
    let at = { lng: 0, lat: 0 };
    let alive = true;
    const syncRestrooms = () => {
      const e = getEye();
      if (!e || !mini.getSource("mini-restrooms")) return;
      if (shown && metresBetween([e.lon, e.lat], [at.lng, at.lat]) < 20) return;
      at = { lng: e.lon, lat: e.lat };
      void import("@/lib/map/restrooms").then((mod) => {
        if (!alive) return;
        void mod.loadRestrooms().then((all) => {
          if (!alive || !mini.getSource("mini-restrooms")) return;
          const b = mini.getBounds();
          const view = mod.restroomsForView(all, [e.lon, e.lat], mini.getZoom(), {
            west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth(),
          });
          const here: [number, number] = [e.lon, e.lat];
          const closest = mod.nearestRestrooms(all, here, 1).features[0];
          const info = closest ? mod.restroomInfo(closest) : null;
          setNearest(info ? { info, metres: metresBetween(here, [info.lon, info.lat]), bearing: bearingTo(here, [info.lon, info.lat]) } : null);
          const has = (f: GeoJSON.Feature) => view.features.some((v) => v.geometry?.type === "Point" && f.geometry?.type === "Point" && v.geometry.coordinates[0] === f.geometry.coordinates[0] && v.geometry.coordinates[1] === f.geometry.coordinates[1]);
          const next: GeoJSON.FeatureCollection = closest && !has(closest) ? { type: "FeatureCollection", features: [...view.features, closest] } : view;
          const key = next.features.map((f) => {
            if (f.geometry?.type !== "Point") return "";
            const [lon, lat] = f.geometry.coordinates as [number, number];
            return `${lon.toFixed(4)},${lat.toFixed(4)}`;
          }).join("|");
          if (key === shown) return;
          shown = key;
          mod.setMiniRestrooms(mini, next);
        });
      });
    };
    mini.on("load", () => {
      // Points under the dots. Camera bearing and pitch stay at the north-up values above.
      applyInsetFilters(mini, main, filtersRef.current, DOTS);
      syncInsetOverlays(mini, main, DOTS);
      // Landmarks are how you know where you are; same colours as the main map's.
      const color = main.getLayer(LANDMARK_LABELS_LAYER) ? main.getPaintProperty(LANDMARK_LABELS_LAYER, "text-color") : undefined;
      const halo = main.getLayer(LANDMARK_LABELS_LAYER) ? main.getPaintProperty(LANDMARK_LABELS_LAYER, "text-halo-color") : undefined;
      installLandmarkLabels(mini, typeof color === "string" ? color : "#1f2937", typeof halo === "string" ? halo : "#ffffff");
      mini.addSource(DOTS, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      // Trains are bullets with their letter, so you can tell which line is passing.
      mini.addLayer({ id: DOTS, type: "circle", source: DOTS, paint: {
        "circle-radius": ["case", ["get", "bus"], 3, 7],
        "circle-color": ["get", "color"],
        "circle-opacity": ["case", ["get", "bus"], ["case", ["get", "under"], 0, 1], ["case", ["get", "under"], 0.6, 1]],
        "circle-stroke-color": ["case", ["get", "bus"], ["get", "color"], "#ffffff"],
        "circle-stroke-width": ["case", ["get", "bus"], 2, 1.5],
      } });
      mini.addLayer({ id: `${DOTS}-label`, type: "symbol", source: DOTS, filter: ["!", ["get", "bus"]], layout: {
        "text-field": ["get", "label"], "text-font": ["Noto Sans Bold"], "text-size": 9,
        "text-allow-overlap": true, "text-ignore-placement": true,
      }, paint: { "text-color": ["case", ["in", ["get", "label"], ["literal", ["N", "Q", "R", "W"]]], "#111111", "#ffffff"] } });
      void import("@/lib/map/restrooms").then((mod) => {
        if (!alive) return;
        mod.mountMiniRestrooms(mini);
        shown = "";
        syncRestrooms();
      });
      mini.resize();
    });
    const sync = () => {
      const e = getEye();
      if (e) mini.jumpTo({ center: [e.lon, e.lat] });
      setBearing(e?.bearing ?? main.getBearing());
      syncRestrooms();
    };
    sync();
    main.on("move", sync);
    return () => {
      alive = false;
      main.off("move", sync);
      miniRef.current = null;
      mini.remove();
    };
  }, [main, getEye]);

  // A new size redraws the map to fill it.
  useEffect(() => {
    miniRef.current?.resize();
  }, [place.size]);

  // Filter toggles, and layers that mount a moment later, update this inset in place.
  useEffect(() => {
    let queued = 0;
    const run = () => {
      const mini = miniRef.current;
      if (!mini) return;
      applyInsetFilters(mini, main, filtersRef.current, DOTS);
      syncInsetOverlays(mini, main, DOTS);
    };
    const schedule = () => {
      if (queued) return;
      queued = window.setTimeout(() => {
        queued = 0;
        run();
      }, 0);
    };
    const onSource = (e: { sourceDataType?: string; sourceId?: string }) => {
      if (e.sourceDataType !== "content" || !e.sourceId) return;
      const mini = miniRef.current;
      if (mini) refreshInsetSource(mini, main, e.sourceId);
    };
    schedule();
    main.on("styledata", schedule);
    main.on("sourcedata", onSource);
    return () => {
      window.clearTimeout(queued);
      main.off("styledata", schedule);
      main.off("sourcedata", onSource);
    };
  }, [main, filtersKey]);

  useEffect(() => {
    const mini = miniRef.current;
    const src = mini?.getSource<GeoJSONSource>(DOTS);
    if (!mini || !src) return;
    const c = getEye() ?? { lon: mini.getCenter().lng, lat: mini.getCenter().lat };
    void src.setData(dotsNear(dots, c.lon, c.lat, DOTS_RADIUS_M));
  }, [dots, getEye]);

  const onMiniClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    const mini = miniRef.current;
    const el = box.current;
    if (!mini || !el) return;
    const rect = el.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const f = mini.getLayer("mini-restrooms") ? mini.queryRenderedFeatures([[x - 24, y - 24], [x + 24, y + 24]], { layers: ["mini-restrooms"] })[0] : undefined;
    // A tap on the map itself (not a restroom) opens the flat map centred on you.
    if (!f) { onMap(); return; }
    void import("@/lib/map/restrooms").then((mod) => {
      const info = mod.restroomInfo(f);
      if (!info) return;
      openRestroom(info);
    });
  };

  const begin = useCallback(() => {
    const el = frame.current;
    const parent = el?.offsetParent?.getBoundingClientRect();
    const rect = el?.getBoundingClientRect();
    const cur = placeRef.current;
    grab.current = rect && parent ? { size: cur.size, right: parent.right - rect.right, bottom: parent.bottom - rect.bottom } : cur;
  }, []);
  const finish = useCallback(() => {
    grab.current = null;
    savePlacement(placeRef.current);
  }, []);
  const move = useDrag(begin, (dx, dy) => {
    const g = grab.current;
    const parent = frame.current?.offsetParent?.getBoundingClientRect();
    const rect = frame.current?.getBoundingClientRect();
    if (!g || g.right == null || g.bottom == null || !parent || !rect) return;
    const right = Math.min(Math.max(0, g.right - dx), parent.width - rect.width);
    const bottom = Math.min(Math.max(0, g.bottom - dy), parent.height - rect.height);
    setPlace((p) => ({ ...p, right: Math.round(right), bottom: Math.round(bottom) }));
  }, finish);
  // The bottom-right corner stays put, so the handle at the top left grows the map up and left.
  const resize = useDrag(begin, (dx, dy) => {
    const g = grab.current;
    if (g) setPlace((p) => ({ ...p, size: clampSize(g.size - Math.max(dx, dy)) }));
  }, (moved) => {
    if (!moved) {
      setPlace((p) => {
        const next = STEPS.find((s) => s > p.size + 4 && s <= maxSize());
        return { ...p, size: clampSize(next ?? STEPS[0]) };
      });
    }
    finish();
  });

  const placed = place.right != null && place.bottom != null;
  // An open answer sheet takes the ask box to the left side, and --chat-bar-h with it
  // (800×1000: the map rode up under the street bar); the map stays at the foot instead.
  const sheet = useLeftColumn((s) => s.sheet);
  const handle = "flex h-7 w-7 touch-none items-center justify-center rounded-full border border-border bg-card text-foreground shadow-md";
  const dist = nearest ? distanceLabel(nearest.metres) : "";
  // Unmoved, it rides above Center on my location (.corner-locate: chat bar + pull sheet + 12 px, 44 px tall);
  // a fixed 168 px put the restroom chip under that button on a 375×667 phone (layout check).
  // On a phone under 600 px tall there is no room for it between the quick buttons and an open card:
  // measured on 320×568, a card left 52 to 73 px, and the map's Leave button rose onto Layers and Language
  // (layout check, 2026-11-10). It steps aside while the card is up; "Map" in the street bar still leaves.
  const cardUp = usePullSheetUp();
  const noRoom = cardUp && !placed && typeof window !== "undefined" && window.innerHeight < 600;
  return (
    <div
      ref={frame}
      data-testid="street-minimap"
      data-vehicles={dots.length}
      data-size={place.size}
      style={placed ? { right: place.right!, bottom: place.bottom! } : undefined}
      className={`absolute z-20 ${noRoom ? "hidden" : "flex"} flex-col items-end gap-[var(--sp-1)] ${placed ? "" : `${sheet ? "bottom-[calc(var(--edge)+36px)]" : "bottom-[calc(var(--chat-bar-h,56px)+var(--pull-sheet-h,0px)+64px)]"} lg:bottom-[calc(var(--edge)+36px)] right-[var(--edge)] sm:right-[calc(var(--edge)+68px)]`}`}
    >
      <div className="flex gap-[var(--sp-1)]">
        <button type="button" aria-label="Move map" title="Drag to move the map" className={`${handle} cursor-grab active:cursor-grabbing`} {...move}>
          <Move aria-hidden className="h-4 w-4" />
        </button>
        <button type="button" onClick={onExit} className="h-7 rounded-full border border-border bg-card px-[var(--sp-3)] text-[12px] font-semibold text-foreground shadow-md">
          Leave
        </button>
      </div>
      <div className="relative" style={{ width: place.size, height: place.size }}>
        <button
          type="button"
          aria-label={`Street map. You are here, ${facing}. Click a restroom for details.`}
          onClick={onMiniClick}
          className="relative h-full w-full overflow-hidden rounded-[18px] border-2 border-foreground bg-[#F2F1ED] p-0 text-left shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div ref={box} className="absolute inset-0" />
          <div aria-hidden className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            <div className="relative h-16 w-16">
              <div
                data-testid="minimap-cone"
                data-bearing={Math.round(coneRotation(bearing))}
                className="absolute inset-0"
                style={{ transform: `rotate(${coneRotation(bearing)}deg)` }}
              >
                <div
                  className="absolute bottom-1/2 left-1/2 h-0 w-0 -translate-x-1/2 border-x-[16px] border-b-[34px] border-x-transparent"
                  style={{ borderBottomColor: "#c6f702" }}
                />
              </div>
              <div className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#c6f702] bg-[#121212]" />
            </div>
          </div>
          <div className="pointer-events-none absolute inset-x-1 bottom-1 z-10 rounded-full bg-[#F2F1ED]/95 px-1 py-0.5 text-center text-[10px] font-semibold leading-tight text-[#121212]">
            You · {facing}
          </div>
        </button>
        <button type="button" aria-label="Resize map" title="Drag to resize, tap for the next size" data-overlap-ok className={`${handle} absolute -left-2 -top-2 z-20 cursor-nwse-resize`} {...resize}>
          <MoveDiagonal2 aria-hidden className="h-4 w-4" />
        </button>
      </div>
      {nearest ? (
        <button
          type="button"
          data-testid="minimap-nearest-restroom"
          aria-label={`Nearest restroom, ${whereLabel(nearest.metres, nearest.bearing)}`}
          onClick={() => openRestroom(nearest.info, `${whereLabel(nearest.metres, nearest.bearing)} from you`)}
          className="flex h-7 items-center gap-1 rounded-full border border-border bg-card px-[var(--sp-3)] text-[12px] font-semibold text-foreground shadow-md"
        >
          {/* Turned to where you are facing: straight up means ahead. */}
          <span aria-hidden className="inline-block" style={{ transform: `rotate(${Math.round(nearest.bearing - bearing)}deg)` }}>↑</span>
          <RestroomIcon size={16} />
          {dist}
        </button>
      ) : null}
    </div>
  );
}
