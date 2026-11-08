import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { useFlag } from "@/lib/flags";
import { sharedCoords, startSharing, useSharedLocation } from "@/lib/geo/sharedLocation";
import { nextYouCamera, setYouCamera, useYouCamera } from "@/lib/geo/youCamera";
import { onMapInstance } from "@/lib/map/mapInstance";
import { setOpenMenu, useOpenMenu } from "@/lib/store/openMenu";
import { setFollowMode, stopFollowing, useFollowMode, useFollowed, usePreviewing, type FollowMode } from "@/lib/transit/follow";
import { useSelectedLine } from "@/lib/transit/selectedLine";
import { useMenuT } from "@/lib/i18n/menuText";
import { usePullSheetUp } from "@/lib/store/pullSheet";
import { APP_LANGS, LANG_LABELS, setLangPref, useLangPref, type AppLang } from "@/lib/voice/langPref";
import type { ViewName } from "@/lib/map/viewChange";
import { pickView, useCurrentView } from "./MapViewSwitch";
import { LiveLayerRows } from "./LiveLayerRows";

/**
 * Agent-first map chrome (#370, #372): one column of quick buttons at the top
 * right (Change view, zoom, north; on a phone also Layers and the language), the view menu, and Center on my location just above the chat.
 * Everything else comes up from behind the chat (owner, 2026-10-25). Layers and
 * every other menu live in the top-left menu row (MenuRow).
 */

const ROUND = "flex h-11 w-11 shrink-0 items-center justify-center rounded-full p-0 shadow-[0_6px_18px_rgba(0,0,0,0.35)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60a5fa]";
const DARK = "border border-[#263449] bg-[rgba(15,23,42,0.92)] text-[#f1f5f9]";
const LIGHT = "border border-transparent bg-[#f8fafc] text-[#0f172a]";
const FLOAT = "rounded-[20px] border border-[#263449] bg-[rgba(11,18,32,0.82)] p-2 text-[#f1f5f9] shadow-[0_12px_32px_rgba(0,0,0,0.5)] backdrop-blur-[14px]";

