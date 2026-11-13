import "@/components/task-screens.css";
import { BellRing, ChevronDown, Clock, MapPin, Pause, PartyPopper, Play, SkipBack, SkipForward, TriangleAlert, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
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
  /** Back one step of the walkthrough, and on to the next. */
  onBack: () => void; onNext: () => void;
  /** Drag the bar to a spot (0 to 1) of the preview, back or forward, as on a video. */
  onSeek?: (f: number) => void;
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
  const progress = state.progress * 100;
  /** Play has been pressed: the preview is a walkthrough now, and the trip card steps back. */
  const started = state.status === "playing" || state.status === "paused" || state.status === "ended";
  const wide = useMediaQuery("(min-width: 640px)");
  // A desktop: the trip is a card in the one left column, with the ask box under it.
  const desktop = useMediaQuery("(min-width: 1024px)");
  const { slot, top } = useLeftCard(`trip:${trip.id}`, desktop);
  const [level, setLevel] = useState<SheetLevel>(0);
  // Playing, the sheet drops to its one bar so the walk has the screen (owner, 2026-11-10: the panel hid half the station).
  useEffect(() => { if (state.playing) setLevel(0); }, [state.playing]);
  const close = <button type="button" className="task-action task-close" aria-label="Close trip" onClick={p.onClose}><X size={18} /></button>;
  const playBtn = (size: string) => <button type="button" className={`task-action ${size} shrink-0 rounded-full p-0`} aria-label={state.playing ? "Pause preview" : "Play preview"} onClick={p.onToggle}>
    {state.playing ? <Pause size={22} /> : <Play size={22} />}
  </button>;
  const speeds = <div className="grid min-w-0 flex-1 grid-cols-4 gap-0.5 rounded-[12px] bg-slate-900/50 p-0.5" role="group" aria-label="Playback speed">
    {PLAYBACK_SPEEDS.map((s) => <button type="button" key={s} aria-pressed={s === p.speed} onClick={() => p.onSpeed(s)} className={`h-9 min-w-0 rounded-[10px] text-[13px] font-semibold ${s === p.speed ? "bg-slate-50 text-slate-900" : "text-slate-200"}`}>{s}×</button>)}
  </div>;
  const weather = w ? `${w.summary} · ${Math.round(w.tempC)}°C / ${Math.round(w.tempC * 9 / 5 + 32)}°F${w.precipPct >= 40 ? ` · ${w.precipPct}% rain` : ""}` : null;
  const notice = alert ? <button type="button" disabled={!alertRoute || !p.onAlert} onClick={() => alertRoute && p.onAlert?.(alertRoute)}
    className="task-panel flex max-w-full items-center gap-1.5 rounded-full border-amber-500/40 px-3 py-2 text-left text-[13px] text-amber-200">
    <TriangleAlert size={14} className="shrink-0" aria-hidden /><span className="truncate">{plainAlertText(alert)}</span></button> : null;
  // The bar drags like a video's: back to see the station walk again, or ahead (owner, 2026-11-12).
  const bar = p.onSeek
    ? <input type="range" aria-label="Preview progress" data-testid="trip-seek" min={0} max={1000} step={1} value={Math.round(progress * 10)}
      onChange={(e) => p.onSeek?.(Number(e.target.value) / 1000)}
      className="h-6 w-full shrink-0 cursor-pointer accent-amber-500" />
    : <div role="progressbar" aria-label="Preview progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)} className="h-1.5 shrink-0 overflow-hidden rounded bg-slate-400/25"><div className="h-full bg-amber-500" style={{ width: `${progress}%` }} /></div>;
  const place = trip.destination.label.split(",")[0];
  const stepBtn = (label: string, onClick: () => void, icon: ReactNode) =>
    <button type="button" className="task-action task-secondary h-10 w-10 shrink-0 rounded-full p-0" aria-label={label} onClick={onClick}>{icon}</button>;
  const [more, setMore] = useState(false);
  // On a phone the sheet itself is the "more": pulled up, it shows the details.
  const open = wide ? more : level > 0;
  const toggleMore = () => (wide ? setMore((m) => !m) : setLevel((l) => (l === 0 ? 2 : 0)));
  // Where you are now: the step's place once it plays, the start before, and the destination at the end.
  const now = state.status === "ended" ? t("atPlace").replace("{p}", place) : started ? (state.where ?? state.callout) : trip.origin.label;
  // The first view is only three things (owner, 2026-11-12): where to, where you are now, and the bar.
  // Everything else waits behind the destination's chevron.
  const head = <div className="flex flex-col gap-1.5" data-testid="trip-heading">
    <div className="flex items-center gap-2">
      {playBtn("h-11 w-11")}
      <div className="min-w-0 flex-1">
        <button type="button" className="flex min-h-7 max-w-full items-center gap-1 text-left" aria-expanded={open} aria-label="Trip details" onClick={toggleMore}>
          <span className="truncate text-[15px] font-bold" title={`${trip.origin.label} → ${trip.destination.label}`}>To {place}</span>
          {impact ? <TriangleAlert size={14} className={`shrink-0 ${impact.blocks ? "text-red-300" : "text-amber-300"}`} aria-hidden /> : null}
          <ChevronDown size={16} className={`shrink-0 text-slate-300 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
        </button>
        <p className="flex items-center gap-1 text-[13px] text-slate-300" aria-live="polite">
          <MapPin size={12} className="shrink-0" aria-hidden /><span className="truncate" data-testid="trip-caption">{now}</span>
        </p>
      </div>
      {close}
    </div>
    {bar}
  </div>;
  const details = <div className="flex flex-col gap-2.5" data-testid="trip-details">
    {/* A trip the day's changes break says so first, whole. */}
    {impactBox}
    <p className="flex items-center gap-1.5 text-[13px] text-slate-300"><Clock size={14} className="shrink-0" aria-hidden />Leave {leave} · about {minutes} min</p>
    {started && state.callout && state.callout !== now ? <p className="text-[13px] text-slate-200">{state.callout}</p> : null}
    {notice}
    {weather ? <p className="text-[13px] text-slate-300">{weather}</p> : null}
    <div className="flex items-center gap-1.5">
      {stepBtn("Previous step", p.onBack, <SkipBack size={16} />)}
      <span className="shrink-0 text-[12px] tabular-nums text-slate-300" data-testid="trip-step">{Math.min(state.seg + 1, state.segs.length)} / {state.segs.length}</span>
      {stepBtn("Next step", p.onNext, <SkipForward size={16} />)}
      {speeds}
    </div>
    {/* A trip planned for later: the answer says "tap Remind me", so the button is here too. */}
    {trip.scheduled?.future ? <button type="button" className="task-action task-secondary flex items-center justify-center gap-1.5" data-testid="preview-remind"
      onClick={() => { saveReminder(trip); toast(t("remindSaved").replace("{t}", remindAt(trip))); }}>
      <BellRing size={16} aria-hidden />{t("remindMe")}</button> : null}
    {p.onChoice ? <div role="group" aria-label="Other ways to go" data-testid="trip-choices" className="flex flex-wrap gap-1.5">
      {TRIP_CHOICES.map((c) => <button type="button" key={c} onClick={() => p.onChoice?.(c)}
        className="h-9 shrink-0 rounded-full border border-slate-500/40 px-3 text-[13px] font-semibold text-slate-100 hover:bg-slate-800">
        {t(c === "subway" ? "bySubway" : c === "bus" ? "byBus" : c === "walk" ? "byWalk" : "lessWalking")}</button>)}
    </div> : null}
    {state.status === "ended"
      ? <button type="button" className="task-action task-secondary" data-testid="trip-done" onClick={p.onClose}>{t("done")}</button>
      : <div className="grid grid-cols-2 gap-2">
        <button type="button" className="task-action" onClick={p.onUse}>Use this route</button>
        <button type="button" className="task-action task-secondary" onClick={p.onOther}>{t("otherOptions")}</button>
      </div>}
  </div>;
  const balloons = state.status === "ended" ? <ArrivedBubble key={state.restart} text={t("arrivedAt").replace("{p}", place)} where={state.where} /> : null;
  // A phone: one pull sheet; resting, it is just the three things, and pulled up it shows the rest (owner, 2026-10-25).
  if (!wide) return <>
    <PullSheet testId="trip-sheet" label="Trip preview" level={level} onLevel={setLevel} onClose={p.onClose} header={head}>
      <div className="pull-sheet-body mt-2">{details}</div>
    </PullSheet>
    {balloons}
  </>;
  const card = (className: string) => <section aria-label="Trip preview" className={`task-panel ${className} flex-col gap-2.5 overflow-y-auto`}>
    {head}
    {more ? details : null}
  </section>;
  // A desktop: the trip is a card in the left column with the chat, the ask box under it (owner, 2026-10-28).
  if (slot) return <>{createPortal(card(`${top ? "flex" : "hidden"} min-h-0 rounded-2xl p-3`), slot)}{balloons}</>;
  return <>{card("task-bottom flex")}{balloons}</>;
}

/** You've arrived, said like a reply: a speech bubble just above the chat bar. Nothing to dismiss; Done or close puts it away with the trip. */
function ArrivedBubble({ text, where }: { text: string; where: string | null }) {
  return <div className="arrive-bubble" role="status" data-testid="trip-arrived">
    <p className="flex items-center gap-2 text-[15px] font-semibold"><PartyPopper size={18} className="shrink-0 text-amber-500" aria-hidden />{text}</p>
    {where ? <p className="mt-0.5 text-[13px] text-slate-600">{where}</p> : null}
  </div>;
}
