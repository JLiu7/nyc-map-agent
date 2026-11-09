import { useSyncExternalStore } from "react";
import { stationOf, type StaticSystem } from "./model";
import type { TransitAlert } from "./hooks";
import { otherDirection, sameStation, towardEnd } from "@/lib/transit/serviceChanges";

/**
 * Alert focus (#253): which service alert the map is showing, and the pure
 * geometry for it — the affected stretch of each line, the skipped stations
 * and the reroute path over the "via" lines (e.g. the F via the E and A).
 */
let focused: TransitAlert | null = null;
const subs = new Set<() => void>();
export function setAlertFocus(a: TransitAlert | null): void {
  focused = a;
  subs.forEach((f) => f());
}
export const getAlertFocus = (): TransitAlert | null => focused;
export function useAlertFocus(): TransitAlert | null {
  return useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), () => focused, () => focused);
}

/**
 * The notice walk's current step (#55): the map frames these stations, marks the shuttle bus corners
 * with the MTA's own words, and shows the buses a travel tip names. Null between steps and when it stops.
 */
type WalkFocus = { ids: string[]; corners: Array<{ id: string; text: string }>; bus: string[] };
let walk: WalkFocus | null = null;
const walkSubs = new Set<() => void>();
export function setWalkFocus(w: WalkFocus | null): void {
  walk = w;
  walkSubs.forEach((f) => f());
}
export function useWalkFocus(): WalkFocus | null {
  return useSyncExternalStore((f) => (walkSubs.add(f), () => walkSubs.delete(f)), () => walk, () => walk);
}

type Pos = [number, number];
export type AlertGeometry = {
  /** Affected stretch of each informed line. */
  affected: Array<{ route: string; coords: Pos[] }>;
  /** Stations the alert takes out of service. */
  skipped: Array<{ id: string; name: string; coord: Pos }>;
  /** Where the trains run instead, as dashed paths. */
  reroute: Array<{ route: string; coords: Pos[] }>;
  /** [[west, south], [east, north]] around everything above, or null. */
  bounds: [Pos, Pos] | null;
  /** "No [M] between A and B": no trains run on `affected`, so it is drawn broken, not highlighted. */
  suspended: boolean;
  /** The two ends of a suspension, where a replacement shuttle picks people up. */
  ends: Array<{ name: string; coord: Pos }>;
};

/** "No [M] between Myrtle Av (Broadway) and Delancey St-Essex St" -> the two end names. */
export function suspendedBetween(text: string): [string, string] | null {
  const m = /^No \[?[\w-]+\]? (?:trains? )?between (.+?) and (.+?)(?:\n|$)/i.exec(text.trim());
  return m ? [m[1].trim(), m[2].trim()] : null;
}

