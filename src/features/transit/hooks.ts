import type { ServiceChange } from "@/lib/transit/serviceChanges";
import { keepPreviousData, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "react-router-dom";
import { useIdle } from "@/lib/idle";
import { useBasemapReady } from "@/lib/map/basemapReady";
import { lookupFrom, nyHourOfWeek, type SegmentLookup, type SegmentRow } from "./history";
import type { BusHistory } from "./busEstimate";
import { parseBusCap, parseBusLines } from "@/lib/transit/busReveal";
import { RAIL_SYSTEMS, type Bus, type LiveSystem, type StaticSystem, type SystemId , type XrayStation } from "./model";

const API_BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");
const REFRESH = 15_000;
/** Batched rail + alerts poll; the endpoint is edge-cached for 30 s, so polling faster gains nothing. */
const LIVE_REFRESH = 30_000;

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return (await res.json()) as T;
}

export type TransitLayerId = SystemId | "bus";

/** Live subway is on when the URL says nothing. Buses stay off until picked lines, a trip, or a replacement shuttle ask for them. */
const DEFAULT_TRANSIT = "subway";
const parseTransit = (raw: string | null) =>
  new Set((raw ?? DEFAULT_TRANSIT).split(",").filter((id) => id && id !== "none"));

/**
 * `?transit=subway,lirr` in the URL (absent = subway, `none` = off). `?busLines=Q1,B41` are the picked bus lines (at most 20), `?busCap=3` the buses shown per line, `?busNear=1` that those lines came from a "buses near you" lookup and only their nearby buses show. An old `?busPage=` link still opens that page's lines.
 * `?transitPanel=1` opens the status drawer.
 */
export function useTransitToggles() {
  const [params, setParams] = useSearchParams();
  const on = parseTransit(params.get("transit")) as Set<TransitLayerId>;
  const set = useCallback(
    (id: TransitLayerId, value: boolean) =>
      setParams((prev) => {
        // From the address bar, not the last render, so a trip closing and an answer closing in one tap both stick.
        const next = new URLSearchParams(typeof window === "undefined" ? prev : window.location.search);
        const cur = parseTransit(next.get("transit"));
        if (value) cur.add(id); else cur.delete(id);
        if (id === "bus" && !value) { next.delete("busPage"); next.delete("busLines"); next.delete("busNear"); }
        const joined = cur.size ? [...cur].join(",") : "none";
        if (joined === DEFAULT_TRANSIT) next.delete("transit"); else next.set("transit", joined);
        return next;
      }, { replace: true }),
    [setParams],
  );
  const panelOpen = params.get("transitPanel") === "1";
  const setPanelOpen = useCallback(
    (open: boolean) =>
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        if (open) next.set("transitPanel", "1"); else next.delete("transitPanel");
        return next;
      }, { replace: true }),
    [setParams],
  );
  const busPage = params.get("busPage");
  const busLines = useMemo(() => parseBusLines(params.get("busLines")), [params]);
  const busCap = parseBusCap(params.get("busCap"));
  const busNear = params.get("busNear") === "1";
  /**
   * Picking a line turns Live buses on; clearing the last one leaves it on and empty.
   * `near` marks lines found around you rather than picked: they stay out of focus.
   */
  const setBusLines = useCallback(
    (lines: string[], opts?: { near?: boolean }) =>
      setParams((prev) => {
        // From the address bar, not the last render, so a trip closing and an answer closing in one tap both stick.
        const next = new URLSearchParams(typeof window === "undefined" ? prev : window.location.search);
        const cur = parseTransit(next.get("transit"));
        const clean = parseBusLines(lines.join(","));
        next.delete("busPage");
        if (opts?.near && clean.length) next.set("busNear", "1"); else next.delete("busNear");
        if (clean.length) { cur.add("bus"); next.set("busLines", clean.join(",")); } else next.delete("busLines");
        const joined = cur.size ? [...cur].join(",") : "none";
        if (joined === DEFAULT_TRANSIT) next.delete("transit"); else next.set("transit", joined);
        return next;
      }, { replace: true }),
    [setParams],
  );
  const setBusCap = useCallback(
    (n: number) =>
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        const cap = parseBusCap(String(n));
        if (cap === parseBusCap(null)) next.delete("busCap"); else next.set("busCap", String(cap));
        return next;
      }, { replace: true }),
    [setParams],
  );
  return { on, set, panelOpen, setPanelOpen, busPage, busLines, busNear, setBusLines, busCap, setBusCap };
}

