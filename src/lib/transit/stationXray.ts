import { useSyncExternalStore } from "react";

/**
 * Which subway station is shown in x-ray (null = off). Shared core, so the
 * station panel, the map layer and the trip preview (going down the stairs) all set the same one.
 */
let xrayId: string | null = null;
const subs = new Set<() => void>();
export function setXray(id: string | null) {
  xrayId = id;
  subs.forEach((f) => f());
}
export const getXray = () => xrayId;
export function useXray(): string | null {
  return useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), () => xrayId);
}
