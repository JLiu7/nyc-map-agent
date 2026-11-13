/**
 * Whether the walk inside Fulton St is open, and from which street exit (#126). The station card
 * opens it; the walk scene closes it.
 */
import { useSyncExternalStore } from "react";

export type StationWalkOpen = { exit: [number, number] | null } | null;

let state: StationWalkOpen = null;
const listeners = new Set<() => void>();
const emit = () => { for (const l of listeners) l(); };

/** Opens the walk at the street exit nearest `exit` (lon, lat), or at the walk through most of the station. */
export function openStationWalk(exit: [number, number] | null = null): void { state = { exit }; emit(); }
export function closeStationWalk(): void { state = null; emit(); }
export function useStationWalk(): StationWalkOpen {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => state, () => null);
}

/** Fulton St's model is placed here; the walk is offered for stations within FULTON_NEAR_M of it. */
export const FULTON_AT: [number, number] = [-74.0085, 40.7102];
export const FULTON_NEAR_M = 300;

/** Whether a station at (lon, lat) is Fulton St, the one station with a model to walk inside. */
export function hasWalkInside(lon: number, lat: number): boolean {
  const k = Math.cos((lat * Math.PI) / 180) * 111_320;
  return Math.hypot((lon - FULTON_AT[0]) * k, (lat - FULTON_AT[1]) * 110_540) < FULTON_NEAR_M;
}
