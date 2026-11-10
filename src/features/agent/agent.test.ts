import { describe, expect, it, vi } from "vitest";
import { executeCommand, type ExecutorContext } from "./executor";
import { buildTimeline, calloutAt, calloutInfoAt, poseAt, speakStop, wallSeconds } from "./flythrough";
import { command, streamEvent, trip as tripSchema, type Trip } from "./schema";
import { readEvents } from "./stream";
import { afterWake } from "./useWakePhrase";

export const sampleTrip: Trip = tripSchema.parse({
  id: "t1",
  origin: { label: "Union Sq", at: [-73.9903, 40.7359] },
  destination: { label: "Grand Central", at: [-73.9772, 40.7527] },
  departIso: "2026-10-22T09:00",
  arriveIso: "2026-10-22T09:18",
  routes: ["4"],
  legs: [
    { kind: "walk", label: "Walk to 14 St-Union Sq", coords: [[-73.9903, 40.7359], [-73.9906, 40.7347]], durationS: 120, distanceM: 140, turns: [{ at: [-73.9906, 40.7347], text: "Turn left onto E 14 St" }] },
    { kind: "enter", label: "Enter at the SE entrance", station: { id: "635", name: "14 St-Union Sq", lon: -73.9903, lat: 40.7347 }, portal: { lon: -73.9901, lat: 40.7345, label: "SE entrance", type: "Stair" } },
    { kind: "ride", route: "4", label: "4 train", coords: [[-73.9903, 40.7347], [-73.9768, 40.7518]], durationS: 420, underground: true, geometrySource: "straight-line", stops: [{ at: [-73.9823, 40.7462], text: "33 St" }] },
    { kind: "exit", label: "Use the NE exit near E 42 St & Lexington Av", station: { id: "631", name: "Grand Central-42 St", lon: -73.9768, lat: 40.7518 }, portal: { lon: -73.9762, lat: 40.7522, label: "NE exit", type: "Elevator", elevatorOnly: true, outage: "Elevator out" } },
    { kind: "walk", label: "Walk to Grand Central", coords: [[-73.9762, 40.7522], [-73.9772, 40.7527]], durationS: 60, distanceM: 90 },
  ],
});

const ctx = (): ExecutorContext => ({ flyTo: vi.fn(), showTrip: vi.fn(), openTrip: vi.fn(), enterStreetView: vi.fn(), playFlythrough: vi.fn(), setTime: vi.fn() });

describe("command schema", () => {
  it("accepts every command type", () => {
    for (const c of [
      { type: "flyTo", lon: -74, lat: 40.7, zoom: 15 },
      { type: "showRoute", trip: sampleTrip },
      { type: "openPanel", trip: sampleTrip },
      { type: "enterStreetView", lon: -74, lat: 40.7 },
      { type: "playFlythrough", trip: sampleTrip },
      { type: "setTime", iso: "2026-10-22T09:00" },
    ]) expect(command.safeParse(c).success).toBe(true);
  });
  it("rejects unknown commands and bad coordinates", () => {
    expect(command.safeParse({ type: "deleteMap" }).success).toBe(false);
    expect(command.safeParse({ type: "flyTo", lon: 500, lat: 0 }).success).toBe(false);
  });
  it("trip defaults mode to transit", () => expect(sampleTrip.mode).toBe("transit"));
});

describe("command executor", () => {
  it("dispatches each command to the context", () => {
    const c = ctx();
    expect(executeCommand({ type: "flyTo", lon: -74, lat: 40.7 }, c)).toEqual({ ok: true, type: "flyTo" });
    expect(c.flyTo).toHaveBeenCalledWith(-74, 40.7, undefined);
    executeCommand({ type: "playFlythrough", trip: sampleTrip, speed: 30 }, c);
    expect(c.playFlythrough).toHaveBeenCalledWith(expect.objectContaining({ id: "t1" }), 30);
    executeCommand({ type: "setTime", iso: "2026-10-22T09:00" }, c);
    expect(c.setTime).toHaveBeenCalledWith("2026-10-22T09:00");
  });
  it("refuses invalid input without calling anything", () => {
    const c = ctx();
    expect(executeCommand({ type: "flyTo", lon: "x" }, c).ok).toBe(false);
    expect(c.flyTo).not.toHaveBeenCalled();
  });
  it("contains a throwing handler", () => {
    const c = { ...ctx(), showTrip: () => { throw new Error("no map"); } };
    expect(executeCommand({ type: "showRoute", trip: sampleTrip }, c)).toEqual({ ok: false, error: "no map" });
  });
});