const svg = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
const ViewIcon = () => <svg {...svg} width={20} height={20}><path d="M12 3 3 8v8l9 5 9-5V8l-9-5Z" /><path d="M3 8l9 5 9-5M12 13v8" /></svg>;
// The "my location" crosshair people know from Google Maps (Material Icons, Apache-2.0).
const LocateIcon = () => <svg width={22} height={22} viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3A8.99 8.99 0 0 0 13 3.06V1h-2v2.06A8.99 8.99 0 0 0 3.06 11H1v2h2.06A8.99 8.99 0 0 0 11 20.94V23h2v-2.06A8.99 8.99 0 0 0 20.94 13H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z" /></svg>;
/** The same three as the Map · 3D · Street switch, which this menu stands in for on a phone. */
const VIEWS: Array<{ id: ViewName; label: string; note: string; icon: ReactNode }> = [
  { id: "map", label: "Map", note: "Flat, from above", icon: <svg {...svg}><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M4 12h16M12 4v16" /></svg> },
  { id: "3d", label: "3D", note: "Tilted, with buildings", icon: <svg {...svg}><path d="M3 20h18M6 20V10l6-5 6 5v10" /></svg> },
  { id: "street", label: "Street", note: "Walk at street level", icon: <svg {...svg}><circle cx="12" cy="5" r="2" /><path d="M12 7v7M9 21l3-7 3 7M8 11h8" /></svg> },
];

const LIVE_URL = "https://nyc.design-bakery.com";
const QrIcon = () => <svg {...svg} width={18} height={18}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3" /></svg>;

/** A small QR button: opens a code for the live app, so someone nearby can scan it any time. */
export function QrButton({ wide }: { wide?: boolean } = {}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [open]);
  return <>
    {wide
      ? <button type="button" data-testid="qr-button" onClick={() => setOpen(true)} className="task-action task-secondary gap-2"><QrIcon />Show the app's QR code</button>
      : <button type="button" aria-label="QR code for this app" data-testid="qr-button" onClick={() => setOpen(true)}
        className={`${ROUND} ${DARK} pointer-events-auto !h-9 !w-9`}><QrIcon /></button>}
    {open ? (
      <div className="pointer-events-auto fixed inset-0 z-[60] flex items-center justify-center p-4" data-testid="qr-sheet">
        {/* A tap anywhere around the code closes it. */}
        <button type="button" aria-label="Close QR code" tabIndex={-1} className="absolute inset-0 bg-black/45" onClick={() => setOpen(false)} />
        <div role="dialog" aria-modal="true" aria-label="Scan to open the app"
          className="relative flex w-[min(300px,100%)] flex-col items-center gap-3 rounded-[24px] bg-white p-5 text-center text-[#0f172a] shadow-[0_16px_40px_rgba(0,0,0,0.45)]">
          <button type="button" aria-label="Close QR code" onClick={() => setOpen(false)}
            className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-full bg-[#0b1220] text-xl leading-none text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60a5fa]">×</button>
          <p className="pr-10 text-left text-[15px] font-semibold">Scan to open the app</p>
          <img src="/qr-live.svg" alt={`QR code for ${LIVE_URL}`} width={220} height={220} className="h-[220px] w-[220px] [image-rendering:pixelated]" />
          <p className="text-[13px] font-medium text-[#334155]">nyc.design-bakery.com</p>
        </div>
      </div>
    ) : null}
  </>;
}

/**
 * Phones only: the language, as a small chip in the rail. The menu row with Settings is gone on a
 * phone, and someone who does not read English must still be able to switch (owner, 2026-10-25;
 * it sat in the wider-screens column and showed nowhere until #54). Wider screens pick it in Settings.
 * A native select sits over the chip, so a phone opens its own picker.
 */
function LangChip() {
  const lang = useLangPref();
  const t = useMenuT();
  return (
    <label data-testid="lang-chip" className={`${ROUND} ${DARK} pointer-events-auto relative text-[13px] font-bold uppercase sm:hidden`}>
      {lang ?? <svg {...svg} width={20} height={20}><path d="m5 8 6 6M4 14l6-6 2-3M2 5h12M7 2h1M22 22l-5-10-5 10M14 18h6" /></svg>}
      <select value={lang ?? ""} aria-label={t("language")} onChange={(e) => setLangPref((e.target.value || null) as AppLang | null)}
        className="absolute inset-0 cursor-pointer appearance-none opacity-0">
        <option value="">{t("thisPhone")}</option>
        {APP_LANGS.map((code) => <option key={code} value={code}>{LANG_LABELS[code]}</option>)}
      </select>
    </label>
  );
}

/** The live map and its bearing and pitch, outside the react-map-gl tree. */
function useCamera(): { map: MapLibreMap | null; bearing: number; pitch: number } {
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [cam, setCam] = useState({ bearing: 0, pitch: 0 });
  useEffect(() => onMapInstance(setMap), []);
  useEffect(() => {
    if (!map) return;
    const sync = () => setCam({ bearing: map.getBearing(), pitch: map.getPitch() });
    sync();
    map.on("rotate", sync);
    map.on("pitch", sync);
    return () => { map.off("rotate", sync); map.off("pitch", sync); };
  }, [map]);
  return { map, ...cam };
}

/** Map / 3D / Street, as a menu of radio items; each keeps the spot and the heading. */
function ViewMenu({ onPick }: { onPick: () => void }) {
  const street = useFlag("streetLevel");
  const { map, current: level, walking, spot } = useCurrentView();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.querySelector<HTMLButtonElement>('[aria-checked="true"], [role="menuitemradio"]')?.focus(); }, []);
  const go = (l: ViewName) => {
    if (l !== level) pickView(map, l, walking, spot);
    onPick();
  };
  const onKey = (e: ReactKeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = [...(ref.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    items[(i + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length]?.focus();
  };
  return (
    <div ref={ref} role="menu" tabIndex={-1} aria-label="Change view" data-testid="view-menu" data-map-cover onKeyDown={onKey} className={`flex w-[220px] flex-col gap-0.5 ${FLOAT}`}>
      {VIEWS.filter((v) => street || v.id !== "street").map((v) => {
        const on = level === v.id;
        return (
          <button key={v.id} type="button" role="menuitemradio" aria-checked={on} onClick={() => go(v.id)}
            className="flex min-h-[52px] items-center gap-3 rounded-[14px] border px-2.5 text-left text-[15px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60a5fa]"
            style={{ background: on ? "rgba(37,99,235,0.22)" : "transparent", borderColor: on ? "rgba(96,165,250,0.55)" : "transparent" }}>
            {v.icon}
            <span className="flex flex-1 flex-col"><span className="font-semibold">{v.label}</span><span className="text-[12px] text-[#a5b4cb]">{v.note}</span></span>
          </button>
        );
      })}
    </div>
  );
}

/** While following, Change view picks the follow camera; Street rides along at street level (trains and buses). */
const FOLLOW_VIEWS: Array<{ id: FollowMode; label: string; note: string }> = [
  { id: "map", label: "Map", note: "Flat, from above" },
  { id: "chase", label: "Chase", note: "Just behind it" },
  { id: "side", label: "Side", note: "Alongside" },
  { id: "overhead", label: "Overhead", note: "High above" },
  { id: "cab", label: "Street", note: "Ride along at street level" },
];

function FollowViewMenu({ onPick, preview }: { onPick: () => void; preview?: boolean }) {
  const mode = useFollowMode();
  return (
    <div role="menu" aria-label="Change view" data-testid="follow-view-menu" data-map-cover className={`flex w-[220px] flex-col gap-0.5 ${FLOAT}`}>
      {FOLLOW_VIEWS.map((v) => {
        const on = mode === v.id;
        return (
          <button key={v.id} type="button" role="menuitemradio" aria-checked={on} onClick={() => { setFollowMode(v.id); onPick(); }}
            className="flex min-h-[48px] items-center rounded-[14px] border px-2.5 text-left text-[15px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60a5fa]"
            style={{ background: on ? "rgba(37,99,235,0.22)" : "transparent", borderColor: on ? "rgba(96,165,250,0.55)" : "transparent" }}>
            <span className="flex flex-1 flex-col"><span className="font-semibold">{v.label}</span><span className="text-[12px] text-[#a5b4cb]">{v.note}</span></span>
          </button>
        );
      })}
      {preview ? null : <><div className="mx-2 my-1 h-px bg-[#263449]" />
      <button type="button" onClick={() => { stopFollowing(); onPick(); }} className="flex min-h-[44px] items-center rounded-[14px] px-2.5 text-left text-[14px] font-semibold text-[#fca5a5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60a5fa]">Stop following</button></>}
    </div>
  );
}

/**
 * Zoom, always in the same place: +, a vertical slider, −. It works while
 * following or previewing too: the camera keeps your zoom (ZoomKeeper).
 */
export const ZOOM_MIN = 9;
export const ZOOM_MAX = 20;
function ZoomControl({ map }: { map: MapLibreMap | null }) {
  const [z, setZ] = useState(() => map?.getZoom() ?? 12);
  useEffect(() => {
    if (!map) return;
    const sync = () => setZ(map.getZoom());
    sync();
    map.on("zoom", sync);
    return () => { map.off("zoom", sync); };
  }, [map]);
  const set = (next: number) => map?.setZoom(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, next)));
  const step = "flex h-9 w-11 items-center justify-center text-[20px] font-semibold leading-none text-[#f1f5f9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60a5fa]";
  return (
    <div data-testid="zoom-control" className="pointer-events-auto flex max-sm:hidden w-11 flex-col items-center rounded-full border border-[#263449] bg-[rgba(15,23,42,0.92)] py-1 shadow-[0_6px_18px_rgba(0,0,0,0.35)]">
      <button type="button" aria-label="Zoom in" className={step} onClick={() => set(z + 1)}>+</button>
      <input type="range" aria-label="Zoom" min={ZOOM_MIN} max={ZOOM_MAX} step={0.1} value={z} onChange={(e) => set(Number(e.target.value))}
        className="h-24 w-6 cursor-pointer accent-[#60a5fa]" style={{ writingMode: "vertical-lr", direction: "rtl" }} />
      <button type="button" aria-label="Zoom out" className={step} onClick={() => set(z - 1)}>−</button>
    </div>
  );
}

