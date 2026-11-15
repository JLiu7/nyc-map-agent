/**
 * Bus motion estimator. GTFS-rt reports a bus's GPS about every 30 s; drawing
 * the raw fixes makes buses sit still and then jump. Instead each bus is
 * snapped to its route shape and tracked as distance-along-shape:
 *
 *   - between reports it dead-reckons forward at an estimated cruise speed
 *     (last two reports, clamped, blended with a route default, or with the
 *     learned stop-to-stop speed for this hour of the week when there is one), easing into stops for a typical dwell;
 *   - a new report never teleports it: the displayed position speed-adjusts
 *     toward the new estimate over ~4 s and never moves backward. When it is
 *     ahead of the estimate it waits there for the real bus. Only a real
 *     disagreement (more than 400 m ahead, or very far behind) is shown as a
 *     fade out, a jump and a fade back in;
 *   - a report older than 2 minutes freezes and fades the bus;
 *   - a bus that is not known to be moving is never driven ahead: on first
 *     sight it may run at most 60 m past its report, and one that has stood
 *     still for two reports (a layover at a terminal) is held where it is;
 *   - which way a bus faces comes from how it actually moved and from the
 *     stop it reports as next. The feed's compass bearing is only a first
 *     guess: it swings while a bus is parked, and a swing must not turn the
 *     bus round.
 *
 * Pure TypeScript, no map dependency, so it is unit-tested directly.
 */
export type LonLat = [number, number];
/** `offsets[i][j]`: metres right of vertex j to the travel lane (street-centerline snapped shapes). */
export type RouteGeom = { route: string; lines: LonLat[][]; offsets?: number[][]; stops: Array<{ id: string; lon: number; lat: number }> };
/** `next` is the feed's next stop id, with or without the Bus Time "MTA_" prefix. */
export type BusReport = { id: string; route: string; lon: number; lat: number; bearing: number | null; t: number; next?: string | null };
export type BusFrame = { lon: number; lat: number; bearing: number; alpha: number };
/**
 * Learned times from /api/transit-bus-segments; either may be missing, then defaults apply.
 * Stop ids are GTFS ids without the Bus Time "MTA_" prefix.
 */
export type BusHistory = {
  /** Median seconds from leaving stop `from` to leaving stop `to` (includes the dwell at `to`). */
  travel?: (route: string, from: string, to: string) => number | undefined;
  /** Median dwell (s) at a stop. */
  dwell?: (route: string, stop: string) => number | undefined;
};

/**
 * Cruise speed that makes a braking-and-accelerating leg of L metres take
 * `seconds` (travel minus dwell): solves L/v + v/a = T for the realistic root.
 */
export function speedFromTravel(L: number, seconds: number, dwell: number): number | undefined {
  const T = seconds - dwell;
  if (!(L > 0) || !(T > 2)) return undefined;
  const disc = ACCEL * ACCEL * T * T - 4 * ACCEL * L;
  const v = disc >= 0 ? (ACCEL * T - Math.sqrt(disc)) / 2 : L / T;
  return clamp(v, MIN_SPEED, MAX_SPEED);
}
const stopKey = (id: string) => id.replace(/^MTA_/, "");

export const BLEND_S = 4;
export const BACKWARD_FADE_M = 400;
export const FORWARD_FADE_M = 600;
export const STALE_S = 120;
export const DEAD_RECKON_MAX_S = 90;
export const DWELL_S = 16;
export const MIN_SPEED = 1.5;
export const MAX_SPEED = 15;
const ACCEL = 1.0; // m/s², gentle bus acceleration and braking
const FADE_S = 0.6;
const SNAP_MAX_M = 80;
const STOP_SNAP_M = 35;
const STALE_ALPHA = 0.25;
/** How far a bus may be drawn past its last report before a report shows it moving (m). */
const UNSURE_LEAD_M = 60;
/** Slower than this between two reports (m/s over the ground) is standing still: a parked bus's GPS wanders about 20 m. */
const STILL_MPS = 1;
/** A bus must have moved this far (m) since its shape was chosen before the choice is reopened. */
const MOVED_M = 40;
/** Falling this far (m) back along its shape, while heading against it, means the bus is on the wrong shape. */
const BACK_M = 20;
/** Two passes of one shape this close (m) to a fix are told apart by where the bus was, not by which is nearer. */
const LOOP_TIE_M = 20;
/** A bus changing to another piece of its route carries on without a fade when that piece is this close (m) to where it is drawn. */
const JOIN_M = 15;
/** A moving bus stays on its piece of the route while its fix is within this (m) of it. */
const STAY_M = 25;
/** How far a moving bus may be drawn past its last report (m). Reports are often 30 s old and the next is 30 s away. */
const MOVING_LEAD_M = 300;

