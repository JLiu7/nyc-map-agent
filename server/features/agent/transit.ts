/**
 * Transit planning behind two small interfaces, so the live-transit feature
 * (#56: GTFS static shapes + GTFS-rt) can replace the stub without touching the
 * agent. Until it lands, `stubPlanner` uses MTA open data only:
 *   - stations: data.ny.gov 39hk-dx4f (routes served, structure, coordinates)
 *   - entrances/exits: data.ny.gov i9wp-a4ja (MTA Subway Entrances and Exits)
 * and draws the ride as a straight line between stations (flagged
 * `geometrySource: "straight-line"`). Car position is not in MTA open data, so
 * the plan never advises which car to board.
 */
import { z } from "zod";
import type { LngLatTuple } from "../../../src/features/agent/schema";

export interface Station {
  id: string; complexId: string; name: string; routes: string[]; structure: string; at: LngLatTuple;
  /** GTFS stop id (what alert entities and live feeds use) and the direction labels riders see (#361). */
  gtfsId?: string; north?: string; south?: string;
  /** M, Bk, Q, Bx or SI, as the MTA's station list writes it. */
  borough?: string;
}
export interface Entrance { complexId: string; at: LngLatTuple; type: string; entry: boolean; exit: boolean }

/** What the transit worker's entrances module must expose. */
export interface StationEntrances {
  stations(): Promise<Station[]>;
  entrances(complexId: string): Promise<Entrance[]>;
}

export interface RidePlan {
  from: Station;
  to: Station;
  route: string;
  coords: LngLatTuple[];
  stops: Array<{ at: LngLatTuple; text: string }>;
  durationS: number;
  geometrySource: "gtfs-shape" | "straight-line";
}
export type AvoidStop = (station: Station, route: string, from: Station, to: Station) => boolean;
export interface TransitPlan { rides: RidePlan[]; walkToM: number; walkFromM: number }

/** What the transit worker's planner must expose. */
export interface TransitPlanner {
  /** `avoid(station, route, from, to)`: true when the route's trains do not stop at `station` heading from → to (skips, #253). */
  plan(origin: LngLatTuple, destination: LngLatTuple, departAt: Date, avoid?: AvoidStop): Promise<TransitPlan | null>;
}

const R = 6371000;
export function distM(a: LngLatTuple, b: LngLatTuple): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Compass octant of b as seen from a: "NE", "S", … */
export function octant(a: LngLatTuple, b: LngLatTuple): string {
  const dx = (b[0] - a[0]) * Math.cos((a[1] * Math.PI) / 180);
  const dy = b[1] - a[1];
  const deg = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
  return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(deg / 45) % 8];
}

const stationRow = z.object({ station_id: z.string(), complex_id: z.string(), stop_name: z.string(), daytime_routes: z.string(), structure: z.string(), gtfs_latitude: z.string(), gtfs_longitude: z.string(), gtfs_stop_id: z.string().optional(), borough: z.string().optional(), north_direction_label: z.string().optional(), south_direction_label: z.string().optional() });
const entranceRow = z.object({ complex_id: z.string(), entrance_type: z.string(), entry_allowed: z.string(), exit_allowed: z.string(), entrance_latitude: z.string(), entrance_longitude: z.string() });

let stationCache: Promise<Station[]> | null = null;
let entranceCache: Promise<Entrance[]> | null = null;

async function socrata<T>(id: string, schema: z.ZodType<T>): Promise<T[]> {
  const res = await fetch(`https://data.ny.gov/resource/${id}.json?$limit=5000`, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`data.ny.gov ${id} returned ${res.status}`);
  return z.array(schema).parse(await res.json());
}

export const openDataEntrances: StationEntrances = {
  stations() {
    stationCache ??= socrata("39hk-dx4f", stationRow).then((rows) =>
      rows.map((r) => ({ id: r.station_id, complexId: r.complex_id, name: r.stop_name, routes: r.daytime_routes.split(/\s+/).filter(Boolean), structure: r.structure, at: [Number(r.gtfs_longitude), Number(r.gtfs_latitude)] as LngLatTuple, gtfsId: r.gtfs_stop_id, borough: r.borough, north: r.north_direction_label, south: r.south_direction_label })),
    ).catch((e) => { stationCache = null; throw e; });
    return stationCache;
  },
  async entrances(complexId) {
    entranceCache ??= socrata("i9wp-a4ja", entranceRow).then((rows) =>
      rows.map((r) => ({ complexId: r.complex_id, at: [Number(r.entrance_longitude), Number(r.entrance_latitude)] as LngLatTuple, type: r.entrance_type, entry: r.entry_allowed === "YES", exit: r.exit_allowed === "YES" })),
    ).catch((e) => { entranceCache = null; throw e; });
    return (await entranceCache).filter((e) => e.complexId === complexId);
  },
};

