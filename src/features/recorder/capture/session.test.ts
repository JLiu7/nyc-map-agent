import { describe, expect, it } from "vitest";
import { parseRecording } from "../format";
import { addGps, addHeading, addMark, addMotion, clock, extFor, fileBase, newSession, pickMime, toRecording } from "./session";

const T0 = Date.UTC(2026, 10, 14, 18, 15, 0);

describe("a recorded segment", () => {
  it("saves rows the recording format's checker accepts, each with its clock time", () => {
    const s = newSession(T0);
    addMotion(s, T0 + 16, { x: 0.1, y: 9.7, z: 0.4 }, { alpha: 3, beta: 1, gamma: 2 });
    addHeading(s, T0 + 20, 271.5, 80, -3);
    addGps(s, T0 + 900, 40.7347, -73.9906, 12);
    addMark(s, T0 + 4000, "elevator");
    const rec = toRecording(s, { device: "test phone", video: { file: "walk.mp4", startedAt: T0 } });
    expect(parseRecording(JSON.parse(JSON.stringify(rec)))).toMatchObject({ ok: true });
    // Rotation is stored about x, y, z: the browser's beta, gamma, alpha.
    expect(rec.motion).toEqual([[T0 + 16, 0.1, 9.7, 0.4, 1, 2, 3]]);
    expect(rec.heading).toEqual([[T0 + 20, 271.5, 80, -3]]);
    expect(rec.gps).toEqual([[T0 + 900, 40.7347, -73.9906, 12]]);
    expect(rec.marks).toEqual([{ t: T0 + 4000, kind: "elevator" }]);
    expect(rec.baro).toEqual([]);
    expect(rec.steps).toEqual([]);
  });

  it("drops a reading with a missing number, never pads it", () => {
    const s = newSession(T0);
    addMotion(s, T0, { x: 1, y: null, z: 3 }, { alpha: 1, beta: 2, gamma: 3 });
    addMotion(s, T0, { x: 1, y: 2, z: 3 }, null);
    addMotion(s, T0, null, { alpha: 1, beta: 2, gamma: 3 });
    addHeading(s, T0, null, 10, 20);
    addGps(s, T0, 40.7, Number.NaN, 5);
    expect([s.motion.length, s.heading.length, s.gps.length]).toEqual([0, 0, 0]);
  });

  it("is still a valid file with no sensors and no video", () => {
    const rec = toRecording(newSession(T0), { device: "" });
    expect(rec.video).toBeUndefined();
    expect(parseRecording(JSON.parse(JSON.stringify(rec)))).toMatchObject({ ok: true });
  });

  it("names files by the local start time and shows elapsed time as minutes and seconds", () => {
    expect(fileBase(new Date(2026, 10, 14, 13, 5, 9).getTime())).toBe("walk-20261114-130509");
    expect([clock(0), clock(7_900), clock(750_000), clock(-5)]).toEqual(["0:00", "0:07", "12:30", "0:00"]);
  });

  it("prefers mp4, then webm, then lets the browser choose", () => {
    expect(pickMime(() => true)).toBe("video/mp4");
    expect(pickMime((m) => m.startsWith("video/webm"))).toBe("video/webm;codecs=vp9");
    expect(pickMime(() => false)).toBe("");
    expect([extFor("video/mp4"), extFor("video/webm;codecs=vp9")]).toEqual(["mp4", "webm"]);
  });
});
