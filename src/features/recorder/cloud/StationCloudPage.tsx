import { Pause, Play, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { removeShell } from "@/lib/shellDraft";
import { buildCloud, project, shownCount, type Cloud, type StationModel, type View } from "./cloud";

const MODEL = "/transit/fulton-model.json";
const POINTS = 14000;
/** Seconds the walk takes to play. */
const PLAY_S = 24;
/** Seconds for the camera to go once round the station. */
const TURN_S = 50;
const PITCH = 0.62;

/** The colour of a point by its height: deep blue on the lowest platform, teal between, amber at the street. */
const COLOURS = Array.from({ length: 12 }, (_, i) => {
  const k = i / 11;
  const hue = 215 - 175 * k;
  return `hsl(${hue.toFixed(0)} 85% ${(52 + 10 * k).toFixed(0)}%)`;
});

function draw(g: CanvasRenderingContext2D, cloud: Cloud, v: View, k: number): void {
  g.globalCompositeOperation = "source-over";
  g.fillStyle = "#05070d";
  g.fillRect(0, 0, v.w, v.h);
  // Points add their light where they overlap, so dense surfaces glow and thin ones stay faint.
  g.globalCompositeOperation = "lighter";
  const n = shownCount(cloud.seen, k);
  for (let band = 0; band < COLOURS.length; band++) {
    g.fillStyle = COLOURS[band];
    for (let i = 0; i < n; i++) {
      if (Math.min(COLOURS.length - 1, Math.floor(cloud.height[i] * COLOURS.length)) !== band) continue;
      const p = project(cloud.xyz[i * 3], cloud.xyz[i * 3 + 1], cloud.xyz[i * 3 + 2], v);
      if (!p) continue;
      const size = Math.max(1.5, Math.min(5, p[2] * 0.4));
      // The newest points flare as they appear.
      g.globalAlpha = cloud.seen[i] > k - 0.03 && k < 1 ? 1 : 0.6;
      g.fillRect(p[0] - size / 2, p[1] - size / 2, size, size);
    }
  }
  g.globalAlpha = 1;
  g.globalCompositeOperation = "source-over";

  // The walk so far, and the rider at its head.
  const upTo = Math.max(1, Math.round(k * (cloud.walk.length - 1)));
  g.strokeStyle = "#22c55e";
  g.lineWidth = 3;
  g.lineJoin = "round";
  g.beginPath();
  let last: [number, number, number] | null = null;
  for (let i = 0; i <= upTo && i < cloud.walk.length; i++) {
    const p = project(cloud.walk[i][0], cloud.walk[i][1], cloud.walk[i][2] + 1.2, v);
    if (!p) continue;
    if (last) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]);
    last = p;
  }
  g.stroke();
  if (last) {
    g.fillStyle = "#fff";
    g.beginPath();
    g.arc(last[0], last[1], 7, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#2563eb";
    g.beginPath();
    g.arc(last[0], last[1], 4.5, 0, Math.PI * 2);
    g.fill();
  }
}

/**
 * The 3D preview page at /station-3d: a station drawn as a cloud of points
 * that fills in along a walk, the way a walk video turned into 3D would. It is
 * a picture of what comes next, drawn from the station model the app already
 * has; no video is read. Reached by its address only.
 */
export default function StationCloudPage() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [cloud, setCloud] = useState<Cloud | null>(null);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [k, setK] = useState(0);
  const kRef = useRef(0);
  const yaw = useRef(0.6);

  useEffect(() => {
    removeShell();
    const title = document.title;
    document.title = "A station in 3D";
    let gone = false;
    fetch(MODEL)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((m: StationModel) => { if (!gone) setCloud(buildCloud(m, POINTS)); })
      .catch(() => { if (!gone) setFailed(true); });
    return () => { gone = true; document.title = title; };
  }, []);

  useEffect(() => {
    const el = canvas.current;
    if (!el || !cloud) return;
    const g = el.getContext("2d");
    if (!g) return;
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    let raf = 0;
    let last = performance.now();
    let shown = -1;
    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = el.clientWidth, h = el.clientHeight;
      if (el.width !== Math.round(w * dpr) || el.height !== Math.round(h * dpr)) {
        el.width = Math.round(w * dpr);
        el.height = Math.round(h * dpr);
      }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!still) yaw.current += (dt * Math.PI * 2) / TURN_S;
      if (playing) {
        kRef.current = Math.min(1, kRef.current + dt / PLAY_S);
        if (kRef.current >= 1) setPlaying(false);
      }
      if (Math.abs(kRef.current - shown) >= 0.004 || kRef.current >= 1) { shown = kRef.current; setK(kRef.current); }
      draw(g, cloud, { yaw: yaw.current, pitch: PITCH, w, h, reach: cloud.reach }, kRef.current);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [cloud, playing]);

  const play = () => {
    if (playing) { setPlaying(false); return; }
    if (kRef.current >= 1) { kRef.current = 0; setK(0); }
    setPlaying(true);
  };

  const done = k >= 1;
  const points = cloud ? shownCount(cloud.seen, k) : 0;

  return (
    <main data-testid="station-3d" className="fixed inset-0 overflow-hidden bg-[#05070d] text-white">
      <canvas ref={canvas} data-testid="station-3d-canvas" data-points={points} aria-label="Fulton St drawn as a cloud of points" role="img" className="absolute inset-0 h-full w-full" />
      <div className="pointer-events-none absolute inset-x-4 top-[max(1rem,env(safe-area-inset-top))]">
        <h1 className="text-lg font-bold">Fulton St in 3D</h1>
        <p className="text-sm text-white/75">What a walk video could become.</p>
      </div>
      {failed && <p role="alert" className="absolute inset-x-4 top-1/2 text-center text-sm">Could not load the station. Reload the page.</p>}
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <div className="flex w-full max-w-md items-center gap-3 rounded-2xl bg-black/60 px-3 py-2 backdrop-blur">
          <button type="button" data-testid="station-3d-play" onClick={play} disabled={!cloud} aria-label={playing ? "Pause" : done ? "Play again" : "Play"}
            className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-blue-600 disabled:opacity-50">
            {playing ? <Pause size={20} aria-hidden /> : done ? <RotateCcw size={20} aria-hidden /> : <Play size={20} aria-hidden />}
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold tabular-nums" data-testid="station-3d-count">{points.toLocaleString("en-US")} points</p>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/20" role="progressbar" aria-label="How much of the walk has played" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(k * 100)}>
              <div className="h-full rounded-full bg-amber-300" style={{ width: `${k * 100}%` }} />
            </div>
          </div>
        </div>
        <p className="text-center text-[11px] text-white/60">Station model: Project Subway NYC, projectsubwaynyc.com</p>
      </div>
    </main>
  );
}