/** Cruise speed (m/s, excluding stops) by route kind. */
export function defaultSpeed(route: string): number {
  if (/^(X|BXM|BM|QM|SIM)\d/i.test(route)) return 9;
  if (/\+$|SBS$/i.test(route)) return 6.5;
  return 5.2;
}

type Stop = { id: string; s: number };
export type Shape = { x: Float64Array; y: Float64Array; cum: Float64Array; off: Float64Array; len: number; lon0: number; lat0: number; kx: number; stops: Stop[] };
const KY = 111_320;

export function buildShape(line: LonLat[], stops: RouteGeom["stops"] = [], offsets?: number[]): Shape {
  const lat0 = line[0][1], lon0 = line[0][0], kx = KY * Math.cos((lat0 * Math.PI) / 180);
  const n = line.length, x = new Float64Array(n), y = new Float64Array(n), cum = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    x[i] = (line[i][0] - lon0) * kx; y[i] = (line[i][1] - lat0) * KY;
    if (i) cum[i] = cum[i - 1] + Math.hypot(x[i] - x[i - 1], y[i] - y[i - 1]);
  }
  const off = new Float64Array(n);
  if (offsets?.length === n) off.set(offsets);
  const shape: Shape = { x, y, cum, off, len: cum[n - 1], lon0, lat0, kx, stops: [] };
  for (const st of stops) {
    const p = project(shape, st.lon, st.lat);
    if (p.d < STOP_SNAP_M) shape.stops.push({ id: st.id, s: p.s });
  }
  shape.stops.sort((a, b) => a.s - b.s);
  return shape;
}

/**
 * Nearest point on the shape: distance along it, perpendicular distance, local bearing.
 * A shape that loops or doubles back passes some streets twice; with `near` (where the
 * bus last was, metres along the shape) the pass closest to that wins over the one that
 * happens to be a metre nearer, so a bus on the way out is not put on the way back.
 */
export function project(sh: Shape, lon: number, lat: number, near?: number): { s: number; d: number; bearing: number } {
  const px = (lon - sh.lon0) * sh.kx, py = (lat - sh.lat0) * KY;
  let best = { s: 0, d: Infinity, bearing: 0 };
  const all: Array<typeof best> = [];
  for (let i = 1; i < sh.x.length; i++) {
    const ax = sh.x[i - 1], ay = sh.y[i - 1], dx = sh.x[i] - ax, dy = sh.y[i] - ay;
    const l2 = dx * dx + dy * dy;
    const u = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
    const d = Math.hypot(ax + u * dx - px, ay + u * dy - py);
    const c = { s: sh.cum[i - 1] + u * Math.sqrt(l2), d, bearing: (Math.atan2(dx, dy) * 180) / Math.PI };
    if (d < best.d) best = c;
    if (near !== undefined) all.push(c);
  }
  if (near !== undefined) {
    // Going back counts double: a bus is far more likely a little ahead of where it was than behind it.
    const far = (c: { s: number }) => (c.s >= near ? c.s - near : 2 * (near - c.s));
    let pick = best;
    for (const c of all) if (c.d <= best.d + LOOP_TIE_M && far(c) < far(pick)) pick = c;
    best = pick;
  }
  return { ...best, bearing: (best.bearing + 360) % 360 };
}