/**
 * Phones: just + and −, no slider; the column stays short and pinches still work.
 * Short phones (under 700 px tall, an iPhone SE) drop them: with an answer open the
 * column ran into Center on my location and under the sheet (layout check, 320×568).
 */
function ZoomButtons({ map }: { map: MapLibreMap | null }) {
  const step = (d: number) => { if (map) map.easeTo({ zoom: Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, map.getZoom() + d)), duration: 250 }); };
  const btn = "flex h-11 w-11 items-center justify-center text-[22px] font-semibold leading-none text-[#f1f5f9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60a5fa]";
  return (
    <div data-testid="zoom-buttons" className="pointer-events-auto flex w-11 flex-col items-center rounded-full border border-[#263449] bg-[rgba(15,23,42,0.92)] shadow-[0_6px_18px_rgba(0,0,0,0.35)] sm:hidden [@media(max-height:699px)]:hidden">
      <button type="button" aria-label="Zoom in" className={btn} onClick={() => step(1)}>+</button>
      <span className="h-px w-6 bg-[#263449]" aria-hidden />
      <button type="button" aria-label="Zoom out" className={btn} onClick={() => step(-1)}>−</button>
    </div>
  );
}

/** The arrow Center on my location shows while the map turns with you. */
const TurnIcon = () => <svg width={22} height={22} viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M12 2 4.5 20.3l.7.7L12 18l6.8 3 .7-.7z" /></svg>;

