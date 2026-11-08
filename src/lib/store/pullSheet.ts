import { useSyncExternalStore } from "react";

/**
 * The pull sheets that want the bottom of a phone, oldest first. Only the
 * newest one shows; the ones under it stay mounted but draw nothing, so a
 * phone never has two sheets on screen (owner, 2026-11-07: one sheet with
 * drill-in views and a back arrow, the way Google Maps does it). Closing the
 * top one brings back the one under it. MapChrome reads whether any is up to
 * keep the quick buttons beside a sheet without loading the screen machine at boot.
 */
interface Entry { id: number; close: () => void }
let stack: readonly Entry[] = [];
let nextId = 1;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

/** A sheet came up: it goes on top. Returns its id and the call that takes it off again. */
export function pullSheetMounted(close: () => void): { id: number; release: () => void } {
  const id = nextId++;
  stack = [...stack, { id, close }];
  emit();
  return { id, release: () => { stack = stack.filter((e) => e.id !== id); emit(); } };
}

/** Close every sheet in the stack, newest first: the close button empties the sheet, back only pops one view. */
export function closeSheets(): void {
  for (const e of [...stack].reverse()) e.close();
}

const subscribe = (f: () => void) => (subs.add(f), () => subs.delete(f));

export function usePullSheetUp(): boolean {
  return useSyncExternalStore(subscribe, () => stack.length > 0, () => false);
}

/** Where a sheet sits: whether it is the one showing, and whether another waits under it. */
export function useSheetPlace(id: number | null): { top: boolean; below: boolean } {
  const top = useSyncExternalStore(subscribe, () => id !== null && stack.at(-1)?.id === id, () => true);
  const below = useSyncExternalStore(subscribe, () => id !== null && stack.findIndex((e) => e.id === id) > 0, () => false);
  return { top, below };
}