function xyAt(sh: Shape, s: number): [number, number, number] {
  s = Math.max(0, Math.min(sh.len, s));
  let lo = 1, hi = sh.cum.length - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (sh.cum[m] < s) lo = m + 1; else hi = m; }
  const i = lo, seg = sh.cum[i] - sh.cum[i - 1], u = seg ? (s - sh.cum[i - 1]) / seg : 0;
  return [sh.x[i - 1] + u * (sh.x[i] - sh.x[i - 1]), sh.y[i - 1] + u * (sh.y[i] - sh.y[i - 1]), sh.off[i - 1] + u * (sh.off[i] - sh.off[i - 1])];
}
const TANGENT_M = 10;
/**
 * Point at distance `s`: heading is the shape's tangent in the direction of
 * travel (chord over ±10 m, so it does not snap at vertices), and the point
 * sits `off` metres to the right of the (centerline) shape, in the travel lane.
 */
export function pointAt(sh: Shape, s: number): BusFrame {
  const [x, y, off] = xyAt(sh, s);
  const a = xyAt(sh, Math.max(0, Math.min(sh.len - 2 * TANGENT_M, s - TANGENT_M))), b = xyAt(sh, Math.min(sh.len, Math.max(2 * TANGENT_M, s + TANGENT_M)));
  let tx = b[0] - a[0], ty = b[1] - a[1];
  const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
  // right of travel (bearing clockwise from north): (ty, -tx)
  return {
    lon: sh.lon0 + (x + off * ty) / sh.kx,
    lat: sh.lat0 + (y - off * tx) / KY,
    bearing: ((Math.atan2(tx, ty) * 180) / Math.PI + 360) % 360,
    alpha: 1,
  };
}

/** Shortest-arc heading interpolation (2D slerp). */
export function slerpBearing(from: number, to: number, k: number): number {
  const d = ((to - from + 540) % 360) - 180;
  return (from + d * k + 360) % 360;
}
const HEADING_TAU_S = 0.5;

/** Distance covered after `t` s on a leg of length L, starting at speed v0, cruising at v, braking to 0 at the end. Returns [distance, legTime]. */
export function legMotion(L: number, v: number, v0: number, t: number): [number, number] {
  let vp = v;
  const need = (vp * vp - v0 * v0) / (2 * ACCEL) + (vp * vp) / (2 * ACCEL);
  if (need > L) vp = Math.max(v0, Math.sqrt(ACCEL * L + (v0 * v0) / 2));
  const t1 = Math.max(0, (vp - v0) / ACCEL), d1 = (vp + v0) / 2 * t1;
  const t3 = vp / ACCEL, d3 = (vp * vp) / (2 * ACCEL);
  const d2 = Math.max(0, L - d1 - d3), t2 = vp > 0 ? d2 / vp : 0;
  const total = t1 + t2 + t3;
  if (t >= total) return [L, total];
  if (t < t1) return [v0 * t + 0.5 * ACCEL * t * t, total];
  if (t < t1 + t2) return [d1 + vp * (t - t1), total];
  const r = t - t1 - t2;
  return [Math.min(L, d1 + d2 + vp * r - 0.5 * ACCEL * r * r), total];
}