/**
 * Center on my location, cycled like Google and Apple Maps: the first tap
 * shares your location and follows you; the next turns the map with the way you
 * face (when the phone knows it); the next goes back to north up. Dragging the
 * map stops following (see youCamera).
 */
function LocateButton({ className, style }: { map?: MapLibreMap | null; className?: string; style?: React.CSSProperties }) {
  const [asking, setAsking] = useState(false);
  const camera = useYouCamera();
  const shared = useSharedLocation();
  const canTurn = shared.course != null || typeof DeviceOrientationEvent !== "undefined";
  const locate = () => {
    if (sharedCoords()) { setYouCamera(nextYouCamera(camera, canTurn)); return; }
    setAsking(true);
    setYouCamera("follow");
    void startSharing().then((c) => {
      setAsking(false);
      if (!c) setYouCamera("off");
    });
  };
  const label = camera === "follow" && canTurn ? "Turn the map with me" : camera === "turn" ? "Keep north up" : "Center on my location";
  return (
    <button type="button" aria-label={label} aria-pressed={camera !== "off"} aria-busy={asking} onClick={locate} data-testid="locate-button" data-camera={camera}
      className={`${ROUND} border border-[#263449] pointer-events-auto ${camera === "off" ? "bg-[rgba(15,23,42,0.92)] text-[#60a5fa]" : "bg-[#2563eb] text-white"} ${asking ? "animate-pulse motion-reduce:animate-none" : ""} ${className ?? ""}`} style={style}>
      {camera === "turn" ? <TurnIcon /> : <LocateIcon />}
    </button>
  );
}

const LayersIcon = () => <svg {...svg} width={20} height={20}><path d="m12 2 10 5-10 5L2 7l10-5Z" /><path d="m2 12 10 5 10-5M2 17l10 5 10-5" /></svg>;

/**
 * Phones: Live trains, Live buses (and which routes) and Restrooms, one tap from the map.
 * They were only in the Settings sheet, where nobody found them (owner, 2026-10-27).
 * The bus route groups make it tall: it scrolls instead of running under the buttons and chat at the bottom.
 */
