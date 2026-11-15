/**
 * Scores the tracker's own predictions (#11). While the observer polls the live
 * feeds, these classes note what the app would predict for a vehicle's arrival
 * at a stop some minutes ahead, then, when the feed shows the vehicle there,
 * how many seconds off that was. Each score carries two predictions: `model`
 * uses the learned times exactly as the client does, `base` is the same
 * prediction with no learned times, so the two can be compared.
 *
 * Subway: `base` is the feed's own arrival time; `model` is `blendStops`
 * (src/features/transit/history.ts, imported, not copied), the blended time
 * that moves the drawn train. The outcome is the vehicle's first "stopped at"
 * report for that stop when the feed gives one, else the last arrival time the
 * feed listed before it dropped the stop.
 *
 * Buses: the feed has no arrival times. When a bus leaves a stop, the time to
 * leave each later stop is predicted the way `deadReckon` in
 * src/features/transit/busEstimate.ts moves it: a leg at cruise speed with
 * gentle acceleration and braking (`legMotion`, `speedFromTravel`, both
 * imported), then the dwell. One thing differs: the client nudges the cruise
 * speed with the bus's last two reports; here the route's default speed stands
 * in for it. The outcome is when the bus is seen leaving that stop.
 *
 * A prediction is opened only if its time lands well before the run ends, so
 * late vehicles are not silently dropped; the ones still open at the end are
 * counted as unresolved.
 */
import { blendStops, type SegmentRow } from "../../../src/features/transit/history";
import { buildShape, defaultSpeed, DWELL_S, legMotion, MAX_SPEED, MIN_SPEED, speedFromTravel, type RouteGeom } from "../../../src/features/transit/busEstimate";
import { BusObserver, type BusPos } from "./busObserve";
import type { TransitTrip } from "./routes";

/** How far ahead a prediction looked, by the default prediction: [from, to) seconds. */
const LEADS = [[60, 180], [180, 360], [360, 600]] as const;
export const leadOf = (seconds: number): number => LEADS.findIndex(([a, b]) => seconds >= a && seconds < b);
/** A prediction must land this long before the run ends, or it is not opened. */
const END_MARGIN_S = 180;

export type Score = {
  /** When the vehicle got there (unix seconds). */
  at: number;
  system: "subway" | "bus";
  route: string;
  dir: number | null;
  /** Where the vehicle was when the prediction was made, and the stop predicted. */
  from: string;
  to: string;
  /** Stop-to-stop stretches between them. */
  legs: number;
  /** Seconds ahead, by the default prediction. */
  lead: number;
  /** Seconds it really took. */
  actual: number;
  /** Predicted minus actual, seconds: with learned times, and without. */
  errModel: number;
  errBase: number;
  /** Fewest samples behind any learned time used; null when none was used (then model = base). */
  learnedN: number | null;
  /** 0: the feed's last listed arrival; 1: the vehicle's "stopped at" report; 2: the bus seen leaving. */
  truth: 0 | 1 | 2;  /** The conditions at the time (conditions.ts), added by the observer before storing; absent in older rows. */
  notice?: boolean | null;
  weather?: string | null;
  traffic?: number | null;
};
export type Tally = { opened: number; resolved: number; unresolved: number };

type Pred = { madeAt: number; from: string; legs: number; base: number; model: number; learnedN: number | null };

type SubwayTrip = { route: string; dir: number | null; order: string[]; arr: Map<string, number>; stopped: Map<string, number>; open: Map<string, Pred[]>; done: Set<string>; seen: number };

export class SubwayScorer {
  private trips = new Map<string, SubwayTrip>();
  private idx = new Map<string, { median: number; n: number }>();
  readonly tally: Tally = { opened: 0, resolved: 0, unresolved: 0 };

  /** `segments`: rows as /api/transit-segments/all serves them, by route. `runEnd`: unix seconds. */
  constructor(segments: Record<string, SegmentRow[]>, private runEnd: number) {
    for (const [route, rows] of Object.entries(segments)) for (const r of rows) if (r.kind === "travel") this.idx.set(`${route}|${r.dir}|${r.from}|${r.to}`, { median: r.median, n: r.n });
  }

  private seg(route: string, dir: number | null, from: string, to: string) {
    return this.idx.get(`${route}|${dir ?? -1}|${from}|${to}`) ?? this.idx.get(`${route}|-1|${from}|${to}`);
  }

