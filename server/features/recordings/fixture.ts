import type { Recording } from "../../../src/features/recorder/format";

/** A small, valid recording of a walk; tests change one field at a time from here. */
export function recording(over: Partial<Recording> = {}): Recording {
  return {
    v: 1,
    startedAt: Date.parse("2026-11-16T14:05:06Z"),
    device: "Pixel 8",
    motion: [[0, 0, 0, 9.8, 0, 0, 0]],
    heading: [[0, 0, 0, 0]],
    gps: [[0, 40.7306, -73.9972, 8]],
    baro: [[0, 0]],
    steps: [[0, 0]],
    marks: [{ t: 1200, kind: "stairs" }],
    video: { file: "walk.mp4", startedAt: 0 },
    ...over,
  };
}

/** The body of POST /api/recordings: the phone's video size beside the JSON. */
export const start = (over: Partial<Recording> = {}, bytes: number | undefined = 10) => ({
  device: "Pixel 8",
  json: recording(over),
  ...(bytes === undefined ? {} : { bytes }),
});
