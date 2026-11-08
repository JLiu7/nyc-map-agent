import "@/components/task-screens.css";
import { createPortal } from "react-dom";
import { useFlag } from "@/lib/flags";
import { useLeftCard } from "@/lib/store/leftColumn";
import { ArrowUp, LocateFixed, WifiOff, X } from "lucide-react";
import { useState } from "react";
import { PullSheet } from "@/components/PullSheet";
import type { SheetLevel } from "@/components/sheetSwipe";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { alongLabel } from "./cues";
import type { ExitPack } from "./pack";
import { signText } from "./cues";
import { distanceLabel, type Where } from "./where";

/** Real saved exits, with a pointer only when the existing calibration trusts it. */
export function ExitTask(p: {
  pack: ExitPack; chosen: number; online: boolean;
  rotation: number | null; distanceM: number | null;
  onChoose: (i: number) => void; onOut: () => void; onClose: () => void;
  onCalibrate?: () => void;
  /** Whether you are at this station; without it the card just shows the exits. */
  where?: Where;
  onShare?: () => void; onHere?: () => void; onWalkThere?: () => void; onPickStation?: (id: string) => void;
}) {
  const [other, setOther] = useState(false);
  const exit = p.pack.exits[p.chosen];
  const w = p.where;
  const here = !w || w.kind === "here";
  const away = exit && w?.kind === "here" && w.toExitM !== null ? `About ${w.toExitM} m from you` : null;
  const wide = useMediaQuery("(min-width: 640px)");
  const [level, setLevel] = useState<SheetLevel>(1);
  // A desktop with the agent home: the station and its exits are one card in the left column.
  const home = useFlag("agentHome");
  const desktop = useMediaQuery("(min-width: 1024px)");
  const { slot, top } = useLeftCard(`exits:${p.pack.station.name}`, home && desktop);
  const exitTitle = exit ? signText(exit.streets, exit.corner)?.replace(/^Exit · /, "") ?? `Exit ${p.chosen + 1}` : "No street exits listed";
  const offline = !p.online ? <span className="ml-auto flex shrink-0 items-center gap-1 text-xs text-slate-300"><WifiOff size={14} />Offline</span> : null;
  const close = <button type="button" aria-label="Close underground help" className="task-action task-close" onClick={p.onClose}><X size={18} /></button>;
  const body = <>
    {w && w.kind !== "here" ? <WhereRow where={w} station={p.pack.station.name} onShare={p.onShare} onHere={p.onHere} onWalkThere={p.onWalkThere} onPickStation={p.onPickStation} /> : null}
    <div className="flex items-center gap-3">
      {exit && p.rotation !== null ? <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-slate-400/25" role="img" aria-label="Approximate direction to your exit"><ArrowUp className="h-7 w-7 text-blue-400" style={{ transform: `rotate(${p.rotation}deg)` }} /></div> : null}
      <div className="min-w-0 flex-1">
        <span className="task-caption">Your exit</span>
        <h3 className="truncate text-base font-bold leading-tight">{exitTitle}</h3>
        <p className="text-xs text-slate-300">{exit ? <>{away ?? alongLabel(exit.alongM) ?? (p.distanceM !== null ? `About ${p.distanceM} m from the station centre` : "Follow the exit signs")} · <span className="text-amber-300">approximate</span></> : "Follow the station signs."}</p>
      </div>
      {exit && here ? <button type="button" className="task-action min-h-10 shrink-0 px-3" onClick={p.onOut}>I'm out</button> : null}
    </div>
    {exit ? <div className="flex gap-2 text-xs">
      <button type="button" className="task-action task-secondary min-h-9 flex-1" aria-expanded={other} onClick={() => { setOther(!other); if (!other) setLevel(2); }}>Other exits</button>
      {p.rotation === null && p.onCalibrate ? <button type="button" className="task-action task-secondary min-h-9 flex-1" onClick={p.onCalibrate}>Set pointer</button> : null}
    </div> : null}
    {other ? <div className="flex w-full flex-col gap-1.5" aria-label="Other exits">{p.pack.exits.map((e, i) => <button type="button" key={i} className="task-action task-secondary min-h-9 text-left text-sm" aria-pressed={i === p.chosen} onClick={() => { p.onChoose(i); setOther(false); }}>{signText(e.streets, e.corner) ?? `Exit ${i + 1}`}</button>)}</div> : null}
  </>;
  // A phone: the station and your exit rest as one line on the chat and pull up, so the map keeps the station, you and the way out (owner, 2026-10-25).
  if (!wide) return (
    <PullSheet testId="exit-sheet" label={`${p.pack.station.name} exits`} level={level} onLevel={setLevel} onClose={p.onClose}
      header={<div className="flex items-center gap-2.5">
        <button type="button" className="flex min-h-11 min-w-0 flex-1 flex-col justify-center text-left" aria-expanded={level > 0} onClick={() => setLevel((l) => (l === 0 ? 1 : l))}>
          <span className="flex items-center gap-2"><span className="truncate text-[15px] font-bold">{p.pack.station.name}</span>{offline}</span>
          <span className="truncate text-xs text-amber-200">Your exit: {exitTitle}</span>
        </button>
        {close}
      </div>}>
      <section className="pull-sheet-body mt-1 flex flex-col gap-2" aria-label="Station exits">{body}</section>
    </PullSheet>
  );
  if (slot) return createPortal(
    <section aria-label="Station exits" data-testid="exit-card" className={`task-panel ${top ? "flex" : "hidden"} min-h-0 flex-col gap-2 overflow-y-auto rounded-2xl px-3 py-2.5`}>
      <div className="flex items-center gap-2">
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">{p.pack.station.name}</h2>
        {offline}
        {close}
      </div>
      {body}
    </section>,
    slot,
  );
  return <>
    <div className="task-top flex items-center gap-2">
      <div className="task-panel flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-full px-3 py-1.5">
        <h2 className="text-sm font-semibold">{p.pack.station.name}</h2>
        {offline}
      </div>
      {close}
    </div>
    {/* A short strip under the station name: the map below shows you, the exit and the way there (owner, 2026-10-25). */}
    <section style={{ top: "calc(env(safe-area-inset-top) + 132px)" }} className="task-panel absolute left-3 z-40 flex max-h-[calc(100dvh-250px)] w-[min(420px,calc(100%-104px))] flex-col gap-2 overflow-y-auto rounded-2xl px-3 py-2.5" aria-label="Station exits">
      {body}
    </section>
  </>;
}

/** "Are you at Flushing Av?", "Finding you…" or "You're 1.2 km from Flushing Av", with the one or two buttons that answer it. */
function WhereRow(p: { where: Exclude<Where, { kind: "here" }>; station: string; onShare?: () => void; onHere?: () => void; onWalkThere?: () => void; onPickStation?: (id: string) => void }) {
  const w = p.where;
  const btn = "task-action min-h-9 flex-1 px-3 text-xs";
  return <div className="flex flex-col gap-1.5 rounded-xl bg-[rgba(15,23,42,0.45)] px-2.5 py-2" role="status" data-testid="exit-where">
    {w.kind === "finding" ? <p className="flex items-center gap-1.5 text-sm"><LocateFixed size={14} aria-hidden />Finding you…</p>
      : w.kind === "ask" ? <>
        <p className="text-sm font-semibold">Are you at {p.station}?</p>
        <p className="text-xs text-slate-300">{w.blocked ? "Location is off for this site, so tell me." : "Share your location and I'll check, then show the way to your exit."}</p>
        <div className="flex gap-2">
          {!w.blocked && p.onShare ? <button type="button" className={btn} onClick={p.onShare}>Share location</button> : null}
          {p.onHere ? <button type="button" className={`${btn} task-secondary`} onClick={p.onHere}>I'm here</button> : null}
        </div>
      </>
      : <>
        <p className="text-sm font-semibold">You're about {distanceLabel(w.metres)} from {p.station}.</p>
        <div className="flex gap-2">
          {p.onWalkThere ? <button type="button" className={btn} onClick={p.onWalkThere}>Walk there</button> : null}
          {p.onHere ? <button type="button" className={`${btn} task-secondary`} onClick={p.onHere}>I'm here</button> : null}
        </div>
        {w.nearest && p.onPickStation ? <button type="button" className={`${btn} task-secondary w-full text-left`} onClick={() => p.onPickStation!(w.nearest!.id)}>Use {w.nearest.name}, by you</button> : null}
      </>}
  </div>;
}
