import { usePullSheetUp } from "@/lib/store/pullSheet";
import { Bus, Car, ChevronUp, Compass, Footprints, Headphones, LocateFixed, Mic, MicOff, MoreVertical, Pause, Play, Send, SkipForward, X } from "lucide-react";
import { legFocus } from "./legFocus";
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { setAmbient } from "@/lib/ambient";
import { useFlag } from "@/lib/flags";
import { getMapInstance } from "@/lib/map/mapInstance";
import { useDataView } from "@/lib/store/DataViewContext";
import { followTripRoute } from "@/lib/transit/routeFollow";
import { setTripStep } from "@/lib/store/tripStep";
import { walkToBoard } from "./tripStart";
import { followUpQuestion } from "./followUpQuestion";
import { setLineDay } from "@/lib/transit/lineDay";
import { lineOf, setSelectedLine, useSelectedLine } from "@/lib/transit/selectedLine";
import { useMapState } from "@/lib/store/MapStateContext";
import { publishActiveTrip } from "@/lib/transit/activeTrip";
import { clearTripBuses, revealTripBuses } from "@/lib/transit/busReveal";
import { setFollowed } from "@/lib/transit/follow";
import { usePanel } from "@/lib/store/PanelContext";
import { useCssHeight } from "@/lib/useCssHeight";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { cn } from "@/lib/utils";
import { useSpeech } from "@/lib/voice/useSpeech";
import { turnAroundLine, useWrongWay } from "@/lib/geo/wrongWay";
import { spokenSummary } from "@/lib/voice/tts";
import { executeCommand, type ExecutorContext } from "./executor";
import { PLAYBACK_SPEEDS, langTag, type Leg, type MapAction, type PlaybackSpeed, type Trip, type TripMode } from "./schema";
import { askAgent } from "./stream";
import { TripSummary, selectAlternative } from "./TripSummary";
import { TRIP_CHOICES, tripChoiceQuestion } from "./tripChoices";
import { nameRemindButton, remindAt, saveReminder } from "./reminder";
import { joinSegments, nameLocationButton } from "./answerText";
import { toast } from "sonner";
import { clearPoints, clearTrip, routeColor, showPoints, showTrip } from "./tripLayer";
import { runMapAction, TROUBLE_COLOR, type ExitAction, type MapActionContext } from "./mapActions";
import { setQuickLayer } from "@/lib/quickLayers";
import { setOptions } from "@/lib/map/mapOptions";
import { useHeading } from "@/lib/compass/useHeading";
import { metres } from "@/lib/map/mapRead";
import { AnswerActions, RestroomSpotDetails } from "./AnswerActions";
import { AnswerSources, type AnswerSourcesLine } from "./AnswerSources";
import { formatStationName, formatStreetText } from "@/lib/streetName";
import { sharedCoords, startSharing, stopSharing, useSharedLocation } from "@/lib/geo/sharedLocation";
import { usePlayer, type Speed } from "./usePlayer";
import { useWakePhrase } from "./useWakePhrase";
import { useHandsFree } from "./useHandsFree";
import { closeAsk, streetContextHere, useAskRequest } from "@/lib/agent/streetContext";
import { AgentHome, AnswerCard, WorkingPanel } from "./AgentHome";
import { DailyCard, TaskButtons } from "./HomeTasks";

const SettingsSheet = lazy(() => import("@/components/SettingsSheet"));
// Only once a trip is previewed: keeps the overlay inside its size budget.
const TripPreview = lazy(() => import("./TripPreview").then((m) => ({ default: m.TripPreview })));
import { rememberCommute, useHomeWork } from "./commute";
import { memorySummary } from "./memorySummary";
import { recentTurns } from "./chatWindow";
import { rememberChat, rememberLookup } from "@/lib/memory/memory";
import { parseLang, useLangPref, type AppLang } from "@/lib/voice/langPref";
import { useVoicePrefs } from "@/lib/voice/voicePrefs";
import { useFollowed } from "@/lib/transit/follow";
import { useLinesControl } from "@/lib/transit/linesControl";
import { useStationHelp, useStationHelpVisible } from "@/lib/underground/stationHelp";
import { applyStep, statusLine, type AgentStep } from "./agentSteps";
import { detectLang, speechTag, statusLang } from "./statusLines";
import { getAppLang, setAskedLang, tr, useAppLang } from "@/lib/i18n/appLang";
import { languageList, languagePrompt, matchSpokenLanguage } from "@/lib/voice/languagePrompt";
import { needsSharedOrigin, ORIGIN_PROMPT, replyAsksForOrigin } from "./needsOrigin";
import { framePadding, frameRestrooms } from "@/lib/map/mapCover";
import { useOpenMenu } from "@/lib/store/openMenu";
import { sendScreen, useScreen } from "@/lib/screen/screenSpace";
import { getUndergroundNow, useUndergroundNow } from "@/lib/underground/whereNow";
import { removeShell } from "@/lib/shellDraft";

/** Draw an exit answer and frame it (and you, within a walk of it) in the map left clear by the card. */
// Loaded on the first exit answer, so the overlay stays in its size budget.
let exitLoaded = false;
const exitLayer = () => import("./exitLayer").then((x) => { exitLoaded = true; return x; });

async function frameExit(a: ExitAction) {
  const { exitBounds, showExit } = await exitLayer();
  const m = getMapInstance();
  if (!m) return;
  const v = { exit: a.exit, destination: a.destination, path: a.path };
  showExit(m, v);
  const me = sharedCoords();
  const near = me && metres([me.lon, me.lat], a.exit.at) < 1500 ? ([me.lon, me.lat] as [number, number]) : null;
  const phone = window.innerWidth < 640;
  // The small exit card and the chat bar take about the lower 40% on a phone, the left column wider up.
  // Labels grow inward (exitLayer), so the sides only clear the dots and, on the right, the round map buttons.
  const pad = framePadding(m, phone ? { top: 96, bottom: Math.round(window.innerHeight * 0.42), left: 48, right: 84 } : { top: 100, bottom: 120, left: Math.min(420, window.innerWidth * 0.44) + 48, right: 96 });
  m.fitBounds(exitBounds(v, near), { padding: pad, maxZoom: 18, pitch: 0, bearing: 0, duration: 900 });
}

/** Beside More on an exit answer: turn on the arrow (iOS asks on a tap), or ask for a figure 8 when the compass is off. */
function CompassHint({ heading }: { heading: { ask: (() => void) | null; calibrate: boolean } }) {
  if (heading.ask) {
    return (
      <Button type="button" variant="ghost" onClick={heading.ask} className="h-9 gap-1.5 rounded-full px-3 text-sm font-semibold text-blue-300 hover:bg-slate-800 hover:text-white">
        <Compass className="!h-4 !w-4" aria-hidden="true" />
        Show my direction
      </Button>
    );
  }
  if (!heading.calibrate) return null;
  return (
    <p className="flex items-center gap-1.5 text-xs leading-tight text-amber-300" role="status" data-testid="compass-calibrate">
      <Compass className="h-4 w-4 shrink-0" aria-hidden="true" />
      Calibrate: move your phone in a figure 8
    </p>
  );
}

interface Msg { id: string; role: "user" | "assistant"; content: string; offerLocation?: boolean; actions?: MapAction[]; sources?: AnswerSourcesLine }

/** A spoken status line covers a voice question that is still working after this long (#370). */
const STATUS_AFTER_MS = 2500;
const VOICE_UNSUPPORTED = "Voice input isn't available in this browser. Type your question instead.";

