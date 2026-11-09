import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, Bus, ChevronDown, Play, Square, Volume2, VolumeX } from "lucide-react";
import { useSharedLocation } from "@/lib/geo/sharedLocation";
import { useAppLang } from "@/lib/i18n/appLang";
import { formatStationName } from "@/lib/streetName";
import { say } from "@/lib/voice/say";
import { alertDiagram, cleanAlertText, isGap, laterSteps, shortNotice, type AlertDiagram, type Corner, type DiagramStep, type StopState } from "./alertDiagram";
import { setWalkFocus } from "./alertFocus";
import { useNoticeLines } from "./noticeLang";
import type { TransitAlert } from "./hooks";
import type { StaticSystem } from "./model";

/** Notices read aloud on tap, unless muted here; the choice stays on this phone. */
const MUTE_KEY = "nma.notices.voice";
const readMuted = () => { try { return localStorage.getItem(MUTE_KEY) === "off"; } catch { return false; } };

/**
 * The walk (owner, 2026-11-07: "automated voice when i click on these notification that tells me in
 * voice and does graph walk for me"): each step is said aloud while its stations light up, then the
 * next. Muted, the steps still walk, paced for reading. Each step stays up at least a moment.
 */
function useNoticeWalk(steps: DiagramStep[], auto: boolean, lang: string) {
  const [step, setStep] = useState<number | null>(null);
  const [muted, setMutedState] = useState(readMuted);
  const cancel = useRef<(() => void) | null>(null);
  const stop = useCallback(() => {
    cancel.current?.();
    cancel.current = null;
    setStep(null);
  }, []);
  const play = useCallback(() => {
    cancel.current?.();
    let alive = true;
    let hush: () => void = () => undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const go = (i: number) => {
      if (!alive) return;
      if (i >= steps.length) { cancel.current = null; setStep(null); return; }
      setStep(i);
      let spoke = muted, dwelt = false;
      const next = () => { if (spoke && dwelt) go(i + 1); };
      timer = setTimeout(() => { dwelt = true; next(); }, muted ? 1500 + steps[i].text.length * 45 : 900);
      if (!muted) hush = say(steps[i].text, lang, () => { spoke = true; next(); });
    };
    cancel.current = () => { alive = false; clearTimeout(timer); hush(); };
    go(0);
  }, [steps, muted, lang]);
  const setMuted = (m: boolean) => {
    try { localStorage.setItem(MUTE_KEY, m ? "off" : "on"); } catch { /* private window: this visit only */ }
    stop();
    setMutedState(m);
  };
  // Opened by a tap: start once the words are ready (in the rider's language). Closing the notice ends it.
  const started = useRef(false);
  useEffect(() => { if (auto && !started.current) { started.current = true; play(); } }, [auto, play]);
  useEffect(() => () => cancel.current?.(), []);
  return { step, playing: step !== null, play, stop, muted, setMuted };
}

const TAG_KEYS = ["skip", "closed", "shuttle", "local"] as const;
const TAG: Record<StopState, { label: string; bg: string; fg: string } | null> = {
  skip: { label: "Skipped", bg: "#dc2626", fg: "#ffffff" },
  closed: { label: "No trains", bg: "#475569", fg: "#f1f5f9" },
  shuttle: { label: "Shuttle bus", bg: "#f59e0b", fg: "#111827" },
  local: { label: "Now stops", bg: "#16a34a", fg: "#ffffff" },
  transfer: { label: "Change here", bg: "#2563eb", fg: "#ffffff" },
  open: null,
};

