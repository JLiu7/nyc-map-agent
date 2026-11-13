import "@/components/task-screens.css";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { LocateOff, MapPin, WifiOff, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { PullSheet } from "@/components/PullSheet";
import type { SheetLevel } from "@/components/sheetSwipe";
import { askAgent } from "../stream";
import { useAppLang } from "@/lib/i18n/appLang";
import { tr } from "@/lib/i18n/appLang";
import { useSharedLocation } from "@/lib/geo/sharedLocation";
import { getMapInstance } from "@/lib/map/mapInstance";
import { useLeftCard } from "@/lib/store/leftColumn";
import { useActiveTrip } from "@/lib/transit/activeTrip";
import { closeLostHelper, notedTrain, notedTrainPart, notedTrip, setLostSender, type LostContext } from "@/lib/underground/lostHelper";
import { useStationHelp } from "@/lib/underground/stationHelp";
import { useUndergroundNow } from "@/lib/underground/whereNow";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { metres, type Pt } from "@/lib/map/mapRead";
import { bestGuess, readSignal, signalPoor, type Connection, type Fix, type Signal } from "./lostGuess";
import { guessText, lostT, offlineReply, signalChips, signalForAgent } from "./lostText";
import { Placer } from "./placeFlow";
import { answerLabel, placeT, questionText, spotText } from "./placeText";
import { answersFor, walkLen, type Answer, type Question } from "@/lib/map/stationPlace";
import type { StationPlaceKit } from "@/lib/map/dollhousePreview";
import { translateLines } from "@/lib/i18n/translateLines";

/** Fulton St, the station with a detailed model (#143): its four platforms' stations are within this of its centre. */
const FULTON_AT: Pt = [-74.0085, 40.7102];
const FULTON_M = 400;

/** The part of subway.json the guess needs: each station's id, name and place. */
interface Stations { stations: { features: Array<{ geometry: { coordinates: number[] }; properties: { id: string; name: string } }> } }

/** The station nearest a point, within `maxM`. */
function nearestStation(sys: Stations, at: Pt, maxM: number): { id: string; name: string; at: Pt; d: number } | null {
  let best: { id: string; name: string; at: Pt; d: number } | null = null;
  for (const f of sys.stations.features) {
    const p: Pt = [f.geometry.coordinates[0], f.geometry.coordinates[1]];
    const d = metres(at, p);
    if (d <= maxM && (!best || d < best.d)) best = { id: String(f.properties.id), name: f.properties.name, at: p, d };
  }
  return best;
}

type Msg = { id: number; role: "user" | "assistant"; text: string; pending?: boolean };

/** Online or not, and the browser's network quality where it gives one (Chromium only). */
function useNetwork(): { online: boolean; connection: Connection | null } {
  const conn = () => (typeof navigator !== "undefined" ? ((navigator as Navigator & { connection?: Connection }).connection ?? null) : null);
  const read = () => ({ online: typeof navigator === "undefined" ? true : navigator.onLine, connection: conn() ? { ...conn() } : null });
  const [state, setState] = useState(read);
  useEffect(() => {
    const update = () => setState(read());
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    const c = conn() as (Connection & EventTarget) | null;
    c?.addEventListener?.("change", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      c?.removeEventListener?.("change", update);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return state;
}

/** A clock that ticks every 30 s, so a fix's age keeps up while the helper is open. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

/**
 * The where-am-I helper (#131): says where the app thinks you are, then a text
 * chat about it. Typing goes through the chat bar (stations are loud, so text
 * comes first); this sheet shows the thread. Offline it answers from what it
 * has and sends the question when the network is back.
 */
export function LostHelper({ ctx }: { ctx: LostContext }) {
  const lang = useAppLang();
  const net = useNetwork();
  const shared = useSharedLocation();
  const trip = useActiveTrip() ?? notedTrip();
  const under = useUndergroundNow();
  const stationHelp = useStationHelp();
  const now = useNow();
  const { data: sys } = useQuery({
    queryKey: ["transit", "static", "subway"],
    queryFn: async () => (await (await fetch("/transit/subway.json")).json()) as Stations,
    staleTime: Infinity,
  });

  const fix: Fix | null = shared.status === "on" && shared.coords ? { at: [shared.coords.lon, shared.coords.lat], accuracy: shared.accuracy ?? null, fixAt: shared.fixAt ?? null } : null;
  const signal: Signal = readSignal({ online: net.online, connection: net.connection, fix, now });
  // The guess is made once when the helper opens (and again when the station data arrives), not on every tick.
  const guess = useMemo(
    () => bestGuess({
      ctx, trip, train: notedTrain(), under, fix, signal, now: Date.now(),
      nearest: (at: Pt) => (sys ? nearestStation(sys, at, 2000) : null),
      partFor: notedTrainPart,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ctx, sys],
  );
  const first = guessText(guess, lang);
  const [msgs, setMsgs] = useState<Msg[]>(() => [{ id: 0, role: "assistant", text: first }]);
  // Every change goes through `commit`, so a send reads the thread as it is, not as the last render saw it.
  const cur = useRef(msgs);
  const commit = (next: Msg[]) => { cur.current = next; setMsgs(next); };
  const patch = (id: number, m: Partial<Msg>) => commit(cur.current.map((x) => (x.id === id ? { ...x, ...m } : x)));
  // The first message follows the language if it changes before anyone answers.
  useEffect(() => { if (cur.current.length === 1) commit([{ id: 0, role: "assistant", text: first }]); }, [first]);
  const [answered, setAnswered] = useState(false);
  const waiting = useRef<string[]>([]);
  const nextId = useRef(1);
  const abort = useRef<AbortController | null>(null);
  /** Where the questions placed them, in English, for the agent. */
  const placedRef = useRef<string | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  const add = (m: Omit<Msg, "id">) => {
    const id = nextId.current++;
    commit([...cur.current, { ...m, id }]);
    return id;
  };

  const ask = async (thread: Msg[]) => {
    const id = add({ role: "assistant", text: "", pending: true });
    abort.current?.abort();
    const ctl = new AbortController();
    abort.current = ctl;
    // The agent sees the guess as context; the thread it gets starts at the person's first message.
    const start = thread.findIndex((m) => m.role === "user");
    const messages = thread.slice(Math.max(start, 0)).filter((m) => m.text.trim()).slice(-10).map((m) => ({ role: m.role, content: m.text }));
    let text = "";
    try {
      for await (const ev of askAgent({
        messages, location: fix && signal.gps === "ok" ? { lon: fix.at[0], lat: fix.at[1] } : null, mode: "transit", now: new Date().toISOString(), lang,
        underground: { stage: "lost", station: guess.station ?? "", exit: guess.exit, guess: guessText(guess, "en"), ...(signalForAgent(signal) ? { signal: signalForAgent(signal) } : {}), ...(placedRef.current ? { place: placedRef.current } : {}) },
      }, ctl.signal)) {
        if (ctl.signal.aborted) return;
        if (ev.type === "text") {
          text += ev.text;
          const t = text;
          patch(id, { text: t, pending: false });
        } else if (ev.type === "error") {
          text = ev.message;
          patch(id, { text: ev.message, pending: false });
        }
      }
    } catch {
      if (ctl.signal.aborted) return;
    }
    if (!text.trim()) patch(id, { text: lostT(lang, "failed"), pending: false });
  };

  const send = (raw: string) => {
    const text = raw.trim();
    if (!text) return;
    setAnswered(true);
    add({ role: "user", text });
    // While placing, words that fit a sign in the station narrow the place, with no network needed.
    if (placer.current && (question || placedAt)) {
      if (placer.current.typed(text)) { hideSpot(); setPlacedAt(null); askNext(); return; }
      if (question === "sign" && !navigator.onLine) { add({ role: "assistant", text: placeT(lang, "noSign") }); askNext(); return; }
    }
    if (!navigator.onLine) {
      waiting.current.push(text);
      add({ role: "assistant", text: offlineReply(guess.exit, lang) });
      return;
    }
    void ask(cur.current);
  };
  const sendRef = useRef(send);
  sendRef.current = send;
  useEffect(() => {
    setLostSender((t) => sendRef.current(t));
    return () => setLostSender(null);
  }, []);

  // Back online: the questions that waited go now, in one turn.
  useEffect(() => {
    if (!net.online || !waiting.current.length) return;
    waiting.current = [];
    const thread = cur.current;
    add({ role: "assistant", text: lostT(lang, "sentLater") });
    void ask(thread);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [net.online]);

  const yes = () => {
    setAnswered(true);
    add({ role: "user", text: tr(lang, "yes") });
    if (startPlacing()) return;
    add({ role: "assistant", text: guess.exit ? lostT(lang, "yesExit", { e: guess.exit }) : lostT(lang, "yesNoExit") });
  };
  const notQuite = () => {
    setAnswered(true);
    add({ role: "user", text: lostT(lang, "notQuite") });
    add({ role: "assistant", text: lostT(lang, "notQuiteReply") });
  };
  const station = guess.stationId && sys ? sys.stations.features.find((f) => String(f.properties.id) === guess.stationId) : null;
  const showOnMap = () => {
    if (guess.stationId && stationHelp) {
      closeLostHelper();
      stationHelp(guess.stationId);
      return;
    }
    const at = station?.geometry.coordinates;
    if (at) getMapInstance()?.flyTo({ center: [at[0], at[1]], zoom: 17 });
  };
  const canShow = !!guess.stationId && (!!stationHelp || !!station);
  const wide = useMediaQuery("(min-width: 640px)");
  const desktop = useMediaQuery("(min-width: 1024px)");
  const { slot, top } = useLeftCard("lost-helper", desktop);
  const [level, setLevel] = useState<SheetLevel>(1);

  // Inside Fulton St the helper pins down where in the station someone is (#143): a few tap questions
  // and the nearest sign's words against the station model, then the way out from that spot.
  const atModel = guess.station === "Fulton St" && (!station || metres([station.geometry.coordinates[0], station.geometry.coordinates[1]], FULTON_AT) < FULTON_M);
  const [kit, setKit] = useState<StationPlaceKit | null>(null);
  useEffect(() => {
    if (!atModel) return;
    let live = true;
    import("@/lib/map/dollhousePreview").then((m) => m.loadStationPlace(getMapInstance())).then((k) => { if (live) setKit(k); }).catch(() => {});
    return () => { live = false; };
  }, [atModel]);
  const tripExit = useMemo((): [number, number] | null => {
    const i = trip ? trip.legs.map((l) => l.kind).lastIndexOf("ride") : -1;
    const leg = i >= 0 ? trip!.legs.slice(i + 1).find((l) => l.station) : undefined;
    return guess.exit && leg?.portal ? [leg.portal.lon, leg.portal.lat] : null;
  }, [trip, guess.exit]);
  const placer = useRef<Placer | null>(null);
  const [question, setQuestion] = useState<Question | null>(null);
  const [placedAt, setPlacedAt] = useState<string | null>(null);
  useEffect(() => { placedRef.current = placedAt; }, [placedAt]);
  const shown = useRef<(() => void) | null>(null);
  const hideSpot = () => { shown.current?.(); shown.current = null; };
  useEffect(() => hideSpot, []);

  const askNext = () => {
    const p = placer.current!;
    const q = p.next();
    setQuestion(q);
    if (q) { add({ role: "assistant", text: questionText(q, lang) }); return; }
    const at = p.placed();
    const where = (l: typeof lang) => spotText(at.spot, at.signWords, p.kit.lines, l);
    const way = p.way();
    const head = placeT(lang, at.sure ? "likely" : "bestGuess", { p: where(lang) });
    const back = way.backM > 3 ? placeT(lang, "back", { n: way.backM }) : "";
    const say = (steps: string[]) => [head, back, steps.length ? `${placeT(lang, "then")} ${steps.join(" ")}` : ""].filter(Boolean).join(" ");
    const id = add({ role: "assistant", text: say(way.steps) });
    setPlacedAt(`${where("en")}${way.backM > 3 ? `; first back about ${way.backM} m` : ""}; then: ${way.steps.join(" ")}`);
    // The steps come from the model in English; online, they follow the app's language.
    if (lang !== "en" && navigator.onLine && way.steps.length)
      void translateLines(way.steps, lang).then((t) => { if (t.size) patch(id, { text: say(way.steps.map((x) => t.get(x) ?? x)) }); });
  };
  const startPlacing = () => {
    if (!kit) return false;
    placer.current = new Placer(kit, kit.walkTo(tripExit));
    setPlacedAt(null);
    askNext();
    return true;
  };
  const tap = (a: Exclude<Answer, { q: "sign" }>) => {
    add({ role: "user", text: answerLabel(a, lang) });
    placer.current?.tap(a);
    askNext();
  };
  const showSpot = () => {
    const p = placer.current, map = getMapInstance();
    if (!p || !map) return;
    const { spot } = p.placed();
    const on = spot.on[0], walk = p.kit.walks[on.walk];
    hideSpot();
    if (!wide) setLevel(0);
    void import("@/lib/map/dollhousePreview")
      .then((m) => m.showDollhouse(map, { exit: walk.exit, at: on.walked / walkLen(walk.path), street: p.kit.corners[on.walk] ?? "Fulton Street" }))
      .then((stop) => { shown.current = stop; });
  };
  const notThere = () => {
    add({ role: "user", text: placeT(lang, "notThere") });
    hideSpot();
    setPlacedAt(null);
    placer.current?.notThere();
    askNext();
  };

  const chips = signalPoor(signal) ? signalChips(signal, lang) : [];
  const listRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs]);

  const close = <button type="button" aria-label={lostT(lang, "close")} className="task-action task-close" onClick={closeLostHelper}><X size={18} /></button>;
  const signalRow = chips.length ? (
    <p className="flex flex-wrap items-center gap-1.5 text-xs text-amber-200" role="status" data-testid="lost-signal">
      {chips.map((c) => <span key={c} className="flex items-center gap-1 rounded-full bg-amber-400/10 px-2 py-0.5">{/network|red|网络|сеть|নেটওয়ার্ক|rezo|réseau|네트워크/i.test(c) ? <WifiOff size={12} aria-hidden /> : <LocateOff size={12} aria-hidden />}{c}</span>)}
    </p>
  ) : null;
  const thread = (
    <ol ref={listRef} className="flex min-h-0 flex-col gap-2 overflow-y-auto" aria-live="polite" data-testid="lost-thread">
      {msgs.map((m) => (
        <li key={m.id} className={m.role === "user" ? "max-w-[85%] self-end rounded-2xl rounded-br-md bg-blue-600 px-3 py-1.5 text-sm text-white" : "max-w-[95%] self-start rounded-2xl rounded-bl-md bg-slate-800/80 px-3 py-1.5 text-sm text-slate-100"}>
          {m.pending ? <span className="text-slate-300">{tr(lang, "agentsWorking")}…</span> : m.text}
        </li>
      ))}
    </ol>
  );
  const actions = (
    <div className="flex gap-2 text-sm">
      {!answered && guess.stage ? <>
        <button type="button" className="task-action min-h-10 flex-1 px-3" onClick={yes}>{tr(lang, "yes")}</button>
        <button type="button" className="task-action task-secondary min-h-10 flex-1 px-3" onClick={notQuite}>{lostT(lang, "notQuite")}</button>
      </> : null}
      {placedAt && !question ? <>
        <button type="button" className="task-action min-h-10 flex-1 px-3" onClick={showSpot}>{placeT(lang, "showMe")}</button>
        <button type="button" className="task-action task-secondary min-h-10 flex-1 px-3" onClick={notThere}>{placeT(lang, "notThere")}</button>
      </> : null}
      {canShow && !placedAt ? <button type="button" className="task-action task-secondary min-h-10 flex-1 px-3" onClick={showOnMap}>{lostT(lang, "showOnMap")}</button> : null}
    </div>
  );
  const taps = question && question !== "sign" && placer.current ? (
    <div className="flex flex-wrap gap-2 text-sm" role="group" aria-label={questionText(question, lang)} data-testid="lost-answers">
      {answersFor(question, placer.current.kit.spots, placer.current.w).map((a) => (
        <button key={String(a.a)} type="button" className="task-action task-secondary min-h-10 px-3" onClick={() => tap(a)}>{answerLabel(a, lang)}</button>
      ))}
    </div>
  ) : question === "sign" ? (
    <div className="flex flex-wrap gap-2 text-sm" data-testid="lost-answers">
      <button type="button" className="task-action task-secondary min-h-10 px-3" onClick={() => { add({ role: "user", text: placeT(lang, "noSignNear") }); askNext(); }}>{placeT(lang, "noSignNear")}</button>
    </div>
  ) : null;
  const body = <>{signalRow}{thread}{taps}{actions}</>;
  const name = guess.station ?? lostT(lang, "title");

  if (!wide) return (
    <PullSheet testId="lost-sheet" label={lostT(lang, "title")} level={level} onLevel={setLevel} onClose={closeLostHelper}
      header={<div className="flex items-center gap-2.5">
        <button type="button" className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left" aria-expanded={level > 0} onClick={() => setLevel((l) => (l === 0 ? 1 : l))}>
          <MapPin size={18} className="shrink-0 text-blue-300" aria-hidden />
          <span className="truncate text-[15px] font-bold">{name}{guess.line ? ` · ${guess.line}` : ""}</span>
          {chips.length ? <WifiOff size={14} className="shrink-0 text-amber-200" aria-hidden /> : null}
        </button>
        {close}
      </div>}>
      <section className="pull-sheet-body mt-1 flex flex-col gap-2" aria-label={lostT(lang, "title")}>{body}</section>
    </PullSheet>
  );
  const card = (
    <section aria-label={lostT(lang, "title")} data-testid="lost-card" className={`task-panel ${slot ? (top ? "flex" : "hidden") : "absolute left-3 z-40 flex max-h-[calc(100dvh-250px)] w-[min(420px,calc(100%-104px))]"} min-h-0 flex-col gap-2 overflow-y-auto rounded-2xl px-3 py-2.5`}
      style={slot ? undefined : { top: "calc(env(safe-area-inset-top) + 76px)" }}>
      <div className="flex items-center gap-2">
        <MapPin size={16} className="shrink-0 text-blue-300" aria-hidden />
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">{name}{guess.line ? ` · ${guess.line}` : ""}</h2>
        {close}
      </div>
      {body}
    </section>
  );
  return slot ? createPortal(card, slot) : card;
}

export default LostHelper;
