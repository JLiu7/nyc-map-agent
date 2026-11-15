import { describe, expect, it } from "vitest";
import { buildTimeline } from "./flythrough";
import { trip as tripSchema, type Trip } from "./schema";
import { withStairs } from "./stationStairs";
import { withStepFree } from "./stream";
import { readStepFree, setStepFreePref, STEP_FREE_KEY } from "@/lib/stepFreePref";

// The same trip as agent.test.ts: Union Sq to Grand Central on the 4.
const sampleTrip: Trip = tripSchema.parse({
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

describe("Elevators only (#133)", () => {
  it("is kept on the phone and off by default", () => {
    const store = new Map<string, string>();
    const s = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
    expect(readStepFree(s)).toBe(false);
    setStepFreePref(true, s);
    expect(store.get(STEP_FREE_KEY)).toBe("1");
    expect(readStepFree(s)).toBe(true);
    setStepFreePref(false, s);
    expect(readStepFree(s)).toBe(false);
  });

  it("goes with the question only when on, and never overrides what the request says", () => {
    const req = { messages: [{ role: "user", content: "to Fulton St" }] } as unknown as Parameters<typeof withStepFree>[0];
    expect(withStepFree(req, false)).toBe(req);
    expect(withStepFree(req, true).stepFree).toBe(true);
    expect(withStepFree({ ...req, stepFree: false }, true).stepFree).toBe(false);
  });

  it("rides the elevator in the preview instead of walking the stairs", () => {
    const t = tripSchema.parse({
      ...sampleTrip,
      legs: sampleTrip.legs.map((l) => (l.kind === "enter" || l.kind === "exit" ? { ...l, portal: { ...l.portal, type: "Elevator", elevatorOnly: true, outage: null, stepFree: true } } : l)),
    });
    const segs = buildTimeline(t);
    const down = segs.find((s) => s.kind === "descend")!, up = segs.find((s) => s.kind === "ascend")!;
    expect(down.elevator && up.elevator).toBe(true);
    expect(down.callouts[0].text).toContain("Take the elevator down");
    expect(up.callouts[0].text).toContain("Take the elevator up");
    // The x-ray stairs leave an elevator ride alone.
    const xray = { [down.station!]: {} as never, [up.station!]: {} as never };
    expect(withStairs(segs, xray)).toEqual(segs);
  });

  it("leaves a trip planned without the setting exactly as before", () => {
    const segs = buildTimeline(sampleTrip);
    expect(segs.some((s) => s.elevator)).toBe(false);
    expect(segs.find((s) => s.kind === "ascend")!.callouts[0].text).not.toContain("Take the elevator");
  });
});
