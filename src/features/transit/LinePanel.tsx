import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useFlag } from "@/lib/flags";
import { useLeftCard } from "@/lib/store/leftColumn";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { Marker, type Map as MaplibreMap } from "maplibre-gl";
import { X } from "lucide-react";
import { lineColor } from "@/lib/transit/bullets";
import { setSelectedLine, useSelectedLine } from "@/lib/transit/selectedLine";
import { useMapState } from "@/lib/store/MapStateContext";
import { framePadding } from "@/lib/map/mapCover";
import { showView } from "@/lib/map/viewChange";
import { sendScreen, useScreen, useScreenSize } from "@/lib/screen/screenSpace";
import { heldTrains } from "@/lib/transit/holds";
import { setAlertFocus } from "./alertFocus";
import { useAlerts, useAlertsBetween, useNow, useTransitData } from "./hooks";
import { setLineDay, useLineDay, weekendWindow } from "@/lib/transit/lineDay";
import { boardingArrivals, minutesUntil } from "./model";
import { TONE, allLineNotices, type LineNotice } from "./lineNotices";
import { NoticeIcon, noticeKind } from "./noticeKind";
import { PullSheet } from "@/components/PullSheet";
import { closeSheets } from "@/lib/store/pullSheet";
import { useLineKeys } from "./useLineKeys";
import type { Vehicle } from "./model";
import type { SheetLevel } from "@/components/sheetSwipe";

// Loaded with the first notice opened, so the line panel itself stays small.
const NoticeDiagram = lazy(() => import("./NoticeDiagram"));

const GLASS = "border border-[rgba(148,163,184,0.18)] bg-[rgba(15,23,42,0.6)] backdrop-blur-[10px]";

