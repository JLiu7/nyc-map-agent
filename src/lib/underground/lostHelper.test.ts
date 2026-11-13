import { describe, expect, it } from "vitest";
import type { ActiveTrip } from "@/lib/transit/activeTrip";
import { notedTrip, noteTrip } from "./lostHelper";

describe("the trip the where-am-I helper remembers", () => {
  it("keeps the last trip after its card closes, for three hours", () => {
    const trip = { destination: { label: "Fulton St" }, legs: [] } as unknown as ActiveTrip;
    noteTrip(trip, 1_000);
    expect(notedTrip(1_000 + 2 * 60 * 60 * 1000)).toBe(trip);
    expect(notedTrip(1_000 + 3 * 60 * 60 * 1000)).toBeNull();
  });
});
