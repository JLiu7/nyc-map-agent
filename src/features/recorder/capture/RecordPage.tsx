import { ArrowUpDown, Download, Signpost, Square, Trash2, TrendingUp } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { removeShell } from "@/lib/shellDraft";
import type { Mark, MarkKind } from "../format";
import { addGps, addHeading, addMark, addMotion, clock, extFor, fileBase, newSession, pickMime, toRecording, type Session } from "./session";

type Stage = "intro" | "camera" | "recording" | "review";
type Asker = { requestPermission?: () => Promise<"granted" | "denied"> };
type Lock = { release: () => Promise<void> };
interface Take { url: string; video: File | null; json: File; marks: Mark[]; startedAt: number; ms: number; rows: { motion: number; heading: number; gps: number } }

const INTRO_KEY = "record.introSeen";
/** A segment ends itself here: the film is held in the phone's memory until it is saved. */
const MAX_MS = 10 * 60_000;
const MARKS: ReadonlyArray<{ kind: MarkKind; label: string; Icon: typeof Signpost }> = [
  { kind: "sign", label: "Sign", Icon: Signpost },
  { kind: "stairs", label: "Stairs", Icon: TrendingUp },
  { kind: "elevator", label: "Elevator", Icon: ArrowUpDown },
];
const TIPS = ["Hold the phone steady at chest height.", "Walk at an even pace.", "Pause at each sign."];

const seenIntro = () => { try { return localStorage.getItem(INTRO_KEY) === "1"; } catch { return false; } };
const markIntroSeen = () => { try { localStorage.setItem(INTRO_KEY, "1"); } catch { /* private mode: show it again next time */ } };

/** Ask for motion or orientation. iOS shows its prompt only inside a tap; a browser with nothing to ask answers yes. */
const allow = (name: "DeviceMotionEvent" | "DeviceOrientationEvent"): Promise<boolean> => {
  const C = (window as unknown as Record<string, Asker | undefined>)[name];
  if (!C) return Promise.resolve(false);
  if (typeof C.requestPermission !== "function") return Promise.resolve(true);
  return C.requestPermission().then((r) => r === "granted").catch(() => false);
};
const camera = () => navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });

function download(file: File): void {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * /record: film a walk through a station with the back camera (no sound) while
 * the phone logs its motion, orientation and location, every row stamped with
 * the phone's clock. Sign, Stairs and Elevator add a timed mark. The film and
 * one JSON file in the recording format (docs/RECORDING_FORMAT.md) are saved
 * to the phone by the walker; this page sends nothing anywhere.
 */
export default function RecordPage() {
  const [stage, setStage] = useState<Stage>(() => (seenIntro() ? "camera" : "intro"));
  const [blocked, setBlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [marked, setMarked] = useState(0);
  const [off, setOff] = useState<string[]>([]);
  const [take, setTake] = useState<Take | null>(null);
  const [saved, setSaved] = useState(false);

  const view = useRef<HTMLVideoElement>(null);
  const live = useRef<{ stream?: MediaStream; rec?: MediaRecorder; chunks: Blob[]; session?: Session; videoAt: number; offs: Array<() => void>; tick?: number; lock?: Lock; on: boolean; gone: boolean }>({ chunks: [], videoAt: 0, offs: [], on: false, gone: false });

  const show = useCallback((stream: MediaStream) => {
    const l = live.current;
    if (l.stream && l.stream !== stream) l.stream.getTracks().forEach((t) => t.stop());
    l.stream = stream;
    const v = view.current;
    if (v) { v.srcObject = stream; void v.play().catch(() => undefined); }
  }, []);

  const awake = useCallback(() => {
    const l = live.current;
    const wl = (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<Lock> } }).wakeLock;
    if (!wl || l.lock) return;
    void wl.request("screen").then((lock) => { if (l.gone) void lock.release(); else l.lock = lock; }).catch(() => undefined);
  }, []);

  const openCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) { setBlocked(true); return; }
    try {
      const stream = await camera();
      if (live.current.gone) { stream.getTracks().forEach((t) => t.stop()); return; }
      setBlocked(false);
      show(stream);
      awake();
    } catch { setBlocked(true); }
  }, [awake, show]);

  const stop = useCallback(async () => {
    const l = live.current;
    if (!l.on || !l.session) return;
    l.on = false;
    const endedAt = Date.now();
    window.clearInterval(l.tick);
    l.offs.forEach((f) => f());
    l.offs = [];
    const rec = l.rec;
    if (rec && rec.state !== "inactive") await new Promise<void>((done) => { rec.addEventListener("stop", () => done(), { once: true }); rec.stop(); });
    l.stream?.getTracks().forEach((t) => t.stop());
    l.stream = undefined;
    const s = l.session;
    const base = fileBase(s.startedAt);
    const mime = rec?.mimeType || l.chunks[0]?.type || "video/webm";
    const video = l.chunks.length ? new File(l.chunks, `${base}.${extFor(mime)}`, { type: mime.split(";")[0] }) : null;
    const recording = toRecording(s, { device: navigator.userAgent, video: video ? { file: video.name, startedAt: l.videoAt || s.startedAt } : undefined });
    const json = new File([JSON.stringify(recording)], `${base}.json`, { type: "application/json" });
    l.chunks = [];
    if (l.gone) return;
    setTake({ url: video ? URL.createObjectURL(video) : "", video, json, marks: s.marks, startedAt: s.startedAt, ms: endedAt - s.startedAt, rows: { motion: s.motion.length, heading: s.heading.length, gps: s.gps.length } });
    setSaved(false);
    setStage("review");
  }, []);

  // Open the camera when the camera view shows; never leave it or the screen lock running after the page.
  useEffect(() => {
    removeShell();
    const l = live.current;
    l.gone = false;
    if (seenIntro()) void openCamera();
    const vis = () => {
      if (document.visibilityState === "hidden") { l.lock = undefined; void stop(); }
      else if (l.stream || l.on) awake();
    };
    document.addEventListener("visibilitychange", vis);
    return () => {
      document.removeEventListener("visibilitychange", vis);
      l.gone = true;
      void stop();
      l.stream?.getTracks().forEach((t) => t.stop());
      l.stream = undefined;
      void l.lock?.release().catch(() => undefined);
      l.lock = undefined;
    };
  }, [awake, openCamera, stop]);

  const begin = () => { markIntroSeen(); setStage("camera"); void openCamera(); };

  const start = async () => {
    if (busy || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") { if (!busy) setBlocked(true); return; }
    setBusy(true);
    const l = live.current;
    const s = newSession(Date.now());
    // Every ask starts inside this tap, on every start: iOS refuses a prompt that begins later.
    const askMotion = allow("DeviceMotionEvent");
    const askTurn = allow("DeviceOrientationEvent");
    const askCamera = camera();
    let gpsOn = "geolocation" in navigator;
    let gpsId: number | undefined;
    if (gpsOn) gpsId = navigator.geolocation.watchPosition((p) => { if (l.on) addGps(s, Date.now(), p.coords.latitude, p.coords.longitude, p.coords.accuracy); }, (e) => { if (e.code === e.PERMISSION_DENIED) setOff((o) => (o.includes("Location") ? o : [...o, "Location"])); }, { enableHighAccuracy: true, maximumAge: 0 });
    const dropGps = () => { if (gpsId !== undefined) navigator.geolocation.clearWatch(gpsId); };

    let stream: MediaStream;
    try { stream = await askCamera; } catch { dropGps(); setBlocked(true); setBusy(false); return; }
    const [motion, turn] = await Promise.all([askMotion, askTurn]);
    if (l.gone) { stream.getTracks().forEach((t) => t.stop()); dropGps(); return; }
    setBlocked(false);
    show(stream);
    awake();

    const mime = pickMime((m) => MediaRecorder.isTypeSupported(m));
    const rec = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: 2_500_000 });
    l.rec = rec; l.chunks = []; l.session = s; l.videoAt = 0; l.offs = [dropGps];
    rec.addEventListener("dataavailable", (e) => { if (e.data.size) l.chunks.push(e.data); });
    rec.addEventListener("start", () => { l.videoAt = Date.now(); }, { once: true });

    // The video and the three sensor logs start together, on the phone's clock.
    s.startedAt = Date.now();
    l.on = true;
    rec.start(1000);
    if (motion) {
      const fn = (e: DeviceMotionEvent) => { if (l.on) addMotion(s, Date.now(), e.accelerationIncludingGravity, e.rotationRate); };
      window.addEventListener("devicemotion", fn);
      l.offs.push(() => window.removeEventListener("devicemotion", fn));
    }
    if (turn) {
      const fn = (e: DeviceOrientationEvent) => { if (l.on) addHeading(s, Date.now(), e.alpha, e.beta, e.gamma); };
      window.addEventListener("deviceorientation", fn);
      l.offs.push(() => window.removeEventListener("deviceorientation", fn));
    }
    if (!("geolocation" in navigator)) gpsOn = false;
    setOff([...(motion ? [] : ["Motion"]), ...(turn ? [] : ["Orientation"]), ...(gpsOn ? [] : ["Location"])]);
    setElapsed(0);
    setMarked(0);
    setStage("recording");
    setBusy(false);
    l.tick = window.setInterval(() => {
      const ms = Date.now() - s.startedAt;
      setElapsed(ms);
      if (ms >= MAX_MS) void stop();
    }, 250);
  };

  const mark = (kind: MarkKind) => {
    const l = live.current;
    if (!l.on || !l.session) return;
    addMark(l.session, Date.now(), kind);
    setMarked(l.session.marks.length);
    navigator.vibrate?.(30);
  };

  const discard = () => {
    if (take?.url) URL.revokeObjectURL(take.url);
    setTake(null);
    setStage("camera");
    void openCamera();
  };
  const save = () => {
    if (!take) return;
    download(take.json);
    if (take.video) window.setTimeout(() => take.video && download(take.video), 400);
    setSaved(true);
  };

  const filming = stage === "camera" || stage === "recording";
  return (
    <main data-testid="record-page" className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-black text-white">
      <video ref={view} muted playsInline aria-label="Camera" className={filming ? "absolute inset-0 h-full w-full object-cover" : "hidden"} />

      {stage === "intro" && (
        <div className="flex flex-1 flex-col justify-center gap-6 p-6">
          <h1 className="text-2xl font-semibold">Record a station walk</h1>
          <ol className="space-y-3 text-lg">
            {TIPS.map((t, i) => <li key={t} className="flex gap-3"><span className="font-semibold text-red-400">{i + 1}</span><span>{t}</span></li>)}
          </ol>
          <p className="text-sm text-white/70">No sound is recorded. Nothing is uploaded.</p>
          <button type="button" onClick={begin} className="min-h-14 rounded-full bg-white px-6 text-lg font-semibold text-black">Open camera</button>
        </div>
      )}

      {filming && blocked && (
        <div role="alert" className="relative z-10 m-auto flex max-w-xs flex-col items-center gap-4 rounded-2xl bg-black/80 p-6 text-center">
          <p className="text-lg">The camera is blocked. Allow it for this site.</p>
          <button type="button" onClick={() => void openCamera()} className="min-h-12 rounded-full bg-white px-6 font-semibold text-black">Try again</button>
        </div>
      )}

      {stage === "recording" && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col items-center gap-1 p-4" style={{ paddingTop: "calc(env(safe-area-inset-top) + 1rem)" }}>
          <p data-testid="record-timer" className="flex items-center gap-2 rounded-full bg-black/60 px-4 py-1.5 text-lg font-semibold tabular-nums">
            <span aria-hidden className="h-3 w-3 animate-pulse rounded-full bg-red-500" />
            <span className="sr-only">Recording</span>
            {clock(elapsed)}
          </p>
          {off.length > 0 && <p className="rounded-full bg-black/60 px-3 py-1 text-sm">{off.join(", ")} off</p>}
        </div>
      )}

      {filming && !blocked && (
        <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-4 p-4" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1.25rem)" }}>
          {stage === "recording" && (
            <div className="grid w-full max-w-md grid-cols-3 gap-2">
              {MARKS.map(({ kind, label, Icon }) => (
                <button key={kind} type="button" onClick={() => mark(kind)} className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl bg-black/60 text-base font-semibold backdrop-blur active:bg-white/30">
                  <Icon className="h-6 w-6" aria-hidden /> {label}
                </button>
              ))}
            </div>
          )}
          {stage === "recording" ? (
            <button type="button" onClick={() => void stop()} aria-label="Stop" className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-white bg-black/40">
              <Square className="h-8 w-8 fill-red-500 text-red-500" aria-hidden />
            </button>
          ) : (
            <button type="button" onClick={() => void start()} disabled={busy} aria-label="Record" className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-white bg-black/40 disabled:opacity-60">
              <span aria-hidden className="h-14 w-14 rounded-full bg-red-600" />
            </button>
          )}
          {stage === "recording" && <p className="sr-only" aria-live="polite">{marked} marks</p>}
        </div>
      )}

      {stage === "review" && take && (
        <div className="flex min-h-0 flex-1 flex-col gap-3 p-4" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}>
          {take.url ? <video src={take.url} controls muted playsInline aria-label="Recorded walk" className="min-h-0 w-full flex-1 rounded-xl bg-neutral-900 object-contain" /> : <p role="alert" className="flex-1 content-center text-center text-lg">No video was captured.</p>}
          <p className="text-sm text-white/70">{clock(take.ms)} · Motion {take.rows.motion} · Orientation {take.rows.heading} · Location {take.rows.gps}</p>
          <ul aria-label="Marks" className="max-h-40 space-y-1 overflow-y-auto text-base">
            {take.marks.length === 0 && <li className="text-white/70">No marks.</li>}
            {take.marks.map((m, i) => <li key={`${m.t}-${i}`} className="flex gap-3"><span className="w-12 tabular-nums text-white/70">{clock(m.t - take.startedAt)}</span><span className="capitalize">{m.kind}</span></li>)}
          </ul>
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={discard} className="flex min-h-14 items-center justify-center gap-2 rounded-full border border-white/40 text-lg font-semibold"><Trash2 className="h-5 w-5" aria-hidden /> Delete</button>
            <button type="button" onClick={save} className="flex min-h-14 items-center justify-center gap-2 rounded-full bg-white text-lg font-semibold text-black"><Download className="h-5 w-5" aria-hidden /> Save</button>
          </div>
          <p className="text-center text-sm text-white/70" aria-live="polite">{saved ? "Saved to this phone. Nothing is uploaded." : "Nothing is uploaded."}</p>
        </div>
      )}
    </main>
  );
}
