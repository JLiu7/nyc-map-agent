import { LEVEL_M, type XrayStation } from "./model";
import { setXray } from "@/lib/transit/stationXray";

/** Which subway station is shown in x-ray lives in shared core, so the trip preview can set it too. */
export { getXray, setXray, useXray } from "@/lib/transit/stationXray";

const LEVEL_COLORS = ["#38bdf8", "#a78bfa", "#f472b6", "#fb923c", "#facc15"];
export type Prim = { kind: "area" | "ribbon" | "shaft"; pts: Array<[number, number, number]>; width: number; color: string; order: number };
/** A level's depth in metres (level -1 = one storey down, the mezzanine on most stations). */
const z = (level: number) => Math.min(level, 0) * LEVEL_M;

/** Station insides → x-ray primitives; elevators at a station with an outage are red. */
export function xrayPrims(st: XrayStation, entrances: Array<[number, number]>, elevatorOut: boolean): Prim[] {
  const out: Prim[] = [];
  for (const w of st.ways) {
    const order = 10 + w.from; // shallower on top
    if (w.k === "platform") {
      const closed = w.c.length > 3 && w.c[0][0] === w.c.at(-1)![0] && w.c[0][1] === w.c.at(-1)![1];
      const color = LEVEL_COLORS[Math.min(-w.from - 1, LEVEL_COLORS.length - 1)] ?? LEVEL_COLORS[0];
      out.push({ kind: closed ? "area" : "ribbon", pts: w.c.map(([x, y]) => [x, y, z(w.from)]), width: 4, color, order });
    } else if (w.k === "steps") {
      const n = w.c.length - 1;
      out.push({ kind: "ribbon", pts: w.c.map(([x, y], i) => [x, y, z(w.from) + ((z(w.to) - z(w.from)) * i) / Math.max(n, 1)]), width: 2, color: "#facc15", order: order + 0.5 });
    } else {
      // A corridor traced as a closed outline is a room (a mezzanine, a hall): drawn as its floor, under the platforms.
      const room = w.c.length > 3 && w.c[0][0] === w.c.at(-1)![0] && w.c[0][1] === w.c.at(-1)![1];
      out.push({ kind: room ? "area" : "ribbon", pts: w.c.map(([x, y]) => [x, y, z(w.from)]), width: 1.6, color: "#e2e8f0", order: room ? order - 0.5 : order });
    }
  }
  for (const e of st.elevators) out.push({ kind: "shaft", pts: [[e.lon, e.lat, z(e.from)]], width: 2.2, color: elevatorOut ? "#ef4444" : "#22c55e", order: 20 });
  for (const [x, y] of entrances) out.push({ kind: "shaft", pts: [[x, y, -LEVEL_M]], width: 0.8, color: "#16a34a", order: 19 });
  return out;
}
// Dev-only handle for headless QA.
if (import.meta.env.DEV && typeof window !== "undefined") Object.assign(window, { __xray: setXray });
