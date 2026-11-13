import { lazy, Suspense, useEffect } from "react";
import { createPortal } from "react-dom";
import { closeStationWalk, openStationWalk, useStationWalk } from "./store";

const StationWalk = lazy(() => import("@/lib/map/three/StationWalkScene").then((m) => ({ default: m.StationWalk })));

/** Mounts the walk inside Fulton St while it is open; nothing (and no download) otherwise. */
export function StationWalkHost() {
  const open = useStationWalk();
  // Dev and test hook: window.__walkInside() opens it without going through the station card.
  useEffect(() => {
    const w = window as unknown as { __walkInside?: (exit?: [number, number]) => void };
    w.__walkInside = (exit) => openStationWalk(exit ?? null);
    return () => { delete w.__walkInside; };
  }, []);
  // The walk covers the whole screen: the app behind it takes no taps, keys or screen-reader focus.
  useEffect(() => {
    const app = document.getElementById("root");
    if (!open || !app) return;
    app.inert = true;
    return () => { app.inert = false; };
  }, [open]);
  if (!open) return null;
  // Drawn beside the app, not inside it, so the inert app does not take the walk with it.
  return createPortal(
    <Suspense fallback={null}>
      <StationWalk exit={open.exit} onClose={closeStationWalk} />
    </Suspense>,
    document.body,
  );
}
