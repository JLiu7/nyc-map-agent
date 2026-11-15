import type { TransitAlert } from "./hooks";

/**
 * How much a notice disrupts a ride (owner, 2026-11-14: "skips, trains not available and things like that should
 * be prioritized more and sorted rather than random sort"). One ranking for a line's notices and for the Lines
 * list's status. Pure.
 */
export type Trouble = "suspended" | "skip" | "reroute" | "delay" | "other";
/** 1 no trains on a stretch · 2 trains skip stops or run another way · 3 delays and slow service · 4 anything else · 5 elevators and escalators. */
export const RANK: Record<Trouble | "outage", number> = { suspended: 1, skip: 2, reroute: 2, delay: 3, other: 4, outage: 5 };

const bare = (s: string) => s.replace(/\[([A-Z0-9]+)\]/g, "$1");
const ONE_WAY = /-bound|\buptown\b|\bdowntown\b/i;
const NO_TRAINS = /\bno (?:[A-Z0-9]{1,3} )?(?:trains? |service )?(?:between|at)\b|\bsuspended\b/i;

/** What an alert does to `route` (or to any of its routes), by its headline first, then the feed's own type. */
export function alertTrouble(a: TransitAlert, route?: string): Trouble {
  const head = bare(a.text);
  const mine = (a.changes ?? []).filter((c) => !route || c.route === route);
  // Another service's trouble told to this line's riders (the JFK AirTrain) is not the line's own.
  if (/airtrain/i.test(head)) return "other";
  // A delay's description may recall planned work; only its own headline counts.
  if (a.kind === "delay") return /\bno (?:[A-Z0-9]{1,3} )?(?:trains? |service )?between\b|\bsuspended\b/i.test(head) ? "suspended" : /\bskips?\b|\bbypass/i.test(head) ? "skip" : "delay";
  if (mine.some((c) => c.kind === "suspended") || (a.replacement?.length ?? 0) > 0 || /suspend|substitute bus|no scheduled service/i.test(a.type) || (NO_TRAINS.test(head) && !ONE_WAY.test(head))) return "suspended";
  // "No Inwood-bound A at High St" is a skip one way, not a suspension.
  if (mine.some((c) => c.kind === "skip") || /stops skipped/i.test(a.type) || /\bskips?\b/i.test(head) || (/\bno\b/i.test(head) && ONE_WAY.test(head) && /\bat\b/i.test(head))) return "skip";
  if (a.reroute || /reroute|detour|express to local|local to express/i.test(a.type) || /\bruns? via\b|\brerouted\b|\bruns? (?:express|local)\b/i.test(head)) return "reroute";
  if (/delay|reduced service|slow|cancel/i.test(a.type) || /\bdelays?\b|\bruns? (?:approximately )?every\b/i.test(head)) return "delay";
  return "other";
}

/** Most disruptive first; within a rank what is in effect now, then what started first. Stable beyond that. */
export function byRank<T extends { rank: number; start?: number }>(list: T[], nowS: number): T[] {
  const later = (x: T) => (x.start !== undefined && x.start > nowS ? 1 : 0);
  return list.map((x, i) => ({ x, i })).sort((p, q) => p.x.rank - q.x.rank || later(p.x) - later(q.x) || (p.x.start ?? 0) - (q.x.start ?? 0) || p.i - q.i).map((p) => p.x);
}