export function useTransitMeta() {
  return useQuery({ queryKey: ["transit", "meta"], queryFn: () => getJson<{ bus: boolean }>(`${API_BASE}/api/transit`), staleTime: 5 * 60_000, retry: 1 });
}

/*
 * Live rail and alerts come from one batched request (/api/transit-live) for
 * the union of what every mounted component asks for, so the map, the status
 * drawer and a card share one poll instead of one per system plus alerts.
 */
type Demand = { systems: SystemId[]; alerts: boolean };
const demands = new Set<Demand>();
const demandListeners = new Set<() => void>();
let demandKey = "";
function emitDemand() {
  const sys = new Set<SystemId>();
  let alerts = false;
  for (const d of demands) { d.systems.forEach((s) => sys.add(s)); alerts ||= d.alerts; }
  const key = sys.size || alerts ? `${RAIL_SYSTEMS.filter((s) => sys.has(s)).join(",")}|${alerts ? 1 : 0}` : "";
  if (key === demandKey) return;
  demandKey = key;
  demandListeners.forEach((l) => l());
}
function subscribeDemand(fn: () => void) {
  demandListeners.add(fn);
  return () => { demandListeners.delete(fn); };
}
function useLiveDemand(systems: SystemId[], alerts: boolean) {
  const sysKey = RAIL_SYSTEMS.filter((s) => systems.includes(s)).join(",");
  useEffect(() => {
    const d: Demand = { systems: sysKey ? (sysKey.split(",") as SystemId[]) : [], alerts };
    demands.add(d);
    emitDemand();
    return () => { demands.delete(d); emitDemand(); };
  }, [sysKey, alerts]);
}

type LiveBatch = { at: number; systems: Partial<Record<SystemId, LiveSystem>>; alerts?: AlertsBody; failed?: string[] };

/** True while some mounted component wants live rail or alerts. */
export function useLiveWanted(): boolean {
  return useSyncExternalStore(subscribeDemand, () => demandKey !== "", () => false);
}

function useLiveBatch() {
  const key = useSyncExternalStore(subscribeDemand, () => demandKey, () => "");
  const { idle } = useIdle();
  const client = useQueryClient();
  const mapShown = useBasemapReady();
  // Waking from idle refreshes at once rather than on the next 30 s tick.
  useEffect(() => {
    if (!idle && key) void client.refetchQueries({ queryKey: ["transit", "live-batch", key], stale: true, type: "active" });
  }, [idle]); // eslint-disable-line react-hooks/exhaustive-deps
  return useQuery({
    queryKey: ["transit", "live-batch", key],
    queryFn: async () => {
      const [systems, alerts] = key.split("|");
      const body = await getJson<LiveBatch>(`${API_BASE}/api/transit-live?${new URLSearchParams({ systems, alerts })}`);
      // A part that failed upstream keeps its last good value instead of blanking the map.
      if (body.failed?.length) {
        const prev = client.getQueryData<LiveBatch>(["transit", "live-batch", key]);
        for (const f of body.failed) {
          if (f === "alerts") body.alerts ??= prev?.alerts;
          else body.systems[f as SystemId] ??= prev?.systems[f as SystemId];
        }
      }
      return body;
    },
    // After the basemap, which needs the connection more on a slow phone (basemapReady.ts).
    enabled: key !== "" && mapShown,
    staleTime: LIVE_REFRESH - 5_000,
    // Idle tab (#369): stop polling until the next interaction.
    refetchInterval: idle ? false : LIVE_REFRESH,
    refetchOnWindowFocus: !idle,
    placeholderData: keepPreviousData,
  });
}

export function useTransitData(systems: SystemId[]) {
  const mapShown = useBasemapReady();
  const statics = useQueries({
    queries: RAIL_SYSTEMS.map((s) => ({
      queryKey: ["transit", "static", s],
      queryFn: () => getJson<StaticSystem>(`/transit/${s}.json`),
      staleTime: Infinity,
      // The subway file is 220 kB; it waits for the basemap (basemapReady.ts). A kept copy still shows at once.
      enabled: systems.includes(s) && mapShown,
    })),
  });
  useLiveDemand(systems, false);
  const live = useLiveBatch().data;
  const out: Partial<Record<SystemId, { stat?: StaticSystem; live?: LiveSystem }>> = {};
  RAIL_SYSTEMS.forEach((s, i) => {
    if (systems.includes(s)) out[s] = { stat: statics[i].data, live: live?.systems[s] };
  });
  return out;
}

