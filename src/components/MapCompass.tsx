import { useEffect, useState } from "react";
import { useMap } from "react-map-gl/maplibre";
import { useMediaQuery } from "@/lib/useMediaQuery";

/**
 * Bottom-right map orientation control (Layout A dropped the rail's compass).
 * Desktop: a compass with a labeled N that turns with the bearing (tap: north
 * up and flat) and rotate left / right 15°. Tilt lives in the view switcher (Mid / Up / Top).
 * Phones: only the compass, and only once the map has been rotated.
 * Right-drag, Ctrl/Cmd+drag and Shift+arrows still rotate and tilt.
 */
export const ROTATE_STEP = 15;
export const TILT_PITCH = 60;

export function MapCompass() {
  const { current } = useMap();
  const map = current?.getMap();
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const [cam, setCam] = useState({ bearing: 0, pitch: 0 });
  useEffect(() => {
    if (!map) return;
    const sync = () => setCam({ bearing: map.getBearing(), pitch: map.getPitch() });
    sync();
    map.on("rotate", sync);
    map.on("pitch", sync);
    return () => { map.off("rotate", sync); map.off("pitch", sync); };
  }, [map]);
  if (!map) return null;
  const rotated = Math.abs(cam.bearing) > 0.5 || cam.pitch > 0.5;
  if (!isDesktop && !rotated) return null;
  const btn = "h-9 rounded-full border border-border bg-card px-[var(--sp-3)] text-[12px] font-semibold text-foreground shadow-md hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  return (
    <div
      className="absolute z-20 flex items-center gap-[var(--sp-2)]"
      style={{ right: "max(var(--edge), env(safe-area-inset-right))", bottom: "calc(max(var(--edge), env(safe-area-inset-bottom)) + var(--sp-6) + var(--chat-bar-h, 0px) + var(--playback-h, 0px))" }}
      aria-label="Map orientation"
      role="group"
    >
      {isDesktop ? (
        <>
          <button type="button" className={btn} onClick={() => map.easeTo({ bearing: map.getBearing() - ROTATE_STEP })}>Rotate left</button>
          <button type="button" className={btn} onClick={() => map.easeTo({ bearing: map.getBearing() + ROTATE_STEP })}>Rotate right</button>
        </>
      ) : null}
      <button
        type="button"
        aria-label={`Compass, bearing ${Math.round(cam.bearing)} degrees. Reset north and flat`}
        onClick={() => map.easeTo({ bearing: 0, pitch: 0 })}
        className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card shadow-md hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex flex-col items-center leading-none" style={{ transform: `rotate(${-cam.bearing}deg)` }}>
          <span className="block h-0 w-0 border-x-[4px] border-b-[7px] border-x-transparent border-b-acc" aria-hidden />
          <span className="text-[11px] font-bold text-foreground">N</span>
        </span>
      </button>
    </div>
  );
}