describe("flythrough timeline", () => {
  const segs = buildTimeline(sampleTrip);
  it("walk → descend → ride → ascend → walk", () => {
    expect(segs.map((s) => s.kind)).toEqual(["walk", "descend", "ride", "ascend", "walk"]);
  });
  it("each part starts where the last one ended, so the marker never jumps", () => {
    // The planner's walk out starts at the station's stop point, not at the exit: the marker used to jump back.
    const out = tripSchema.parse({ ...sampleTrip, legs: sampleTrip.legs.map((l, i) => i === 4 && l.kind === "walk" ? { ...l, coords: [[-73.9768, 40.7518], [-73.9762, 40.7522], [-73.9772, 40.7527]] } : l) });
    for (const t of [sampleTrip, out]) {
      const s = buildTimeline(t);
      for (let i = 1; i < s.length; i++) expect(s[i].coords[0]).toEqual(s[i - 1].coords[s[i - 1].coords.length - 1]);
    }
    // In at the entrance, and out from the exit.
    expect(segs[0].coords.at(-1)).toEqual([-73.9901, 40.7345]);
    expect(buildTimeline(out)[4].coords[0]).toEqual([-73.9762, 40.7522]);
  });
  it("holds the parts on foot long enough to read and keeps the ride short", () => {
    // A 7 minute ride: capped at 10 s at 10x, however long it really is.
    expect(wallSeconds(segs[2], 10)).toBe(10);
    expect(wallSeconds({ ...segs[2], realS: 1800 }, 10)).toBe(10);
    expect(wallSeconds({ ...segs[2], realS: 20 }, 10)).toBe(4);
    // A short walk and a station without its stairs still get 4 s.
    expect(wallSeconds(segs[0], 10)).toBe(4);
    expect(wallSeconds(segs[1], 10)).toBe(4);
    // A long walk stops at 12 s.
    expect(wallSeconds({ ...segs[0], realS: 1200 }, 10)).toBe(12);
  });
  it("gives the walk through a station the most time", () => {
    const stairs = { ...segs[1], depths: [0, -8] };
    expect(wallSeconds(stairs, 10)).toBe(6);
    expect(wallSeconds({ ...stairs, inside: {} as never }, 10)).toBe(22);
    expect(wallSeconds({ ...stairs, inside: {} as never }, 10)).toBeGreaterThan(wallSeconds(segs[2], 10));
  });
  it("scales every scene with the speed", () => {
    expect(wallSeconds(segs[2], 2)).toBe(50);
    expect(wallSeconds(segs[2], 5)).toBe(20);
    expect(wallSeconds(segs[0], 30)).toBeCloseTo(4 / 3);
    expect(wallSeconds({ ...segs[0], realS: 1200 }, 30)).toBe(4);
  });
  it("walks at eye level and rides lower, x-ray underground", () => {
    expect(poseAt(segs[0], 0.5).pitch).toBe(75);
    expect(poseAt(segs[2], 0.5).zoom).toBeLessThan(17);
    expect(segs[2].underground).toBe(true);
  });
  it("calls out stops and the exit with its outage", () => {
    expect(calloutAt(segs[2], 0.9)).toBe("33 St");
    expect(calloutAt(segs[3], 0)).toContain("Elevator out");
  });
  it("speaks only the last two stops of a ride; the rest only show", () => {
    expect([0, 1, 2, 3, 4].map((i) => speakStop(i, 5))).toEqual([false, false, false, true, true]);
    expect(calloutInfoAt(segs[2], 0).quiet).toBe(false); // boarding is spoken
  });
});

describe("stream + wake phrase", () => {
  it("parses NDJSON and drops junk", async () => {
    const lines = [JSON.stringify({ type: "text", text: "hi" }), "garbage", JSON.stringify({ type: "tool", name: "geocode" })].join("\n") + "\n";
    const body = new Response(lines).body!;
    const out = [];
    for await (const e of readEvents(body)) out.push(e);
    expect(out).toEqual([{ type: "text", text: "hi" }, { type: "tool", name: "geocode" }]);
    expect(streamEvent.safeParse({ type: "nope" }).success).toBe(false);
  });
  it("extracts the request after 'Hey map'", () => {
    expect(afterWake("hey map, how is my trip tomorrow")).toBe("how is my trip tomorrow");
    expect(afterWake("what's the weather")).toBeNull();
  });
});