function Diagram({ d, color, lit, labels }: { d: AlertDiagram; color: string; lit: Set<string> | null; labels: Record<StopState, string> & { heading: string } }) {
  const rail = d.rows.filter((r) => isGap(r) || !r.off);
  const off = d.rows.filter((r) => !isGap(r) && r.off);
  const directional = d.kind === "skip" || d.kind === "local";
  return (
    <div data-testid="notice-diagram" className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-[#a5b4cb]">
        {labels.heading}
        {directional && !/both ways/.test(d.heading) ? <ArrowDown className="h-3.5 w-3.5" aria-label="this way down the list" /> : null}
      </div>
      <ol className="flex flex-col" aria-label={`${d.heading}, station by station`}>
        {rail.map((r, i) => {
          const first = i === 0, last = i === rail.length - 1;
          if (isGap(r)) {
            return (
              <li key={`gap${i}`} className="flex min-h-6 items-stretch gap-2.5 text-[12px] text-[#a5b4cb]">
                <span aria-hidden className="relative w-4 shrink-0"><span className="absolute inset-y-0 left-1/2 w-[3px] -translate-x-1/2 opacity-70" style={{ background: color }} /></span>
                <span className="self-center">{r.gap === 1 ? "1 more stop" : `${r.gap} more stops`}</span>
              </li>
            );
          }
          const tag = TAG[r.state];
          const broken = r.state === "closed" || r.state === "shuttle";
          const on = lit?.has(r.id) ?? false;
          const seg = (pos: "top" | "bottom") => {
            const hidden = pos === "top" ? first : last;
            return <span className={`absolute left-1/2 w-[3px] -translate-x-1/2 ${pos === "top" ? "top-0 h-1/2" : "bottom-0 h-1/2"}`}
              style={hidden ? undefined : broken ? { backgroundImage: `repeating-linear-gradient(${r.state === "shuttle" ? "#f59e0b" : "#64748b"} 0 4px, transparent 4px 8px)` } : { background: color }} />;
          };
          return (
            <li key={r.id} data-stop={r.id} data-state={r.state} data-lit={on || undefined}
              className="flex min-h-7 items-stretch gap-2.5 rounded-lg pr-1 transition-[background-color,opacity] duration-300"
              style={{ background: on ? "rgba(96,165,250,0.2)" : undefined, opacity: lit && !on ? 0.5 : 1 }}>
              <span aria-hidden className="relative w-4 shrink-0">
                {seg("top")}{seg("bottom")}
                <span className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-[2.5px] bg-[#0f172a]"
                  style={{ borderColor: r.state === "skip" ? "#dc2626" : r.state === "transfer" ? "#60a5fa" : broken ? "#94a3b8" : color, background: r.state === "local" || r.state === "open" ? color : "#0f172a" }} />
              </span>
              <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5 py-1 text-[13px]">
                <span className={r.state === "skip" || broken ? "text-[#cbd5e1] line-through decoration-[#94a3b8]/70" : "font-medium"}>{formatStationName(r.name)}</span>
                {tag ? <Tag {...tag} label={labels[r.state]} shuttle={r.state === "shuttle"} /> : null}
                {r.corners ? <Corners list={r.corners} /> : null}
              </span>
            </li>
          );
        })}
      </ol>
      {off.length ? (
        <ul className="mt-1 flex flex-col gap-1" aria-label="Also change at">
          {off.map((r) => !isGap(r) && (
            <li key={r.id} data-stop={r.id} data-state="transfer" data-lit={lit?.has(r.id) || undefined}
              className="flex min-h-7 items-center gap-2.5 rounded-lg pr-1 transition-[background-color,opacity] duration-300"
              style={{ background: lit?.has(r.id) ? "rgba(96,165,250,0.2)" : undefined, opacity: lit && !lit.has(r.id) ? 0.5 : 1 }}>
              <span aria-hidden className="flex w-4 shrink-0 justify-center"><span className="h-3 w-3 rounded-full border-[2.5px] border-[#60a5fa]" /></span>
              <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px]">
                <span className="font-medium">{formatStationName(r.name)}</span>
                <Tag label={`${labels.transfer}: ${r.off!.join(", ")}`} bg="#2563eb" fg="#ffffff" />
                {r.corners ? <Corners list={r.corners} /> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Where the shuttle bus stops for a station, in the MTA's words. */
function Corners({ list }: { list: Corner[] }) {
  return (
    <span className="flex basis-full items-start gap-1 text-[12px] leading-snug text-[#fcd34d]">
      <Bus className="mt-px h-3 w-3 shrink-0" aria-label="Shuttle bus stop" />
      <span>{list.map((c) => (c.note ? `${c.text} (${c.note})` : c.text)).join("; ")}</span>
    </span>
  );
}

function Tag({ label, bg, fg, shuttle }: { label: string; bg: string; fg: string; shuttle?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-px text-[11px] font-bold" style={{ background: bg, color: fg }}>
      {shuttle ? <Bus className="h-3 w-3" aria-hidden /> : null}{label}
    </span>
  );
}

/**
 * An open service notice: the affected stretch drawn as a line, the short steps under it, read
 * aloud with each step lit, and the MTA's own words folded below. A notice with no stations to
 * draw shows its first sentence or two instead.
 */
export default function NoticeDiagram({ alert, sys, route, color, auto }: { alert: TransitAlert; sys: StaticSystem | undefined; route: string; color: string; auto: boolean }) {
  // Start from the rider's nearest station when they share where they are; about 100 m is close enough.
  const here = useSharedLocation();
  const nearKey = here.status === "on" && here.coords ? `${here.coords.lon.toFixed(3)},${here.coords.lat.toFixed(3)}` : "";
  const near = useMemo(() => (nearKey ? { lon: Number(nearKey.split(",")[0]), lat: Number(nearKey.split(",")[1]) } : null), [nearKey]);
  const diagram = useMemo(() => alertDiagram(alert, sys, route, near), [alert, sys, route, near]);
  const full = useMemo(() => cleanAlertText([alert.text, alert.description].filter(Boolean).join("\n\n")).replace(/\n{3,}/g, "\n\n").trim(), [alert]);
  const short = useMemo(() => shortNotice(alert.description || alert.text), [alert]);
  const english = useMemo(() => diagram?.steps ?? [{ text: short, ids: [] }, ...laterSteps(alert, sys, route)], [diagram, short, alert, sys, route]);
  // One call translates the steps, the tags and the heading together (owner, 2026-11-08: "in user preffered language").
  const lang = useAppLang();
  const words = useMemo(() => [...english.map((s) => s.text), ...TAG_KEYS.map((k) => TAG[k]!.label), "Change here", diagram?.heading ?? ""], [english, diagram]);
  const said = useNoticeLines(words, lang);
  const steps = useMemo(() => english.map((s, i) => ({ ...s, text: said.lines[i] })), [english, said.lines]);
  const labels = useMemo(() => {
    const t = said.lines.slice(english.length);
    return { ...Object.fromEntries(TAG_KEYS.map((k, i) => [k, t[i]])), transfer: t[TAG_KEYS.length], heading: diagram?.heading ? t[TAG_KEYS.length + 1] : "" } as Record<StopState, string> & { heading: string };
  }, [said.lines, english.length, diagram]);
  const walk = useNoticeWalk(steps, auto && said.ready, lang === "en" || said.failed ? "en-US" : lang);
  const [more, setMore] = useState(false);
  const lit = walk.step !== null && steps[walk.step].ids.length ? new Set(steps[walk.step].ids) : null;
  // The map follows the walk: this step's stations, their shuttle bus corners, the buses a tip names.
  const corners = useMemo(() => new Map((diagram?.rows ?? []).flatMap((r) => (!isGap(r) && r.corners ? [[r.id, r.corners] as const] : []))), [diagram]);
  const current = walk.step === null ? null : english[walk.step];
  useEffect(() => {
    if (!current) { setWalkFocus(null); return; }
    setWalkFocus({
      ids: current.ids,
      corners: (current.corners ?? []).flatMap((id) => (corners.get(id) ?? []).map((c) => ({ id, text: c.note ? `${c.text} (${c.note})` : c.text }))),
      bus: current.bus ?? [],
    });
  }, [current, corners]);
  useEffect(() => () => setWalkFocus(null), []);
  const btn = "flex h-9 items-center gap-1.5 rounded-[18px] border border-[rgba(148,163,184,0.3)] px-3 text-[13px] font-semibold text-[#f1f5f9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60a5fa]";
  return (
    <div data-testid="notice-walk" data-step={walk.step ?? undefined} className="flex flex-col gap-2.5 rounded-[14px] border border-[rgba(148,163,184,0.16)] bg-[rgba(15,23,42,0.35)] p-3 text-[#f1f5f9]">
      {diagram ? <Diagram d={diagram} color={color} lit={lit} labels={labels} /> : null}
      {said.failed ? <p className="text-[12px] text-[#a5b4cb]">Could not translate this notice, so it is in English.</p> : null}
      <ol className="flex flex-col gap-1 text-[13px] leading-[1.4]" aria-label="What it means" aria-live="polite">
        {steps.map((s, i) => (
          <li key={i} data-testid="notice-step" className={walk.step === i ? "font-semibold text-white" : walk.playing ? "text-[#a5b4cb]" : "text-[#e2e8f0]"}>{s.text}</li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-2">
        {walk.playing ? (
          <button type="button" className={btn} onClick={walk.stop}><Square className="h-3.5 w-3.5" aria-hidden />Stop</button>
        ) : (
          <button type="button" className={btn} onClick={walk.play}><Play className="h-3.5 w-3.5" aria-hidden />{walk.muted ? "Walk through" : "Read it to me"}</button>
        )}
        <button type="button" className={btn} aria-pressed={walk.muted} aria-label={walk.muted ? "Voice off: turn on" : "Voice on: turn off"} onClick={() => walk.setMuted(!walk.muted)}>
          {walk.muted ? <VolumeX className="h-4 w-4" aria-hidden /> : <Volume2 className="h-4 w-4" aria-hidden />}
        </button>
        {full !== short ? (
          <button type="button" className={`${btn} ml-auto border-transparent px-2 text-[#cbd5e1]`} aria-expanded={more} onClick={() => setMore((m) => !m)}>
            Full notice <ChevronDown className="h-3.5 w-3.5 transition-transform" style={{ transform: `rotate(${more ? 180 : 0}deg)` }} aria-hidden />
          </button>
        ) : null}
      </div>
      {more ? <p data-testid="notice-full" className="whitespace-pre-line text-[13px] leading-[1.45] text-[#cbd5e1]">{full}</p> : null}
    </div>
  );
}