  ingest(trips: TransitTrip[], at: number): Score[] {
    const out: Score[] = [];
    const live = new Set<string>();
    for (const t of trips) {
      live.add(t.id);
      let s = this.trips.get(t.id);
      if (!s || s.route !== t.route) this.trips.set(t.id, (s = { route: t.route, dir: t.dir, order: [], arr: new Map(), stopped: new Map(), open: new Map(), done: new Set(), seen: at }));
      // The vehicle's first report of standing at a stop is its arrival there.
      if (t.st === 1 && t.at && !s.stopped.has(t.at)) s.stopped.set(t.at, t.vt && t.vt <= at + 5 && t.vt > at - 300 ? t.vt : at);
      const cur = new Map<string, number>(t.stops.map(([stop, arr]) => [stop, arr]));
      // Stops listed before the first one still listed have been passed.
      const firstLive = s.order.findIndex((id) => cur.has(id));
      for (const stop of firstLive < 0 ? [] : s.order.slice(0, firstLive)) {
        const preds = s.open.get(stop);
        s.open.delete(stop);
        if (!preds) continue;
        const stoppedAt = s.stopped.get(stop);
        const listed = s.arr.get(stop)!;
        // Dropped before it was due with no stop report: a skip or reroute, not an arrival.
        if (stoppedAt === undefined && listed > at + 60) continue;
        const when = stoppedAt ?? listed;
        for (const p of preds) {
          this.tally.resolved++;
          out.push({ at: when, system: "subway", route: s.route, dir: s.dir, from: p.from, to: stop, legs: p.legs, lead: p.base - p.madeAt, actual: when - p.madeAt, errModel: p.model - when, errBase: p.base - when, learnedN: p.learnedN, truth: stoppedAt === undefined ? 0 : 1 });
        }
      }
      // Open predictions for the stops now 1 to 10 minutes away by the feed.
      const pts = t.stops.map(([id, arr, dep]) => ({ id, arr, dep }));
      const blended = blendStops(pts, at, t.route, t.dir, (route, dir, from, to) => this.seg(route, dir, from, to)?.median);
      let learnedN: number | null = null;
      // The first stop is scored too: the blend never moves it, so there model and base are the feed's time.
      for (let i = 0; i < pts.length; i++) {
        const row = i ? this.seg(t.route, t.dir, pts[i - 1].id, pts[i].id) : undefined;
        if (row && row.median > 0) learnedN = Math.min(learnedN ?? Infinity, row.n);
        const base = pts[i].arr, lead = leadOf(base - at), key = `${pts[i].id}|${lead}`;
        // At its origin the feed lists a departure, not an arrival: nothing to score there.
        if (lead < 0 || (i === 0 && t.origin) || s.done.has(key) || s.stopped.has(pts[i].id) || base > this.runEnd - END_MARGIN_S) continue;
        s.done.add(key);
        this.tally.opened++;
        const list = s.open.get(pts[i].id) ?? [];
        list.push({ madeAt: at, from: pts[0].id, legs: i, base, model: blended[i].arr, learnedN });
        s.open.set(pts[i].id, list);
      }
      s.order = [...cur.keys()];
      s.arr = cur;
      s.seen = at;
    }
    for (const [id, s] of this.trips) if (!live.has(id) && at - s.seen > 900) { this.close(s); this.trips.delete(id); }
    return out;
  }

  private close(s: SubwayTrip) { for (const preds of s.open.values()) this.tally.unresolved += preds.length; s.open.clear(); }
  /** Call once after the last poll: what is still open never resolved. */
  finish(): Tally { for (const s of this.trips.values()) this.close(s); return this.tally; }
}

/** Learned bus times for one route, as /api/transit-bus-segments serves them. */
export type BusSegRow = { dir: number; from: string; to: string; kind: "travel" | "dwell"; n: number; median: number };
const stopKey = (id: string) => id.replace(/^MTA_/, "");
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

/** Seconds from leaving one stop to leaving the next, `L` metres on: the client's leg, then the dwell. */
export function busLegSeconds(route: string, L: number, travel?: number, dwell?: number): number {
  const d = dwell !== undefined && dwell >= 0 ? clamp(dwell, 0, 90) : DWELL_S;
  const v = defaultSpeed(route);
  const learned = travel !== undefined ? speedFromTravel(L, travel, d) : undefined;
  const vs = learned ? clamp(0.7 * learned + 0.3 * v, MIN_SPEED, MAX_SPEED) : v;
  return legMotion(L, vs, 0, Infinity)[1] + d;
}

type BusRoute = {
  /** Each drawn line, both ways: its stops in order with metres along it, as the client's estimator builds them. */
  shapes: Array<Array<{ id: string; s: number }>>;
  travel: Map<string, { median: number; n: number }>;
  dwell: Map<string, { median: number; n: number }>;
  /** The stops each direction really serves (a line passes the stops on both kerbs). */
  served: Map<number, Set<string>>;
  /** Where each stop is: [lon, lat]. */
  points: Map<string, [number, number]>;
};
type BusOpen = { to: string } & Pred;

export class BusScorer {
  private routes = new Map<string, BusRoute>();
  private observers = new Map<string, BusObserver>();
  private open = new Map<string, { route: string; dir: number | null; preds: BusOpen[] }>();
  readonly tally: Tally = { opened: 0, resolved: 0, unresolved: 0 };

  constructor(private runEnd: number) {}

