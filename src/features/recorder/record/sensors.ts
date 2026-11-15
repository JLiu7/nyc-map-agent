/**
 * The phone's sensors for the recorder page: motion, orientation and location,
 * each row stamped with Date.now() and handed to the collector (session.ts).
 */
import type { Collector } from "./session";

type Askable = { requestPermission?: () => Promise<"granted" | "denied"> };

const askables = () => [globalThis.DeviceMotionEvent, globalThis.DeviceOrientationEvent] as unknown as (Askable | undefined)[];

/** True on an iPhone or iPad, where motion arrives only after the person allows it in a tap. */
export function motionNeedsAsking(): boolean {
  return askables().some((E) => typeof E?.requestPermission === "function");
}

/**
 * Ask for motion and orientation, as an iPhone requires. Call this first
 * thing in the Record tap, before any await: Safari allows the prompt only
 * inside the tap itself. Both requests start here at once; the promise waits
 * for them. Elsewhere there is nothing to ask, and it resolves at once.
 */
export function askMotion(): Promise<boolean> {
  const pending: Promise<"granted" | "denied">[] = [];
  for (const E of askables()) {
    const ask = E?.requestPermission;
    if (typeof ask === "function") pending.push(ask.call(E).catch(() => "denied" as const));
  }
  return Promise.all(pending).then((r) => r.every((x) => x === "granted"));
}

/** Start collecting rows. Location asks for permission here, on each start. Returns the stop function. */
export function watchSensors(c: Collector, onLocationDenied?: () => void): () => void {
  const onMotion = (e: DeviceMotionEvent) => c.motion(Date.now(), e);
  const onOrientation = (e: DeviceOrientationEvent) => c.heading(Date.now(), e);
  window.addEventListener("devicemotion", onMotion);
  window.addEventListener("deviceorientation", onOrientation);
  let geo: number | null = null;
  if (navigator.geolocation) {
    geo = navigator.geolocation.watchPosition(
      (p) => c.gps(Date.now(), p.coords),
      (err) => { if (err.code === err.PERMISSION_DENIED) onLocationDenied?.(); },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 30_000 },
    );
  }
  return () => {
    window.removeEventListener("devicemotion", onMotion);
    window.removeEventListener("deviceorientation", onOrientation);
    if (geo !== null) navigator.geolocation.clearWatch(geo);
  };
}

/**
 * Keep the screen on while recording (Screen Wake Lock). The browser drops
 * the lock when the page is hidden, so it is taken again when the page
 * shows. Returns the release function; without the API it does nothing.
 */
export function keepAwake(): () => void {
  const wl = (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock;
  if (!wl) return () => undefined;
  let lock: { release: () => Promise<void> } | null = null;
  let on = true;
  const take = () => {
    if (!on || document.visibilityState !== "visible") return;
    wl.request("screen").then((l) => { if (on) lock = l; else void l.release(); }).catch(() => undefined);
  };
  document.addEventListener("visibilitychange", take);
  take();
  return () => {
    on = false;
    document.removeEventListener("visibilitychange", take);
    void lock?.release().catch(() => undefined);
    lock = null;
  };
}