const SVG = (body: string) => `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
/** An elevator (a cab with up and down arrows) or an escalator (a rising step line) ahead of an outage tag (owner, 2026-10-27). */
export function tagIcon(label: string): string | null {
  if (/elevator/i.test(label)) return SVG('<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 10l3-3 3 3M9 14l3 3 3-3"/>');
  if (/escalator/i.test(label)) return SVG('<path d="M3 19h5l8-12h5"/><path d="M8 19l8-12"/><circle cx="17" cy="4" r="1.2" fill="currentColor"/>');
  return null;
}

/** A skipped stop reads as trouble: red ring, red tag, white words (owner, 2026-10-27: the grey tag was barely visible). */
const SKIP = { color: "#dc2626", glow: "rgba(220,38,38,0.28)" };

/** The ring and label for one affected station, as plain DOM so it matches the design exactly. */
function ringMarker(color: string, glow: string, label: string): HTMLElement {
  const skip = /skipped/i.test(label);
  if (skip) ({ color, glow } = SKIP);
  const el = document.createElement("div");
  // No `position` here: MapLibre's marker class places the element absolutely, which also anchors the label.
  el.style.cssText = "width:34px;height:34px;pointer-events:none";
  const ring = document.createElement("div");
  ring.style.cssText = `width:34px;height:34px;box-sizing:border-box;border-radius:17px;border:3px solid ${color};box-shadow:0 0 0 6px ${glow}`;
  const tag = document.createElement("div");
  const icon = tagIcon(label);
  if (icon) tag.innerHTML = icon;
  tag.append(label);
  tag.style.cssText = `position:absolute;left:39px;top:5px;display:flex;align-items:center;gap:5px;padding:4px 8px;border-radius:8px;background:${color};color:${skip ? "#ffffff" : "#111827"};font:700 12px Inter,system-ui,sans-serif;white-space:nowrap;border:1.5px solid rgba(17,24,39,0.55);box-shadow:0 1px 4px rgba(0,0,0,0.35)`;
  el.append(ring, tag);
  return el;
}

/** Ring the picked notice's stations and take the map to them: tapping a notice is asking where it is. */
function useNoticeRings(map: MaplibreMap | undefined, notice: LineNotice | null, panel: HTMLElement | null, sheet: boolean) {
  const { walking } = useMapState();
  const walkingRef = useRef(walking);
  walkingRef.current = walking;
  // The notice already taken out of street view: the sheet moving must not take you out again.
  const leftFor = useRef<string | null>(null);
  useEffect(() => {
    if (!notice) leftFor.current = null;
    if (!map || !notice?.stations.length) return;
    const tone = TONE[notice.tone];
    const markers = notice.stations.map((s) => new Marker({ element: ringMarker(tone.color, tone.glow, s.label) }).setLngLat(s.coord).addTo(map));
    // The ring's tag names each skip and its direction: the station's own "Skipped …-bound" words would print under it.
    const quiet = map.getLayer("transit-skip") ? "transit-skip" : null;
    if (quiet) map.setPaintProperty(quiet, "text-opacity", 0);
    // An alert's own focus already fits the affected stretch (TransitLayer); only outages are framed here.
    if (!notice.alert) {
      // A phone's line sheet is a map cover at the bottom (the map's padding clears it): frame under the quick buttons.
      // The side panel on wider screens sits at the top: frame below it, above the chat bar.
      const top = sheet ? 80 : Math.round((panel?.getBoundingClientRect().bottom ?? 120) + 24);
      const bottom = sheet ? 24 : (parseInt(getComputedStyle(document.documentElement).getPropertyValue("--chat-bar-h"), 10) || 0) + 40;
      const xs = notice.stations.map((s) => s.coord[0]), ys = notice.stations.map((s) => s.coord[1]);
      const bounds: [[number, number], [number, number]] = [[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]];
      const padding = framePadding(map, { top, bottom, left: 40, right: sheet ? 72 : 140 });
      // Street view: the flat map framed on it; "Back to street view" resumes the walk.
      if (walkingRef.current) {
        if (leftFor.current !== notice.id) showView("map", null, null, { frame: { bounds, padding, maxZoom: 15 } });
      } else map.fitBounds(bounds, { padding, maxZoom: 15, duration: 700 });
      leftFor.current = notice.id;
    }
    return () => {
      markers.forEach((m) => m.remove());
      if (quiet && map.getLayer(quiet)) map.setPaintProperty(quiet, "text-opacity", 1);
    };
  }, [map, notice, panel, sheet]);
}

/**
 * The selected subway line (#370): one card headed by the line, its notice count
 * and a close button, listing the line's notices; folded, just the pill.
 * Tapping a notice opens its full text and rings its stations on the map.
 */
export function LinePanel({ map, route, onFollow, trains = () => [] }: { map: MaplibreMap | undefined; route: string; onFollow: () => void; trains?: () => Vehicle[] }) {
  const data = useTransitData(["subway"]);
  const nowAlerts = useAlerts(true).data;
  // "This weekend": the planned work then, not what is running now (owner, 2026-10-27).
  const day = useLineDay();
  const ahead = useAlertsBetween(day);
  const alerts = day ? ahead.data : nowAlerts;
  const sys = data.subway?.stat;
  const live = data.subway?.live;
  // Held trains first: they are happening now, on this line (src/lib/transit/holds.ts). Not part of another day.
  const notices = useMemo(() => allLineNotices(route, day ? [] : heldTrains(live).values(), alerts?.alerts ?? [], alerts?.outages ?? [], sys), [route, alerts, sys, live, day]);
  // The day goes with the line: closing it (or another line) starts again from now.
  useEffect(() => () => setLineDay(null), []);
  const [picked, setPicked] = useState<string | null>(null);
  // The notice opened by a tap, which starts its spoken walk; one opened for an answer stays quiet.
  const [tapped, setTapped] = useState<string | null>(null);
  // A new line starts with every notice closed; opened from an answer about its trouble, with that trouble open.
  const trouble = useSelectedLine()?.trouble ?? false;
  const troubleNotice = trouble ? notices.find((n) => n.alert && n.tone !== "access" && n.stations.length) ?? notices.find((n) => n.alert && n.tone !== "access") : undefined;
  useEffect(() => { setPicked(null); setTapped(null); }, [route]);
  useEffect(() => { if (troubleNotice) setPicked(troubleNotice.id); }, [route, troubleNotice?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelEl, setPanelEl] = useState<HTMLElement | null>(null);
  const wide = useScreenSize() === "wide";
  // On a phone a picked line opens as a sheet over the chat, one step up; swipe down for just its line.
  const [level, setLevel] = useState<SheetLevel>(1);
  useEffect(() => setLevel(1), [route]);
  const pickedNotice = notices.find((n) => n.id === picked) ?? null;
  // A desktop with the agent home: the line is a card in the one left column, not a panel on the right.
  const home = useFlag("agentHome");
  const desktop = useMediaQuery("(min-width: 1024px)");
  const { slot, top } = useLeftCard(`line:${route}`, home && desktop);
  // In the column it is a cover on the left, so a notice frames like the phone sheet does.
  useNoticeRings(map, pickedNotice, panelEl, !wide || Boolean(slot));
  // The picked alert draws its affected stretch, skipped stops and detour on the map, the rest dimmed.
  const pickedAlert = pickedNotice?.alert ?? null;
  useEffect(() => {
    if (!pickedAlert) return;
    setAlertFocus(pickedAlert);
    return () => setAlertFocus(null);
  }, [pickedAlert]);
  const ride = useSelectedLine()?.ride;
  const now = useNow(Boolean(ride));
  const board = ride && sys ? boardingArrivals(sys, data.subway?.live, route, ride.from, ride.to, now) : null;
  const { walking } = useMapState();
  // Arrows step along the line, train or station, and across to another line; Escape leaves it.
  useLineKeys(map, route, useSelectedLine()?.train ?? null, sys, trains, walking);
  const info = sys?.routes[route];
  const color = info?.color ?? lineColor(route);
  const text = info?.text ?? "#ffffff";
  const count = notices.length;
  const name = info?.name && info.name !== route ? info.name : "";
  // On a phone the open answer or orb wins: the panel folds to its pill, and tapping the pill opens it again (src/lib/screen/screenSpace.ts).
  useEffect(() => { sendScreen({ type: "LINE", on: true }); return () => sendScreen({ type: "LINE", on: false }); }, []);
  const folded = useScreen((v) => v.line === "pill");
  const sheet = !wide && !folded;
  useEffect(() => setPanelEl(panelRef.current), [sheet, level, folded, slot, top]);
  const pillLabel = (
    <>
      <span className="flex h-8 w-8 items-center justify-center rounded-full text-[16px] font-bold" style={{ background: color, color: text }} aria-hidden>
        {info?.short ?? route}
      </span>
      <span className="pr-1.5 text-[14px] font-semibold">
        <span className="sr-only">{route} line, </span>
        {name ? <span className="mr-1.5 inline-block max-w-[150px] truncate align-bottom lg:max-w-[200px]">{name}</span> : null}
        <span className={name ? "font-medium text-[#cbd5e1]" : ""}>{count === 1 ? "1 notice" : `${count} notices`}</span>
      </span>
    </>
  );

  const boardEl = board ? (
          <div data-testid="line-board" className="flex items-start gap-3 rounded-[14px] border border-[rgba(148,163,184,0.16)] bg-[rgba(15,23,42,0.35)] px-3 py-2.5 text-[14px]">
            <div className="min-w-0 flex-1">
              <div className="font-semibold">Next {route} at {board.name}</div>
              {board.toward ? <div className="truncate text-[13px] text-[#cbd5e1]">Toward {board.toward}</div> : null}
              {board.times.length ? null : <div className="mt-1 text-[13px] text-[#cbd5e1]">No live times for this stop right now.</div>}
            </div>
            {/* The next trains stack at the right, soonest on top. */}
            {board.times.length ? (
              <div data-testid="line-times" className="flex shrink-0 flex-col items-end gap-1" aria-live="polite">
                {board.times.map((t) => {
                  const m = minutesUntil(t, now);
                  return <span key={t} className="rounded-full bg-[rgba(37,99,235,0.28)] px-2.5 py-0.5 text-[13px] font-semibold">{m < 1 ? "Now" : `${m} min`}</span>;
                })}
              </div>
            ) : null}
          </div>
        ) : null;
  const noticesEl = (inSheet: boolean) => count ? (
          <ul className={`line-notices flex ${inSheet ? "" : picked ? "max-h-[min(380px,45dvh)]" : "max-h-[150px]"} min-h-0 flex-col gap-2 ${inSheet ? "" : "overflow-y-auto overscroll-contain"} pr-1.5`} aria-label={`${route} line notices`}>
            {notices.map((n) => {
              const open = n.id === picked;
              const tone = TONE[n.tone];
              return (
                <li key={n.id} className="flex flex-col gap-1.5">
                  <button type="button" aria-expanded={open} data-notice={n.id} onClick={(e) => {
                      setPicked(open ? null : n.id);
                      setTapped(open ? null : n.id);
                      // An alert opens as its diagram under the title: bring both into the sheet's view.
                      const row = e.currentTarget.parentElement;
                      if (!open && n.alert) requestAnimationFrame(() => row?.scrollIntoView({ block: "start", behavior: "smooth" }));
                    }}
                    className="flex w-full items-start gap-2.5 rounded-[14px] border px-3 py-2.5 text-left text-[14px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60a5fa]"
                    style={{ borderColor: open ? "rgba(96,165,250,0.6)" : "rgba(148,163,184,0.16)", background: open ? "rgba(37,99,235,0.22)" : "rgba(15,23,42,0.35)" }}>
                    <NoticeIcon kind={noticeKind(`${n.title} ${n.body}`, { kind: n.alert?.kind ?? (n.tone === "delay" ? "delay" : undefined), reroute: n.alert?.reroute })} color={tone.dot} className="mt-[2px] h-4 w-4 shrink-0" />
                    <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                      {/* Closed: one line each; the full text opens on tap. */}
                      <span className={`font-semibold ${open ? "" : "truncate"}`}>{n.title}</span>
                      {n.meta ? <span className={`text-[13px] text-[#cbd5e1] ${open ? "" : "truncate"}`}>{n.meta}</span> : null}
                      {open && !n.alert && n.body !== n.title ? <span className="mt-1 whitespace-pre-line text-[13px] leading-[1.45] text-[#e2e8f0]">{n.body}</span> : null}
                    </span>
                    <span aria-hidden className="mt-0.5 text-[#a5b4cb] transition-transform" style={{ transform: `rotate(${open ? 180 : 0}deg)` }}>⌄</span>
                  </button>
                  {/* A service alert opens as its stretch of line, read aloud when tapped (owner, 2026-11-07). */}
                  {open && n.alert ? <Suspense fallback={null}><NoticeDiagram alert={n.alert} sys={sys} route={route} color={color} auto={tapped === n.id} /></Suspense> : null}
                </li>
              );
            })}
          </ul>
        ) : null;
  const weekend = weekendWindow();
  const onWeekend = Boolean(day && day.from === weekend.from && day.to === weekend.to);
  const chip = (on: boolean) => `h-8 rounded-full border px-3 text-[13px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60a5fa] ${on ? "border-transparent bg-slate-50 text-slate-900" : "border-[rgba(148,163,184,0.3)] text-[#f1f5f9]"}`;
  const dayEl = (
    <div role="group" aria-label="Show notices for" data-testid="line-day" className="flex items-center gap-1.5">
      <button type="button" aria-pressed={!day} className={chip(!day)} onClick={() => { setLineDay(null); setPicked(null); }}>Now</button>
      <button type="button" aria-pressed={onWeekend} className={chip(onWeekend)} onClick={() => { setLineDay(weekend); setPicked(null); }}>This weekend</button>
      {day && !onWeekend ? <button type="button" aria-pressed className={chip(true)}>{day.label}</button> : null}
      {day && ahead.isLoading ? <span className="text-[12px] text-[#cbd5e1]" aria-live="polite">Checking…</span> : null}
    </div>
  );
  const noneEl = day && !ahead.isLoading && !count
    ? <p className="text-[13px] text-[#cbd5e1]" data-testid="line-day-none">No planned work on the {route} {onWeekend ? "this weekend" : `for ${day.label}`}.</p> : null;
  // No "Other ways" here: trips are asked in the chat (owner, 2026-11-07).
  const actionsEl = (
    <button type="button" onClick={onFollow}
      className="h-9 w-full shrink-0 rounded-[18px] border border-[rgba(148,163,184,0.3)] bg-transparent text-[13px] font-semibold text-[#f1f5f9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60a5fa]">
      Follow a train
    </button>
  );

  if (sheet) {
    return (
      // A new line is a new view: it comes to the top of the sheet even when another line was under a station.
      <PullSheet key={route} testId="line-panel" label={`${route} line`} level={level} onLevel={setLevel} onClose={() => setSelectedLine(null)}
        header={<div className="flex items-center gap-2">
          <button type="button" data-testid="line-pill" aria-expanded={level > 0} aria-label={`Show the ${route} line`} onClick={() => setLevel((l) => (l === 0 ? 1 : l))}
            className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60a5fa]">{pillLabel}</button>
          {/* Close empties the one phone sheet (a station under the line too); Back, drawn by the sheet, returns to it. */}
          <button type="button" aria-label="Close line" onClick={closeSheets} className="task-action task-close"><X className="h-[18px] w-[18px]" strokeWidth={2.5} aria-hidden /></button>
        </div>}>
        <div ref={panelRef} data-testid="line-body" className="pull-sheet-body mt-2 flex flex-col gap-2.5 text-[#f1f5f9]">
          {actionsEl}
          {boardEl}
          {dayEl}
          {noticesEl(true)}
          {noneEl}
        </div>
      </PullSheet>
    );
  }
  const card = (
    // One card: the line and its close button head it, then the board, the notices and the actions,
    // all on the same left edge (owner, 2026-10-27).
    <div className="pointer-events-auto flex min-h-0 flex-col rounded-[22px] border border-[#263449] bg-[rgba(15,23,42,0.92)] shadow-[0_10px_30px_rgba(0,0,0,0.4)] backdrop-blur-[14px]">
      <div className="flex items-center gap-2 py-2 pl-2.5 pr-2">
        <div data-testid="line-pill" className="flex min-w-0 flex-1 items-center gap-2.5">{pillLabel}</div>
        <button type="button" aria-label="Close line" onClick={() => setSelectedLine(null)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#cbd5e1] hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60a5fa]">
          <X className="h-[18px] w-[18px]" strokeWidth={2.5} aria-hidden />
        </button>
      </div>
      <div ref={panelRef} data-testid="line-body" className="flex min-h-0 flex-col gap-2.5 border-t border-[rgba(148,163,184,0.16)] p-2.5">
        {boardEl}
        {dayEl}
        {noticesEl(false)}
        {noneEl}
        {actionsEl}
      </div>
    </div>
  );
  if (slot) {
    return createPortal(
      <div data-testid="line-panel" className={`${top ? "flex" : "hidden"} min-h-0 flex-col font-[Inter,system-ui,sans-serif] text-[#f1f5f9]`}>{card}</div>,
      slot,
    );
  }
  return (
    <div
      data-testid="line-panel"
      data-map-cover
      className="pointer-events-none absolute left-4 right-4 z-[44] flex flex-col gap-3 font-[Inter,system-ui,sans-serif] text-[#f1f5f9] sm:left-auto sm:w-[360px] md:w-[380px] lg:w-[400px]"
      // The old layout keeps its Layers button at the top right: the card starts below it.
      style={{ top: `calc(env(safe-area-inset-top) + ${home ? 16 : 64}px)`, maxHeight: `calc(100% - env(safe-area-inset-top) - var(--chat-bar-h, 0px) - ${home ? 32 : 80}px)` }}
    >
      {folded ? (
        <div className="flex items-center justify-between">
          <button type="button" aria-expanded={false} aria-label={`Show the ${route} line`} data-testid="line-pill" onClick={() => sendScreen({ type: "SHOW_LINE" })}
            className={`pointer-events-auto flex h-11 items-center gap-2.5 rounded-[22px] pl-1.5 pr-2 ${GLASS} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60a5fa]`}>
            {pillLabel}
          </button>
          <button type="button" aria-label="Close line" onClick={() => setSelectedLine(null)}
            className={`pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full ${GLASS} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60a5fa]`}>
            <X className="h-[18px] w-[18px]" strokeWidth={2.5} aria-hidden />
          </button>
        </div>
      ) : (
        card
      )}
    </div>
  );
}
