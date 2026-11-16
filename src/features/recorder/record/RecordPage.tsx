import { useCallback, useEffect, useRef, useState } from "react";
import { SwitchCamera } from "lucide-react";
import { removeShell } from "@/lib/shellDraft";
import { MARK_KINDS, type MarkKind } from "../format";
import { cameraName, listCameras, nextCamera, openCamera, rememberCamera, rememberedCamera, stopStream, type Camera } from "./camera";
import Review, { type Take } from "./Review";
import { askMotion, keepAwake, motionNeedsAsking, watchSensors } from "./sensors";
import { clock, createCollector, deviceName, fileStem, motionRow, pickVideoType, videoExt, type Collector } from "./session";

interface Live {
  collector: Collector;
  recorder: MediaRecorder | null;
  chunks: Blob[];
  videoStartedAt: number | null;
  stopSensors: () => void;
  letSleep: () => void;
}

const MARK_LABEL: Record<MarkKind, string> = { sign: "Sign", stairs: "Stairs", elevator: "Elevator" };

/** How long to wait for a first motion row before saying the device sends none. */
const MOTION_WAIT_MS = 1500;
type MotionState = "unknown" | "ok" | "none" | "blocked";

/**
 * The recorder page at /record (#185): the back camera full screen with one
 * red Record button, and beside it a switch control when the device has more
 * than one camera (#223). No map and no chat bar here; the page is reached by its
 * address only and changes nothing on the map page.
 */
