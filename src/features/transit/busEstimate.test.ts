import { describe, expect, it } from "vitest";
import { BusEstimator, buildShape, deadReckon, legMotion, pointAt, project, slerpBearing, speedFromTravel, type BusReport, type LonLat, type RouteGeom } from "./busEstimate";
import layover from "./busLayover.fixture.json";

// A straight 2 km line heading north along a meridian, stops every 400 m.
const LAT0 = 40.7, LON0 = -73.99, M = 1 / 111_320;
const line: LonLat[] = Array.from({ length: 21 }, (_, i) => [LON0, LAT0 + i * 100 * M]);
const stops = [1, 2, 3, 4].map((k) => ({ id: `S${k}`, lon: LON0, lat: LAT0 + k * 400 * M }));
const geom: RouteGeom = { route: "M1", lines: [line], stops };
const at = (m: number) => ({ lon: LON0 + 0.00005, lat: LAT0 + m * M });
const sOf = (lat: number) => (lat - LAT0) / M;

function sim(est: BusEstimator, id: string, from: number, to: number, step = 1 / 15) {
  const out: number[] = [];
  for (let t = from; t <= to + 1e-9; t += step) { const f = est.frame(id, t); if (f) out.push(sOf(f.lat)); }
  return out;
}

describe("shape geometry", () => {
  it("snaps a GPS fix to distance along the shape", () => {
    const sh = buildShape(line, stops);
    const p = project(sh, at(730).lon, at(730).lat);
    expect(p.s).toBeCloseTo(730, 0);
    expect(p.d).toBeLessThan(6);
    expect(sh.stops.map((s) => Math.round(s.s))).toEqual([400, 800, 1200, 1600]);
  });
  it("leg motion brakes to a stop at the end of the leg", () => {
    const [, total] = legMotion(300, 6, 6, 0);
    expect(legMotion(300, 6, 6, total)[0]).toBe(300);
    const near = legMotion(300, 6, 6, total - 1)[0];
    expect(300 - near).toBeLessThan(1); // last second covers < 1 m: easing in
  });
  it("dead reckoning dwells at the next stop", () => {
    const sh = buildShape(line, stops);
    const atStop = deadReckon(sh, "M1", 300, 6, true, 30, 0, undefined, 16);
    expect(atStop).toBeCloseTo(400, 0); // reached S1 (~18 s) and is dwelling
    const later = deadReckon(sh, "M1", 300, 6, true, 45, 0, undefined, 16);
    expect(later).toBeGreaterThan(400);
  });
  it("uses learned segment speed and dwell when given", () => {
    const sh = buildShape(line, stops);
    const slow = deadReckon(sh, "M1", 410, 6, true, 20, 0, { travel: () => 200 });
    const fast = deadReckon(sh, "M1", 410, 6, true, 20, 0, { travel: () => 60 });
    expect(fast).toBeGreaterThan(slow);
    // learned dwell is used at the stop
    const long = deadReckon(sh, "M1", 300, 6, true, 45, 0, { dwell: () => 60 });
    expect(long).toBeCloseTo(400, 0);
  });
  it("turns learned travel seconds into a plausible cruise speed", () => {
    const v = speedFromTravel(400, 100, 20)!; // 400 m in 80 s of motion
    expect(v).toBeGreaterThan(5);
    expect(v).toBeLessThan(6.5);
    expect(speedFromTravel(400, 10, 20)).toBeUndefined();
  });
});

