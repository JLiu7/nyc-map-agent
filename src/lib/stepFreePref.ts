import { useSyncExternalStore } from "react";

/**
 * Elevators only (#133): the rider uses elevators, never stairs or escalators, so every trip is
 * planned step-free. Set in Settings and kept on this phone as `nma.stepFree`; it goes with each
 * question to the agent as one true/false and is never stored on the server.
 */
export const STEP_FREE_KEY = "nma.stepFree";

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const local = (): Store | undefined => {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
};

export function readStepFree(storage: Pick<Storage, "getItem"> | undefined = local()): boolean {
  try {
    return storage?.getItem(STEP_FREE_KEY) === "1";
  } catch {
    return false;
  }
}

let current = readStepFree();
const subs = new Set<() => void>();

export function setStepFreePref(on: boolean, storage: Store | undefined = local()): void {
  current = on;
  try {
    if (on) storage?.setItem(STEP_FREE_KEY, "1");
    else storage?.removeItem(STEP_FREE_KEY);
  } catch {
    /* private mode: kept for this visit only */
  }
  subs.forEach((f) => f());
}

export const getStepFreePref = (): boolean => current;

export function useStepFreePref(): boolean {
  return useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), () => current, () => current);
}
