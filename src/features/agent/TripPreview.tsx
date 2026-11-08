import "@/components/task-screens.css";
import { BellRing, Clock, MapPin, Pause, PartyPopper, Play, TriangleAlert, X } from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { useLeftCard } from "@/lib/store/leftColumn";
import { toast } from "sonner";
import { PullSheet } from "@/components/PullSheet";
import type { SheetLevel } from "@/components/sheetSwipe";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { useT } from "@/lib/i18n/appLang";
import { plainAlertText } from "@/lib/transit/trouble";
import { remindAt, saveReminder } from "./reminder";
import { PLAYBACK_SPEEDS, type PlaybackSpeed, type Trip } from "./schema";
import type { PlayerState } from "./usePlayer";
import { TRIP_CHOICES, type TripChoice } from "./tripChoices";

/** The frame's preview controls; the existing player owns all playback state. */
export function TripPreview(p: {
  trip: Trip; state: PlayerState; speed: PlaybackSpeed;
  onToggle: () => void; onSpeed: (s: PlaybackSpeed) => void;
  onClose: () => void; onUse: () => void; onOther: () => void;
  /** Ask again by subway, by bus, on foot or with the least walking (src/features/agent/tripChoices.ts). */
  onChoice?: (c: TripChoice) => void;
  /** Open the line a notice is about, e.g. "N" for "[N][R] trains are delayed". */
  onAlert?: (route: string) => void;
}) {
  const { trip, state } = p;
  const t = useT();
  const minutes = Math.max(1, Math.round((Date.parse(trip.arriveIso) - Date.parse(trip.departIso)) / 60000));
  const departs = new Date(trip.departIso);
  // A trip for another day says the day: "this weekend" read as today is how the 7's work got missed (owner, 2026-10-27).
  const day = departs.toDateString() === new Date().toDateString() ? "" : departs.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
  const leave = `${day ? `${day}, ` : ""}${departs.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  // What that day's changes do to this trip: shown whole, never cut off, and it opens the line.
  const impact = trip.impacts[0];
  const impactBox = impact ? <button type="button" data-testid="trip-impact" disabled={!p.onAlert} onClick={() => p.onAlert?.(impact.route)}
    className={`task-panel flex w-full items-start gap-2 rounded-[14px] px-3 py-2 text-left text-[13px] leading-snug ${impact.blocks ? "border-red-500/60 text-red-100" : "border-amber-500/40 text-amber-100"}`}>
    <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden />
    <span>{impact.blocks ? <strong className="block">This way doesn't work {day || "today"}</strong> : null}{impact.text}{trip.impacts.length > 1 ? ` (+${trip.impacts.length - 1} more)` : ""}</span>
  </button> : null;
  const alert = trip.alerts[0];
  // The line the notice names; the one you ride when it names several.
  const named = alert ? [...alert.matchAll(/\[([A-Z0-9]{1,3})\]/g)].map((m) => m[1]) : [];
  const alertRoute = named.find((r) => trip.legs.some((l) => l.kind === "ride" && l.route === r)) ?? named[0];
  const w = trip.weather;
  const progress = state.status === "ended" ? 100 : state.segs.length ? state.seg / state.segs.length * 100 : 0;
  const wide = useMediaQuery("(min-width: 640px)");
  // A desktop: the trip is a card in the one left column, with the ask box under it.
  const desktop = useMediaQuery("(min-width: 1024px)");
  const { slot, top } = useLeftCard(`trip:${trip.id}`, desktop);
  const [level, setLevel] = useState<SheetLevel>(1);
  const close = <button type="button" className="task-action task-close" aria-label="Close trip" onClick={p.onClose}><X size={18} /></button>;
  const playBtn = (size: string) => <button type="button" className={`task-action ${size} shrink-0 rounded-full p-0`} aria-label={state.playing ? "Pause preview" : "Play preview"} onClick={p.onToggle}>
    {state.playing ? <Pause size={22} /> : <Play size={22} />}
  </button>;
  const speeds = <div className="grid flex-1 grid-cols-4 gap-1 rounded-[14px] bg-slate-900/50 p-1" role="group" aria-label="Playback speed">
    {PLAYBACK_SPEEDS.map((s) => <button type="button" key={s} aria-pressed={s === p.speed} onClick={() => p.onSpeed(s)} className={`h-10 rounded-[10px] text-sm font-semibold ${s === p.speed ? "bg-slate-50 text-slate-900" : "text-slate-200"}`}>{s}×</button>)}
  </div>;
  const weather = w ? `${w.summary} · ${Math.round(w.tempC)}°C / ${Math.round(w.tempC * 9 / 5 + 32)}°F${w.precipPct >= 40 ? ` · ${w.precipPct}% rain` : ""}` : null;
  const notice = alert ? <button type="button" disabled={!alertRoute || !p.onAlert} onClick={() => alertRoute && p.onAlert?.(alertRoute)}
    className="task-panel flex max-w-full items-center gap-1.5 rounded-full border-amber-500/40 px-3 py-2 text-left text-[13px] text-amber-200">
    <TriangleAlert size={14} className="shrink-0" aria-hidden /><span className="truncate">{plainAlertText(alert)}</span></button> : null;
  const rest = <>
    <div role="progressbar" aria-label="Preview progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)} className="h-1.5 shrink-0 overflow-hidden rounded bg-slate-400/25"><div className="h-full bg-amber-500" style={{ width: `${progress}%` }} /></div>
    {state.status === "ended" ? <div className="flex items-center gap-2.5">
      <p className="min-w-0 flex-1 truncate text-[14px] text-slate-300">At {trip.destination.label.split(",")[0]}</p>
      {/* The trip is over: one plain way to put it away, beside the small close at the top. */}
      <button type="button" className="task-action task-secondary shrink-0 px-4" data-testid="trip-done" onClick={p.onClose}>Done</button>
    </div> : <>
      {state.active ? <p className="text-[13px] text-slate-300" aria-live="polite">{state.callout}</p> : null}
      {state.where ? <p className="flex items-center gap-1.5 text-[13px] text-slate-200" data-testid="trip-where">
        <MapPin size={14} className="shrink-0" aria-hidden /><span className="truncate">{state.where}</span></p> : null}
    </>}
    {/* A trip planned for later: the answer says "tap Remind me", so the button is here too. */}
    {trip.scheduled?.future ? <button type="button" className="task-action task-secondary flex items-center justify-center gap-1.5" data-testid="preview-remind"
      onClick={() => { saveReminder(trip); toast(t("remindSaved").replace("{t}", remindAt(trip))); }}>
      <BellRing size={16} aria-hidden />{t("remindMe")}</button> : null}
    {/* The trip card hides the chat answer, so the ways to go live here too (owner, 2026-10-26). */}
    {p.onChoice ? <div role="group" aria-label="Other ways to go" data-testid="trip-choices" className="flex gap-1.5 overflow-x-auto">
      {TRIP_CHOICES.map((c) => <button type="button" key={c} onClick={() => p.onChoice?.(c)}
        className="h-9 shrink-0 rounded-full border border-slate-500/40 px-3 text-[13px] font-semibold text-slate-100 hover:bg-slate-800">
        {t(c === "subway" ? "bySubway" : c === "bus" ? "byBus" : c === "walk" ? "byWalk" : "lessWalking")}</button>)}
    </div> : null}
    <div className="grid grid-cols-2 gap-2">
      <button type="button" className="task-action" onClick={p.onUse}>Use this route</button>
      <button type="button" className="task-action task-secondary" onClick={p.onOther}>{t("otherOptions")}</button>
    </div>
  </>;
  const balloons = state.status === "ended" ? <ArrivedBubble key={state.restart} place={trip.destination.label.split(",")[0]} where={state.where} /> : null;
  // A phone: the trip rests as one line on the chat (Play, where to, how long) and pulls up, so the route stays on the map (owner, 2026-10-25).
  if (!wide) return <>
    <PullSheet testId="trip-sheet" label="Trip preview" level={level} onLevel={setLevel} onClose={p.onClose}
      header={<div className="flex items-center gap-2.5" data-testid="trip-heading">
        {playBtn("h-11 w-11")}
        <button type="button" className="flex min-h-11 min-w-0 flex-1 flex-col justify-center text-left" aria-expanded={level > 0} onClick={() => setLevel((l) => (l === 0 ? 1 : l))}>
          <span className="truncate text-[15px] font-bold" title={`${trip.origin.label} → ${trip.destination.label}`}>To {trip.destination.label}</span>
          <span className={`truncate text-xs ${impact?.blocks ? "text-red-300" : "text-amber-200"}`}>{impact ? (impact.blocks ? "Blocked · " : "Changes · ") : ""}Leave {leave} · about {minutes} min</span>
        </button>
        {close}
      </div>}>
      <div className="pull-sheet-body mt-2 flex flex-col gap-2.5">
        {impactBox}
        {speeds}
        {rest}
        {notice}
        {weather ? <p className="text-[13px] text-slate-300">{weather}</p> : null}
      </div>
    </PullSheet>
    {balloons}
  </>;
  if (slot) return <>
    {createPortal(
      <section aria-label="Trip preview" className={`task-panel ${top ? "flex" : "hidden"} min-h-0 flex-col gap-2.5 overflow-y-auto rounded-2xl p-3`}>
        <div className="flex items-center gap-2" data-testid="trip-heading">
          <Clock className="h-5 w-5 shrink-0" aria-hidden />
          <div className="min-w-0 flex-1"><h2 className="text-[15px] font-semibold">{leave}</h2>
            <p className="text-[13px] text-slate-300">{trip.origin.label} → {trip.destination.label} · about {minutes} min</p></div>
          {close}
        </div>
        {impactBox}
        {notice}
        {weather ? <p className="text-[13px] text-slate-300">{weather}</p> : null}
        <div className="flex items-center gap-2.5">
          {playBtn("h-[52px] w-[52px]")}
          {speeds}
        </div>
        {rest}
      </section>,
      slot,
    )}
    {balloons}
  </>;
  return <>
    <div className="task-top flex flex-col gap-2" data-testid="trip-heading">
      <div className="flex items-center gap-2">
        <div className="task-panel flex min-w-0 flex-1 items-center gap-2.5 rounded-[18px] px-3.5 py-2">
          <Clock className="h-5 w-5 shrink-0" aria-hidden />
          <div className="min-w-0"><h2 className="text-[15px] font-semibold">{leave}</h2>
            <p className="text-[13px] text-slate-300">{trip.origin.label} → {trip.destination.label} · about {minutes} min</p></div>
        </div>
        {close}
      </div>
      {impactBox}
      <div className="flex flex-wrap gap-2">
        {weather ? <span className="task-panel rounded-full px-3 py-2 text-[13px]">{weather}</span> : null}
        {notice}
      </div>
    </div>
    <section className="task-panel task-bottom flex flex-col gap-2.5" aria-label="Trip preview">
      <div className="flex items-center gap-2.5">
        {playBtn("h-[52px] w-[52px]")}
        {speeds}
      </div>
      {rest}
    </section>
    {balloons}
  </>;
}

/** You've arrived, said like a reply: a speech bubble just above the chat bar. Nothing to dismiss; Done or close puts it away with the trip. */
function ArrivedBubble({ place, where }: { place: string; where: string | null }) {
  return <div className="arrive-bubble" role="status" data-testid="trip-arrived">
    <p className="flex items-center gap-2 text-[15px] font-semibold"><PartyPopper size={18} className="shrink-0 text-amber-500" aria-hidden />You've arrived at {place}</p>
    {where ? <p className="mt-0.5 text-[13px] text-slate-600">{where}</p> : null}
  </div>;
}