describe("BusEstimator", () => {
  const mk = () => { const e = new BusEstimator(); e.setRoute(geom); return e; };

  it("moves continuously between reports", () => {
    const e = mk();
    e.report({ id: "b", route: "M1", ...at(100), bearing: 0, t: 0 }, 0);
    const s = sim(e, "b", 0, 25);
    expect(s[s.length - 1]).toBeGreaterThan(150);
    for (let i = 1; i < s.length; i++) expect(s[i]).toBeGreaterThanOrEqual(s[i - 1] - 1e-6);
  });

  it("corrects a new report smoothly, without teleporting or backing up", () => {
    const e = mk();
    e.report({ id: "b", route: "M1", ...at(100), bearing: 0, t: 0 }, 0);
    sim(e, "b", 0, 30);
    // the real bus got further than the estimate
    e.report({ id: "b", route: "M1", ...at(420), bearing: 0, t: 30 }, 30);
    const s = sim(e, "b", 30, 40);
    for (let i = 1; i < s.length; i++) {
      expect(s[i] - s[i - 1]).toBeGreaterThanOrEqual(-1e-6);
      expect(s[i] - s[i - 1]).toBeLessThan(3); // ≤ 30 m/s at 15 fps
    }
  });

  it("holds rather than moving backward when slightly ahead of a report", () => {
    const e = mk();
    e.report({ id: "b", route: "M1", ...at(100), bearing: 0, t: 0 }, 0);
    const before = sim(e, "b", 0, 30).pop()!;
    e.report({ id: "b", route: "M1", ...at(before - 80), bearing: 0, t: 30 }, 30);
    const s = sim(e, "b", 30, 34);
    for (let i = 1; i < s.length; i++) expect(s[i]).toBeGreaterThanOrEqual(s[i - 1] - 1e-6);
  });

  it("turns round, without a jump, when the bus really goes back the way it came", () => {
    const e = mk();
    e.report({ id: "b", route: "M1", ...at(1000), bearing: 0, t: 0 }, 0);
    const before = sim(e, "b", 0, 30).pop()!;
    e.report({ id: "b", route: "M1", ...at(700), bearing: 0, t: 30 }, 30);
    const s = [before, ...sim(e, "b", 30, 90)];
    for (let i = 1; i < s.length; i++) {
      expect(s[i]).toBeLessThanOrEqual(s[i - 1] + 1e-6); // heading south now
      expect(s[i - 1] - s[i]).toBeLessThan(3);
    }
    expect(s[s.length - 1]).toBeLessThan(700);
    expect(e.frame("b", 90)!.alpha).toBe(1);
  });

  it("estimates speed from the last two reports, clamped", () => {
    const e = mk();
    e.report({ id: "b", route: "M1", ...at(0), bearing: 0, t: 0 }, 0);
    e.report({ id: "b", route: "M1", ...at(1500), bearing: 0, t: 10 }, 10); // 150 m/s: absurd
    const st = (e as unknown as { state: Map<string, { v: number }> }).state.get("b")!;
    expect(st.v).toBeLessThanOrEqual(15);
  });

  it("fades a bus whose report is over 2 minutes old", () => {
    const e = mk();
    e.report({ id: "b", route: "M1", ...at(100), bearing: 0, t: 0 }, 0);
    sim(e, "b", 0, 125, 0.5);
    expect(e.frame("b", 126)!.alpha).toBeLessThan(0.5);
  });

  it("picks the shape orientation that matches the bearing", () => {
    const e = mk();
    e.report({ id: "n", route: "M1", ...at(1000), bearing: 0, t: 0 }, 0);
    e.report({ id: "s", route: "M1", ...at(1000), bearing: 180, t: 0 }, 0);
    expect(sOf(e.frame("n", 10)!.lat)).toBeGreaterThan(1000);
    expect(sOf(e.frame("s", 10)!.lat)).toBeLessThan(1000);
  });

  it("turns a bus the right way once it moves, when the feed's bearing had it backward", () => {
    const e = mk();
    // The feed says south; the bus creeps north, 25 m a report.
    for (let i = 0; i < 6; i++) e.report({ id: "b", route: "M1", ...at(1000 + 25 * i), bearing: 180, t: 30 * i }, 30 * i);
    const s = sim(e, "b", 150, 170);
    expect(s[s.length - 1]).toBeGreaterThan(1100);
    expect(e.frame("b", 170)!.bearing).toBeCloseTo(0, 0);
  });

  it("falls back (undefined) for routes without a shape", () => {
    const e = mk();
    expect(e.report({ id: "x", route: "Q99", ...at(0), bearing: 0, t: 0 })).toBe(false);
    expect(e.frame("x")).toBeUndefined();
  });
});

