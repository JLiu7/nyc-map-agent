import { useMemo } from "react";
import { setOptions, useMapOptions } from "@/lib/map/mapOptions";
import { usePanel } from "@/lib/store/PanelContext";
import { heldTrains } from "@/lib/transit/holds";
import { setSelectedLine } from "@/lib/transit/selectedLine";
import { useAlerts, useTransitData } from "./hooks";
import { allLineNotices } from "./lineNotices";
import { NoticeIcon, type NoticeKind } from "./noticeKind";
import { RANK, type Trouble } from "./noticeRank";
import { RouteBullet } from "./TransitCard";

/** Every subway service plus the shuttles and SIR, in MTA order. */
const DRAWER_LINES = ["1", "2", "3", "4", "5", "6", "7", "A", "C", "E", "B", "D", "F", "M", "G", "J", "Z", "L", "N", "Q", "R", "W", "GS", "FS", "H", "SI"];

/** A line's worst current status (owner, 2026-11-14: the A read "Delays" with a no-trains stretch on it): words, a symbol and a colour. */
const STATUS: Record<Trouble | "good", { label: string; icon: NoticeKind | null; chip: string }> = {
  suspended: { label: "No trains", icon: "noService", chip: "border-[#dc2626] bg-[#dc2626] text-white" },
  skip: { label: "Skips stops", icon: "skip", chip: "border-[hsl(var(--acc))] bg-[hsl(var(--acc))] text-[hsl(var(--acc-foreground))]" },
  reroute: { label: "Rerouted", icon: "detour", chip: "border-[hsl(var(--acc))] bg-[hsl(var(--acc))] text-[hsl(var(--acc-foreground))]" },
  delay: { label: "Delays", icon: "delay", chip: "border-foreground bg-foreground text-background" },
  other: { label: "Notice", icon: "info", chip: "border-foreground text-foreground" },
  good: { label: "Good service", icon: null, chip: "border-border text-muted-foreground" },
};
/** The summary's rows, worst first: no trains; skipping stops or rerouted; delays. */
const SUMMARY: Array<{ rank: number; icon: NoticeKind; label: string }> = [
  { rank: RANK.suspended, icon: "noService", label: "No trains on part of the line" },
  { rank: RANK.skip, icon: "skip", label: "Skipping stops or rerouted" },
  { rank: RANK.delay, icon: "delay", label: "Delays" },
];

/** Lines drawer (#253): tap a row to open that line on the map with its notices. */
export function LinesDrawer() {
  const data = useTransitData(["subway"]);
  const feed = useAlerts(true).data;
  const alerts = useMemo(() => feed?.alerts ?? [], [feed]);
  const sys = data.subway?.stat;
  const live = data.subway?.live;
  // The same notices the line's sheet lists, so the count here matches it; a held train counts as a delay.
  const lines = useMemo(() => {
    const held = [...heldTrains(live).values()];
    return new Map(DRAWER_LINES.map((r) => {
      const notices = allLineNotices(r, held, alerts, feed?.outages ?? [], sys);
      // Sorted worst first, so the first notice about the trains is the line's status.
      const status: Trouble | "good" = notices.find((n) => n.trouble)?.trouble ?? "good";
      return [r, { count: notices.length, status, outagesOnly: notices.length > 0 && notices.every((n) => !n.trouble) }] as const;
    }));
  }, [live, alerts, feed, sys]);
  const { routes } = useMapOptions();
  const { closePanel } = usePanel();
  // The whole row opens the line: its trains, stations and notices, with the map in view.
  const openLine = (r: string, trouble = false) => { closePanel(); setSelectedLine(r, null, undefined, trouble); };
  // Which lines are in trouble right now, by symbol and bullet; nothing when all is well.
  const summary = SUMMARY.map((row) => ({ ...row, lines: DRAWER_LINES.filter((r) => { const st = lines.get(r)?.status; return st && st !== "good" && RANK[st] === row.rank; }) })).filter((row) => row.lines.length);
  return (
    <div className="space-y-2 text-sm" data-testid="lines-drawer">
      {routes.length ? <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Showing {routes.join(", ")}</span>
        <button type="button" onClick={() => setOptions({ routes: [] })}
          className="h-8 rounded-full border border-border px-3 text-xs font-semibold">Show all</button>
      </div> : null}
      {summary.length ? (
        <ul data-testid="lines-trouble" aria-label="Lines with trouble now" className="flex flex-col gap-1.5 rounded-lg border border-border px-2 py-2">
          {summary.map((row) => (
            <li key={row.rank} data-rank={row.rank} className="flex items-start gap-2">
              <span className="flex h-7 w-6 shrink-0 items-center justify-center"><NoticeIcon kind={row.icon} className="h-4 w-4" /></span>
              <span className="sr-only">{row.label}</span>
              <span className="flex min-w-0 flex-1 flex-wrap gap-1">
                {row.lines.map((r) => (
                  <button key={r} type="button" onClick={() => openLine(r, true)} aria-label={`${row.label}: ${data.subway?.stat?.routes[r]?.name ?? r}`}
                    className="flex h-7 min-w-7 items-center justify-center rounded-full hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60a5fa]">
                    <RouteBullet system="subway" route={r} data={data} />
                  </button>
                ))}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <ul className="divide-y divide-border">
        {DRAWER_LINES.map((r) => {
          const { count = 0, status = "good" as const, outagesOnly = false } = lines.get(r) ?? {};
          const st = STATUS[status];
          // A line whose only notices are elevators and escalators is in good service: the count says what they are.
          const countWords = count ? `${count} ${outagesOnly ? (count === 1 ? "outage" : "outages") : count === 1 ? "notice" : "notices"}` : "";
          const on = routes.includes(r);
          const name = data.subway?.stat?.routes[r]?.name ?? r;
          return (
            <li key={r} data-line={r}>
              <button type="button" onClick={() => openLine(r)} aria-label={`${name}: ${st.label}${countWords ? `, ${countWords}` : ""}`}
                className={`flex w-full items-center gap-2 rounded-md px-1 py-2.5 text-left hover:bg-muted/60 ${on ? "bg-[hsl(var(--acc)/0.25)]" : ""}`}>
                <RouteBullet system="subway" route={r} data={data} />
                <span className="min-w-0 flex-1 truncate text-xs">{name}</span>
                <span data-status={status} className={`flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${st.chip}`}>
                  {st.icon ? <NoticeIcon kind={st.icon} className="h-3 w-3" /> : null}{st.label}
                </span>
                {countWords ? <span className="shrink-0 text-[11px] text-muted-foreground">{countWords}</span> : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