function PhoneLayers({ open, onOpen }: { open: boolean; onOpen: (open: boolean) => void }) {
  return (
    <div className="relative sm:hidden">
      <button type="button" aria-label="Layers: trains, buses, restrooms" aria-haspopup="dialog" aria-expanded={open} data-testid="phone-layers-button"
        onClick={() => onOpen(!open)} className={`${ROUND} ${open ? LIGHT : DARK} pointer-events-auto`}>
        <LayersIcon />
      </button>
      {open ? (
        <div role="dialog" aria-label="Layers" data-testid="phone-layers-menu" data-map-cover
          className={`pointer-events-auto absolute right-[52px] top-0 max-h-[max(220px,calc(100dvh-380px))] w-[min(300px,calc(100vw-88px))] overflow-y-auto overscroll-contain ${FLOAT}`}>
          <LiveLayerRows />
        </div>
      ) : null}
    </div>
  );
}

function Compass({ map, bearing, style }: { map: MapLibreMap; bearing: number; style?: React.CSSProperties }) {
  return (
    <button type="button" aria-label={`Compass, bearing ${Math.round(bearing)} degrees. Reset north and flat`} data-testid="compass"
      onClick={() => map.easeTo({ bearing: 0, pitch: 0 })} className={`${ROUND} ${DARK} pointer-events-auto`} style={style}>
      <span className="flex flex-col items-center leading-none" style={{ transform: `rotate(${-bearing}deg)` }}>
        <span className="block h-0 w-0 border-x-[5px] border-b-[8px] border-x-transparent border-b-[#ef4444]" aria-hidden />
        <span className="text-[11px] font-bold">N</span>
      </span>
    </button>
  );
}