/** Live positions for at most one page of routes. An empty list does not ask for the fleet. */
export function useBuses(enabled: boolean, routes: string[]) {
  const list = [...new Set(routes.map((r) => r.toUpperCase()))].sort().slice(0, 20);
  const key = list.join(",");
  const { idle } = useIdle();
  return useQuery({
    queryKey: ["transit", "bus", key],
    queryFn: () => getJson<{ at: number; buses: Bus[] }>(`${API_BASE}/api/transit/bus?${new URLSearchParams({ routes: key })}`),
    refetchInterval: idle ? false : REFRESH,
    refetchOnWindowFocus: !idle,
    enabled: enabled && list.length > 0,
    retry: false,
  });
}

type BusPage = { id: string; label: string; routes: string[] };
type BusGroup = { id: string; label: string; pages: BusPage[] };
/** Borough pages. Fetched when the filter is open or a page is already selected, so the list stays out of the bundle. */
export function useBusLines(enabled: boolean) {
  return useQuery({
    queryKey: ["transit", "bus-lines"],
    queryFn: () => getJson<{ groups: BusGroup[] }>(`${API_BASE}/api/transit/bus-lines`),
    staleTime: Infinity,
    enabled,
    retry: 1,
  });
}
let catalogOnce: Promise<string[]> | null = null;
/** Every bus route id from the borough catalog, fetched once (a failure lets the next ask retry). */
export function fetchBusCatalog(): Promise<string[]> {
  catalogOnce ??= getJson<{ groups: BusGroup[] }>(`${API_BASE}/api/transit/bus-lines`)
    .then((d) => [...new Set(d.groups.flatMap((g) => g.pages.flatMap((p) => p.routes)))])
    .catch((e: unknown) => { catalogOnce = null; throw e; });
  return catalogOnce;
}
export function routesForPage(groups: BusGroup[] | undefined, pageId: string | null): string[] {
  if (!pageId || !groups) return [];
  for (const g of groups) {
    const page = g.pages.find((p) => p.id === pageId);
    if (page) return page.routes;
  }
  return [];
}

export type BusCall = { id: string; name: string; eta: number | null; away: string };
export type BusTrip = { found: boolean; route?: string; destination?: string; dir?: string; calls?: BusCall[] };
export type BusRoute = { route: string; lines: Array<Array<[number, number]>>; offsets?: number[][]; stops: Array<{ id: string; name: string; lon: number; lat: number }> };
/** One bus's headsign and upcoming stops with ETAs (SIRI), while its sheet is open. */
export function useBusTrip(vehicle: string | undefined) {
  const { idle } = useIdle();
  return useQuery({
    queryKey: ["transit", "bus-trip", vehicle],
    queryFn: () => getJson<BusTrip>(`${API_BASE}/api/transit/bus-trip?${new URLSearchParams({ vehicle: vehicle ?? "" })}`),
    refetchInterval: idle ? false : REFRESH,
    refetchOnWindowFocus: !idle,
    enabled: Boolean(vehicle),
    retry: false,
  });
}
export type BusStopInfo = { id: string; name: string; lat: number; lon: number; dir: string; routes: string[] };
/** `vehicle` is the live feed's bus id ("MTA NYCT_7225"), so a row can follow its bus; empty when the MTA leaves it out. */
export type BusArrival = { route: string; destination: string; vehicle?: string; eta: number | null; away: string };
/** The routes serving the most of these stops, busiest first, at most `max`. Pure, for tests. */
export function routesFromStops(stops: Pick<BusStopInfo, "routes">[], max = 6): string[] {
  const count = new Map<string, number>();
  for (const s of stops) for (const r of new Set(s.routes)) count.set(r, (count.get(r) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, max).map(([r]) => r);
}
/**
 * The bus-stops query for a point. The server takes at most 12 characters per coordinate, and a
 * map centre is often `40.7000000000011`, a 400 that made Live buses look dead (owner, 2026-10-27);
 * five decimals is about a metre.
 */
export function busStopsQuery(point: { lon: number; lat: number }): string {
  return new URLSearchParams({ lat: point.lat.toFixed(5), lon: point.lon.toFixed(5) }).toString();
}
async function stopsNear(point: { lon: number; lat: number }): Promise<BusStopInfo[]> {
  const { stops } = await getJson<{ stops: BusStopInfo[] }>(`${API_BASE}/api/transit/bus-stops?${busStopsQuery(point)}`);
  return stops ?? [];
}
/** About 700 m north-south in degrees; east-west is scaled for New York's latitude. */
const RING_DEG = 0.0063;
const RING = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [0.7, -0.7], [-0.7, 0.7], [-0.7, -0.7]] as const;
/**
 * Bus routes near a point, for the Live buses switch: no picking a line first. The server looks
 * about 300 m out; over a park, a creek or the river that finds nothing, so a ring of points
 * about 700 m away is asked next (owner, 2026-10-27: the switch looked dead over Newtown Creek).
 */