/** Ideal distance-along-shape `dt` s after a report at `s0`. */
export function deadReckon(sh: Shape, route: string, s0: number, v: number, moving: boolean, dt: number, dwellLeft: number, hist?: BusHistory, dwellDefault = DWELL_S): number {
  let t = Math.min(dt, DEAD_RECKON_MAX_S) - dwellLeft;
  if (t <= 0) return s0;
  let s = s0, v0 = moving ? v : 0;
  let k = sh.stops.findIndex((st) => st.s > s0 + 5);
  for (let guard = 0; guard < 50 && t > 0; guard++) {
    const stop = k >= 0 && k < sh.stops.length ? sh.stops[k] : undefined;
    const end = stop ? stop.s : sh.len;
    const from = k > 0 ? sh.stops[k - 1].id : undefined;
    const secs = from && stop ? hist?.travel?.(route, stopKey(from), stopKey(stop.id)) : undefined;
    const learned = secs !== undefined && k > 0 && stop ? speedFromTravel(stop.s - sh.stops[k - 1].s, secs, dwellAt(hist, route, stop.id, dwellDefault)) : undefined;
    // Learned speed replaces the default; the live two-report estimate still nudges it.
    const vs = learned ? clamp(0.7 * learned + 0.3 * v, MIN_SPEED, MAX_SPEED) : v;
    const [d, legT] = legMotion(end - s, vs, v0, t);
    if (t < legT || !stop) return s + d;
    s = end; t -= legT; v0 = 0;
    t -= dwellAt(hist, route, stop.id, dwellDefault);
    k++;
  }
  return s;
}

function clamp(x: number, a: number, b: number) { return Math.max(a, Math.min(b, x)); }
function dwellAt(hist: BusHistory | undefined, route: string, stop: string, def: number) {
  const d = hist?.dwell?.(route, stopKey(stop));
  return d !== undefined && d >= 0 ? clamp(d, 0, 90) : def;
}

type State = {
  route: string; shape: number; s: number; t: number; v: number; moving: boolean; dwellLeft: number;
  disp: number; at: number; alpha: number; fade: "none" | "out" | "in"; hdg?: number;
  /** The last fix, and the fix (with its distance along the shape) at which the shape was last chosen. */
  lon: number; lat: number; alon: number; alat: number; as: number;
  /** Reports in a row that showed the bus standing still. */
  still: number;
  /** How far past `s` the bus may be drawn (m): more once a report shows it moving. */
  lead: number;
};
const KX40 = KY * Math.cos((40.7 * Math.PI) / 180);
const metres = (lon1: number, lat1: number, lon2: number, lat2: number) => Math.hypot((lon2 - lon1) * KX40, (lat2 - lat1) * KY);
const courseOf = (lon1: number, lat1: number, lon2: number, lat2: number) => ((Math.atan2((lon2 - lon1) * KX40, (lat2 - lat1) * KY) * 180) / Math.PI + 360) % 360;
const turn = (a: number, b: number) => 60 * (1 - Math.cos(((a - b) * Math.PI) / 180));

export class BusEstimator {
  private shapes = new Map<string, Shape[]>();
  private state = new Map<string, State>();
  constructor(private hist?: BusHistory) {}
  setHistory(h: BusHistory | undefined) { this.hist = h; }
  hasRoute(route: string) { return this.shapes.has(route); }

  setRoute(g: RouteGeom) {
    if (this.shapes.has(g.route) || !g.lines.length) return;
    const out: Shape[] = [];
    g.lines.forEach((l, i) => {
      if (l.length < 2) return;
      const off = g.offsets?.[i];
      out.push(buildShape(l, g.stops, off), buildShape([...l].reverse(), g.stops, off && [...off].reverse()));
    });
    this.shapes.set(g.route, out);
  }

