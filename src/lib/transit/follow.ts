import { useSyncExternalStore } from "react";

/** Which vehicle the camera is locked to (null = not following). Shared by the map layer and the panel. */
let followed: string | null = null;
const subs = new Set<() => void>();
/** The map camera from just before follow started. Stop following eases back to it. */
export type FollowSnap = { center: [number, number]; zoom: number; bearing: number; pitch: number };
let snap: FollowSnap | null = null;
let restoreOnStop = false;
/** Quiet stop for the trip preview. Must not call setFollowed. */
let onLeavePreview: (() => void) | null = null;

/** The trip preview registers this so locking onto a vehicle takes the camera back. */
export function bindPreviewRelease(fn: (() => void) | null) {
  onLeavePreview = fn;
}

/** Boarded from street view: "Get off" puts you back on foot where the vehicle is (owner, 2026-10-27). */
let onFoot = false;
export function setBoardedOnFoot(on: boolean) {
  onFoot = on;
}
export function useBoardedOnFoot(): boolean {
  return useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), () => onFoot);
}

export function setFollowed(key: string | null) {
  // Riding ends with the follow, however it ends.
  if (key === null) onFoot = false;
  // Drag, Esc, Show on map, Show map, and a non-vehicle map click release the camera where it is.
  // The Stop button sets the flag first.
  if (key === null && !restoreOnStop) snap = null;
  // A new vehicle owns the camera, so a playing trip preview lets go without gliding home.
  if (key !== null && key !== followed) onLeavePreview?.();
  followed = key;
  subs.forEach((f) => f());
}

/**
 * Heading for the follow camera. A sample that flips more than 150° is kept
 * back until it has repeated `hold` times, so one noisy bus heading cannot spin the view.
 */
export function stableHeading(prev: number | null, next: number, streak: number, hold = 4): { bearing: number; streak: number } {
  if (prev === null || !Number.isFinite(next)) return { bearing: Number.isFinite(next) ? next : (prev ?? 0), streak: 0 };
  const turn = ((next - prev + 540) % 360) - 180;
  if (Math.abs(turn) <= 150) return { bearing: next, streak: 0 };
  if (streak + 1 >= hold) return { bearing: next, streak: 0 };
  return { bearing: prev, streak: streak + 1 };
}

/** Keep the first view. A later train tap must not overwrite it with the chase camera. */
export function rememberFollowOrigin(cam: FollowSnap) {
  if (!snap) snap = cam;
}

/** The Stop following button: release the vehicle and ask the map to ease back. */
export function stopFollowing() {
  if (followed === null) return;
  restoreOnStop = true;
  setFollowed(null);
}

/** Read once, on the render where follow has just ended. */
export function takeFollowRestore(): { restore: boolean; cam: FollowSnap | null } {
  const restore = restoreOnStop;
  const cam = restore ? snap : null;
  restoreOnStop = false;
  snap = null;
  return { restore, cam };
}

export function useFollowed(): string | null {
  return useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), () => followed);
}
/** Non-hook read, for one-off snapshots such as the Ask context. */
export const followedTrain = (): string | null => followed;

/** Follow camera: a flat map view, behind, beside, above, or in the train's cab. */
export type FollowMode = "map" | "chase" | "side" | "overhead" | "cab";
let mode: FollowMode = "chase";
const modeSubs = new Set<() => void>();
export function setFollowMode(m: FollowMode) {
  mode = m;
  modeSubs.forEach((f) => f());
}
export function useFollowMode(): FollowMode {
  return useSyncExternalStore((f) => (modeSubs.add(f), () => modeSubs.delete(f)), () => mode);
}
/** Non-hook read, for the trip preview's frame loop. */
export const followMode = (): FollowMode => mode;

/**
 * True while a trip preview is on the map. Its marker then takes the same follow
 * cameras as a train (Map, Chase, Side, Overhead, Street), so a view picked from
 * Change view stays put for the whole preview instead of resetting each leg.
 */
let previewing = false;
const previewSubs = new Set<() => void>();
export function setPreviewing(on: boolean) {
  if (previewing === on) return;
  previewing = on;
  previewSubs.forEach((f) => f());
}
export function usePreviewing(): boolean {
  return useSyncExternalStore((f) => (previewSubs.add(f), () => previewSubs.delete(f)), () => previewing);
}

/**
 * True while a trip preview looks through the rider's eyes on the street. The map
 * then stands its buildings up as street view does: on the flat overview map the
 * walk out of a station was an empty grey plane (owner, 2026-11-10).
 */
let previewEye = false;
const eyeSubs = new Set<() => void>();
export function setPreviewEye(on: boolean) {
  if (previewEye === on) return;
  previewEye = on;
  eyeSubs.forEach((f) => f());
}
export function usePreviewEye(): boolean {
  return useSyncExternalStore((f) => (eyeSubs.add(f), () => eyeSubs.delete(f)), () => previewEye);
}

/**
 * Keeps the person's own zoom while a camera drives the map every frame: a
 * zoom since the last frame becomes an offset on top of the camera's zoom.
 */
export class ZoomKeeper {
  private offset = 0;
  private last: number | null = null;
  reset(): void { this.offset = 0; this.last = null; }
  /** The zoom to set this frame, given the camera's own zoom and the map's current zoom. */
  next(cameraZoom: number, mapZoom: number): number {
    if (this.last !== null && Math.abs(mapZoom - this.last) > 0.01) this.offset = Math.max(-5, Math.min(4, this.offset + mapZoom - this.last));
    this.last = cameraZoom + this.offset;
    return this.last;
  }
}

/**
 * Camera eye and look-at (metres east/north of the vehicle, and height) for a
 * follow mode; `bearing` is the vehicle's heading in degrees, `z` its height.
 * Side and Chase stand well back so you can see what is around the train
 * (owner, 2026-10-26: "a bit further"); a phone's narrow screen gets a higher,
 * more top-down angle so the train stays clear of the card and the buttons.
 */
export function followRig(m: FollowMode, bearing: number, z: number, phone = false): { eye: [number, number, number]; look: [number, number, number] } {
  const r = (bearing * Math.PI) / 180, fx = Math.sin(r), fy = Math.cos(r); // forward
  const rx = fy, ry = -fx; // right-hand side
  const at = Math.max(z, 0);
  switch (m) {
    case "side": return phone
      ? { eye: [rx * 150, ry * 150, at + 120], look: [fx * 30, fy * 30, at] }
      : { eye: [rx * 170, ry * 170, at + 75], look: [fx * 40, fy * 40, at] };
    case "overhead": return { eye: [-fx * 20, -fy * 20, at + 320], look: [0, 0, at] };
    case "cab": return { eye: [fx * 9, fy * 9, at + 3.2], look: [fx * 120, fy * 120, at + 2] };
    default: return phone
      ? { eye: [-fx * 120, -fy * 120, at + 120], look: [fx * 20, fy * 20, at] }
      : { eye: [-fx * 140, -fy * 140, at + 70], look: [fx * 30, fy * 30, at] };
  }
}

/** Where the followed vehicle is now (~2 Hz), for the follow mini map. */
export type FollowPos = { lon: number; lat: number; bearing: number };
let pos: FollowPos | null = null;
const posSubs = new Set<() => void>();
export function publishFollowPos(next: FollowPos | null) {
  pos = next;
  posSubs.forEach((f) => f());
}
export function useFollowPos(): FollowPos | null {
  return useSyncExternalStore((f) => (posSubs.add(f), () => posSubs.delete(f)), () => pos);
}
