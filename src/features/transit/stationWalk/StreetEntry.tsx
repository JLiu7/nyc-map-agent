import { useEffect, useState } from "react";
import { DoorOpen } from "lucide-react";
import { useAmbient } from "@/lib/ambient";
import { FULTON_EXITS } from "@/lib/map/fultonCorners";
import { getMapInstance } from "@/lib/map/mapInstance";
import { openStationWalk, useStationWalk } from "./store";

/** Within this many metres of a Fulton St stair in Street view, the way down is offered. */
export const ENTRY_NEAR_M = 35;

/** The Fulton St exit nearest (lon, lat) and how far it is, in metres. */
export function nearestExit(lon: number, lat: number): { exit: [number, number]; m: number } {
  const k = Math.cos((lat * Math.PI) / 180) * 111_320;
  let best = { exit: [...FULTON_EXITS[0]] as [number, number], m: Infinity };
  for (const e of FULTON_EXITS) {
    const m = Math.hypot((e[0] - lon) * k, (e[1] - lat) * 110_540);
    if (m < best.m) best = { exit: [e[0], e[1]], m };
  }
  return best;
}

/**
 * In Street view at a Fulton St stair, a button to go down it: the walk inside opens at that exit
 * and goes on to the 4/5 platform and the train (owner, 2026-11-13: street view, then inside, then
 * onto the train).
 */
export function StreetEntry() {
  const { walking } = useAmbient();
  const open = useStationWalk();
  const [exit, setExit] = useState<[number, number] | null>(null);
  useEffect(() => {
    if (!walking) { setExit(null); return; }
    const map = getMapInstance();
    if (!map) return;
    const update = () => {
      const c = map.getCenter();
      const n = nearestExit(c.lng, c.lat);
      setExit((was) => (n.m < ENTRY_NEAR_M ? (was && was[0] === n.exit[0] && was[1] === n.exit[1] ? was : n.exit) : null));
    };
    update();
    map.on("move", update);
    return () => { map.off("move", update); };
  }, [walking]);
  if (!walking || !exit || open) return null;
  return (
    <div className="pointer-events-none absolute right-3 top-[calc(env(safe-area-inset-top)+156px)] z-30 sm:left-1/2 sm:right-auto sm:top-[calc(env(safe-area-inset-top)+72px)] sm:-translate-x-1/2">
      <button
        type="button"
        data-testid="street-walk-inside"
        onClick={() => openStationWalk(exit)}
        className="pointer-events-auto flex min-h-11 items-center gap-2 rounded-full bg-[#00933c] px-4 text-sm font-semibold text-white shadow-lg"
      >
        <DoorOpen className="h-4 w-4" aria-hidden />
        Walk inside Fulton St
      </button>
    </div>
  );
}
