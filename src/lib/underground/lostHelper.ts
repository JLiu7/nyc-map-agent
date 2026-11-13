import { useSyncExternalStore } from "react";
import type { ActiveTrip } from "@/lib/transit/activeTrip";

/**
 * The where-am-I helper (#131): one focused chat for someone lost in or near a
 * station, opened by the home's Find exit, a followed train's Find exit and a
 * walk's Where am I. It replaced Exit help and I'm lost. This file holds
 * whether it is open, what opened it, and the few facts other features note
 * for its guess (the train being followed, which part of the train stops by an
 * exit's stairs). Memory only: nothing here is written to storage.
 */

/** What the button that opened the helper knew. */
export type LostContext =
  | { from: "home" }
  /** A followed train's card: its line and the next stop. */
  | { from: "train"; line: string; nextStop: string | null; stationId?: string }
  /** A walking route: where it goes and the landmark it was looking for. */
  | { from: "walk"; walkingTo: string | null; landmark: string | null };

/** A train the person followed, noted when its card shows. */
export interface NotedTrain { line: string; nextStop: string | null; at: number }

let open: LostContext | null = null;
let train: NotedTrain | null = null;
let trip: { trip: ActiveTrip; at: number } | null = null;
/** A trip looked up longer ago than this no longer says where someone is. */
const TRIP_KEEP_MS = 3 * 60 * 60 * 1000;
/** Station id → the part of the train by its exit's stairs ("at the front"), from the station walk. */
const parts = new Map<string, string>();
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const subscribe = (f: () => void) => (subs.add(f), () => subs.delete(f));

export function openLostHelper(ctx: LostContext = { from: "home" }): void {
  open = ctx;
  emit();
}

export function closeLostHelper(): void {
  if (!open) return;
  open = null;
  emit();
}

export function useLostHelper(): LostContext | null {
  return useSyncExternalStore(subscribe, () => open, () => null);
}

export function noteTrain(t: NotedTrain | null): void {
  if (t && train && t.line === train.line && t.nextStop === train.nextStop) return;
  train = t;
}

export function notedTrain(): NotedTrain | null {
  return train;
}

/** The last trip looked up. Closing the trip card clears the active trip, and Find exit only shows once it is closed. */
export function noteTrip(t: ActiveTrip, at = Date.now()): void {
  trip = { trip: t, at };
}

export function notedTrip(now = Date.now()): ActiveTrip | null {
  return trip && now - trip.at < TRIP_KEEP_MS ? trip.trip : null;
}

export function noteTrainPart(stationId: string, part: string): void {
  parts.set(stationId, part);
}

export function notedTrainPart(stationId: string | undefined): string | null {
  return stationId ? parts.get(stationId) ?? null : null;
}

/** The open helper takes what is typed in the chat bar; it registers here while it is mounted. */
let sender: ((text: string) => void) | null = null;
export function setLostSender(fn: ((text: string) => void) | null): void {
  sender = fn;
}
/** Sends to the helper when it is open; false when it is not, so the chat bar asks the agent as usual. */
export function sendToLost(text: string): boolean {
  if (!open || !sender) return false;
  sender(text);
  return true;
}
