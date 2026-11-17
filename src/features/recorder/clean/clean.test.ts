import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { BaroRow, HeadingRow, MotionRow, Recording, StepRow } from "../format";
import { parseRecording } from "../format";
import { END_S, filmAt, LEVELS, LINE, LINE_LEVELS, RIDE_AT, SIGNS, signTimes, T0 } from "@/features/recorder/replay/unionSq";
import { chooseFixes, cleanWalk, deadReckon, distM, findRides, headingAt, levelAt, levelSpans, pathAt, pinPath, placeRaw, snapToLine, steadyHeading, stepsFromMotion, toXY, type Fix, type LonLat } from "./index";

const O: LonLat = [-73.99, 40.735];
/** A place `e` metres east and `n` metres north of O. */
const east = (e: number, n = 0): LonLat => [O[0] + e / (111_320 * Math.cos((O[1] * Math.PI) / 180)), O[1] + n / 110_540];
const near = (a: LonLat, b: LonLat, m = 0.5) => expect(distM(a, b)).toBeLessThan(m);

describe("dead reckoning", () => {
  it("reads the heading compass-style, and says when there is none", () => {
    const h: HeadingRow[] = [[0, 90, 0, 0], [500, 0, 0, 0]];
    expect(headingAt(h, 0)).toBe(270);
    expect(headingAt(h, 600)).toBe(0);
    expect(headingAt(h, 5000)).toBeNull();
  });

  it("walks one step length per step along the heading", () => {
    const steps: StepRow[] = [[0, 10], [1000, 12], [2000, 12], [3000, 14]];
    const heading: HeadingRow[] = [[0, 0, 0, 0], [1000, 0, 0, 0], [2000, 270, 0, 0], [3000, 270, 0, 0]];
    const p = deadReckon(steps, heading, 0.7);
    expect(p[0].at).toEqual([0, 0]);
    const end = p[p.length - 1].at;
    expect(end[0]).toBeCloseTo(1.4); // two steps east once alpha says 270
    expect(end[1]).toBeCloseTo(1.4); // two steps north first
  });

  it("does not guess a step it has no heading for", () => {
    const p = deadReckon([[0, 0], [3000, 3]], [[0, 0, 0, 0]], 1);
    expect(p[p.length - 1].at[1]).toBeCloseTo(2); // the third step, three seconds from any heading, does not move
  });
});

describe("steps and turns from the motion sensors", () => {
  /** A phone held upright, as when filming: gravity along -y, as an iPhone reads it. `bounce` is m/s² on top of gravity, `turn` deg/s about up. */
  const walk = (secs: number, bounce: (s: number) => number, turn: (s: number) => number = () => 0): MotionRow[] =>
    Array.from({ length: secs * 100 }, (_, i): MotionRow => {
      const s = i / 100;
      return [s * 1000, 0, -(9.81 + bounce(s)), 0, 0, turn(s), 0];
    });
  const stride = (s: number) => 1.5 * Math.sin(2 * Math.PI * 1.8 * s); // 1.8 steps a second

  it("counts one step per bounce, and none while standing", () => {
    const steps = stepsFromMotion(walk(10, stride));
    expect(steps[0]).toEqual([0, 0]);
    expect(steps.length - 1).toBeGreaterThanOrEqual(17);
    expect(steps.length - 1).toBeLessThanOrEqual(18);
    expect(stepsFromMotion(walk(10, (s) => 0.1 * Math.sin(2 * Math.PI * 7 * s)))).toEqual([[0, 0]]);
  });

  it("does not care which way the phone reports gravity", () => {
    const flipped = walk(10, stride).map(([t, ax, ay, az, ...r]): MotionRow => [t, -ax, -ay, -az, ...r]);
    expect(stepsFromMotion(flipped).length).toBe(stepsFromMotion(walk(10, stride)).length);
  });

  it("follows the gyroscope through the jump an iPhone makes when it finds north", () => {
    const motion = walk(3, () => 0, (s) => (s < 1 ? 90 : 0)); // a quarter turn anticlockwise in the first second
    const heading: HeadingRow[] = [0, 500, 1000, 1500, 2000, 2500].map((t): HeadingRow => [t, t < 1500 ? 10 + Math.min(t / 1000, 1) * 90 : 220, 90, 0]);
    const steady = steadyHeading(motion, heading);
    expect(steady[0][1]).toBeCloseTo(10);
    expect(steady[2][1]).toBeCloseTo(100, 0);
    expect(steady[4][1]).toBeCloseTo(100, 0); // the phone's own alpha says 220 here
    expect(headingAt(steady, 2000)).toBeCloseTo(260, 0);
    expect(steady[4].slice(2)).toEqual([90, 0]);
  });

  it("leaves the heading as it is when there is no motion", () => {
    const heading: HeadingRow[] = [[0, 40, 10, 5]];
    expect(steadyHeading([], heading)).toEqual(heading);
  });

  it("walks a recording with no step counter, and says the steps were counted", () => {
    const rec: Recording = {
      v: 1, startedAt: 0, device: "test", marks: [], baro: [], steps: [],
      motion: walk(10, stride),
      heading: Array.from({ length: 21 }, (_, k): HeadingRow => [k * 500, 0, 90, 0]),
      gps: [[0, O[1], O[0], 5], [9_900, east(0, 12)[1], east(0, 12)[0], 5]],
    };
    const c = cleanWalk(rec, { levels: ["street"], rideAt: [], line: [], snapFrom: 0, snapTo: 0 });
    expect(c.gaps.some((g) => g.includes("counted from the accelerometer"))).toBe(true);
    expect(c.raw.length).toBeGreaterThan(15);
    near(pathAt(c.pinned, 9_900), east(0, 12), 1);
  });
});

