import type { BaroRow } from "@/features/recorder/format";
import type { Ride, Span } from "@/features/recorder/clean";

/** The owner's level colours (the levels page of 2026-11-13). */
export const LEVEL_COLOR: Record<string, string> = { street: "#0f5a3c", mezzanine: "#3d3a8f", platform: "#4a4a44" };
export const LEVEL_NAME: Record<string, string> = { street: "Street", mezzanine: "Mezzanine", platform: "Platform" };

interface Props {
  baro: readonly BaroRow[];
  spans: readonly Span[];
  rides: readonly Ride[];
  rideNames: readonly string[];
  /** Replay seconds: the range drawn, and now. */
  from: number;
  to: number;
  now: number;
  /** Seconds when Google Maps showed "No GPS signal". */
  noGps: { from: number; to: number };
  t0: number;
}

const W = 360, H = 168, L = 70, R = 6, TOP = 8, BOT = 132;

/**
 * Height against time from the barometer, with street, mezzanine and platform
 * as three bands (each band is where the barometer sat on that level), the two
 * elevator rides, the stretch where Google Maps had no GPS, and a moving dot.
 */
export function LevelGraph({ baro, spans, rides, rideNames, from, to, now, noGps, t0 }: Props) {
  const s = (t: number) => (t - t0) / 1000;
  const lo = Math.min(...spans.map((x) => x.lowM)) - 0.6;
  const hi = Math.max(...spans.map((x) => x.highM)) + 0.6;
  const x = (sec: number) => L + ((sec - from) / (to - from)) * (W - L - R);
  const y = (m: number) => BOT - ((m - lo) / (hi - lo)) * (BOT - TOP);
  const pts = baro.filter((b) => s(b[0]) >= from && s(b[0]) <= to).map((b) => `${x(s(b[0])).toFixed(1)},${y(b[1]).toFixed(1)}`).join(" ");
  // The dot sits on the barometer line at the reading nearest now.
  let h = baro[0]?.[1] ?? 0;
  for (const b of baro) if (s(b[0]) <= now) h = b[1]; else break;
  const nx = x(Math.max(from, Math.min(to, now)));
  const gx0 = x(Math.max(from, noGps.from)), gx1 = x(Math.min(to, noGps.to));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full shrink-0" role="img" aria-label="Height from the barometer, with the three levels" data-testid="replay-graph">
      {spans.map((b) => (
        <g key={b.level}>
          <rect x={L} y={y(b.highM + 0.25)} width={W - L - R} height={Math.max(6, y(b.lowM - 0.25) - y(b.highM + 0.25))} fill={LEVEL_COLOR[b.level] ?? "#334"} opacity={0.75} rx={4} />
          <text x={L - 6} y={y(b.heightM) + 4} textAnchor="end" fontSize={12} fontWeight={700} fill="#e2e8f0">{LEVEL_NAME[b.level] ?? b.level}</text>
        </g>
      ))}
      {rides.map((r, k) => (
        <g key={r.t0}>
          <rect x={x(s(r.t0)) - 1.5} y={TOP} width={Math.max(3, x(s(r.t1)) - x(s(r.t0)) + 3)} height={BOT - TOP} fill="#f97316" opacity={0.55} />
          <text x={x(s(r.t0)) + 5} y={TOP + 11} fontSize={10.5} fontWeight={700} fill="#fdba74">{rideNames[k] ?? "Elevator"}</text>
        </g>
      ))}
      <polyline points={pts} fill="none" stroke="#f8fafc" strokeWidth={1.6} strokeLinejoin="round" />
      <rect x={gx0} y={BOT + 10} width={Math.max(0, gx1 - gx0)} height={8} rx={4} fill="#ef4444" />
      <text x={L - 6} y={BOT + 18} textAnchor="end" fontSize={10.5} fontWeight={700} fill="#fca5a5">Google</text>
      <text x={gx0 + 4} y={BOT + 32} fontSize={10.5} fill="#fca5a5">No GPS signal</text>
      <line x1={nx} x2={nx} y1={TOP} y2={BOT + 18} stroke="#FCCC0A" strokeWidth={2} />
      <circle cx={nx} cy={y(h)} r={6} fill="#2563eb" stroke="#fff" strokeWidth={2.5} data-testid="replay-graph-dot" />
    </svg>
  );
}
