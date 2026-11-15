import { useEffect, useState } from "react";
import type * as THREE from "three";

/** Where the walker stood and looked, kept across a dev reload (sessionStorage). */
export type WalkSpot = { x: number; y: number; z: number; heading: number };
const KEY = "walk-dev-spot";
const DIRS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

export function savedWalkSpot(): WalkSpot | null {
  try {
    const s = sessionStorage.getItem(KEY);
    return s ? (JSON.parse(s) as WalkSpot) : null;
  } catch {
    return null;
  }
}

export function forgetWalkSpot() {
  try { sessionStorage.removeItem(KEY); } catch { /* private window */ }
}

/**
 * Dev only: a readout of where the walker stands and looks, in the model's frame (x east, y north,
 * floor height in metres), so a screenshot says exactly where it was taken. It also saves the spot,
 * so a reload after a code change opens the walk again at the same place, facing the same way.
 */
export function WalkDevHud() {
  const [text, setText] = useState("");
  useEffect(() => {
    const id = setInterval(() => {
      const w = window as unknown as { __walkBody?: { body: { translation(): THREE.Vector3Like; linvel(): THREE.Vector3Like } }; __walkCamera?: THREE.Camera; __THREE?: typeof THREE };
      if (!w.__walkBody || !w.__walkCamera || !w.__THREE) return;
      const p = w.__walkBody.body.translation();
      const d = new w.__THREE.Vector3();
      w.__walkCamera.getWorldDirection(d);
      const heading = Math.atan2(d.x, -d.z);
      const deg = ((heading * 180) / Math.PI + 360) % 360;
      const pitch = (Math.asin(d.y) * 180) / Math.PI;
      setText(`at ${p.x.toFixed(1)}, ${(-p.z).toFixed(1)}  floor ${(p.y - 1.05).toFixed(1)} m\nlooking ${DIRS[Math.round(deg / 45) % 8]} ${deg.toFixed(0)}°, ${pitch >= 0 ? "up" : "down"} ${Math.abs(pitch).toFixed(0)}°`);
      // Not while falling: a reload would start the walk in mid-air again.
      if (w.__walkBody.body.linvel().y < -2) return;
      try { sessionStorage.setItem(KEY, JSON.stringify({ x: p.x, y: p.y, z: p.z, heading } satisfies WalkSpot)); } catch { /* private window */ }
    }, 150);
    return () => clearInterval(id);
  }, []);
  if (!text) return null;
  return (
    <pre data-testid="walk-dev-hud" className="pointer-events-none absolute left-3 top-[calc(env(safe-area-inset-top)+64px)] m-0 rounded-lg bg-black/75 px-2.5 py-1.5 font-mono text-[13px] leading-snug text-[#7CFC9A]">
      {text}
    </pre>
  );
}
