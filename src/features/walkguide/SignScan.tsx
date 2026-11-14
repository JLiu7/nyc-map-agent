import { Camera } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

const API_BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");
/** The frame is sent no wider than this: wider only slows the answer. */
const FRAME_W = 960;

type Cam = "off" | "starting" | "on" | "blocked";
type Ask = "idle" | "asking" | "none" | "failed";

/** One frame and the signs it may show, to the server; the id it names, or null. */
export async function askSign(image: string, signs: ReadonlyArray<{ id: string; sign: string }>, signal?: AbortSignal): Promise<string | null> {
  const res = await fetch(`${API_BASE}/api/agent/see-sign`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ image, signs: signs.map((s) => ({ id: s.id, sign: s.sign })) }), signal });
  if (!res.ok) throw new Error(`see-sign ${res.status}`);
  const body = (await res.json()) as { id?: unknown };
  return typeof body.id === "string" ? body.id : null;
}

/**
 * Point the camera at a sign and ask which one it is. The photo is sent to our
 * server, which passes it to a model that can see and keeps nothing; the line
 * under the button says so before the first photo is taken. Kept small: the
 * map above the sheet stays the main view.
 */
export function SignScan({ signs, onFound }: { signs: ReadonlyArray<{ id: string; sign: string }>; onFound: (id: string) => void }) {
  const [cam, setCam] = useState<Cam>("off");
  const [ask, setAsk] = useState<Ask>("idle");
  const video = useRef<HTMLVideoElement>(null);
  const live = useRef<{ stream?: MediaStream; ctl?: AbortController; alive: boolean }>({ alive: false });

  const stop = useCallback(() => {
    live.current.alive = false;
    live.current.stream?.getTracks().forEach((t) => t.stop());
    live.current.ctl?.abort();
    live.current = { alive: false };
    setCam((c) => (c === "blocked" ? c : "off"));
  }, []);

  // The camera never outlives the screen: stop when the tab hides and when this closes.
  useEffect(() => {
    const hide = () => { if (document.visibilityState === "hidden") stop(); };
    document.addEventListener("visibilitychange", hide);
    return () => { document.removeEventListener("visibilitychange", hide); stop(); };
  }, [stop]);

  const start = () => {
    live.current = { alive: true };
    const l = live.current;
    setCam("starting");
    if (!navigator.mediaDevices?.getUserMedia) { setCam("blocked"); return; }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } }, audio: false }).then(async (stream) => {
      if (!l.alive) { stream.getTracks().forEach((t) => t.stop()); return; }
      live.current.stream = stream;
      setCam("on");
      const v = video.current;
      if (v) { v.srcObject = stream; await v.play().catch(() => {}); }
    }).catch(() => { if (l.alive) { l.alive = false; setCam("blocked"); } });
  };

  const scan = () => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const k = Math.min(1, FRAME_W / v.videoWidth);
    const frame = document.createElement("canvas");
    frame.width = Math.round(v.videoWidth * k);
    frame.height = Math.round(v.videoHeight * k);
    frame.getContext("2d")?.drawImage(v, 0, 0, frame.width, frame.height);
    const ctl = (live.current.ctl = new AbortController());
    setAsk("asking");
    askSign(frame.toDataURL("image/jpeg", 0.72), signs, ctl.signal).then((id) => {
      if (ctl.signal.aborted) return;
      if (id) { setAsk("idle"); stop(); onFound(id); } else setAsk("none");
    }).catch(() => { if (!ctl.signal.aborted) setAsk("failed"); });
  };

  return (
    <div className="flex flex-col gap-2" data-testid="walk-scan">
      <video ref={video} playsInline muted aria-hidden className={`${cam === "on" ? "block" : "hidden"} max-h-[22dvh] w-full rounded-xl bg-black object-cover`} style={{ aspectRatio: "16 / 9" }} />
      {cam === "on" ? <button type="button" className="task-action min-h-11 px-3" disabled={ask === "asking"} onClick={scan}>{ask === "asking" ? "Looking…" : "Which sign is this?"}</button>
        : <button type="button" className="task-action min-h-11 px-3" disabled={cam === "starting"} onClick={start}>
          <span className="inline-flex items-center gap-1.5"><Camera size={16} aria-hidden />{cam === "starting" ? "Starting…" : "Point the camera at a sign"}</span>
        </button>}
      {cam === "blocked" ? <p className="text-xs text-amber-200" role="status">The camera is off for this site. Tap the sign below.</p> : null}
      {ask === "none" ? <p className="text-xs text-amber-200" role="status" data-testid="walk-scan-note">Could not read a sign on this walk there. Fill the view with the sign, or tap one below.</p> : null}
      {ask === "failed" ? <p className="text-xs text-amber-200" role="status" data-testid="walk-scan-note">Could not check the photo. Tap the sign below.</p> : null}
      <p className="text-xs text-slate-300">The photo goes to our server to name the sign. It is not kept.</p>
    </div>
  );
}