/** The browser language, when it is a tag the server accepts. */
function browserLang(): string | undefined {
  const l = typeof navigator === "undefined" ? undefined : navigator.language;
  return l && langTag.safeParse(l).success ? l : undefined;
}

const MODES: Array<{ id: TripMode; Icon: typeof Bus }> = [
  { id: "walk", Icon: Footprints },
  { id: "transit", Icon: Bus },
  { id: "drive", Icon: Car },
];

export default function AgentOverlay() {
  const { setRoutePoint, setFollowingRoute, followingRoute, clearRoute } = useDataView();
  const { chatOpen, setChatOpen, flyTo, startWalk, stopWalk, chatSeed, clearSeed, restrooms, setRestrooms, walking, streetViewOpen } = useMapState();
  const { showPanel, closeAll, content: panelContent, minimized: panelMinimized, drawerOpen } = usePanel();
  // Agent-first home (#370): bottom chat bar, voice waveform, visible steps.
  const home = useFlag("agentHome");
  // The classic Ask sheet has its own input; the early chat bar from index.html would be a second one (#368).
  useLayoutEffect(() => {
    if (!home) removeShell();
  }, [home]);
  const undergroundOn = useFlag("underground");
  const places = useHomeWork();
  const followed = useFollowed();
  const selectedLine = useSelectedLine();
  const openLines = useLinesControl();
  const stationHelp = useStationHelp();
  const stationHelpVisible = useStationHelpVisible();
  const homeInput = useRef<HTMLInputElement>(null);
  // A stored language wins; otherwise the browser's, read when it changes.
  const storedLang = useLangPref();
  const lang = storedLang ?? browserLang();
  const appLang = useAppLang();
  // One panel at a time (#225): opening Ask closes the drawer and any sheet.
  useEffect(() => {
    if (chatOpen) closeAll();
  }, [chatOpen, closeAll]);
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const driveOn = useFlag("agentDrive");
  const [messages, setMessages] = useState<Msg[]>([]);
  // Who gets the screen is decided in one place (src/lib/screen/screenSpace.ts); this reports what is open.
  const openMenu = useOpenMenu();
  useEffect(() => sendScreen({ type: "MENU", on: openMenu !== null }), [openMenu]);
  // The exit card is a task too, so the answer and the follow card make room for it (#418).
  const atExit = useUndergroundNow()?.stage === "at-station";
  const onTask = followingRoute || walking || followed !== null || atExit;
  useEffect(() => sendScreen({ type: "TASK", on: onTask }), [onTask]);
  const answerView = useScreen((v) => v.answer);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  // The question is held until the server's gap between questions ends (askSpacing).
  const [waiting, setWaiting] = useState(false);
  const [trip, setTrip] = useState<Trip | null>(null);
  // Phones: language and the QR code, up from behind the chat over the idle home.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mode, setMode] = useState<TripMode>("transit");
  const [wakeClassic, setWake] = useState(false);
  // Home: voice settings live in the Settings menu (#370).
  const voicePrefs = useVoicePrefs();
  const wake = home ? voicePrefs.wake : wakeClassic;
  const [mapTime, setMapTime] = useState<string | null>(null);
  // Street weather forecasts the trip's departure hour instead of now.
  useEffect(() => {
    setAmbient({ tripDepart: trip?.departIso ?? null });
    return () => setAmbient({ tripDepart: null });
  }, [trip]);
  const shared = useSharedLocation();
  const abort = useRef<AbortController | null>(null);
  /** The reply still being answered (or held), so a newer question can replace it. */
  const liveReply = useRef<string | null>(null);
  const messagesRef = useRef<Msg[]>([]);
  messagesRef.current = messages;
  /** The question waiting on a shared location, so the button can ask it again. */
  const pendingQuestion = useRef<string | null>(null);
  // Hands-free opened with the spoken language question (#42): the next thing said picks the
  // language rather than being sent to the agent as a question. State, not a ref, so the
  // hands-free loop sees it flip and keeps its arm for the real question.
  const [langAsked, setLangAsked] = useState(false);
  // Bumped when the spoken language question is answered: hands-free opens the mic once more.
  const [languagePicked, setLanguagePicked] = useState(0);
  const [handsFree, setHandsFree] = useState(false);
  const askReq = useAskRequest();
  const compact = askReq !== null;

  const [steps, setSteps] = useState<AgentStep[]>([]);
  const stepsRef = useRef<AgentStep[]>([]);
  stepsRef.current = steps;
  const [notice, setNotice] = useState<string | null>(null);
  /** The next send came from speech, so a long wait gets a spoken status line. */
  const voiceTurn = useRef(false);
  // The small mic dictates into the text box; the big button holds a hands-free conversation.
  const [dictating, setDictating] = useState(false);
  const dictatingRef = useRef(false);
  // The language the server heard on the last voice turn (phones with no language picked).
  const heardLangRef = useRef<AppLang | null>(null);
  const speech = useSpeech({
    onFinalTranscript: (t, heard) => {
      if (dictatingRef.current) {
        dictatingRef.current = false;
        setDictating(false);
        setInput((v) => (v.trim() ? `${v.trim()} ${t}` : t));
        return;
      }
      // Hands-free just asked which language: this turn answers that, and is not a question.
      if (langAsked) {
        setLangAsked(false);
        const picked = matchSpokenLanguage(t);
        if (picked) {
          setAskedLang(picked);
          // A `languagePicked` tick tells the hands-free loop to open the mic once more for the real
          // question, now that the language round is over (#42).
          setLanguagePicked((n) => n + 1);
          speech.speak(languageList([picked]), { lang: speechTag(picked, lang) });
          return;
        }
        // Heard no language it knows, or two: read the guess back and ask again.
        const guess = parseLang(heard) ?? appLang;
        setAskedLang(guess);
        speech.speak(`${languageList([guess])}?`, { lang: speechTag(guess, lang) });
        return;
      }
      heardLangRef.current = parseLang(heard);
      voiceTurn.current = true;
      // The real question is here, so the language round is over.
      setLangAsked(false);
      void send(t);
    },
    lang: home ? lang : undefined,
    // No language picked: detect it from the voice, so anyone can just speak (2026-10-25).
    detectLang: home && storedLang === null,
  });
  // Dictation that ends without words (silence, an error) lets go of the mic button.
  const wasListening = useRef(false);
  useEffect(() => {
    if (wasListening.current && !speech.listening && dictatingRef.current) {
      dictatingRef.current = false;
      setDictating(false);
    }
    wasListening.current = speech.listening;
  }, [speech.listening]);
  const player = usePlayer((text) => speech.speak(text));
  /** Speed the next Play uses: the agent's pick or the person's last tap. */
  const [prefSpeed, setPrefSpeed] = useState<PlaybackSpeed>(10);
  // Ask, the route fit, and the preview all move the camera. Follow and street
  // view let go first, without the Stop following glide back. Starting the
  // preview keeps the player (it is the new camera owner).
  const handoffCamera = (keepPreview = false) => {
    setFollowed(null);
    if (!keepPreview) player.release();
    stopWalk();
    getMapInstance()?.stop();
  };
  /**
   * Another option chosen (chat card or trip panel): redraw it and, if the
   * preview is loaded, restart it on that route from its start. A playing
   * preview keeps the camera, so the map does not fit to the new route then.
   */
  const chooseTrip = (next: Trip) => {
    revealTripBuses(next);
    setTrip(next);
    const m = getMapInstance();
    if (m) showTrip(m, next, { fit: !player.state.playing });
    player.select(next);
  };
  const chooseRef = useRef(chooseTrip);
  chooseRef.current = chooseTrip;
  /** The Play button: the only thing that starts the preview. */
  const startPreview = (t: Trip, speed: PlaybackSpeed) => {
    handoffCamera(true);
    revealTripBuses(t);
    setTrip(t);
    setPrefSpeed(speed);
    setChatOpen(false);
    player.start(t, speed);
  };

  /** A tapped trip step: frame that stretch and mark where to board and get off. */
  const showLeg = (l: Leg) => {
    const f = legFocus(l);
    const m = getMapInstance();
    if (!f || !m) return;
    handoffCamera();
    showPoints(m, f.marks.map((x) => ({ at: x.at, name: x.name })), "#2563eb");
    const wide = window.innerWidth >= 640;
    m.fitBounds(f.bounds, { padding: framePadding(m, wide ? { top: 100, bottom: 120, left: 460, right: 100 } : { top: 110, bottom: Math.round(window.innerHeight * 0.55), left: 40, right: 40 }), maxZoom: 17, pitch: 0, bearing: 0, duration: 800 });
  };
  /** A restroom answer turned the restroom layer on (the person had it off); closing the answer turns it back off. */
  const restroomsByAnswer = useRef(false);
  /** What an answer drew goes with it: its pins, and restrooms it turned on (owner, 2026-10-28: they stayed after closing). */
  const clearAnswerMarks = () => {
    if (restroomsByAnswer.current) { restroomsByAnswer.current = false; setRestrooms(false); }
    const m = getMapInstance();
    if (m && lastActions?.some((a) => a.kind === "showRestroom")) clearPoints(m);
  };
  const clearAnswerMarksRef = useRef(clearAnswerMarks);
  clearAnswerMarksRef.current = clearAnswerMarks;
  /** Close the line panel and stop following, so a new trip or answer starts on a clean map. */
  const clearMapTask = () => {
    setSelectedLine(null);
    setFollowed(null);
    const m = getMapInstance();
    if (m) { clearPoints(m); if (exitLoaded) void exitLayer().then((x) => x.clearExit(m)); }
  };
  const ctx: ExecutorContext = {
    flyTo: (lon, lat, zoom) => { handoffCamera(); flyTo({ lon, lat, zoom }); },
    // A new trip replaces whatever the map was showing: a picked line, a followed train.
    showTrip: (t) => { clearMapTask(); handoffCamera(); revealTripBuses(t); setTrip(t); const m = getMapInstance(); if (m) showTrip(m, t); },
    openTrip: (t) => {
      clearMapTask();
      revealTripBuses(t);
      setTrip(t);
      if (home) { setChatOpen(false); player.load(t, prefSpeed); return; }
      showPanel({
        id: `agent:trip:${t.id}`, title: `To ${t.destination.label}`, subtitle: `${t.departIso.slice(11)} → ${t.arriveIso.slice(11)}`,
        summary: <TripSummary trip={t} compact onSelect={(alt) => { const next = selectAlternative(t, alt); chooseRef.current(next); ctxRef.current.openTrip(next); }} />,
        details: <TripSummary trip={t} bodyOnly />,
      });
    },
    enterStreetView: (lon, lat) => { handoffCamera(); startWalk({ lon, lat }); },
    // The agent only loads the preview; it waits for Play (asking for a trip must not start it).
    playFlythrough: (t, speed) => {
      revealTripBuses(t);
      setTrip(t);
      setPrefSpeed(speed);
      const m = getMapInstance();
      if (m) showTrip(m, t);
      player.load(t, speed);
      if (home) setChatOpen(false);
    },
    setTime: (iso) => setMapTime(iso),
  };
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;

  // Answer buttons (#371): each draws what a tool returned, then gets out of the map's way on a phone.
  const actionCtx: MapActionContext = {
    flyTo: ctx.flyTo,
    showTrip: ctx.showTrip,
    showRestroom: (r) => {
      handoffCamera();
      // Off again when the answer closes, unless you had them on already.
      if (!restrooms) { restroomsByAnswer.current = true; setRestrooms(true); }
      const m = getMapInstance();
      if (m) showPoints(m, [{ at: [r.lon, r.lat], name: formatStreetText(r.name) }], "#2563eb");
      else flyTo({ lon: r.lon, lat: r.lat, zoom: 17 });
      showPanel({ id: `restroom:${r.name}`, title: formatStreetText(r.name), subtitle: "Public restroom", details: <RestroomSpotDetails restroom={r} /> });
    },
    showPoints: (points, { color }) => {
      handoffCamera();
      const m = getMapInstance();
      if (m) showPoints(m, points, color);
    },
    showExit: (a) => { handoffCamera(); void frameExit(a); },
    remind: (t) => {
      saveReminder(t);
      toast(tr(appLang, "remindSaved").replace("{t}", remindAt(t)));
    },
    // The same switch as the Layers menu, so turning it off again is where people expect.
    showLayer: (layer) => { if (layer === "busStops") setOptions({ busStops: true }); else setQuickLayer(layer, true); },
    // From an answer, the line opens on its service change: skipped stations ringed and framed.
    showLine: (route, day) => { setLineDay(day ?? null); setSelectedLine(lineOf(route), null, undefined, true); },
  };
  const runAction = (a: MapAction) => {
    runMapAction(a, actionCtx, routeColor);
    if (!isDesktop && !compact) setChatOpen(false);
  };

  const stopPlayer = player.stop;
  const send = useCallback(async (text: string) => {
    closeAll();
    setSettingsOpen(false);
    sendScreen({ type: "SEND" });
    const q = text.trim();
    const byVoice = voiceTurn.current;
    voiceTurn.current = false;
    // Spoken in another language: ask, answer and speak in that one.
    const heard = byVoice ? heardLangRef.current : null;
    heardLangRef.current = null;
    const askLang = heard ?? lang;
    if (!q) return;
    setNotice(null);
    setInput("");
    // A new question replaces the last answer: its trip card, the line it opened, a follow.
    if (home) { stopPlayer(); setTrip(null); clearTripBuses(); clearAnswerMarksRef.current(); clearMapTask(); }
    if (!askReq) setChatOpen(true);
    // A second tap of the same question, after Use my location, keeps the one user bubble.
    const continuing = messagesRef.current.some((m) => m.offerLocation);
    // A newer question replaces one still held or not yet answered: its bubble and its empty reply go.
    const live = messagesRef.current.findIndex((m) => m.id === liveReply.current && !m.content);
    const kept = live > 0 && messagesRef.current[live - 1].role === "user" ? messagesRef.current.filter((_, i) => i !== live && i !== live - 1) : messagesRef.current;
    const prior = kept.filter((m) => !m.offerLocation);
    const lastUser = [...prior].reverse().find((m) => m.role === "user");
    const history: Msg[] = continuing && lastUser?.content === q ? prior : [...prior, { id: crypto.randomUUID(), role: "user", content: q }];
    // Only a position the person chose to share; never asked for here. Street view already has a spot.
    const location = sharedCoords();
    // In street view the spot you stand on is "here", from the ask box too, not only the street bar's Ask:
    // a restroom question there asked for Use my location (owner report, 2026-10-29).
    const street = askReq?.context ?? streetContextHere(getMapInstance()?.getBearing() ?? null);
    if (!street && !location && needsSharedOrigin(q)) {
      pendingQuestion.current = q;
      const reply: Msg = { id: crypto.randomUUID(), role: "assistant", content: ORIGIN_PROMPT, offerLocation: true };
      setMessages([...history, reply]);
      speech.speak(spokenSummary(reply.content), { bargeIn: handsFree });
      return;
    }
    pendingQuestion.current = null;
    // What we remember (#370): the question, on this device, for 30 days, while Chats is on.
    if (home) rememberChat(q);
    const reply: Msg = { id: crypto.randomUUID(), role: "assistant", content: "" };
    setMessages([...history, reply]);
    setBusy(true);
    setSteps([]);
    abort.current?.abort();
    const ctl = new AbortController();
    abort.current = ctl;
    liveReply.current = reply.id;
    setWaiting(false);
    let spoken = "";
    // The text written between tool calls, piece by piece (see joinSegments).
    const segments: string[] = [""];
    let replyActions: MapAction[] | undefined;
    let sawTrip = false;
    // A voice question still working after ~2.5 s gets one short spoken status line.
    const sayIn = heard ?? statusLang(q, lang);
    // A question clearly in another language switches the app's own text to it (unless one is picked in the menu).
    const asked = heard ?? detectLang(q);
    if (asked) setAskedLang(asked);
    const statusTimer = home && byVoice ? window.setTimeout(() => speech.speak(statusLine(stepsRef.current, sayIn), { lang: speechTag(sayIn, lang) }), STATUS_AFTER_MS) : undefined;
    try {
      const memory = home ? memorySummary() : null;
      const underNow = getUndergroundNow();
      for await (const ev of askAgent({ messages: recentTurns(history), location, mode, now: new Date().toISOString(), ...(street ? { context: street } : {}), ...(home && askLang ? { lang: askLang } : {}), ...(memory ? { memory } : {}), ...(underNow ? { underground: underNow } : {}) }, ctl.signal, (w) => { if (abort.current === ctl) setWaiting(w); })) {
        // Closed or replaced: nothing more from this answer reaches the map, the card or the voice.
        if (ctl.signal.aborted) break;
        setSteps((s) => applyStep(s, ev));
        if (ev.type === "text") {
          segments[segments.length - 1] += ev.text;
          spoken = joinSegments(segments);
          const content = spoken;
          setMessages((m) => m.map((x) => (x.id === reply.id ? { ...x, content } : x)));
        } else if (ev.type === "step" && ev.status === "start") {
          if (segments[segments.length - 1].trim()) segments.push("");
        } else if (ev.type === "command") {
          if (ev.command.type === "showRoute") sawTrip = true;
          executeCommand(ev.command, ctxRef.current);
        } else if (ev.type === "actions") {
          replyActions = ev.actions;
          setMessages((m) => m.map((x) => (x.id === reply.id ? { ...x, actions: ev.actions } : x)));
        } else if (ev.type === "sources") {
          setMessages((m) => m.map((x) => (x.id === reply.id ? { ...x, sources: ev } : x)));
        } else if (ev.type === "error") {
          setMessages((m) => m.map((x) => (x.id === reply.id ? { ...x, content: x.content || ev.message } : x)));
        }
      }
    } catch {
      if (!ctl.signal.aborted) setMessages((m) => m.map((x) => (x.id === reply.id ? { ...x, content: x.content || "The assistant is unavailable right now." } : x)));
    } finally {
      window.clearTimeout(statusTimer);
      // A newer question owns busy; a closed one already let go of it.
      if (abort.current === ctl) { setBusy(false); setWaiting(false); liveReply.current = null; }
    }
    if (ctl.signal.aborted) return;
    // On a wide screen an answer about a line's trouble shows it on the map by itself, beside the answer:
    // the 7's weekend skips were only words until someone found the line (owner, 2026-10-27).
    const lineFirst = replyActions?.[0];
    if (!sawTrip && lineFirst?.kind === "showLine" && window.matchMedia("(min-width: 1024px)").matches) { setLineDay(lineFirst.day ?? null); setSelectedLine(lineOf(lineFirst.route), null, undefined, true); }
    // The model still asked for a start: put the same button on its reply.
    const offersLocation = !street && !!spoken && !sharedCoords() && replyAsksForOrigin(spoken);
    if (offersLocation) {
      pendingQuestion.current = q;
      setMessages((m) => m.map((x) => (x.id === reply.id ? { ...x, offerLocation: true } : x)));
    }
    // Short spoken answer; the full detail stays on screen. In hands-free the
    // person can talk over it to interrupt.
    if (spoken) speech.speak(spokenSummary(nameLocationButton(nameRemindButton(spoken, replyActions, tr(getAppLang(), "remindMe")), offersLocation, tr(getAppLang(), "useMyLocation"))), { bargeIn: handsFree, ...(heard ? { lang: heard } : {}) });
  }, [mode, setChatOpen, speech, askReq, handsFree, closeAll, home, lang, stopPlayer]);

  /** Exit: the answer stops where it is. No more text, map moves, trip or speech from it (owner, 2026-10-27). */
  const stopAnswer = useCallback(() => {
    abort.current?.abort();
    abort.current = null;
    liveReply.current = null;
    setBusy(false);
    setWaiting(false);
    setSteps([]);
    speech.stopSpeaking();
  }, [speech]);

  // The reply button and the footer chip both share location, then ask the waiting question.
  const enableLocation = useCallback(async () => {
    const coords = await startSharing();
    // Show where we found you at once; the answer takes a few seconds more.
    if (coords) getMapInstance()?.flyTo({ center: [coords.lon, coords.lat], zoom: 16, duration: 900, offset: [0, window.innerWidth < 640 ? -Math.round(window.innerHeight * 0.3) : 0] });
    const q = pendingQuestion.current;
    if (!coords || !q) return;
    pendingQuestion.current = null;
    void send(q);
  }, [send]);

  // ChatPanel is unmounted while this overlay replaces it, so the top bar's
  // question has to be sent from here or Ask the map opens on the examples.
  // Each seed sends once: send() closes the line and the follow, and those store updates re-render
  // before clearSeed lands, so without the id check "Other ways" or "I'm lost" re-sent itself forever.
  const sentSeed = useRef<string | null>(null);
  useEffect(() => {
    if (!chatSeed || sentSeed.current === chatSeed.id) return;
    sentSeed.current = chatSeed.id;
    clearSeed();
    void send(chatSeed.text);
  }, [chatSeed, clearSeed, send]);

  const turnOffHandsFree = useCallback(() => setHandsFree(false), []);
  // `asking` keeps the hands-free loop armed while the spoken language question and its answer play (#42).
  useHandsFree({ on: handsFree, supported: speech.sttSupported, listening: speech.listening, busy, speaking: speech.speaking, error: speech.error, asking: langAsked, languagePicked, start: speech.startListening, stop: speech.stopListening, turnOff: turnOffHandsFree });
  // A trip preview or a followed route starting takes over the screen: hands-free ends instead of
  // leaving the orb listening over it (owner report, 2026-10-24). Only the start counts, so you can
  // still turn hands-free on during one, and street-level Ask keeps it. The spoken answer still finishes.
  const taskOn = player.state.active || followingRoute;
  const taskWas = useRef(taskOn);
  const stopMic = speech.stopListening;
  useEffect(() => {
    const started = taskOn && !taskWas.current;
    taskWas.current = taskOn;
    if (!started || !handsFree) return;
    setHandsFree(false);
    stopMic();
  }, [taskOn, handsFree, stopMic]);
  const sheetUp = usePullSheetUp();
  const hasAnswer = home && chatOpen && messages.length > 0;
  const orbShown = home && handsFree && speech.listening && !dictating;
  useEffect(() => sendScreen({ type: "ANSWER", on: hasAnswer }), [hasAnswer]);
  useEffect(() => sendScreen({ type: "VOICE", on: orbShown }), [orbShown]);
  useEffect(() => () => { sendScreen({ type: "ANSWER", on: false }); sendScreen({ type: "VOICE", on: false }); sendScreen({ type: "TASK", on: false }); }, []);
  const toggleHandsFree = () => {
    if (handsFree) { setHandsFree(false); setLangAsked(false); speech.stopListening(); speech.stopSpeaking(); return; }
    speech.setMuted(false);
    speech.clearError();
    setHandsFree(true);
    // A hands-free conversation is answer-in-one-language for its whole length, and the only signal
    // used to be Whisper's guess at the first thing said. Ask out loud first, every time hands-free
    // starts, so a handed-over phone or a misheard word cannot fix the wrong language for a session.
    setLangAsked(true);
    speech.speakSequence(languagePrompt(appLang));
  };

  useWakePhrase(wake && speech.sttSupported, speech.listening || busy || speech.speaking, (t) => { voiceTurn.current = true; void send(t); }, speechTag(appLang, lang));
  useEffect(() => () => abort.current?.abort(), []);
  // Other features (underground help) prepare for the trip on screen through core.
  useEffect(() => publishActiveTrip(trip), [trip]);
  // No trip, no trip line: closing the card or stopping a walk used to leave the dotted route on the map.
  useEffect(() => {
    if (trip) return;
    const m = getMapInstance();
    if (m) clearTrip(m);
  }, [trip]);
  // A restroom answer shows the restroom on the map at once, framed with you when your
  // location is shared, instead of leaving the whole city in view (owner report, 2026-10-24).
  const lastActions = messages.at(-1)?.role === "assistant" ? messages.at(-1)?.actions : undefined;
  // A "which exit" answer is the map (owner report, 2026-10-25: the text answer covered a phone):
  // the exit and its walk draw at once, north up, framed above the small card with you when near.
  const exitAnswer = home ? (lastActions?.find((a): a is ExitAction => a.kind === "showExit") ?? null) : null;
  const heading = useHeading(exitAnswer !== null);
  // Up on the street with an exit answer: warn when you walk away from the place.
  const exitHere = exitAnswer && shared.status === "on" && shared.coords ? ([shared.coords.lon, shared.coords.lat] as [number, number]) : null;
  const awayFromExit = useWrongWay(exitAnswer && exitHere ? { key: `${exitAnswer.station}|${exitAnswer.exit.label}`, metres: metres(exitHere, exitAnswer.destination.at), accuracy: shared.accuracy ?? null, place: exitAnswer.destination.label } : null);
  useEffect(() => {
    if (exitAnswer) void frameExit(exitAnswer);
  }, [exitAnswer]);
  useEffect(() => {
    const a = lastActions?.[0];
    if (!home || a?.kind !== "showRestroom") return;
    const m = getMapInstance();
    if (!m) return;
    // Every restroom the answer names, and the restroom layer on so the others nearby show too
    // (owner, 2026-10-27: asked near the Natural History Museum, only one pin appeared).
    const spots = (lastActions ?? []).flatMap((x) => (x.kind === "showRestroom" ? [x.restroom] : []));
    if (!restrooms) { restroomsByAnswer.current = true; setRestrooms(true); }
    showPoints(m, spots.map((r) => ({ at: [r.lon, r.lat], name: formatStreetText(r.name) })), "#2563eb");
    const me = sharedCoords();
    frameRestrooms(m, [...spots.map((r): [number, number] => [r.lon, r.lat]), ...(me ? [[me.lon, me.lat] as [number, number]] : [])]);
  }, [lastActions, home]); // eslint-disable-line react-hooks/exhaustive-deps -- setRestrooms changes with the URL it writes; once per answer is enough
  // A trip planned between saved Home and Work becomes the daily card's usual line (kept on this device).
  useEffect(() => {
    if (trip) rememberCommute(trip);
  }, [trip]);
  // Home: the trip joins "Looked up" in My day (this device only; exact points only with Exact location on).
  useEffect(() => {
    if (home && trip) rememberLookup({ from: { label: trip.origin.label, at: trip.origin.at }, to: { label: trip.destination.label, at: trip.destination.at }, routes: trip.routes, mode: trip.mode });
  }, [home, trip]);
  // Home: "Speak answers" in Settings.
  const { setMuted } = speech;
  useEffect(() => {
    if (home) setMuted(!voicePrefs.speak);
  }, [home, voicePrefs.speak, setMuted]);

  const ModeIcon = MODES.find((m) => m.id === mode)!.Icon;
  const modes = MODES.filter((m) => m.id !== "drive" || driveOn);

  // The home bar's sheet uses 44 px targets; the classic sheet keeps its compact chips.
  const chip = home && !compact ? "h-11 gap-1 rounded-full px-3 text-xs" : "h-7 gap-1 rounded-full px-2.5 text-xs";
  const controls = (
    <>
        <Button
          type="button"
          variant={handsFree ? "default" : "secondary"}
          size="sm"
          className={chip}
          aria-pressed={handsFree}
          disabled={!speech.sttSupported}
          title={speech.sttSupported ? undefined : "Voice input is not available in this browser"}
          onClick={toggleHandsFree}
        >
          <Headphones className="h-3.5 w-3.5" /> <span className={home && !compact ? "sr-only sm:not-sr-only" : undefined}>Hands-free</span>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" size="sm" className={chip} aria-label={`Trip mode: ${mode}`}>
              <ModeIcon className="h-3.5 w-3.5" /> {tr(appLang, mode)}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuRadioGroup value={mode} onValueChange={(v) => setMode(v as TripMode)}>
              {modes.map(({ id, Icon }) => (
                <DropdownMenuRadioItem key={id} value={id}><Icon className="mr-2 h-4 w-4" />{tr(appLang, id)}</DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className={home && !compact ? "h-11 w-11" : "h-8 w-8"} aria-label="Assistant settings"><MoreVertical className="h-4 w-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel>Voice</DropdownMenuLabel>
            <DropdownMenuCheckboxItem checked={wake} disabled={!speech.sttSupported} onCheckedChange={(v) => setWake(v === true)}>
              Listen for “Hey map”
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem checked={!speech.muted} onCheckedChange={(v) => speech.setMuted(v !== true)}>Speak answers</DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            <p className="px-2 py-1.5 text-xs text-muted-foreground">
              {speech.sttSupported
                ? "Hold a conversation by voice: tap the mic, or turn on “Hey map”. Your location is sent only after you tap Use my location, then with each question until you tap Stop sharing location."
                : "Voice input is not available in this browser, so type instead. Answers can still be spoken."}
            </p>
          </DropdownMenuContent>
        </DropdownMenu>
    </>
  );

  const answers = (
    <>
        {messages.length === 0 ? (
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>Ask anything about getting around. For example:</p>
            {["How will my trip be tomorrow from here to Grand Central at 9am?", "Walk me from Union Square to Washington Square Park"].map((q) => (
              <Button key={q} variant="outline" size="sm" className="h-auto w-full justify-start whitespace-normal py-2 text-left" onClick={() => void send(q)}>{q}</Button>
            ))}
          </div>
        ) : (
          messages.map((m) =>
            // In the home sheet the working panel stands in for the empty reply bubble.
            home && !compact && m.role === "assistant" && !m.content && !m.actions?.length && !m.offerLocation ? null : (
            <div key={m.id} className={cn("max-w-[90%] rounded-lg px-3 py-2 text-sm", m.role === "user" ? "ml-auto bg-primary text-primary-foreground" : "bg-muted")}>
              {(m.role === "assistant" ? formatStationName : (x: string) => x)(nameLocationButton(nameRemindButton(m.content, m.actions, tr(appLang, "remindMe")), m.offerLocation, tr(appLang, "useMyLocation"))) || (busy ? (waiting ? `${tr(appLang, "sendingSoon")}…` : "…") : "")}
              {m.actions?.length ? <AnswerActions actions={m.actions} onRun={runAction} /> : null}
              {m.sources ? <AnswerSources line={m.sources} /> : null}
              {m.offerLocation && shared.status !== "on" ? (
                <Button type="button" size="sm" className="mt-2 h-8 w-full gap-1.5" disabled={shared.status === "asking"} onClick={() => void enableLocation()}>
                  <LocateFixed className="h-4 w-4" aria-hidden="true" />
                  {shared.status === "asking" ? "Finding you…" : "Use my location"}
                </Button>
              ) : null}
            </div>
            ),
          )
        )}
        {home && !compact && busy && !waiting ? <WorkingPanel steps={steps} /> : null}
        {trip ? (
          <div className="rounded-lg border p-3">
            <TripSummary trip={trip} mapTime={mapTime} onSelect={(alt) => chooseTrip(selectAlternative(trip, alt))} onLeg={showLeg} />
            <div className="mt-3 flex items-center gap-1.5">
              <Button size="sm" className="flex-1 gap-2" onClick={() => (player.state.playing && player.state.tripId === trip.id ? player.toggle() : startPreview(trip, prefSpeed))}>
                {player.state.playing && player.state.tripId === trip.id ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                {player.state.tripId !== trip.id ? "Play trip preview" : player.state.playing ? "Pause preview" : player.state.status === "paused" ? "Resume preview" : "Play trip preview"}
              </Button>
              <SpeedPicker speed={prefSpeed} onSpeed={(s) => { setPrefSpeed(s); player.setSpeed(s); }} label="Preview speed" />
            </div>
          </div>
        ) : null}
    </>
  );

  const footer = (
      <div className="flex items-center justify-between gap-2 border-t px-3 pt-2 text-xs text-muted-foreground" role="status">
        {shared.status === "on" ? (
          <>
            <span>Using your exact location for directions. It is not saved.</span>
            <Button type="button" size="sm" variant="outline" className="h-7 shrink-0 rounded-full px-2.5 text-xs" onClick={() => stopSharing()}>
              Stop sharing location
            </Button>
          </>
        ) : (
          <>
            <span>{shared.status === "denied" ? "Location is blocked in this browser." : shared.status === "asking" ? "Finding your location…" : "Your location is not shared."}</span>
            <Button type="button" size="sm" variant="outline" className="h-7 shrink-0 gap-1 rounded-full px-2.5 text-xs" disabled={shared.status === "asking"} onClick={() => void enableLocation()}>
              <LocateFixed className="h-3.5 w-3.5" aria-hidden="true" /> Use my location
            </Button>
          </>
        )}
      </div>
  );

  const body = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b py-3 pl-4 pr-12">
        <div className="flex-1 text-sm font-semibold">{compact ? "Ask about this spot" : "Ask the map"}</div>
        {controls}
      </div>

      {handsFree || speech.listening || (speech.speaking && handsFree) ? (
        <div className="flex items-center gap-2 border-b bg-muted/50 px-4 py-1.5 text-xs" role="status" data-testid="voice-status">
          <span className={cn("h-2 w-2 rounded-full", speech.listening ? "animate-pulse bg-destructive" : busy || speech.speaking ? "animate-pulse bg-primary" : "bg-muted-foreground")} />
          <span>{speech.listening ? (speech.interim ? `Listening: “${speech.interim}”` : "Listening") : busy ? "Thinking…" : speech.speaking ? (handsFree ? "Speaking (talk to interrupt)" : "Speaking") : "Hands-free on"}</span>
          <span className="ml-auto text-muted-foreground">Nothing is recorded or saved.</span>
        </div>
      ) : null}
      {speech.error && handsFree ? <p className="border-b px-4 py-1.5 text-xs text-muted-foreground">{speech.error}</p> : null}

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3" aria-live="polite">
        {answers}
      </div>

      {footer}
      <form className="flex items-end gap-2 p-3" onSubmit={(e) => { e.preventDefault(); void send(input); }}>
        {speech.listening ? (
          <div className="flex h-9 flex-1 items-center gap-2 rounded-md border px-3 text-sm" role="status">
            <span className="h-2 w-2 animate-pulse rounded-full bg-destructive" />
            <span className="truncate text-muted-foreground">{speech.interim || "Listening…"}</span>
          </div>
        ) : (
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(input); } }}
            rows={1}
            placeholder="Where to?"
            aria-label="Ask the assistant"
            className="min-h-9 flex-1 resize-none"
          />
        )}
        {speech.sttSupported ? (
          <Button type="button" size="icon" variant={speech.listening ? "destructive" : "ghost"} aria-label={speech.listening ? "Stop listening" : "Push to talk"} aria-pressed={speech.listening} onClick={() => (speech.listening ? speech.stopListening() : speech.startListening())} className="h-9 w-9 shrink-0">
            {speech.listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </Button>
        ) : null}
        <Button type="submit" size="icon" aria-label="Send" disabled={!input.trim()} className="h-9 w-9 shrink-0"><Send className="h-4 w-4" /></Button>
      </form>
    </div>
  );

  if (compact) {
    const slot = typeof document === "undefined" ? null : document.getElementById("ask-street-slot");
    const panel = (
      <div
        role="dialog"
        aria-modal="false"
        aria-label="Ask about this spot"
        data-testid="ask-compact"
        className="pointer-events-auto absolute bottom-3 left-1/2 z-[60] flex h-[min(46vh,420px)] w-[min(440px,calc(100vw-1.5rem))] -translate-x-1/2 flex-col overflow-hidden rounded-xl border bg-card/95 shadow-xl backdrop-blur-md"
      >
        <Button type="button" variant="ghost" size="icon" className="absolute right-1.5 top-1.5 z-10 h-8 w-8" aria-label="Close Ask" onClick={() => { setHandsFree(false); speech.stopListening(); stopAnswer(); closeAsk(); }}>
          <X className="h-4 w-4" />
        </Button>
        {body}
      </div>
    );
    return slot ? createPortal(panel, slot) : <div className="fixed inset-x-0 bottom-0 z-[60] h-0">{panel}</div>;
  }

  const playback = player.state.active ? (
    <PlaybackBar
      playing={player.state.playing}
      speed={player.state.speed}
      callout={player.state.callout}
      step={`${player.state.seg + 1}/${player.state.segs.length}`}
      onToggle={player.toggle}
      onSpeed={(s) => { setPrefSpeed(s); player.setSpeed(s); }}
      onSkip={player.skip}
      onClose={player.stop}
    />
  ) : null;

  if (home) {
    const voiceOff = () => setNotice(VOICE_UNSUPPORTED);
    const toggleDictation = () => {
      if (!speech.sttSupported) return voiceOff();
      if (dictating) { dictatingRef.current = false; setDictating(false); speech.stopListening(); return; }
      if (handsFree) setHandsFree(false);
      speech.stopListening();
      setNotice(null);
      speech.clearError();
      dictatingRef.current = true;
      setDictating(true);
      speech.startListening();
    };
    const toggleVoice = () => {
      if (!speech.sttSupported) return voiceOff();
      if (dictating) { dictatingRef.current = false; setDictating(false); speech.stopListening(); }
      setNotice(null);
      toggleHandsFree();
    };
    const stopOrb = () => { setHandsFree(false); speech.stopListening(); speech.stopSpeaking(); };

    // The last exchange is the answer card; earlier turns stay in the history sent to the agent.
    const lastUser = [...messages].reverse().find((m) => m.role === "user") ?? null;
    const reply = messages.at(-1)?.role === "assistant" ? messages.at(-1)! : null;
    const actions = reply?.actions ?? [];
    const first = actions[0];
    const placeOf = (): { name: string; lon: number; lat: number } | null => {
      if (first?.kind === "showRestroom") return { name: formatStreetText(first.restroom.name), lon: first.restroom.lon, lat: first.restroom.lat };
      if (first?.kind === "flyTo") return { name: first.label.replace(/^Show /, ""), lon: first.lon, lat: first.lat };
      if (trip) return { name: trip.destination.label, lon: trip.destination.at[0], lat: trip.destination.at[1] };
      const c = getMapInstance()?.getCenter();
      return c ? { name: "the map centre", lon: c.lng, lat: c.lat } : null;
    };
    // Walk me there knows both ends: draw the walking route and start guidance directly.
    // Sending it back through the agent made the walk router geocode the name again,
    // which picked a different building a half hour away (owner report, 2026-10-24).
    const walkTo = async (dest: { lon: number; lat: number }) => {
      const from = sharedCoords() ?? (await startSharing());
      if (!from) return;
      setRoutePoint("start", { lon: from.lon, lat: from.lat });
      setRoutePoint("end", { lon: dest.lon, lat: dest.lat });
      setFollowingRoute(true);
      setChatOpen(false);
      flyTo({ lon: from.lon, lat: from.lat, zoom: 16 });
    };

    const primary = exitAnswer ? null : first
      ? first.kind === "showRestroom"
        ? { label: tr(appLang, "walkMeThere"), run: () => { void walkTo(first.restroom); } }
        : { label: first.label, run: () => runAction(first) }
      : null;
    // Only follow-ups that fit this answer: around the place it named, and other routes after a trip.
    const named = first?.kind === "showRestroom" || first?.kind === "flyTo" || trip ? placeOf() : null;
    const followUps = [
      ...(named ? [{ label: tr(appLang, "nearby"), run: () => { void send(followUpQuestion("nearby", named)); } }] : []),
      ...(trip && !busy ? [{ label: tr(appLang, "otherRoutes"), run: () => { void send(`What are the other routes from ${trip.origin.label} to ${trip.destination.label}?`); } }] : []),
    ];
    const askLocation = reply?.offerLocation && shared.status !== "on";
    const homeAnswer = (
      <AnswerCard
        question={lastUser?.content ?? null}
        text={nameLocationButton(nameRemindButton(reply?.content ?? "", reply?.actions, tr(appLang, "remindMe")), reply?.offerLocation, tr(appLang, "useMyLocation"))}
        busy={busy}
        waiting={waiting}
        working={<WorkingPanel steps={steps} />}
        sources={reply?.sources && (reply.sources.sources.length || reply.sources.unverified.length) ? <AnswerSources line={reply.sources} /> : null}
        primary={primary}
        followUps={followUps}
        location={askLocation ? (
          <Button type="button" className="h-[52px] w-full gap-1.5 rounded-full bg-blue-600 text-[15px] font-semibold text-white hover:bg-blue-500" disabled={shared.status === "asking"} onClick={() => void enableLocation()}>
            <LocateFixed className="h-4 w-4" aria-hidden="true" />
            {tr(appLang, shared.status === "asking" ? "findingYou" : "useMyLocation")}
          </Button>
        ) : undefined}
        compact={exitAnswer ? { hint: awayFromExit ? (
          <p className="text-xs font-semibold leading-tight text-amber-300" role="alert" data-testid="wrong-way">{turnAroundLine(exitAnswer.destination.label)}</p>
        ) : <CompassHint heading={heading} /> } : undefined}
        extra={
          <>
            {/* A blocked or failed location used to leave the button looking untouched (owner report, 2026-10-25). */}
            {reply?.offerLocation && (shared.status === "denied" || shared.status === "unavailable") ? (
              <p role="status" className="px-2 text-center text-sm text-slate-300">{tr(appLang, "locationBlocked")}</p>
            ) : null}
            {trip && !busy ? (
              <div className="rounded-[18px] border border-[#22314a] bg-[#111c2f]/90 p-3 text-slate-100">
                {/* Ask again another way: the subway or bus only, on foot, or the least walking (owner, 2026-10-26). */}
                <div role="group" aria-label="Other ways to go" data-testid="trip-choices" className="mb-3 flex gap-1.5 overflow-x-auto">
                  {TRIP_CHOICES.map((c) => (
                    <button key={c} type="button" onClick={() => { void send(tripChoiceQuestion(trip, c)); }}
                      className="h-9 shrink-0 rounded-full border border-[#2c3d5a] px-3 text-[13px] font-semibold text-slate-100 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60a5fa]">
                      {tr(appLang, c === "subway" ? "bySubway" : c === "bus" ? "byBus" : c === "walk" ? "byWalk" : "lessWalking")}
                    </button>
                  ))}
                </div>
                <TripSummary trip={trip} mapTime={mapTime} onSelect={(alt) => chooseTrip(selectAlternative(trip, alt))} onLeg={showLeg} />
                <Button className="mt-3 h-11 w-full gap-2 rounded-full" onClick={() => (player.state.playing && player.state.tripId === trip.id ? player.toggle() : startPreview(trip, prefSpeed))}>
                  {player.state.playing && player.state.tripId === trip.id ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  Play trip preview
                </Button>
              </div>
            ) : null}
          </>
        }
      />
    );

    const trainRoute = trip?.legs.find((l) => l.kind === "ride")?.route;
    const tasks = {
      settings: () => setSettingsOpen(true),
      restroom: () => void send(tr(appLang, "askRestroom")),
      train: () => {
        if (trainRoute) void send(tr(appLang, "askLine").replace("{r}", trainRoute));
        else if (openLines) openLines();
        else void send(tr(appLang, "askLines"));
      },
      plan: () => {
        setInput(tr(appLang, "planPrefix"));
        window.requestAnimationFrame(() => {
          const el = homeInput.current;
          el?.focus();
          el?.setSelectionRange(el.value.length, el.value.length);
        });
      },
      exit: () => {
        if (undergroundOn && stationHelp) stationHelp();
        else void send(tr(appLang, "askExit"));
      },
    };
    const panelUp = panelContent !== null && !panelMinimized;
    const answerOpen = hasAnswer && answerView === "open";
    const showIdle = !selectedLine && !stationHelpVisible && !followingRoute && !player.state.active && !walking && !streetViewOpen && !answerOpen && !busy && !handsFree && !drawerOpen && !panelUp && followed === null;
    const chip = hasAnswer && answerView === "chip" ? (
      <button type="button" aria-label={tr(appLang, "showAnswer")} data-testid="answer-chip" onClick={() => sendScreen({ type: "SHOW_ANSWER" })}
        className="pointer-events-auto flex h-11 max-w-full items-center gap-2 self-start rounded-full border border-[#263449] bg-[#0b1220]/85 px-4 text-sm font-semibold text-slate-100 shadow-lg backdrop-blur-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">
        <span className="truncate">{lastUser?.content}</span>
        <ChevronUp className="h-4 w-4 shrink-0" aria-hidden="true" />
      </button>
    ) : null;
    // Another sheet pulled up from behind the chat (station exits) owns that space: the task row used to
    // sit on top of it and hide its question (owner report, 2026-10-27). Settings is itself one.
    const idle = chip ?? (showIdle && !(sheetUp && !settingsOpen) ? (
      <>
        <DailyCard places={places} onAsk={(q) => void send(q)} onFly={(sp) => flyTo({ lon: sp.lon, lat: sp.lat, zoom: 16 })} onShowStations={(points) => actionCtx.showPoints(points, { color: TROUBLE_COLOR.problem, title: "Delay" })} />
        <TaskButtons on={tasks} />
      </>
    ) : null);
    // Any other step on screen (an answer, a line, a train) puts settings away.
    const settingsUp = settingsOpen && showIdle && !chip;

    return (
      <>
        <AgentHome
          inputRef={homeInput}
          input={input}
          setInput={setInput}
          onSend={(t) => void send(t)}
          busy={busy}
          interim={speech.interim}
          dictation={{ supported: speech.sttSupported, on: dictating && speech.listening, toggle: toggleDictation }}
          handsFree={{ on: handsFree, toggle: toggleVoice }}
          orb={{ show: handsFree && speech.listening && !dictating, transcript: speech.interim, stop: stopOrb }}
          notice={notice ?? speech.error}
          answerOpen={answerOpen}
          onCloseAnswer={() => { stopAnswer(); setChatOpen(false); clearAnswerMarks(); }}
          answer={homeAnswer}
          idle={idle}
          // Task controls sit above the persistent chat bar.
          hidden={false}
          lift={!isDesktop && panelContent !== null && panelMinimized}
        />
        {settingsUp ? <Suspense fallback={null}><SettingsSheet onClose={() => setSettingsOpen(false)} /></Suspense> : null}
        {/* One card at a time: station help or a station card covers the same spot, so the trip waits under it (owner, 2026-10-27). */}
        {trip && player.state.active && !answerOpen && !stationHelpVisible && !(panelUp && !panelContent.id.startsWith("agent:trip:")) ? <Suspense fallback={null}><TripPreview
          trip={trip} state={player.state} speed={player.state.speed}
          onToggle={player.toggle} onSpeed={(s) => { setPrefSpeed(s); player.setSpeed(s); }}
          onBack={player.back} onNext={player.skip}
          onAlert={(route) => setSelectedLine(route)}
          onClose={() => { player.stop(); setTrip(null); clearTripBuses(); }}
          onUse={() => {
            player.release();
            setTripStep(null);
            const ride = trip.legs.find((l) => l.kind === "ride");
            // A subway ride shows when its trains reach your stop, not a train somewhere else on the line.
            const board = (): boolean => {
              if (ride?.mode === "subway") { setSelectedLine(lineOf(ride.route), null, { from: ride.coords[0], to: ride.coords[ride.coords.length - 1] }); return true; }
              return ride?.mode === "bus" && followTripRoute({ system: "bus", route: ride.route, at: ride.coords[0] });
            };
            // Walk to the station or stop first; the train or bus comes once you are there.
            const walk = ride?.mode === "subway" || ride?.mode === "bus" ? walkToBoard(trip) : null;
            if (ride && walk) {
              const enter = trip.legs.find((l) => l.kind === "enter");
              const stop = enter?.kind === "enter" ? enter.station.name : ride.fromStop;
              setRoutePoint("start", { lon: trip.origin.at[0], lat: trip.origin.at[1] });
              setRoutePoint("end", { lon: walk.at[0], lat: walk.at[1] });
              setFollowingRoute(true);
              setTrip(null);
              flyTo({ lon: trip.origin.at[0], lat: trip.origin.at[1], zoom: 16 });
              const what = ride.mode === "bus" ? `the ${ride.route} bus` : `the ${ride.route} train`;
              setTripStep({
                then: stop ? `Then ${what} at ${stop}` : `Then ${what}`,
                action: ride.mode === "bus" ? "I'm at the stop" : "I'm at the station",
                go: () => { setTripStep(null); clearRoute(); board(); },
              });
              return;
            }
            if (board()) return;
            if (trip.mode === "walk") {
              setRoutePoint("start", { lon: trip.origin.at[0], lat: trip.origin.at[1] });
              setRoutePoint("end", { lon: trip.destination.at[0], lat: trip.destination.at[1] });
              setFollowingRoute(true);
              // Walking guidance draws its own route, so the trip line goes; it would stay after Stop.
              setTrip(null);
              flyTo({ lon: trip.origin.at[0], lat: trip.origin.at[1], zoom: 16 });
              return;
            }
            void send(`Use this route to ${trip.destination.label}. Show me the ${trip.routes.join(" and ")} service for this trip.`);
          }}
          onOther={() => { player.release(); void send(`What are the other routes from ${trip.origin.label} to ${trip.destination.label}?`); }}
          onChoice={(c) => { player.release(); void send(tripChoiceQuestion(trip, c)); }}
        /></Suspense> : null}
      </>
    );
  }

  return (
    <>
      {/* Non-modal: the trip preview bar sits on the map and must stay reachable while Ask is open. */}
      <Sheet open={chatOpen} onOpenChange={setChatOpen} modal={false}>
        <SheetContent side={isDesktop ? "left" : "bottom"} className={isDesktop ? "flex h-full w-full flex-col p-0 sm:max-w-[420px]" : "flex h-[85vh] flex-col p-0"}>
          <SheetTitle className="sr-only">Ask the map</SheetTitle>
          <SheetDescription className="sr-only">Voice and text trip assistant</SheetDescription>
          {body}
        </SheetContent>
      </Sheet>
      {/* On a phone the Ask sheet covers the bottom; the trip card's Play button stands in until it closes. */}
      {isDesktop || !chatOpen ? playback : null}
    </>
  );
}

/** 2x / 5x / 10x / 30x. A change keeps the camera where it is and changes the rate. */
function SpeedPicker({ speed, onSpeed, label }: { speed: Speed; onSpeed: (s: Speed) => void; label: string }) {
  return (
    <div className="flex items-center" role="group" aria-label={label}>
      {PLAYBACK_SPEEDS.map((s) => (
        <Button key={s} type="button" size="sm" variant={speed === s ? "default" : "ghost"} className="h-8 rounded-full px-2 text-xs tabular-nums" aria-pressed={speed === s} onClick={() => onSpeed(s)}>
          {s}x
        </Button>
      ))}
    </div>
  );
}

/** The one slim preview bar: play/pause, speed, skip leg, close. No tooltips. */
function PlaybackBar(p: { playing: boolean; speed: Speed; callout: string; step: string; onToggle: () => void; onSpeed: (s: Speed) => void; onSkip: () => void; onClose: () => void }) {
  // Its height as --playback-h, so the compass and the station button step above it.
  const publish = useCssHeight("--playback-h");
  return (
    <div ref={publish} className="pointer-events-auto fixed bottom-4 left-1/2 z-[70] flex w-[min(560px,calc(100vw-2rem))] -translate-x-1/2 flex-wrap items-center gap-1 rounded-2xl border bg-card/95 px-2 py-1 shadow-lg backdrop-blur-md sm:flex-nowrap sm:rounded-full" role="region" aria-label="Trip preview">
      <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full" aria-label={p.playing ? "Pause preview" : "Play preview"} onClick={p.onToggle}>
        {p.playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </Button>
      <SpeedPicker speed={p.speed} onSpeed={p.onSpeed} label="Playback speed" />
      <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full" aria-label="Skip to next leg" onClick={p.onSkip}><SkipForward className="h-4 w-4" /></Button>
      {/* On a phone the step's words get a line of their own above the controls, not cut to "W…". */}
      <div className="order-first min-w-0 basis-full px-1 pt-0.5 text-sm sm:order-none sm:flex-1 sm:basis-auto sm:truncate sm:pt-0" aria-live="polite">{p.callout}</div>
      <span className="flex-1 sm:hidden" aria-hidden />
      <Badge variant="secondary" className="tabular-nums max-[359px]:hidden">{p.step}</Badge>
      <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full" aria-label="Close preview" onClick={p.onClose}><X className="h-4 w-4" /></Button>
    </div>
  );
}