  /** Feed a GPS report (duplicates of the last timestamp, and older ones, are ignored). Returns false if it could not be snapped. */
  report(b: BusReport, nowS = Date.now() / 1000): boolean {
    const shapes = this.shapes.get(b.route);
    if (!shapes?.length) return false;
    const prev = this.state.get(b.id);
    const same = prev && prev.route === b.route ? prev : undefined;
    if (same && b.t <= same.t) return true;
    const dt = same ? b.t - same.t : 0;
    // Metres over the ground since the last report, and since the shape was last chosen.
    const hop = same ? metres(same.lon, same.lat, b.lon, b.lat) : 0;
    const moved = same ? metres(same.alon, same.alat, b.lon, b.lat) >= MOVED_M : false;
    const onPrev = same ? project(shapes[same.shape], b.lon, b.lat, same.s) : undefined;
    let best = -1, bestCost = Infinity, bestP = { s: 0, d: Infinity, bearing: 0 };
    // Which way it is heading: how it moved when it has, else the feed's bearing as a first guess.
    const heading = !same ? b.bearing : moved ? courseOf(same.alon, same.alat, b.lon, b.lat) : null;
    // Driving back down its shape: it is on the wrong shape, most often the right piece the wrong way round.
    const fellBack = Boolean(same && onPrev && heading !== null && moved && onPrev.s < same.as - BACK_M && turn(onPrev.bearing, heading) > 60);
    if (same && onPrev && (moved
      // Moving along its piece of the route: it stays on it until the piece ends or the bus leaves it.
      ? onPrev.d <= STAY_M && !fellBack && heading !== null && turn(onPrev.bearing, heading) < 30
      // Parked, or creeping: it stays on its shape, facing the way it was. Its compass bearing is noise.
      : onPrev.d <= SNAP_MAX_M)) {
      best = same.shape; bestP = onPrev;
    } else {
      const next = b.next ? stopKey(b.next) : undefined;
      for (let i = 0; i < shapes.length; i++) {
        const mine = same?.shape === i;
        // The same piece the other way round: only when the bus really went back along it.
        if (same && i === (same.shape ^ 1) && !fellBack) continue;
        const p = mine && onPrev ? onPrev : project(shapes[i], b.lon, b.lat);
        if (p.d > SNAP_MAX_M) continue;
        let cost = p.d;
        if (heading !== null) cost += turn(p.bearing, heading);
        // The stop it reports as next lies ahead of it on the right shape, behind it on the reverse.
        const ns = next ? shapes[i].stops.find((st) => stopKey(st.id) === next) : undefined;
        if (ns) cost += ns.s >= p.s - STOP_SNAP_M ? -60 : 60;
        if (mine) cost += fellBack ? 60 : -10; // hysteresis, unless it is running backward on this one
        if (cost < bestCost) { bestCost = cost; best = i; bestP = p; }
      }
    }
    if (best < 0) { this.state.delete(b.id); return false; }
    const sh = shapes[best];
    const kept = same && same.shape === best ? same : undefined;
    const def = defaultSpeed(b.route);
    // Until a report shows the bus moving, it may only be drawn a little past where it was seen.
    let v = def, moving = true, dwellLeft = 0, still = 0, lead = UNSURE_LEAD_M;
    if (same && dt >= 5 && dt <= 180) {
      const over = hop / dt, along = kept ? (bestP.s - kept.s) / dt : over;
      if (over < STILL_MPS || along < 0.4) {
        moving = false; still = same.still + 1;
        // Twice in a row is a layover or a jam, not a pause: hold it exactly there.
        if (still >= 2) lead = 0;
      } else {
        v = clamp(0.6 * clamp(along * 1.35, MIN_SPEED, MAX_SPEED) + 0.4 * def, MIN_SPEED, MAX_SPEED);
        lead = MOVING_LEAD_M;
      }
    } else if (kept && dt < 5) {
      v = kept.v; moving = kept.moving; still = kept.still; lead = kept.lead;
    }
    const atStop = sh.stops.find((st) => Math.abs(st.s - bestP.s) < 20);
    if (atStop && !moving) dwellLeft = dwellAt(this.hist, b.route, atStop.id, DWELL_S) / 2;
    const anchor = kept && !moved ? { alon: kept.alon, alat: kept.alat, as: kept.as } : { alon: b.lon, alat: b.lat, as: bestP.s };
    const fresh: State = { route: b.route, shape: best, s: bestP.s, t: b.t, v, moving, dwellLeft, disp: bestP.s, at: nowS, alpha: 1, fade: "none", lon: b.lon, lat: b.lat, ...anchor, still, lead };
    if (kept) {
      fresh.disp = kept.disp; fresh.at = kept.at; fresh.alpha = kept.alpha; fresh.fade = kept.fade; fresh.hdg = kept.hdg;
    } else if (prev) {
      fresh.at = prev.at; fresh.alpha = prev.alpha;
      // A route arrives in pieces. When the bus moves to a piece that meets the one it was on, it carries on
      // from where it is drawn; only a piece somewhere else (or another route) is crossed with a fade.
      const from = same ? this.shapes.get(same.route)?.[same.shape] : undefined;
      const here = from && prev.fade !== "out" ? pointAt(from, prev.disp) : undefined;
      const join = here ? project(sh, here.lon, here.lat) : undefined;
      if (join && join.d <= JOIN_M) {
        fresh.disp = join.s; fresh.fade = prev.fade; fresh.hdg = prev.hdg;
      } else {
        fresh.disp = prev.disp; fresh.fade = "out";
        (fresh as State & { oldShape?: [string, number] }).oldShape = (prev as State & { oldShape?: [string, number] }).oldShape ?? [prev.route, prev.shape];
      }
    }
    this.state.set(b.id, fresh);
    return true;
  }

