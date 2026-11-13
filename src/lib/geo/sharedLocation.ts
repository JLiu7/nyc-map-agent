import { useSyncExternalStore } from "react";
import { appGeo } from "./devGeo";

/**
 * "My location": the person's exact position, shared only after they tap the
 * My location button. Nothing asks the browser for permission before that
 * tap. The position lives in memory for this tab only: it is never written to
 * localStorage, cookies or the URL, and "Stop sharing location" clears it and
 * stops the browser watch.
 */
export type ShareStatus = "off" | "asking" | "on" | "denied" | "unavailable";
export interface SharedLocation {
  status: ShareStatus;
  coords: { lon: number; lat: number } | null;
  /** The browser's accuracy radius for `coords`, in metres (a sudden jump hints at a station or tunnel). */
  accuracy?: number | null;
  /** The direction of travel the device reports while moving (degrees from north), or null. */
  course?: number | null;
  /** Metres per second while moving, or null. */
  speed?: number | null;
  /** When `coords` was fixed (ms since 1970): underground the watch stops reporting, so the fix ages. */
  fixAt?: number | null;
}

type Geo = Pick<Geolocation, "watchPosition" | "clearWatch">;

let state: SharedLocation = { status: "off", coords: null };
let watchId: number | null = null;
const listeners = new Set<() => void>();
const set = (next: SharedLocation) => {
  state = next;
  listeners.forEach((l) => l());
};

function geo(): Geo | null {
  return appGeo();
}

/** Start sharing. Call only from a tap: this is what shows the browser's permission prompt. */
export function startSharing(g: Geo | null = geo()): Promise<SharedLocation["coords"]> {
  if (!g) {
    set({ status: "unavailable", coords: null });
    return Promise.resolve(null);
  }
  if (watchId !== null) return Promise.resolve(state.coords);
  set({ status: "asking", coords: null });
  return new Promise((resolve) => {
    let first = true;
    watchId = g.watchPosition(
      (p) => {
        if (watchId === null) return;
        const coords = { lon: p.coords.longitude, lat: p.coords.latitude };
        const num = (n: number | null | undefined) => (typeof n === "number" && Number.isFinite(n) ? n : null);
        set({ status: "on", coords, accuracy: num(p.coords.accuracy), course: num(p.coords.heading), speed: num(p.coords.speed), fixAt: num(p.timestamp) ?? Date.now() });
        if (first) { first = false; resolve(coords); }
      },
      () => {
        if (watchId !== null) g.clearWatch(watchId);
        watchId = null;
        set({ status: "denied", coords: null });
        if (first) { first = false; resolve(null); }
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    );
  });
}

/** Stop sharing: end the browser watch and forget the position. */
export function stopSharing(g: Geo | null = geo()): void {
  if (watchId !== null) g?.clearWatch(watchId);
  watchId = null;
  set({ status: "off", coords: null });
}

/** The current shared position, or null when the person is not sharing. */
export function sharedCoords(): SharedLocation["coords"] {
  return state.status === "on" ? state.coords : null;
}

export function useSharedLocation(): SharedLocation {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => state,
    () => state,
  );
}
