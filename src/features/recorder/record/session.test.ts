import { describe, expect, it } from "vitest";
import { parseRecording } from "../format";
import { clock, createCollector, deviceName, fileStem, gpsRow, headingRow, motionRow, pickVideoType, recordingJson, videoExt } from "./session";

const T = 1_763_150_000_000;
const phoneMotion = {
  accelerationIncludingGravity: { x: 0.12345, y: -9.80665, z: 0.5 },
  rotationRate: { alpha: 3.3333, beta: 1.1111, gamma: 2.2222 },
};

describe("rows from browser events", () => {
  it("keeps acceleration with gravity and puts rotation in x, y, z order (beta, gamma, alpha)", () => {
    expect(motionRow(T, phoneMotion)).toEqual([T, 0.123, -9.807, 0.5, 1.111, 2.222, 3.333]);
  });

  it("drops a motion event with anything missing, as a laptop sends", () => {
    expect(motionRow(T, { accelerationIncludingGravity: null, rotationRate: null })).toBeNull();
    expect(motionRow(T, { accelerationIncludingGravity: { x: 1, y: 2, z: null }, rotationRate: { alpha: 0, beta: 0, gamma: 0 } })).toBeNull();
    expect(motionRow(T, { accelerationIncludingGravity: { x: 1, y: 2, z: 3 } })).toBeNull();
  });

  it("keeps the orientation angles as the browser gives them", () => {
    expect(headingRow(T, { alpha: 359.987, beta: -12.3456, gamma: 45 })).toEqual([T, 359.99, -12.35, 45]);
    expect(headingRow(T, { alpha: null, beta: 1, gamma: 2 })).toBeNull();
  });

  it("keeps a location fix with its accuracy in metres", () => {
    expect(gpsRow(T, { latitude: 40.735123456, longitude: -73.990987654, accuracy: 17.25 })).toEqual([T, 40.7351235, -73.9909877, 17.3]);
    expect(gpsRow(T, { latitude: Number.NaN, longitude: 1, accuracy: 1 })).toBeNull();
  });
});

describe("a recording collected in the browser", () => {
  const collect = () => {
    const c = createCollector(T, "iPhone");
    c.motion(T + 10, phoneMotion);
    c.motion(T + 20, {}); // dropped
    c.motion(T + 30, phoneMotion);
    c.heading(T + 15, { alpha: 10, beta: 20, gamma: 30 });
    c.gps(T + 1000, { latitude: 40.7359, longitude: -73.9911, accuracy: 25 });
    c.mark(T + 4000, "stairs");
    c.mark(T + 9000, "elevator");
    return c;
  };

  it("counts the rows it kept and the marks", () => {
    expect(collect().counts()).toEqual({ motion: 2, heading: 1, gps: 1, marks: 2 });
  });

  it("finishes as a recording the format's checker accepts, with the video named", () => {
    const rec = collect().finish({ file: "walk-x.mp4", startedAt: T + 50 });
    const parsed = parseRecording(JSON.parse(recordingJson(rec)));
    expect(parsed.ok).toBe(true);
    expect(rec).toMatchObject({ v: 1, startedAt: T, device: "iPhone", baro: [], steps: [], video: { file: "walk-x.mp4", startedAt: T + 50 } });
    expect(rec.marks).toEqual([{ t: T + 4000, kind: "stairs" }, { t: T + 9000, kind: "elevator" }]);
  });

  it("saves a laptop's recording too: no motion rows, marks only, no video field when there is no video", () => {
    const c = createCollector(T, "Windows");
    c.motion(T + 1, { accelerationIncludingGravity: null, rotationRate: null });
    c.mark(T + 2, "sign");
    const rec = c.finish();
    expect(rec.video).toBeUndefined();
    expect(parseRecording(JSON.parse(recordingJson(rec)))).toMatchObject({ ok: true });
    expect(rec.motion).toEqual([]);
  });

  it("refuses to save a file the format would reject", () => {
    const rec = collect().finish();
    expect(() => recordingJson({ ...rec, startedAt: Number.NaN })).toThrow(/does not match the format/);
  });
});

describe("names and labels", () => {
  it("names the device plainly", () => {
    expect(deviceName("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)")).toBe("iPhone");
    expect(deviceName("Mozilla/5.0 (Linux; Android 15; Pixel 8 Build/AP3A) AppleWebKit")).toBe("Android (Pixel 8)");
    expect(deviceName("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("Windows");
    expect(deviceName("")).toBe("Unknown browser");
  });

  it("names the files by the local start time", () => {
    expect(fileStem(new Date(2026, 10, 14, 17, 5, 9).getTime())).toBe("walk-2026-11-14-170509");
  });

  it("picks the first video type the browser can record and its extension", () => {
    expect(pickVideoType((t) => t.startsWith("video/webm"))).toBe("video/webm;codecs=vp9");
    expect(pickVideoType((t) => t === "video/mp4")).toBe("video/mp4");
    expect(pickVideoType(() => false)).toBe("");
    expect(videoExt("video/mp4;codecs=avc1")).toBe("mp4");
    expect(videoExt("video/webm;codecs=vp8")).toBe("webm");
    expect(videoExt("")).toBe("webm");
  });

  it("shows minutes and seconds", () => {
    expect(clock(7_400)).toBe("0:07");
    expect(clock(750_000)).toBe("12:30");
    expect(clock(-5)).toBe("0:00");
  });
});
