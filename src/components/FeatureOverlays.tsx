import { lazy, Suspense, useMemo } from "react";
import { FEATURES } from "@/features";
import { useFlags } from "@/lib/flags";
import { ErrorBoundary } from "./ErrorBoundary";

const LAZY = new Map(
  FEATURES.filter((f) => f.overlay).map((f) => [f.id, lazy(f.overlay!.load)] as const),
);

/**
 * Mounts each enabled feature's lazy overlay (its own chunk). Each gets its own Suspense boundary:
 * under one shared boundary React 19 loads lazy siblings one after another, so the chat overlay
 * waited seconds for the others and swallowed whatever was typed in the meantime.
 */
export function FeatureOverlays() {
  const flags = useFlags();
  return (
    <>
      {[...LAZY].map(([id, C]) => (flags[id] ? (
        <ErrorBoundary key={id} name={id} fallback={null}>
          <Suspense fallback={null}><C /></Suspense>
        </ErrorBoundary>
      ) : null))}
    </>
  );
}

/** True when an enabled feature has taken over the Ask button. */
export function useChatReplaced(): boolean {
  const flags = useFlags();
  return useMemo(() => FEATURES.some((f) => f.overlay?.replacesChat && flags[f.id]), [flags]);
}