// What the app drew for a real bus: its frames between the times its reports arrived.
type Seen = BusReport & { seen: number };
type Drawn = { t: number; lon: number; lat: number; bearing: number; alpha: number; shape: number; disp: number };
function replay(reports: Seen[], id: string, until = Infinity): Drawn[] {
  const e = new BusEstimator();
  e.setRoute(layover.route as RouteGeom);
  const mine = reports.filter((r) => r.id === id && r.t <= until);
  const out: Drawn[] = [];
  mine.forEach((r, i) => {
    e.report(r, r.seen);
    const end = i + 1 < mine.length ? mine[i + 1].seen : r.seen + 20;
    for (let t = r.seen; t < end; t += 0.2) {
      const f = e.frame(id, t)!;
      const st = (e as unknown as { state: Map<string, { shape: number; disp: number }> }).state.get(id)!;
      out.push({ t, ...f, shape: st.shape, disp: st.disp });
    }
  });
  return out;
}
const gap = (a: { lon: number; lat: number }, b: { lon: number; lat: number }) => Math.hypot((a.lon - b.lon) * 111_320 * Math.cos((40.715 * Math.PI) / 180), (a.lat - b.lat) * 111_320);

describe("a bus waiting at its terminal (M22 at Battery Park City, recorded 2026-11-14)", () => {
  const reports = layover.reports as Seen[];
  const WAITING = "MTA NYCT_9673", LEFT_AT = 1794708032; // its last report before it pulled out
  const ARRIVING = "MTA NYCT_7585";

  it("holds the waiting bus near where it is parked, whatever its compass says", () => {
    const fixes = reports.filter((r) => r.id === WAITING && r.t <= LEFT_AT);
    expect(fixes.length).toBeGreaterThanOrEqual(6);
    expect(new Set(fixes.map((r) => Math.round(r.bearing ?? 0))).size).toBeGreaterThan(1); // the bearing swings while parked
    for (const f of replay(reports, WAITING, LEFT_AT)) {
      expect(f.alpha).toBe(1);
      expect(f.shape).toBe(0);
      expect(Math.min(...fixes.map((r) => gap(f, r)))).toBeLessThan(90);
    }
  });

  it("never draws the bus jumping, or going back along its route, from the wait through pulling out", () => {
    const frames = replay(reports, WAITING);
    expect(frames.length).toBeGreaterThan(2000);
    let seen = frames[0];
    for (const f of frames.slice(1)) {
      if (f.alpha < 0.05) continue;
      // Between two frames the rider can see, the bus covers at most what a bus could drive.
      expect(gap(f, seen)).toBeLessThan(5 + 30 * (f.t - seen.t));
      if (f.shape === seen.shape) expect(f.disp).toBeGreaterThanOrEqual(seen.disp - 1e-6);
      seen = f;
    }
    // It did pull out: it ends well up the route from the terminal.
    expect(gap(frames[frames.length - 1], frames[0])).toBeGreaterThan(400);
  });

  it("faces the arriving bus the way it drives round the loop, not the way its compass points", () => {
    // On Murray Street the bus drives east; the feed's bearing said north (3 and 353 degrees).
    const frames = replay(reports, ARRIVING);
    const MURRAY_EAST = 22; // the loop piece (line 11), in the order the bus drives it
    expect(frames[frames.length - 1].shape).toBe(MURRAY_EAST);
    const onMurray = frames.find((f) => f.shape === MURRAY_EAST && f.alpha === 1)!;
    expect(onMurray.bearing).toBeGreaterThan(60);
    expect(onMurray.bearing).toBeLessThan(140);
  });
});