const WALK_MPS = 1.35;
const TRAIN_MPS = 9; // ~32 km/h average including dwell
const DWELL_S = 30;

function ride(from: Station, to: Station, route: string, all: Station[]): RidePlan {
  const len = distM(from.at, to.at);
  // Stations on this route inside a 450 m corridor, ordered along the line.
  const stops = all
    .filter((s) => s.routes.includes(route) && s.id !== from.id && s.id !== to.id)
    .map((s) => {
      const t = ((s.at[0] - from.at[0]) * (to.at[0] - from.at[0]) + (s.at[1] - from.at[1]) * (to.at[1] - from.at[1])) /
        ((to.at[0] - from.at[0]) ** 2 + (to.at[1] - from.at[1]) ** 2 || 1);
      const p: LngLatTuple = [from.at[0] + t * (to.at[0] - from.at[0]), from.at[1] + t * (to.at[1] - from.at[1])];
      return { s, t, off: distM(p, s.at) };
    })
    .filter((x) => x.t > 0 && x.t < 1 && x.off < 450)
    .sort((a, b) => a.t - b.t);
  return {
    from, to, route,
    coords: [from.at, to.at],
    stops: stops.map(({ s }) => ({ at: s.at, text: s.name })),
    durationS: (len * 1.2) / TRAIN_MPS + DWELL_S * stops.length,
    geometrySource: "straight-line",
  };
}

export function stubPlanner(src: StationEntrances = openDataEntrances): TransitPlanner {
  return {
    async plan(origin, destination, _departAt, avoid = () => false) {
      // Board and exit only where the train stops in the direction of travel.
      const ok = (a: Station, b: Station, r: string) => !avoid(a, r, a, b) && !avoid(b, r, a, b);
      const all = await src.stations();
      const near = (p: LngLatTuple) => all.map((s) => ({ s, d: distM(p, s.at) })).filter((x) => x.d < 1500).sort((a, b) => a.d - b.d).slice(0, 6);
      const A = near(origin);
      const B = near(destination);
      if (!A.length || !B.length || distM(origin, destination) < 900) return null;
      let best: { cost: number; plan: TransitPlan } | null = null;
      const consider = (cost: number, plan: TransitPlan) => { if (!best || cost < best.cost) best = { cost, plan }; };
      for (const a of A) for (const b of B) {
        for (const r of a.s.routes) if (b.s.routes.includes(r) && ok(a.s, b.s, r)) {
          const p = ride(a.s, b.s, r, all);
          consider(a.d / WALK_MPS + b.d / WALK_MPS + p.durationS, { rides: [p], walkToM: a.d, walkFromM: b.d });
        }
      }
      if (!best) {
        // One transfer at a complex served by a route from A and a route from B.
        for (const a of A.slice(0, 3)) for (const b of B.slice(0, 3)) for (const x of all) {
          const r1 = a.s.routes.find((r) => x.routes.includes(r));
          if (!r1) continue;
          const y = all.find((s) => s.complexId === x.complexId && s.routes.some((r) => b.s.routes.includes(r)));
          const r2 = y?.routes.find((r) => b.s.routes.includes(r));
          if (!y || !r2 || r2 === r1 || !ok(a.s, x, r1) || !ok(y, b.s, r2)) continue;
          const p1 = ride(a.s, x, r1, all);
          const p2 = ride(y, b.s, r2, all);
          consider(a.d / WALK_MPS + b.d / WALK_MPS + p1.durationS + p2.durationS + 240, { rides: [p1, p2], walkToM: a.d, walkFromM: b.d });
        }
      }
      return (best as { plan: TransitPlan } | null)?.plan ?? null;
    },
  };
}