describe("rides and levels from the barometer", () => {
  const trace = (fn: (s: number) => number, secs = 200): BaroRow[] => Array.from({ length: secs }, (_, s) => [s * 1000, fn(s)]);
  const ramp = (s: number, at: number, rise: number) => (s < at ? 0 : s > at + 10 ? rise : (rise * (s - at)) / 10);

  it("finds a ride that lasts", () => {
    const r = findRides(trace((s) => ramp(s, 80, 3)));
    expect(r).toHaveLength(1);
    expect(r[0].t0).toBeGreaterThanOrEqual(78_000);
    expect(r[0].t1).toBeLessThanOrEqual(92_000);
    expect(r[0].riseM).toBeCloseTo(3, 0);
  });

  it("ignores a pressure push that comes back, and a change with nothing before it", () => {
    expect(findRides(trace((s) => (s > 80 && s < 90 ? 3 : 0)))).toHaveLength(0);
    expect(findRides(trace((s) => ramp(s, 5, -3)))).toHaveLength(0);
  });

  it("names the levels between rides, or says it cannot", () => {
    const baro = trace((s) => ramp(s, 60, 2) + ramp(s, 140, 3));
    const rides = findRides(baro);
    expect(rides).toHaveLength(2);
    const spans = levelSpans(baro, rides, ["platform", "mezzanine", "street"])!;
    expect(spans.map((x) => [x.level, Math.round(x.heightM)])).toEqual([["platform", 0], ["mezzanine", 2], ["street", 5]]);
    expect(levelAt(spans, 100_000)).toBe("mezzanine");
    expect(levelAt(spans, rides[0].t0 + 1)).toBe("ride");
    expect(levelSpans(baro, rides, ["platform", "street"])).toBeNull();
  });
});

describe("pinning", () => {
  const raw = Array.from({ length: 11 }, (_, i) => ({ t: i * 1000, at: [i, 0] as [number, number] })); // 10 m east
  it("turns and stretches a stretch onto its two fixes", () => {
    const fixes: Fix[] = [{ t: 0, at: O, accuracyM: 5, source: "checkpoint" }, { t: 10_000, at: east(0, 20), accuracyM: 5, source: "gps" }];
    const p = pinPath(raw, fixes, O);
    near(pathAt(p, 0), O);
    near(pathAt(p, 10_000), east(0, 20));
    near(pathAt(p, 5000), east(0, 10)); // halfway, on the line between them
  });

  it("slides when a stretch is too short to turn", () => {
    const still = raw.map((p) => ({ ...p, at: [0, 0] as [number, number] }));
    const fixes: Fix[] = [{ t: 0, at: O, accuracyM: 5, source: "gps" }, { t: 10_000, at: east(10), accuracyM: 5, source: "gps" }];
    near(pathAt(pinPath(still, fixes, O), 5000), east(5));
  });

  it("keeps checkpoints and thins the location fixes near them", () => {
    const f = (t: number, source: Fix["source"], accuracyM = 10): Fix => ({ t, at: O, accuracyM, source });
    const kept = chooseFixes([f(0, "checkpoint"), f(5000, "gps", 3), f(30_000, "gps", 15), f(35_000, "gps", 8)]);
    expect(kept.map((k) => [k.t, k.source])).toEqual([[0, "checkpoint"], [35_000, "gps"]]);
  });

  it("puts the raw path on the map turned once, drift and all", () => {
    const fixes: Fix[] = [{ t: 0, at: O, accuracyM: 5, source: "gps" }, { t: 10_000, at: east(0, 10), accuracyM: 5, source: "gps" }];
    near(placeRaw(raw, fixes, O)[10].at, east(0, 10));
  });
});

