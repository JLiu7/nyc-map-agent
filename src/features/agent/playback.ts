import type { PlaybackSpeed } from "./schema";

/**
 * The trip preview's play / pause / restart rules as a pure reducer, so the
 * animation hook (usePlayer) only draws frames. A trip arriving from the agent
 * is loaded, never played: the person presses Play.
 *
 * - `run` changes whenever the running animation loop must be torn down and
 *   started again (new trip, new speed, restart). The hook keys its
 *   requestAnimationFrame effect on it, so the old loop is always cancelled.
 * - `restart` changes whenever progress goes back to the start of the trip.
 */
export type PlayStatus = "idle" | "ready" | "playing" | "paused" | "ended";
export interface Playback {
  status: PlayStatus;
  tripId: string | null;
  speed: PlaybackSpeed;
  seg: number;
  segCount: number;
  run: number;
  restart: number;
}

export type PlaybackEvent =
  | { type: "load"; tripId: string; segCount: number; speed?: PlaybackSpeed }
  /** Another option chosen: same play state, from the new route's start. */
  | { type: "select"; tripId: string; segCount: number }
  | { type: "play" }
  | { type: "pause" }
  | { type: "toggle" }
  | { type: "speed"; speed: PlaybackSpeed }
  | { type: "skip" }
  /** Back one scene; from the first, or within a scene's opening moments, to its own start. */
  | { type: "back" }
  /** The animation reached the end of the current leg. */
  | { type: "legDone" }
  /**
   * Dragged on the progress bar to a spot in leg `seg` (owner, 2026-11-12: a bar to trace the walk
   * back, like a video's). Playing keeps playing from there; anything else holds still on that spot.
   */
  | { type: "seek"; seg: number }
  | { type: "stop" };

export const initialPlayback: Playback = { status: "idle", tripId: null, speed: 10, seg: 0, segCount: 0, run: 0, restart: 0 };

/** Back to the first leg, with the old loop cancelled. */
const fromStart = (s: Playback, tripId: string, segCount: number, status: PlayStatus): Playback => ({
  ...s, tripId, segCount, seg: 0, status: segCount ? status : "idle", run: s.run + 1, restart: s.restart + 1,
});

export function playback(s: Playback, e: PlaybackEvent): Playback {
  switch (e.type) {
    case "load":
      return { ...fromStart(s, e.tripId, e.segCount, "ready"), speed: e.speed ?? s.speed };
    case "select":
      // Nothing loaded: choosing an option only redraws the map; Play loads it later.
      if (s.status === "idle" || e.tripId === s.tripId) return s;
      return fromStart(s, e.tripId, e.segCount, s.status === "playing" ? "playing" : "ready");
    case "play":
      if (s.status === "ready" || s.status === "paused") return { ...s, status: "playing" };
      if (s.status === "ended") return { ...fromStart(s, s.tripId!, s.segCount, "playing") };
      return s;
    case "pause":
      return s.status === "playing" ? { ...s, status: "paused" } : s;
    case "toggle":
      return playback(s, { type: s.status === "playing" ? "pause" : "play" });
    case "speed":
      // Same spot on the route, new rate; the loop restarts so no frame runs at the old speed.
      if (e.speed === s.speed) return s;
      return { ...s, speed: e.speed, run: s.status === "playing" ? s.run + 1 : s.run };
    case "skip":
    case "legDone":
      if (s.status === "idle") return s;
      if (s.seg + 1 >= s.segCount) return { ...s, seg: Math.max(0, s.segCount - 1), status: "ended" };
      return { ...s, seg: s.seg + 1 };
    case "back": {
      if (s.status === "idle") return s;
      // `restart` makes the loop count the scene from 0 again, even when it is the same one.
      const seg = s.status === "ended" ? s.seg : Math.max(0, s.seg - 1);
      return { ...s, seg, status: s.status === "ended" ? "playing" : s.status, run: s.run + 1, restart: s.restart + 1 };
    }
    case "seek":
      if (s.status === "idle") return s;
      return { ...s, seg: Math.max(0, Math.min(s.segCount - 1, e.seg)), status: s.status === "playing" ? "playing" : "paused", run: s.run + 1 };
    case "stop":
      return s.status === "idle" ? s : { ...s, status: "idle", tripId: null, seg: 0, segCount: 0, run: s.run + 1 };
  }
}

export const isActive = (s: Playback) => s.status !== "idle";
