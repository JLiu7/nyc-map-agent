import { useEffect, useState, useSyncExternalStore } from "react";

/**
 * Which model the agent answers with (#35): "smart" (the large hosted models, tried in order of
 * health) or "dev" (the small model being trained up). Stored on this phone as `nma.profile`.
 * Null leaves it to the server, which picks smart whenever a smart provider is set up.
 */
export const PROFILE_KEY = "nma.profile";
export const PROFILES = ["smart", "dev"] as const;
export type ModelProfile = (typeof PROFILES)[number];

export function parseProfile(raw: string | null | undefined): ModelProfile | null {
  return raw === "smart" || raw === "dev" ? raw : null;
}

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const local = (): Store | undefined => {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
};

export function readProfile(storage: Pick<Storage, "getItem"> | undefined = local()): ModelProfile | null {
  try {
    return parseProfile(storage?.getItem(PROFILE_KEY));
  } catch {
    return null;
  }
}

let current: ModelProfile | null = readProfile();
const subs = new Set<() => void>();

export function setProfilePref(next: ModelProfile | null, storage: Store | undefined = local()): void {
  current = parseProfile(next);
  try {
    if (current) storage?.setItem(PROFILE_KEY, current);
    else storage?.removeItem(PROFILE_KEY);
  } catch {
    /* private mode */
  }
  subs.forEach((f) => f());
}

export const getProfilePref = (): ModelProfile | null => current;

export function useProfilePref(): ModelProfile | null {
  return useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), () => current, () => current);
}

export type SmartHealth = { label: string; ok?: boolean };

/** Which smart providers answer right now (GET /api/agent/health), for the line under the Model choice. */
export function useSmartHealth(): SmartHealth[] | null {
  const [smart, setSmart] = useState<SmartHealth[] | null>(null);
  useEffect(() => {
    const ctrl = new AbortController();
    const base = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");
    fetch(`${base}/api/agent/health`, { signal: ctrl.signal })
      .then((r) => (r.ok ? (r.json() as Promise<{ smart?: SmartHealth[] }>) : null))
      .then((j) => setSmart(j?.smart ?? null))
      .catch(() => undefined);
    return () => ctrl.abort();
  }, []);
  return smart;
}

/** "DeepSeek (InferHub) · 3/4": the provider answering first and how many are up. Null when there is no smart chain. */
export function healthLine(smart: SmartHealth[] | null): string | null {
  if (!smart?.length) return null;
  const up = smart.filter((p) => p.ok !== false);
  return up.length ? `${up[0].label} · ${up.length}/${smart.length}` : `0/${smart.length}`;
}