/** Metres between two lon/lat points (equirectangular; fine at city scale). */
function dist(a: Pos, b: Pos): number {
  const k = Math.cos((a[1] * Math.PI) / 180);
  return Math.hypot((a[0] - b[0]) * k, a[1] - b[1]) * 111_320;
}
function nearestIndex(c: Pos[], p: Pos, from = 0, to = c.length - 1): number {
  let best = from, bd = Infinity;
  for (let i = Math.max(0, from); i <= Math.min(c.length - 1, to); i++) {
    const d = dist(c[i], p);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}
const slice = (c: Pos[], i: number, j: number): Pos[] => c.slice(Math.min(i, j), Math.max(i, j) + 1);

/** Station ids the alert takes out: names from "skips …" / "No service at …" first, else informed stop ids. */
export function skippedStations(a: TransitAlert, sys: StaticSystem, route: string): string[] {
  const onRoute = sys.stopM[route] ?? {};
  const names = [...(a.changes ?? []).filter((c) => c.kind === "skip" && c.route === route).flatMap((c) => c.names), ...(a.skipNames ?? [])];
  if (names.length) {
    const hit = sys.stations.features.filter((f) => f.properties.id in onRoute && names.some((n) => sameStation(n, f.properties.name))).map((f) => f.properties.id);
    if (hit.length) return hit;
  }
  return [...new Set(a.stops.map((s) => stationOf(sys.system, s)).filter((id) => id in onRoute))];
}

type End = { name: string; at: Pos; m: number };
/** The two terminals of a route: [low-m end, high-m end]. */
export function routeEnds(sys: StaticSystem, route: string): End[] {
  const sm = sys.stopM[route];
  if (!sm) return [];
  const byId = new Map(sys.stations.features.map((f) => [f.properties.id, f]));
  const ids = Object.entries(sm).filter(([id]) => byId.has(id)).sort((x, y) => x[1] - y[1]);
  if (ids.length < 2) return [];
  return [ids[0], ids[ids.length - 1]].map(([id, m]) => ({ name: byId.get(id)!.properties.name, at: byId.get(id)!.geometry.coordinates as Pos, m }));
}

export type StationSkip = { route: string; alertId: string; toward: string | null; other: string; end: 0 | 1 | null; label: string };
export type StationChange = { skips: StationSkip[]; platform: Array<{ route: string; alertId: string; notice: string }> };
/**
 * Per-station effects of every active alert: direction-aware skips and
 * platform changes. `end` is the line end the skipped trains head to
 * (0 = low stopM end, 1 = high); null = skipped both ways.
 */
export function stationChanges(alerts: TransitAlert[], sys: StaticSystem): Map<string, StationChange> {
  const out = new Map<string, StationChange>();
  const at = (id: string) => { let c = out.get(id); if (!c) out.set(id, (c = { skips: [], platform: [] })); return c; };
  for (const a of alerts) {
    for (const ch of a.changes ?? []) {
      const sm = sys.stopM[ch.route];
      // A suspension names the ends of the gap, which still have service.
      if (!sm || ch.kind === "suspended") continue;
      const ids = sys.stations.features.filter((f) => f.properties.id in sm && ch.names.some((n) => sameStation(n, f.properties.name))).map((f) => f.properties.id);
      if (ch.kind === "platform") { for (const id of ids) at(id).platform.push({ route: ch.route, alertId: a.id, notice: ch.notice }); continue; }
      const ends = routeEnds(sys, ch.route);
      const end = towardEnd(ch.toward, ends);
      const other = ch.toward ? otherDirection(ch.toward, ends) : "";
      const label = ch.toward && end !== null ? `Skipped ${ch.toward}-bound · ${other}-bound stops` : "Skipped both directions";
      for (const id of ids) at(id).skips.push({ route: ch.route, alertId: a.id, toward: end === null ? null : ch.toward, other, end, label });
    }
  }
  return out;
}
/** Is this station skipped for a train on `route` heading to line end `end` (0 low-m, 1 high-m)? */
export function isSkipped(c: StationChange | undefined, route: string, end: 0 | 1): boolean {
  return Boolean(c?.skips.some((s) => s.route === route.replace(/X$/, "") && (s.end === null || s.end === end)));
}

/**
 * Path over the via lines from `from` to `to`: ride each via line from the
 * current point to where it meets the next one (the shared point nearest the
 * destination), then on to the destination on the last line.
 */
export function reroutePath(sys: StaticSystem, via: string[], from: Pos, to: Pos, meetM = 80): Array<{ route: string; coords: Pos[] }> {
  const out: Array<{ route: string; coords: Pos[] }> = [];
  let at = from;
  via.forEach((r, k) => {
    const c = sys.shapes[r]?.c as Pos[] | undefined;
    if (!c || c.length < 2) return;
    const i0 = nearestIndex(c, at);
    const iEnd = nearestIndex(c, to);
    let j = iEnd;
    const next = sys.shapes[via[k + 1]]?.c as Pos[] | undefined;
    if (next) {
      const step = Math.max(1, Math.floor(next.length / 1500));
      let bd = Infinity;
      for (let i = Math.min(i0, iEnd); i <= Math.max(i0, iEnd); i++) {
        let near = false;
        for (let n = 0; n < next.length && !near; n += step) near = dist(c[i], next[n]) < meetM;
        if (near && dist(c[i], to) < bd) { bd = dist(c[i], to); j = i; }
      }
    }
    const coords = slice(c, i0, j);
    if (coords.length > 1) out.push({ route: r, coords });
    at = c[j];
  });
  return out;
}

/** Words of a station name worth matching ("61 St-Woodside" -> "61 st", "woodside"). */
const nameParts = (name: string): string[] => name.toLowerCase().split(/[-/]/).map((x) => x.trim()).filter((x) => x.length >= 3 || /\d/.test(x));
const hasPhrase = (text: string, part: string) => new RegExp(`(^|[^a-z0-9])${part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`).test(text);

/**
 * Stations on `route` that the alert text names: every part of the station's
 * name appears in the text, in any order ("Woodside-61 St" finds 61 St-Woodside).
 */
export function namedStations(text: string, sys: StaticSystem, route: string): string[] {
  const sm = sys.stopM[route];
  if (!sm || !text) return [];
  const t = text.toLowerCase().replace(/\[([a-z0-9]+)\]/g, "$1");
  return sys.stations.features
    .filter((f) => f.properties.id in sm)
    .filter((f) => { const parts = nameParts(f.properties.name); return parts.length > 0 && parts.every((p) => hasPhrase(t, p)); })
    .map((f) => f.properties.id);
}

export function alertGeometry(a: TransitAlert, sys: StaticSystem): AlertGeometry {
  const g: AlertGeometry = { affected: [], skipped: [], reroute: [], bounds: null, suspended: false, ends: [] };
  const byId = new Map(sys.stations.features.map((f) => [f.properties.id, f]));
  const seen = new Set<string>();
  const between = suspendedBetween(a.text);
  for (const route of a.routes) {
    if (between && suspension(g, sys, route, between)) continue;
    const shape = sys.shapes[route], sm = sys.stopM[route];
    if (!shape || !sm) continue;
    const c = shape.c as Pos[];
    const ids = skippedStations(a, sys, route);
    for (const id of ids) {
      const f = byId.get(id);
      if (f && !seen.has(id)) { seen.add(id); g.skipped.push({ id, name: f.properties.name, coord: f.geometry.coordinates as Pos }); }
    }
    // No skipped stops: the stations the alert names on this line ("no 7 at
    // Flushing-Main St") frame it, so the map zooms in instead of showing the whole line.
    const named = ids.length ? [] : namedStations(a.text, sys, route);
    const ms = [...ids, ...named].map((id) => sm[id]).filter((m): m is number => m !== undefined);
    if (!ms.length) { g.affected.push({ route, coords: c }); continue; } // whole-line alert
    // Stretch from the stop before the first affected one to the stop after the last.
    const all = Object.values(sm).sort((x, y) => x - y);
    const lo0 = Math.min(...ms), hi0 = Math.max(...ms);
    const lo = [...all].reverse().find((m) => m < lo0) ?? lo0;
    const hi = all.find((m) => m > hi0) ?? hi0;
    const idx = c.map((_, i) => i).filter((i) => shape.m[i] >= lo && shape.m[i] <= hi);
    if (idx.length > 1) g.affected.push({ route, coords: idx.map((i) => c[i]) });
    if (a.via?.length && idx.length > 1 && route === a.routes[0]) {
      // Start from whichever end of the stretch the first via line passes closest to.
      let from = c[idx[0]], to = c[idx[idx.length - 1]];
      const first = sys.shapes[a.via[0]]?.c as Pos[] | undefined;
      if (first && dist(first[nearestIndex(first, to)], to) < dist(first[nearestIndex(first, from)], from)) [from, to] = [to, from];
      g.reroute.push(...reroutePath(sys, a.via, from, to));
    }
  }
  const pts = [...g.affected.flatMap((x) => x.coords), ...g.skipped.map((s) => s.coord), ...g.reroute.flatMap((x) => x.coords)];
  if (pts.length) {
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    g.bounds = [[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]];
  }
  return g;
}

/**
 * A suspension on one line: exactly the stretch between the two named ends, the
 * stations strictly inside it skipped, the ends kept (trains still turn there).
 * False when either end is not on this line, so the general rules apply.
 */
function suspension(g: AlertGeometry, sys: StaticSystem, route: string, [from, to]: [string, string]): boolean {
  const shape = sys.shapes[route], sm = sys.stopM[route];
  if (!shape || !sm) return false;
  const on = sys.stations.features.filter((f) => f.properties.id in sm);
  const find = (n: string) => on.find((f) => sameStation(n, f.properties.name));
  const fa = find(from), fb = find(to);
  if (!fa || !fb || fa === fb) return false;
  const lo = Math.min(sm[fa.properties.id], sm[fb.properties.id]), hi = Math.max(sm[fa.properties.id], sm[fb.properties.id]);
  const c = shape.c as Pos[];
  const coords = c.filter((_, i) => shape.m[i] >= lo && shape.m[i] <= hi);
  if (coords.length < 2) return false;
  g.suspended = true;
  g.affected.push({ route, coords });
  for (const f of on) {
    const m = sm[f.properties.id];
    if (m > lo && m < hi && !g.skipped.some((s) => s.id === f.properties.id)) g.skipped.push({ id: f.properties.id, name: f.properties.name, coord: f.geometry.coordinates as Pos });
  }
  for (const f of [fa, fb]) if (!g.ends.some((e) => e.name === f.properties.name)) g.ends.push({ name: f.properties.name, coord: f.geometry.coordinates as Pos });
  return true;
}

/** The words at a suspension's end station: where to change from train to the replacement bus. Pure, for tests. */
export function endLabel(station: string, buses: string[], route: string): string {
  return buses.length ? `Transfer to the ${buses.join(" or ")} bus at ${station}` : `No ${route} past ${station}`;
}

/** Line status for the Lines drawer badge. */
export type LineStatus = "Good service" | "Delays" | "Detour" | "Planned work";
export function lineStatus(alerts: TransitAlert[], route: string): LineStatus {
  const mine = alerts.filter((a) => a.routes.includes(route));
  if (mine.some((a) => a.kind === "delay" && !/maintenance|track work/i.test(a.text))) return "Delays";
  if (mine.some((a) => a.reroute)) return "Detour";
  if (mine.some((a) => a.kind === "planned")) return "Planned work";
  if (mine.some((a) => a.kind === "delay")) return "Delays";
  return "Good service";
}