describe("snapping to the walk line", () => {
  const line: LonLat[] = [O, east(100)];
  it("snaps a point near the line, and leaves a detour alone", () => {
    const s = snapToLine([{ t: 0, at: east(30, 5) }, { t: 1, at: east(50, 60) }], line);
    expect(s[0].snapped).toBe(true);
    near(s[0].at, east(30));
    expect(s[1].snapped).toBe(false);
  });

  it("only snaps inside its time window, onto its own level, and never far backwards", () => {
    const s = snapToLine([{ t: 0, at: east(80, 2) }, { t: 1, at: east(20, 2) }, { t: 9, at: east(20, 2) }], line, { to: 5 });
    expect(s[0].snapped).toBe(true);
    expect(s[1].snapped).toBe(false); // 60 m behind where it already was
    expect(s[2].snapped).toBe(false); // after the window
    const lv = snapToLine([{ t: 0, at: east(30, 2) }], line, { lineLevels: ["mezzanine", "mezzanine"], levelAt: () => "platform" });
    expect(lv[0].snapped).toBe(false);
  });
});

describe("Friday's walk at 14 St-Union Sq (real recording)", () => {
  const parsed = parseRecording(JSON.parse(readFileSync("public/replay/union-sq-walk.json", "utf8")));
  if (!parsed.ok) throw new Error(parsed.errors.join("\n"));
  const rec = parsed.recording;
  const c = cleanWalk(rec, { levels: LEVELS, rideAt: RIDE_AT, line: LINE, lineLevels: LINE_LEVELS, snapFrom: T0, snapTo: T0 + 600_000 });
  const s = (t: number) => (t - T0) / 1000;

  it("finds the two elevator rides, up each time", () => {
    expect(c.gaps).toEqual([]);
    expect(c.rides.map((r) => [Math.round(s(r.t0) / 10), r.riseM > 1.5])).toEqual([[28, true], [58, true]]);
    expect(c.spans!.map((x) => x.level)).toEqual(["platform", "mezzanine", "street"]);
  });

  it("puts the cleaned path on each elevator, and near the good street fixes", () => {
    near(pathAt(c.clean, c.rides[0].t0), RIDE_AT[0].from, 1);
    near(pathAt(c.clean, c.rides[1].t0), RIDE_AT[1].from, 1);
    const street = rec.gps.filter((g) => s(g[0]) > 620 && g[3] <= 15);
    expect(street.length).toBeGreaterThan(10);
    for (const g of street) expect(distM(pathAt(c.clean, g[0]), [g[2], g[1]])).toBeLessThan(30);
  });

  it("leaves the raw path visibly adrift: steps and turns alone are not enough", () => {
    const worst = Math.max(...c.raw.map((p) => distM(p.at, pathAt(c.clean, p.t))));
    expect(worst).toBeGreaterThan(30);
    expect(toXY(O, O)).toEqual([0, 0]);
  });

  it("meets every Walk Guide sign in order, and keeps the film moving forward with it", () => {
    const times = signTimes(rec.steps, c.rides);
    expect(times).toHaveLength(SIGNS.length);
    for (let k = 1; k < times.length; k++) expect(times[k]).toBeGreaterThanOrEqual(times[k - 1]);
    expect(times[SIGNS.findIndex((x) => x.id === "us-mural-elevator")]).toBeCloseTo(s(c.rides[1].t0), 0);
    let last = -1;
    for (let x = 10; x <= END_S; x += 5) {
      const f = filmAt(times, x).at;
      expect(f).toBeGreaterThanOrEqual(last);
      expect(f).toBeGreaterThanOrEqual(55);
      expect(f).toBeLessThanOrEqual(114.2);
      last = f;
    }
  });
});
