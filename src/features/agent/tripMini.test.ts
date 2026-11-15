import { describe, expect, it } from "vitest";
import type { Segment } from "./flythrough";
import { nextStopAt, tripMiniLine } from "./tripMini";

const seg = (kind: Segment["kind"], label: string, callouts: Segment["callouts"] = [], route?: string): Segment =>
  ({ kind, label, coords: [[-74.004, 40.712], [-74.006, 40.71]], realS: 60, underground: kind !== "walk", route, callouts });

const trip: Segment[] = [
  seg("walk", "Walk to Brooklyn Bridge–City Hall"),
  seg("descend", "Enter Brooklyn Bridge–City Hall"),
  seg("ride", "4 train Brooklyn Bridge–City Hall → Fulton St (toward Woodlawn)", [{ f: 0, text: "4 train" }, { f: 0.5, text: "Wall St", quiet: true }], "4"),
  seg("ascend", "Use the exit at Fulton St"),
  seg("walk", "Walk to Broadway/Fulton St"),
  seg("ride", "M55 bus Broadway/Fulton St → Houston St", [{ f: 0, text: "M55 bus" }], "M55"),
  seg("walk", "Walk to the destination"),
];

describe("the trip's mini map", () => {
  it("names where the next ride starts while walking or on the stairs", () => {
    expect(nextStopAt(trip, 0, 0.3, "Aldi")).toBe("Brooklyn Bridge–City Hall");
    expect(nextStopAt(trip, 3, 0.5, "Aldi")).toBe("Broadway/Fulton St");
  });
  it("names the next station on a ride, then the stop you get off at", () => {
    expect(nextStopAt(trip, 2, 0.2, "Aldi")).toBe("Wall St");
    expect(nextStopAt(trip, 2, 0.8, "Aldi")).toBe("Fulton St");
  });
  it("names the destination after the last ride", () => {
    expect(nextStopAt(trip, 6, 0.1, "Aldi")).toBe("Aldi");
  });
  it("draws rides in their line colour and the rest in slate", () => {
    const colors = tripMiniLine(trip).features.map((f) => String(f.properties?.color));
    expect(colors[0]).toBe("#475569");
    expect(colors[2]).not.toBe("#475569");
    expect(colors).toHaveLength(trip.length);
  });
});