export async function fetchBusRoutesNear(point: { lon: number; lat: number }, max = 6): Promise<string[]> {
  const near = await stopsNear(point);
  if (near.length) return routesFromStops(near, max);
  const ring = await Promise.all(RING.map(([dy, dx]) => stopsNear({ lat: point.lat + dy * RING_DEG, lon: point.lon + dx * RING_DEG * 1.32 }).catch(() => [])));
  return routesFromStops(ring.flat(), max);
}
/** Stops around a tapped point with the routes serving each (grid-cached on the server). */
export function useBusStopsNear(point: { lon: number; lat: number } | undefined) {
  return useQuery({
    queryKey: ["transit", "bus-stops", point && point.lat.toFixed(3), point && point.lon.toFixed(3)],
    queryFn: () => getJson<{ stops: BusStopInfo[] }>(`${API_BASE}/api/transit/bus-stops?${busStopsQuery(point!)}`),
    staleTime: 3600_000,
    enabled: Boolean(point),
    retry: false,
  });
}
/** Next buses at one stop, refreshed while its sheet is open. */
export function useBusArrivals(stop: string | undefined) {
  const { idle } = useIdle();
  return useQuery({
    queryKey: ["transit", "bus-arrivals", stop],
    queryFn: () => getJson<{ arrivals: BusArrival[] }>(`${API_BASE}/api/transit/bus-arrivals?${new URLSearchParams({ stop: stop ?? "" })}`),
    // Paused with the rest of live data on an idle tab (#369).
    refetchInterval: idle ? false : REFRESH,
    enabled: Boolean(stop),
    retry: false,
  });
}
/** Shapes and stops for the routes of buses near the view, for the motion estimator (shares the bus-route cache). */
export function useBusShapes(routes: string[]): BusRoute[] {
  const qs = useQueries({
    queries: routes.map((route) => ({
      queryKey: ["transit", "bus-route", route],
      queryFn: () => getJson<BusRoute>(`${API_BASE}/api/transit/bus-route?${new URLSearchParams({ route })}`),
      staleTime: 6 * 3600_000,
      retry: 1,
    })),
  });
  const ready = qs.filter((q) => q.data).map((q) => q.data!);
  const key = ready.map((r) => r.route).join(",");
  return useMemo(() => ready, [key]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** A bus route's shape and stops, fetched on demand when the route is selected. */
export function useBusRoute(route: string | undefined) {
  return useQuery({
    queryKey: ["transit", "bus-route", route],
    queryFn: () => getJson<BusRoute>(`${API_BASE}/api/transit/bus-route?${new URLSearchParams({ route: route ?? "" })}`),
    staleTime: 6 * 3600_000,
    enabled: Boolean(route),
    retry: false,
  });
}
/** Routes with an active, unplanned delay or detour (not planned work or notices): these get the '!' badge. */
export function alertedRoutes(alerts: TransitAlert[] | undefined): Set<string> {
  return new Set((alerts ?? []).filter((a) => a.kind === "delay" || (a.reroute && a.kind !== "planned")).flatMap((a) => a.routes));
}
export type TransitAlert = {
  id: string; kind: "planned" | "delay" | "notice"; type: string; reroute: boolean; text: string; agency: string; routes: string[]; stops: string[];
  /** Added in #253; optional so older cached payloads still parse. */
  description?: string; start?: number; end?: number; period?: string; direction?: string; directionIds?: number[]; via?: string[]; skipNames?: string[]; changes?: ServiceChange[];
  /** Bus routes standing in for this train, when the alert names a shuttle. */
  replacement?: string[];
  /** The MTA's note for each affected station, usually where its shuttle bus stops (#55). */
  alternatives?: Array<{ stop: string; notes: string }>;
};
export type Outage = { id: string; station: string; routes: string[]; stops: string[]; equipment: "Elevator" | "Escalator"; serving: string; reason: string; since: string; back: string; ada: "yes" | "no" | "not-ada"; alternative: string };
type AlertsBody = { at: number; alerts: TransitAlert[]; outages: Outage[] };
/** Service alerts and outages, carried in the batched live request (same poll as live rail). */
export function useAlerts(enabled: boolean): { data: AlertsBody | undefined } {
  useLiveDemand([], enabled);
  const data = useLiveBatch().data?.alerts;
  return { data: enabled ? data : undefined };
}

/** Planned work in effect at any time in a chosen window (the line panel's "This weekend"); off when `day` is null. */
export function useAlertsBetween(day: { from: number; to: number } | null): { data: AlertsBody | undefined; isLoading: boolean } {
  const q = useQuery({
    queryKey: ["transit", "alerts", day?.from, day?.to],
    queryFn: () => getJson<AlertsBody>(`${API_BASE}/api/transit/alerts?from=${day!.from}&to=${day!.to}`),
    enabled: Boolean(day), staleTime: 5 * 60_000, retry: 1,
  });
  return { data: day ? q.data : undefined, isLoading: Boolean(day) && q.isLoading };
}

/** Seconds clock that ticks every second, for countdowns between feed refreshes. */
export function useNow(active = true): number {
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

// Starred stations ("subway:G22") and lines ("subway:G"), kept in localStorage.
const STAR_KEY = "nma.transit.starred";
const NOTIFY_KEY = "nma.transit.notify";
const listeners = new Set<() => void>();
const readStars = () => localStorage.getItem(STAR_KEY) ?? "[]";
function subscribe(fn: () => void) {
  listeners.add(fn);
  window.addEventListener("storage", fn);
  return () => { listeners.delete(fn); window.removeEventListener("storage", fn); };
}
export function useStarred() {
  const raw = useSyncExternalStore(subscribe, readStars);
  const notifyRaw = useSyncExternalStore(subscribe, () => localStorage.getItem(NOTIFY_KEY) ?? "0");
  const starred = JSON.parse(raw) as string[];
  const toggle = useCallback((key: string) => {
    const cur = JSON.parse(readStars()) as string[];
    localStorage.setItem(STAR_KEY, JSON.stringify(cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]));
    listeners.forEach((l) => l());
  }, []);
  const setNotify = useCallback((on: boolean) => {
    localStorage.setItem(NOTIFY_KEY, on ? "1" : "0");
    listeners.forEach((l) => l());
  }, []);
  return { starred, isStarred: (k: string) => starred.includes(k), toggle, notify: notifyRaw === "1", setNotify };
}

/** Baked station insides for the x-ray view (~60 kB gz), fetched the first time x-ray is opened. */
export function useXrayData(enabled: boolean) {
  return useQuery({ queryKey: ["transit", "xray"], queryFn: () => getJson<Record<string, XrayStation>>("/transit/xray.json"), staleTime: Infinity, enabled });
}

/**
 * Historical subway segment times for the routes on the map, every route in one
 * request (/api/transit-segments/all). The URL pins the New York hour of the
 * week, so the edge caches it for hours and it changes on the hour.
 */
export function useSegmentHistory(routes: string[]): SegmentLookup | undefined {
  const list = [...new Set(routes)].sort().join(",");
  const { dow, hour } = nyHourOfWeek(new Date());
  const q = useQuery({
    queryKey: ["transit", "segments-all", list, dow, hour],
    queryFn: () => getJson<{ routes: Record<string, SegmentRow[]> }>(`${API_BASE}/api/transit-segments/all?${new URLSearchParams({ routes: list, dow: String(dow), hour: String(hour) })}`),
    enabled: list !== "",
    staleTime: Infinity,
    placeholderData: keepPreviousData,
    retry: 0,
  });
  return useMemo(() => (q.data ? lookupFrom(new Map(Object.entries(q.data.routes))) : undefined), [q.data]);
}

type BusSegRow = { dir: number; from: string; to: string; kind: "travel" | "dwell"; n: number; median: number };
/** Learned bus travel and dwell times for these routes at the current hour of week (refetched each 10 min). */
export function useBusSegmentHistory(routes: string[]): BusHistory | undefined {
  const qs = useQueries({
    queries: routes.map((r) => ({
      queryKey: ["transit", "bus-segments", r],
      queryFn: () => getJson<{ segments: BusSegRow[] }>(`${API_BASE}/api/transit-bus-segments?${new URLSearchParams({ route: r })}`),
      staleTime: 10 * 60_000,
      refetchInterval: 10 * 60_000,
      retry: 0,
    })),
  });
  const key = qs.map((q) => q.dataUpdatedAt).join(",");
  return useMemo(() => {
    if (!qs.some((q) => q.data)) return undefined;
    const travel = new Map<string, number>(), dwell = new Map<string, number>();
    routes.forEach((r, i) => {
      for (const s of qs[i].data?.segments ?? []) {
        if (s.kind === "travel") travel.set(`${r}|${s.from}|${s.to}`, s.median);
        else dwell.set(`${r}|${s.from}`, s.median);
      }
    });
    return { travel: (r, a, b) => travel.get(`${r}|${a}|${b}`), dwell: (r, st) => dwell.get(`${r}|${st}`) };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
}