export default function RecordPage() {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const live = useRef<Live | null>(null);
  const [camError, setCamError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "starting" | "recording" | "done">("idle");
  const [take, setTake] = useState<Take | null>(null);
  const [motion, setMotion] = useState<MotionState>("unknown");
  const [locationBlocked, setLocationBlocked] = useState(false);
  const [startedAt, setStartedAt] = useState(0);
  const [now, setNow] = useState(0);
  const [marks, setMarks] = useState(0);
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [cameraId, setCameraId] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    if (phase !== "recording") return;
    const tick = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(tick);
  }, [phase]);

  /** Opens the camera if none is live. With `want`, closes the live one and opens that camera instead. */
  const startCamera = useCallback(async (want?: string) => {
    setCamError(null);
    if (!want && stream.current?.active) return stream.current;
    // Many phones cannot hold two cameras open, so the live one closes before the next opens.
    stopStream(stream.current);
    stream.current = null;
    const chosen = want ?? rememberedCamera();
    let cam = await openCamera(chosen);
    // The camera asked for has gone (unplugged, or the browser gave its cameras new ids): open the back camera.
    if (!cam.ok && chosen) {
      if (!want) rememberCamera(null);
      cam = await openCamera();
    }
    if (!cam.ok) { setCamError(cam.why); setCameraId(null); return null; }
    if (want && cam.deviceId === want) rememberCamera(want);
    stream.current = cam.stream;
    setCameraId(cam.deviceId);
    // Cameras have ids and names only once one is allowed, so the list is read after each open.
    void listCameras().then(setCameras);
    if (video.current) {
      video.current.srcObject = cam.stream;
      await video.current.play().catch(() => undefined);
    }
    return cam.stream;
  }, []);

  const switchCamera = () => {
    const next = nextCamera(cameras, cameraId);
    if (!next || switching) return;
    setSwitching(true);
    void startCamera(next).finally(() => setSwitching(false));
  };

  useEffect(() => {
    // The static chat bar in index.html is the map page's; it never belongs here.
    removeShell();
    const title = document.title;
    document.title = "Record a station walk";
    void startCamera();
    // A laptop sends no motion, or empty events. An iPhone sends none until Record has asked, so only others are judged here.
    let seen = false;
    const onMotion = (e: DeviceMotionEvent) => { if (motionRow(0, e)) seen = true; };
    let wait: number | undefined;
    if (!motionNeedsAsking()) {
      window.addEventListener("devicemotion", onMotion);
      wait = window.setTimeout(() => setMotion((m) => (m === "unknown" ? (seen ? "ok" : "none") : m)), MOTION_WAIT_MS);
    }
    // A camera plugged in or pulled out changes whether there is anything to switch to.
    const onDevices = () => { void listCameras().then(setCameras); };
    navigator.mediaDevices?.addEventListener?.("devicechange", onDevices);
    return () => {
      navigator.mediaDevices?.removeEventListener?.("devicechange", onDevices);
      window.removeEventListener("devicemotion", onMotion);
      window.clearTimeout(wait);
      document.title = title;
      live.current?.stopSensors();
      live.current?.letSleep();
      if (live.current?.recorder?.state === "recording") live.current.recorder.stop();
      stopStream(stream.current);
      stream.current = null;
    };
  }, [startCamera]);

  const record = () => {
    // Inside the tap, before any await: an iPhone only shows the motion prompt here.
    const motionAsked = askMotion();
    setPhase("starting");
    setLocationBlocked(false);
    void (async () => {
      const motionAllowed = await motionAsked;
      const cam = await startCamera();
      const startedAt = Date.now();
      const collector = createCollector(startedAt, deviceName(navigator.userAgent));
      const l: Live = { collector, recorder: null, chunks: [], videoStartedAt: null, stopSensors: () => undefined, letSleep: keepAwake() };
      live.current = l;
      l.stopSensors = watchSensors(collector, () => setLocationBlocked(true));
      if (!motionAllowed) setMotion("blocked");
      else window.setTimeout(() => { if (live.current === l) setMotion(collector.counts().motion ? "ok" : "none"); }, MOTION_WAIT_MS);
      if (cam && typeof MediaRecorder !== "undefined") {
        const type = pickVideoType((t) => MediaRecorder.isTypeSupported(t));
        try {
          const rec = new MediaRecorder(cam, type ? { mimeType: type } : undefined);
          rec.ondataavailable = (e) => { if (e.data.size) l.chunks.push(e.data); };
          rec.onstart = () => { l.videoStartedAt = Date.now(); };
          rec.start(1000);
          l.recorder = rec;
        } catch {
          setCamError("This browser cannot record video here. Marks and sensors still record.");
        }
      }
      setStartedAt(startedAt);
      setNow(startedAt);
      setMarks(0);
      setPhase("recording");
    })();
  };

  const mark = (kind: MarkKind) => {
    const l = live.current;
    if (!l) return;
    l.collector.mark(Date.now(), kind);
    setMarks(l.collector.counts().marks);
  };

  const stop = () => {
    const l = live.current;
    if (!l) return;
    l.stopSensors();
    l.letSleep();
    const finish = () => {
      const type = l.recorder?.mimeType || l.chunks[0]?.type || "";
      const blob = l.chunks.length ? new Blob(l.chunks, { type }) : null;
      const stem = fileStem(l.collector.recording.startedAt);
      const videoFile = blob ? `${stem}.${videoExt(type)}` : null;
      const recording = l.collector.finish(blob && videoFile ? { file: videoFile, startedAt: l.videoStartedAt ?? l.collector.recording.startedAt } : undefined);
      live.current = null;
      setTake({ recording, video: blob, videoFile, jsonFile: `${stem}.json` });
      setPhase("done");
    };
    if (l.recorder && l.recorder.state !== "inactive") {
      l.recorder.onstop = finish;
      l.recorder.stop();
    } else finish();
  };

  const discard = () => {
    setTake(null);
    setPhase("idle");
    void startCamera();
  };

  return (
    <main data-testid="record-page" className="fixed inset-0 overflow-hidden bg-black text-white">
      <video ref={video} data-testid="record-preview" className="absolute inset-0 h-full w-full object-cover" muted playsInline autoPlay />
      {camError && (
        <div role="alert" data-testid="record-camera-error" className="absolute inset-x-4 top-[max(1rem,env(safe-area-inset-top))] mx-auto max-w-md rounded-xl bg-black/75 px-4 py-3 text-center text-sm backdrop-blur">
          <p>{camError}</p>
          {phase === "idle" && <button type="button" onClick={() => void startCamera()} className="mt-2 min-h-11 rounded-full bg-white px-4 text-sm font-semibold text-black">Try again</button>}
        </div>
      )}
      {(motion === "none" || motion === "blocked" || locationBlocked) && phase !== "done" && (
        <div data-testid="record-notes" className={`absolute inset-x-4 ${phase === "recording" ? "bottom-[calc(max(2rem,env(safe-area-inset-bottom))+10.5rem)]" : "bottom-[calc(max(2rem,env(safe-area-inset-bottom))+6.5rem)]"} mx-auto max-w-md space-y-1 rounded-xl bg-black/60 px-4 py-2 text-center text-sm backdrop-blur`}>
          {motion === "none" && <p data-testid="motion-note">No motion sensors here. Video and marks still record; motion needs a phone.</p>}
          {motion === "blocked" && <p data-testid="motion-note">Motion is blocked. Allow motion for this site, then record again.</p>}
          {locationBlocked && <p data-testid="location-note">Location is blocked. The walk records without it.</p>}
        </div>
      )}
      {phase === "recording" && (
        <div data-testid="record-status" className="absolute left-4 top-[max(1rem,env(safe-area-inset-top))] flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 text-sm font-semibold tabular-nums backdrop-blur">
          <span aria-hidden className="h-3 w-3 animate-pulse rounded-full bg-red-600" />
          <span data-testid="record-timer" aria-label="Recording time">{clock(now - startedAt)}</span>
          {marks > 0 && <span data-testid="record-marks" className="font-normal text-white/80">{marks} {marks === 1 ? "mark" : "marks"}</span>}
        </div>
      )}
      {phase === "done" && take && <Review take={take} onDelete={discard} />}
      {phase !== "done" && <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-4 pb-[max(2rem,env(safe-area-inset-bottom))]">
        {phase === "recording" && (
          <div className="flex w-full max-w-md justify-center gap-2 px-3">
            {MARK_KINDS.map((kind) => (
              <button key={kind} type="button" data-testid={`mark-${kind}`} onClick={() => mark(kind)} className="min-h-12 min-w-0 flex-1 rounded-full bg-black/60 px-2 text-sm font-semibold backdrop-blur active:bg-white active:text-black">
                {MARK_LABEL[kind]}
              </button>
            ))}
          </div>
        )}
        {phase === "recording" ? (
          <button type="button" aria-label="Stop" data-testid="stop-button" onClick={stop} className="grid h-20 w-20 place-items-center rounded-full border-4 border-white bg-transparent">
            <span className="h-8 w-8 rounded-md bg-red-600" />
          </button>
        ) : (
          <div className="relative">
            <button type="button" aria-label="Record" data-testid="record-button" onClick={record} disabled={phase === "starting" || switching} className="grid h-20 w-20 place-items-center rounded-full border-4 border-white bg-transparent disabled:opacity-60">
              <span className="h-14 w-14 rounded-full bg-red-600" />
            </button>
            {/* Before recording only: changing camera mid-recording would cut the video. */}
            {phase === "idle" && cameras.length > 1 && (
              <div className="absolute left-full top-1/2 ml-4 flex w-24 -translate-y-1/2 flex-col items-center gap-1">
                <button type="button" aria-label="Switch camera" data-testid="switch-camera" onClick={switchCamera} disabled={switching} className="grid h-12 w-12 place-items-center rounded-full border-2 border-white bg-black/60 backdrop-blur active:bg-white active:text-black disabled:opacity-60">
                  <SwitchCamera aria-hidden className="h-6 w-6" />
                </button>
                {cameraName(cameras, cameraId) && <span data-testid="camera-name" aria-live="polite" className="max-w-full truncate rounded-full bg-black/60 px-2 text-xs leading-5 backdrop-blur">{cameraName(cameras, cameraId)}</span>}
              </div>
            )}
          </div>
        )}
      </div>}
    </main>
  );
}
