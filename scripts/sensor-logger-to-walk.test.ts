import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { convert, quatToAlphaBetaGamma, readCsv } from "./sensor-logger-to-walk";
import { parseRecording } from "../src/features/recorder/format";

const dir = new URL("./__fixtures__/sensor-logger-mini/", import.meta.url);
const load = (omit: string[] = []): Record<string, string> =>
  Object.fromEntries(
    ["Metadata", "Gyroscope", "AccelerometerUncalibrated", "Orientation", "Location", "Barometer", "Pedometer", "Annotation"]
      .map((n) => `${n}.csv`)
      .filter((n) => !omit.includes(n))
      .map((n) => [n, readFileSync(new URL(n, dir), "utf8")]),
  );

describe("convert", () => {
  const { recording: rec, warnings } = convert(load(), { station: "Test St" });

  it("makes a recording the validator accepts", () => {
    expect(parseRecording(rec).ok).toBe(true);
    expect(rec).toMatchObject({ v: 1, station: "Test St", startedAt: 1794607474359, device: "Test Phone", marks: [] });
    expect(warnings).toEqual([]);
  });

  it("converts nanoseconds to epoch ms and keeps the gyroscope's timeline", () => {
    expect(rec.motion.map((m) => m[0])).toEqual([1794607474454, 1794607474464, 1794607474474]);
  });

  it("scales g to m/s² and rad/s to deg/s, matching acceleration to the nearest time", () => {
    // Gyro at ...454 is nearest the acceleration at ...457 (z -0.5 g, y 0.5 g).
    expect(rec.motion[0]).toEqual([1794607474454, 0, 4.903, -4.903, 57.296, 0, 0]);
    expect(rec.motion[2][6]).toBeCloseTo(180, 3); // pi rad/s
    expect(rec.motion[2][1]).toBeCloseTo(0.2 * 9.80665, 3);
    expect(rec.motion[2][3]).toBeCloseTo(-9.807, 3); // lying face up reads about -9.8 on z, as the phone reports it
    expect(rec.motion[1][5]).toBe(0);
    expect(rec.motion[2][5]).toBe(0);
    expect(rec.motion[2][4]).toBe(0);
  });

  it("turns the orientation quaternion into alpha, beta, gamma", () => {
    expect(rec.heading[0]).toEqual([1794607474454, 0, 0, 0]);
    expect(rec.heading[1][1]).toBeCloseTo(90, 1); // a quarter turn about the vertical
  });

  it("carries gps, barometer and steps across", () => {
    expect(rec.gps).toEqual([[1794607481081, 40.73071073414724, -73.9922434970004, 470.9]]);
    expect(rec.baro).toEqual([[1794607473858, 0], [1794607474859, 0.291]]);
    expect(rec.steps).toEqual([[1794607553535, 16], [1794607556108, 20]]);
  });

  it("leaves gps empty and says so when GPS was off", () => {
    const out = convert(load(["Location.csv"]));
    expect(out.recording.gps).toEqual([]);
    expect(out.warnings[0]).toMatch(/GPS was off/);
    expect(out.recording.station).toBeUndefined();
  });

  it("names a missing required file or column", () => {
    expect(() => convert(load(["Gyroscope.csv"]))).toThrow(/Gyroscope\.csv is missing/);
    expect(() => convert({ ...load(), "Orientation.csv": "time,yaw\n1,2\n" })).toThrow(/Orientation\.csv: expected a column named "qx"/);
  });
});

describe("quatToAlphaBetaGamma", () => {
  it("reports gamma inside -90..90 even for a phone turned past upright", () => {
    // A 100° tilt about the y axis: the other Euler solution is beta 180, gamma -80.
    const h = (100 * Math.PI) / 180 / 2;
    const [alpha, beta, gamma] = quatToAlphaBetaGamma(0, Math.sin(h), 0, Math.cos(h));
    expect(Math.abs(gamma)).toBeLessThanOrEqual(90);
    expect(gamma).toBeCloseTo(-80, 3);
    expect(Math.abs(beta)).toBeCloseTo(180, 3);
    expect(alpha).toBeCloseTo(180, 3);
  });
});

describe("readCsv", () => {
  it("ignores blank lines and keeps the header", () => {
    const t = readCsv("a,b\n1,2\n\n3,4\n");
    expect(t.header).toEqual(["a", "b"]);
    expect(t.rows).toEqual([[1, 2], [3, 4]]);
  });
});
