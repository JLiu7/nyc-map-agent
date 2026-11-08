import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useLeftCard } from "@/lib/store/leftColumn";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { X } from "lucide-react";
import { PullSheet } from "@/components/PullSheet";
import { SettingsBody } from "@/components/SettingsBody";
import { nextTab, type SheetLevel } from "@/components/sheetSwipe";
import { stopFollowing } from "./follow";

const TABS = ["train", "notices", "settings"] as const;
type Tab = (typeof TABS)[number];

export interface FollowSheetProps {
  route: string;
  color: string;
  bus: boolean;
  /** "Underground · No delay reported" and the like. */
  status: string;
  next: { name: string; eta: string } | null;
  /** The stops after the next one, already as buttons. */
  stops: ReactNode[];
  dest: ReactNode;
  notices: ReactNode[];
  noticeCount: number;
  actions: ReactNode;
}

/**
 * Following a train or bus: one line above the chat ("Next: …, 2 min") that
 * swipes or taps up into the stops, notices and settings, and down again.
 * Sideways swipes switch category; every swipe also has a tap, for people who
 * never find a gesture. The map stays clear above it, so the train stays in
 * view (owner, 2026-10-25).
 */
export function FollowSheet(p: FollowSheetProps) {
  const [level, setLevel] = useState<SheetLevel>(0);
  const [tab, setTab] = useState<Tab>("train");
  const tabLabel: Record<Tab, string> = { train: p.bus ? "Bus" : "Train", notices: p.noticeCount ? `Notices (${p.noticeCount})` : "Notices", settings: "Settings" };
  // A desktop: one open card in the left column, with the ask box under it; nothing to pull up.
  const desktop = useMediaQuery("(min-width: 1024px)");
  const { slot, top } = useLeftCard(`follow:${p.route}`, desktop);
  const open = slot ? 2 : level;
  const header = <div className="flex items-center gap-2.5" data-testid="follow-heading">
        <span className={`flex h-8 min-w-8 shrink-0 items-center justify-center px-2 text-[13px] font-extrabold ${p.bus ? "rounded-[10px]" : "rounded-full"}`} style={{ background: p.bus ? "#0ea5e9" : p.color }}>{p.route}</span>
        <button type="button" data-testid="follow-line" className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left" aria-expanded={open > 0}
          onClick={() => setLevel((l) => (l === 0 ? 1 : l))}>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[15px] font-bold">{p.next ? `Next: ${p.next.name}` : "No upcoming stop reported"}</span>
            <span className="truncate text-xs text-amber-200">Following your {p.route} · {p.status}</span>
          </span>
          {p.next ? <span className="shrink-0 text-[15px] font-bold text-amber-200">{p.next.eta}</span> : null}
        </button>
        <button type="button" className="task-action task-close" aria-label="Stop following" onClick={stopFollowing}><X size={18} /></button>
      </div>;
  const body = <>
      <div role="tablist" aria-label="Sheet" className="mt-2 grid grid-cols-3 gap-1 rounded-full bg-slate-900/50 p-1">
        {TABS.map((id) => <button key={id} type="button" role="tab" aria-selected={tab === id} data-testid={`follow-tab-${id}`} onClick={() => setTab(id)}
          className={`min-h-9 truncate rounded-full px-2 text-[13px] font-semibold ${tab === id ? "bg-slate-100 text-slate-900" : "text-slate-300"}`}>{tabLabel[id]}</button>)}
      </div>
      <div role="tabpanel" aria-label={tabLabel[tab]} className="pull-sheet-body mt-2 flex flex-col gap-2">
        {tab === "train" ? <>
          {p.actions}
          <div className="flex flex-col gap-0.5 px-1">{open === 2 ? p.stops : p.stops.slice(0, 2)}</div>
          {p.dest}
        </> : tab === "notices" ? (p.notices.length ? p.notices : <p className="px-1 text-[13px] text-slate-300">No notices reported</p>) : <SettingsBody />}
      </div>
  </>;
  if (slot) return createPortal(
    <section data-testid="follow-card" aria-label={`Following ${p.route}`} className={`task-panel ${top ? "flex" : "hidden"} min-h-0 flex-col overflow-y-auto rounded-2xl p-3`}>
      {header}
      {body}
    </section>,
    slot,
  );
  return (
    <PullSheet testId="follow-card" label={`Following ${p.route}`} level={level} onLevel={setLevel} onClose={stopFollowing} onSide={(swipe) => setTab((at) => nextTab(TABS, at, swipe))}
      header={header}>
      {body}
    </PullSheet>
  );
}
