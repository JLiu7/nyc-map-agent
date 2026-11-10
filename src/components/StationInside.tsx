import { useEffect, useRef } from "react";
import type { NearStation } from "@/lib/map/stationNear";
import { getMapInstance } from "@/lib/map/mapInstance";
import { mountStationView } from "@/lib/map/three/stationScene";

type Eye = { lon: number; lat: number; bearing: number; pitch: number; z?: number };

/**
 * Street view below the street: the station's floors, walls, stairs and tracks
 * on a canvas over the map, seen from 1.7 m above your feet. It takes no input;
 * looking and walking still go to the map underneath, and the mini map keeps
 * showing where you are.
 */
export function StationInside({ station, getEye, fov }: { station: NearStation; getEye: () => Eye | null; fov: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    return mountStationView(ref.current, station.model, station.tracks, getEye, fov, undefined, station.signs, getMapInstance());
  }, [station, getEye, fov]);
  return <canvas ref={ref} aria-hidden data-testid="station-inside" className="pointer-events-none absolute inset-0 z-[1] h-full w-full" />;
}