  /** Add a route to score: its shape and stops (/api/transit/bus-route) and learned times (/api/transit-bus-segments). */
  setRoute(geom: RouteGeom, segments: BusSegRow[]) {
    const shapes: BusRoute["shapes"] = [];
    for (const line of geom.lines) {
      if (line.length < 2) continue;
      for (const sh of [buildShape(line, geom.stops), buildShape([...line].reverse(), geom.stops)]) {
        if (sh.stops.length > 1) shapes.push(sh.stops.map((st) => ({ id: stopKey(st.id), s: st.s })));
      }
    }
    const travel = new Map<string, { median: number; n: number }>(), dwell = new Map<string, { median: number; n: number }>(), served = new Map<number, Set<string>>();
    for (const s of segments) {
      if (s.kind === "dwell") { dwell.set(s.from, { median: s.median, n: s.n }); continue; }
      travel.set(`${s.from}|${s.to}`, { median: s.median, n: s.n });
      const set = served.get(s.dir) ?? new Set<string>();
      set.add(s.from).add(s.to);
      served.set(s.dir, set);
    }
    const points = new Map<string, [number, number]>(geom.stops.map((st) => [stopKey(st.id), [st.lon, st.lat]]));
    this.routes.set(geom.route, { shapes, travel, dwell, served, points });
  }
  has(route: string) { return this.routes.has(route); }
  /** Where a stop of a scored route is, for the traffic near it. */
  stopPoint(route: string, stop: string): [number, number] | undefined { return this.routes.get(route)?.points.get(stopKey(stop)); }

  /** The stops after `from` on the line that reaches `next` soonest, as the client would walk them. */
  private ahead(r: BusRoute, from: string, next: string): Array<{ id: string; s: number }> {
    let best: Array<{ id: string; s: number }> = [], gap = Infinity;
    for (const sh of r.shapes) {
      const i = sh.findIndex((st) => st.id === from);
      const j = i < 0 ? -1 : sh.findIndex((st, k) => k > i && st.id === next);
      if (j > i && sh[j].s - sh[i].s < gap) { gap = sh[j].s - sh[i].s; best = sh.slice(i); }
    }
    return best;
  }

  ingest(buses: BusPos[]): Score[] {
    const out: Score[] = [];
    for (const b of buses) {
      const r = this.routes.get(b.route);
      if (!r || !b.next) continue;
      // One observer per bus, so each departure it reports is known to be this bus's.
      let obs = this.observers.get(b.id);
      if (!obs) this.observers.set(b.id, (obs = new BusObserver()));
      const st = this.open.get(b.id);
      if (st && (st.route !== b.route || st.dir !== b.dir)) { this.tally.unresolved += st.preds.length; this.open.delete(b.id); }
      for (const o of obs.ingest([b])) {
        if (o.kind !== "travel") continue;
        // The bus has just left `o.to` at `o.at`: settle what was predicted for it, then predict ahead.
        const cur = this.open.get(b.id) ?? { route: b.route, dir: b.dir, preds: [] };
        cur.preds = cur.preds.filter((p) => {
          if (p.to !== o.to) return o.at - p.base <= 900 || (this.tally.unresolved++, false);
          this.tally.resolved++;
          out.push({ at: o.at, system: "bus", route: b.route, dir: b.dir, from: p.from, to: p.to, legs: p.legs, lead: p.base - p.madeAt, actual: o.at - p.madeAt, errModel: p.model - o.at, errBase: p.base - o.at, learnedN: p.learnedN, truth: 2 });
          return false;
        });
        const path = this.ahead(r, o.to, b.next);
        const served = r.served.get(b.dir ?? -1);
        let model = o.at, base = o.at, learnedN: number | null = null;
        const taken = new Set<number>();
        for (let k = 1; k < path.length; k++) {
          const from = path[k - 1], to = path[k];
          // A learned stretch time or a learned dwell both change the prediction, so both count as learned.
          const learned = r.travel.get(`${from.id}|${to.id}`), dwell = r.dwell.get(to.id);
          for (const used of [learned, dwell]) if (used) learnedN = Math.min(learnedN ?? Infinity, used.n);
          model += busLegSeconds(b.route, to.s - from.s, learned?.median, dwell?.median);
          base += busLegSeconds(b.route, to.s - from.s);
          const lead = leadOf(base - o.at);
          if (base - o.at >= LEADS[LEADS.length - 1][1]) break;
          if (lead < 0 || taken.has(lead) || !served?.has(to.id) || base > this.runEnd - END_MARGIN_S) continue;
          taken.add(lead);
          this.tally.opened++;
          cur.preds.push({ to: to.id, madeAt: o.at, from: o.to, legs: k, base, model, learnedN });
        }
        this.open.set(b.id, cur);
      }
    }
    return out;
  }

  finish(): Tally { for (const s of this.open.values()) this.tally.unresolved += s.preds.length; this.open.clear(); return this.tally; }
}

/** At most `cap` items, chosen evenly at random, so one run cannot grow the table without limit. */
export function sample<T>(items: T[], cap: number, random: () => number = Math.random): T[] {
  if (items.length <= cap) return items;
  const a = [...items];
  for (let i = 0; i < cap; i++) { const j = i + Math.floor(random() * (a.length - i)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, cap);
}