  /** Where to draw a bus now. Undefined when it has no snapped state (caller falls back to raw GPS). */
  frame(id: string, nowS = Date.now() / 1000): BusFrame | undefined {
    const st0 = this.state.get(id);
    const dt = st0 ? Math.max(0, Math.min(1, nowS - st0.at)) : 0;
    const f = this.rawFrame(id, nowS);
    if (!f || !st0) return f;
    // Smooth the heading through turns; a fresh bus (or one re-snapped after a fade) takes the tangent as is.
    st0.hdg = st0.hdg === undefined || st0.alpha < 0.05 ? f.bearing : slerpBearing(st0.hdg, f.bearing, 1 - Math.exp(-dt / HEADING_TAU_S));
    return { ...f, bearing: st0.hdg };
  }

  private rawFrame(id: string, nowS: number): BusFrame | undefined {
    const st = this.state.get(id) as (State & { oldShape?: [string, number] }) | undefined;
    if (!st) return undefined;
    const sh = this.shapes.get(st.route)?.[st.shape];
    if (!sh) return undefined;
    const dt = Math.max(0, Math.min(1, nowS - st.at));
    st.at = nowS;
    const age = nowS - st.t;
    const ideal = (t: number) => Math.min(deadReckon(sh, st.route, st.s, st.v, st.moving, t - st.t, st.dwellLeft, this.hist), st.s + st.lead);
    if (st.fade === "out") {
      st.alpha = Math.max(0, st.alpha - dt / FADE_S);
      if (st.alpha === 0) { st.disp = ideal(nowS); st.fade = "in"; delete st.oldShape; }
      const osh = st.oldShape ? this.shapes.get(st.oldShape[0])?.[st.oldShape[1]] : sh;
      return { ...pointAt(osh ?? sh, st.disp), alpha: st.alpha };
    }
    if (age > STALE_S) {
      st.alpha = Math.max(STALE_ALPHA, st.alpha - dt / FADE_S);
      return { ...pointAt(sh, st.disp), alpha: st.alpha };
    }
    if (st.fade === "in") { st.alpha = Math.min(1, st.alpha + dt / FADE_S); if (st.alpha === 1) st.fade = "none"; }
    else if (st.alpha < 1) st.alpha = Math.min(1, st.alpha + dt / FADE_S);
    const target = ideal(nowS);
    const err = target - st.disp;
    if (err < -BACKWARD_FADE_M || err > FORWARD_FADE_M) {
      st.fade = "out";
      return { ...pointAt(sh, st.disp), alpha: st.alpha };
    }
    const vIdeal = ideal(nowS + 1) - target;
    const speed = clamp(vIdeal + err / BLEND_S, 0, 2 * MAX_SPEED);
    st.disp = Math.min(sh.len, st.disp + speed * dt);
    return { ...pointAt(sh, st.disp), alpha: st.alpha };
  }

  /** Forget buses not in `live` (vehicles that left the feed). */
  retain(live: Set<string>) { for (const id of this.state.keys()) if (!live.has(id)) this.state.delete(id); }
}