export function MapChrome() {
  const { map, bearing, pitch } = useCamera();
  const line = useSelectedLine();
  const followed = useFollowed();
  // A trip preview rides its marker with the same follow cameras, so its Change view offers them too.
  const previewing = usePreviewing();
  // One dropdown at a time across the menu row and this view menu.
  const menu = useOpenMenu();
  const open = menu === "view" ? "view" : null;
  const setOpen = (v: "view" | null) => setOpenMenu(v);
  // The menu row owns "layers" on wider screens; here it is the phone's Layers button.
  const layersOpen = menu === "layers" && typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches;
  const stack = useRef<HTMLDivElement>(null);
  const rotated = Math.abs(bearing) > 0.5 || pitch > 0.5;
  const lineSheet = usePullSheetUp();

  // A tap anywhere else, or Escape, closes the open panel or menu.
  useEffect(() => {
    if (!open && !layersOpen) return;
    const down = (e: PointerEvent) => { if (!stack.current?.contains(e.target as Node)) setOpenMenu(null); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpenMenu(null); };
    document.addEventListener("pointerdown", down);
    window.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", down); window.removeEventListener("keydown", key); };
  }, [open, layersOpen]);
  // A newly picked line closes the menu; while following, the followed train's line is always
  // selected, so that rule would shut the follow view menu the moment it opened.
  // Only a change of line counts: with a line already open, the cube menu has to stay open on a phone.
  const lastLine = useRef(line);
  useEffect(() => {
    const changed = lastLine.current !== line;
    lastLine.current = line;
    if (changed && line && !followed) setOpenMenu(null);
  }, [line, followed]);

  // Publish where the button stack ends, so a phone's pull sheet stops short enough for Center on my
  // location to fit between them. Zoom grows with the screen, so the stack ends lower on a tall phone.
  useLayoutEffect(() => {
    const el = stack.current;
    const root = document.documentElement;
    if (!el) return;
    const publish = () => root.style.setProperty("--map-chrome-bottom", `${Math.ceil(el.getBoundingClientRect().bottom)}px`);
    publish();
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(publish);
    ro?.observe(el);
    window.addEventListener("resize", publish);
    return () => { ro?.disconnect(); window.removeEventListener("resize", publish); };
  });

  const top = "calc(env(safe-area-inset-top) + 16px)";
  // Following: the same quick bar, with the follow cameras under Change view.
  if (followed || previewing) {
    return (
      <>
      <div ref={stack} data-testid="map-chrome" className="pointer-events-none absolute right-4 z-40 flex flex-col items-end gap-2.5" style={{ top }}>
        <div className="relative">
          <button type="button" aria-label="Change view" aria-haspopup="menu" aria-expanded={open === "view"} data-testid="view-button"
            onClick={() => setOpen(open === "view" ? null : "view")} className={`${ROUND} ${open === "view" ? LIGHT : DARK} pointer-events-auto`}>
            <ViewIcon />
          </button>
          {open === "view" ? <div className="pointer-events-auto absolute right-[52px] top-0"><FollowViewMenu preview={!followed} onPick={() => setOpen(null)} /></div> : null}
        </div>
        <ZoomControl map={map} />
        <ZoomButtons map={map} />
        {map ? <Compass map={map} bearing={bearing} /> : null}
      </div>
      {/* Locate rides just above the follow sheet; language and the QR code live in its Settings tab. */}
      <LocateButton map={map} className="sheet-locate corner-locate absolute z-40" />
      </>
    );
  }
  // A line is selected. On a phone it opens as a sheet over the chat, so the quick buttons stay;
  // folded to its pill at the top (an answer is open), or on a wider screen, its close button takes the top right.
  if (line) {
    return (
      <>
        {lineSheet ? (
          <div ref={stack} data-testid="map-chrome" className="pointer-events-none absolute right-4 z-40 flex flex-col items-end gap-2.5" style={{ top }}>
            <div className="relative">
              <button type="button" aria-label="Change view" aria-haspopup="menu" aria-expanded={open === "view"} data-testid="view-button"
                onClick={() => setOpen(open === "view" ? null : "view")} className={`${ROUND} ${open === "view" ? LIGHT : DARK} pointer-events-auto`}>
                <ViewIcon />
              </button>
              {open === "view" ? <div className="pointer-events-auto absolute right-[52px] top-0"><ViewMenu onPick={() => setOpen(null)} /></div> : null}
            </div>
            <ZoomButtons map={map} />
            {map ? <Compass map={map} bearing={bearing} /> : null}
          </div>
        ) : rotated && map ? <Compass map={map} bearing={bearing} style={{ position: "absolute", top, right: 68, zIndex: 45 }} /> : null}
        <LocateButton map={map} className="sheet-locate corner-locate absolute z-40" />
      </>
    );
  }
  return (
    <>
    <div ref={stack} data-testid="map-chrome" className="pointer-events-none absolute right-4 z-40 flex flex-col items-end gap-2.5" style={{ top }}>
      {/* On wider screens the Map · 3D · Street switch at the top centre stands in for it. */}
      <div className="relative sm:hidden">
        <button type="button" aria-label="Change view" aria-haspopup="menu" aria-expanded={open === "view"} data-testid="view-button"
          onClick={() => setOpen(open === "view" ? null : "view")} className={`${ROUND} ${open === "view" ? LIGHT : DARK} pointer-events-auto`}>
          <ViewIcon />
        </button>
        {open === "view" ? (
          <div className="pointer-events-auto absolute right-[52px] top-0">
            <ViewMenu onPick={() => setOpen(null)} />
          </div>
        ) : null}
      </div>
      {/* Quick buttons, top to bottom: Change view, zoom, north. Everything else comes up from behind the chat. */}
      <ZoomControl map={map} />
      <ZoomButtons map={map} />
      {map ? <Compass map={map} bearing={bearing} /> : null}
      <PhoneLayers open={layersOpen} onOpen={(v) => setOpenMenu(v ? "layers" : null)} />
      {/* Language stays in sight on a phone (#54): the Settings chip sat past the edge of the task row. */}
      <LangChip />
      {/* The QR code: wider screens here, a phone in Settings. */}
      <div className="hidden sm:flex"><QrButton /></div>
    </div>
    <LocateButton map={map} className="sheet-locate corner-locate absolute z-40" />
    </>
  );
}