describe("a route that comes back down the street it went up", () => {
  // North 500 m, round a small block, then south again along the same street.
  const P = (x: number, y: number): LonLat => [LON0 + x / (111_320 * Math.cos((LAT0 * Math.PI) / 180)), LAT0 + y * M];
  const loop: LonLat[] = [...Array.from({ length: 6 }, (_, i) => P(0, i * 100)), P(60, 500), P(60, 560), P(0, 560), ...Array.from({ length: 6 }, (_, i) => P(0, 500 - i * 100))];
  const g: RouteGeom = { route: "M9", lines: [loop], stops: [] };
  const fix = (x: number, y: number) => { const [lon, lat] = P(x, y); return { lon, lat }; };

  it("keeps a bus on the pass it is driving: distance along the route never falls", () => {
    const e = new BusEstimator();
    e.setRoute(g);
    const path: Array<[number, number]> = [[2, 200], [2, 350], [3, 480], [58, 530], [20, 562], [-2, 450], [-2, 300], [-3, 150], [-2, 40]];
    const along: number[] = [], drawn: number[] = [];
    path.forEach(([x, y], i) => {
      e.report({ id: "b", route: "M9", ...fix(x, y), bearing: null, t: i * 30 }, i * 30);
      const st = (e as unknown as { state: Map<string, { shape: number; s: number; disp: number }> }).state;
      expect(st.get("b")!.shape).toBe(0);
      along.push(st.get("b")!.s);
      for (let t = i * 30; t < i * 30 + 30; t += 0.2) { e.frame("b", t); drawn.push(st.get("b")!.disp); }
    });
    for (let i = 1; i < along.length; i++) expect(along[i]).toBeGreaterThan(along[i - 1]);
    for (let i = 1; i < drawn.length; i++) expect(drawn[i]).toBeGreaterThanOrEqual(drawn[i - 1] - 1e-6);
    expect(along[along.length - 1]).toBeGreaterThan(1100); // on the way back, not at 40 m on the way out
  });

  it("project() prefers the pass nearest to where the bus was", () => {
    const sh = buildShape(loop);
    const { lon, lat } = fix(0, 300);
    expect(project(sh, lon, lat).s).toBeCloseTo(300, 0);
    expect(project(sh, lon, lat, 250).s).toBeCloseTo(300, 0);
    expect(project(sh, lon, lat, 800).s).toBeCloseTo(sh.len - 300, 0);
  });
});

describe("lane placement and heading", () => {
  it("offsets the bus to the right of travel and heads along the shape", () => {
    const sh = buildShape(line, [], line.map(() => 3));
    const p = pointAt(sh, 500);
    expect(p.bearing).toBeCloseTo(0, 3); // heading north, the direction of travel
    expect((p.lon - LON0) * 111_320 * Math.cos((LAT0 * Math.PI) / 180)).toBeCloseTo(3, 1); // 3 m east = right
    const rev = buildShape([...line].reverse(), [], line.map(() => 3));
    const q = pointAt(rev, 500);
    expect(q.bearing).toBeCloseTo(180, 3);
    expect((q.lon - LON0) * 111_320 * Math.cos((LAT0 * Math.PI) / 180)).toBeCloseTo(-3, 1);
  });
  it("slerps heading through a turn instead of snapping", () => {
    expect(slerpBearing(350, 10, 0.5)).toBeCloseTo(0, 6);
    const turn: LonLat[] = [[LON0, LAT0], [LON0, LAT0 + 200 * M], [LON0 + 200 * M / Math.cos((LAT0 * Math.PI) / 180), LAT0 + 200 * M]];
    const e = new BusEstimator(); e.setRoute({ route: "M2", lines: [turn], stops: [] });
    e.report({ id: "t", route: "M2", lon: LON0, lat: LAT0 + 190 * M, bearing: 0, t: 0 }, 0);
    let prev = e.frame("t", 0)!.bearing, maxStep = 0;
    for (let t = 1 / 15; t < 10; t += 1 / 15) { const b = e.frame("t", t)!.bearing; maxStep = Math.max(maxStep, Math.abs(((b - prev + 540) % 360) - 180)); prev = b; }
    expect(prev).toBeGreaterThan(80);
    expect(maxStep).toBeLessThan(15);
  });
});
