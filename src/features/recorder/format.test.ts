import { describe, expect, it } from "vitest";
import { parseRecording, type Recording } from "./format";

const good = (): Recording => ({
  v: 1,
  station: "Fulton St",
  startedAt: 1794607474359,
  device: "iPhone 11",
  motion: [[1794607474454, 0.1, -9.8, 0.2, 1, 2, 3]],
  heading: [[1794607474454, 90, 10, -5]],
  gps: [[1794607481080, 40.7307, -73.9922, 16.4]],
  baro: [[1794607474858, 0.29]],
  steps: [[1794607553535, 16]],
  marks: [{ t: 1794607500000, kind: "sign", note: "Exit to Broadway" }],
  video: { file: "walk.mp4", startedAt: 1794607474000 },
});

const errorsOf = (x: unknown): string[] => {
  const r = parseRecording(x);
  if (r.ok) throw new Error("expected errors");
  return r.errors;
};

describe("parseRecording", () => {
  it("accepts a full recording and hands the same value back", () => {
    const r = parseRecording(good());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.recording).toEqual(good());
  });

  it("accepts empty lists and no station or video (a phone browser has no barometer)", () => {
    const rec: Partial<Recording> = { ...good(), baro: [], gps: [], marks: [] };
    delete rec.station;
    delete rec.video;
    expect(parseRecording(rec).ok).toBe(true);
  });

  it("rejects something that is not an object", () => {
    expect(errorsOf(null)[0]).toMatch(/JSON object/);
    expect(errorsOf([1, 2])[0]).toMatch(/JSON object/);
  });

  it("names a wrong version", () => {
    expect(errorsOf({ ...good(), v: 2 })).toEqual([expect.stringContaining('"v" must be 1')]);
  });

  it("names a missing list", () => {
    const rec: Partial<Recording> = good();
    delete rec.baro;
    expect(errorsOf(rec)).toEqual([expect.stringContaining('"baro" must be a list')]);
  });

  it("points at the first bad row by number", () => {
    const bad = { ...good(), motion: [[1, 2, 3, 4, 5, 6, 7], [1, 2, 3]] };
    expect(errorsOf(bad)).toEqual([expect.stringContaining('"motion" row 2 should be 7 numbers')]);
  });

  it("rejects non-finite numbers", () => {
    expect(errorsOf({ ...good(), steps: [[1, Number.NaN]] })[0]).toMatch(/"steps" row 1/);
  });

  it("rejects a mark with an unknown kind", () => {
    const e = errorsOf({ ...good(), marks: [{ t: 1, kind: "escalator" }] });
    expect(e[0]).toMatch(/"marks" item 1/);
  });

  it("rejects a bad video and reports every problem at once", () => {
    const e = errorsOf({ ...good(), device: "", video: { file: 3 } });
    expect(e).toHaveLength(2);
  });
});
