import { formatStreetText } from "@/lib/streetName";
import type { TransitAlert } from "./hooks";

/**
 * The followed bus's next stop, by name, for the mini map. The trip's own first call when it has
 * loaded (the stop the follow card shows), else the route's stop with the id the live feed gives
 * ("405056" in the feed, "MTA_405056" on the route). Null when neither names it: never a bare id.
 */
export function busNextName(firstCall: string | undefined, stops: ReadonlyArray<{ id: string; name: string }> | undefined, next: string | undefined): string | null {
  const bare = (id: string) => id.replace(/^MTA_/, "");
  const name = firstCall || (next ? stops?.find((st) => bare(st.id) === bare(next))?.name : undefined);
  return name ? formatStreetText(name) : null;
}

/** Delays and notices for one route. A detour that is not planned work counts as a delay. */
export function classifyRouteAlerts(alerts: TransitAlert[], route: string): { delays: TransitAlert[]; notices: TransitAlert[] } {
  const mine = alerts.filter((a) => a.routes.includes(route));
  return {
    delays: mine.filter((a) => a.kind === "delay" || (a.reroute && a.kind !== "planned" && a.kind !== "notice")),
    notices: mine.filter((a) => a.kind === "notice" || a.kind === "planned"),
  };
}

const when = (t: number) => new Date(t * 1000).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** Active period from the alert, or null when the feed gives no time. */
export function alertTimeLabel(a: { period?: string; start?: number; end?: number } | undefined): string | null {
  if (!a) return null;
  if (a.period?.trim()) return a.period.trim();
  if (a.start && a.end) return `${when(a.start)} – ${when(a.end)}`;
  if (a.start) return `${when(a.start)} until further notice`;
  return null;
}

/** Station names a skip change names for this route. */
export function skipNamesFor(a: TransitAlert | undefined, route: string): string[] {
  if (!a) return [];
  const named = (a.changes ?? []).filter((c) => c.kind === "skip" && c.route === route).flatMap((c) => c.names);
  const names = named.length ? named : (a.skipNames ?? []);
  return [...new Set(names)];
}

/** Alert text without the "[F]" brackets. */
export const plainAlert = (s: string) => s.replace(/\[([A-Z0-9]+)\]/g, "$1");

/**
 * The trip's stops from the train's next stop on. Times alone kept a stop the train had just
 * left for 30 s, listed above the next stop. Without a known next stop, the times decide.
 */
export function upcomingStops<T extends readonly [string, number, ...unknown[]]>(stops: readonly T[], next: string | undefined, now: number, same: (a: string, b: string) => boolean = (a, b) => a === b): T[] {
  const at = next ? stops.findIndex(([id]) => same(id, next)) : -1;
  return at >= 0 ? stops.slice(at) : stops.filter(([, t]) => t >= now - 30);
}
