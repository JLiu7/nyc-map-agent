import { describe, expect, it } from "vitest";
import type { ActiveTrip } from "@/lib/transit/activeTrip";
import { bestGuess, partOf, readSignal, signalPoor, type Fix } from "./lostGuess";
import { guessText, offlineReply, signalChips, signalForAgent } from "./lostText";

const NOW = 1_800_000_000_000;
const FULTON = { id: "A38", name: "Fulton St", lon: -74.0077, lat: 40.7102 };
const GCT = { id: "631", name: "Grand Central-42 St", lon: -73.9768, lat: 40.7518 };
/** Grand Central to Fulton St on the 4, out at Fulton St & Nassau St. */
const trip: ActiveTrip = {
  id: "t1",
  destination: { label: "Fulton St & Nassau St", at: [-74.0083, 40.7103] },
  legs: [
    { kind: "walk" },
    { kind: "enter", station: GCT, portal: { lon: -73.977, lat: 40.752, label: "42 St & Park Av" } },
    { kind: "ride", route: "4" },
    { kind: "exit", station: FULTON, portal: { lon: -74.0083, lat: 40.7103, label: "Fulton St & Nassau St · NE corner" } },
    { kind: "walk" },
  ],
};
/**
 * The trip the live site planned for "Take the 4 train from Grand Central to Fulton St" on 2026-11-12 at
 * 23:47, with the 4 out between Grand Central and Utica Av: the M15 bus, then a walk to Fulton St station.
 * No subway ride, so no station to get off at. Stops and turns trimmed.
 */
const busTrip: ActiveTrip = {
  id: "live-m15",
  destination: { label: "Fulton St station", at: [-74.007582, 40.710374] },
  legs: [
    { kind: "walk", label: "Walk to 2 Av/E 41 St" },
    { kind: "ride", route: "M15", label: "M15 bus 2 Av/E 41 St → Pearl St/Fulton St (toward SOUTH FERRY via 2 AV)", stops: [{ at: [-73.97388, 40.747638], text: "2 Av/E 39 St" }] },
    { kind: "walk", label: "Walk from Pearl St/Fulton St to Fulton St station" },
  ],
};
const stations = [FULTON, GCT];
const nearest = (at: [number, number]) => {
  const d = (s: typeof FULTON) => Math.hypot((s.lon - at[0]) * 84_000, (s.lat - at[1]) * 111_000);
  const s = [...stations].sort((a, b) => d(a) - d(b))[0];
  return { id: s.id, name: s.name, at: [s.lon, s.lat] as [number, number], d: d(s) };
};
const fixAt = (s: typeof FULTON, accuracy: number, ageS: number): Fix => ({ at: [s.lon, s.lat], accuracy, fixAt: NOW - ageS * 1000 });
const base = { ctx: { from: "home" as const }, trip: null, train: null, under: null, fix: null, now: NOW, nearest, partFor: () => null };
const sig = (fix: Fix | null, online = true) => readSignal({ online, fix, now: NOW });

describe("signal (#131)", () => {
  it("is poor offline, on 2G, with a wide fix and with an old one", () => {
    expect(readSignal({ online: false, fix: null, now: NOW }).net).toBe("offline");
    expect(readSignal({ online: true, connection: { effectiveType: "slow-2g" }, fix: null, now: NOW }).net).toBe("weak");
    expect(readSignal({ online: true, connection: { effectiveType: "4g", downlink: 0.2 }, fix: null, now: NOW }).net).toBe("weak");
    expect(sig(fixAt(FULTON, 180, 5)).gps).toBe("weak");
    expect(sig(fixAt(FULTON, 20, 400))).toMatchObject({ gps: "old", ageMin: 7 });
    expect(signalPoor(sig(fixAt(FULTON, 20, 5)))).toBe(false);
  });
  it("says only what is poor, in the app's language", () => {
    expect(signalChips(sig(fixAt(FULTON, 180, 5), false), "en")).toEqual(["No network", "Location ±180 m"]);
    expect(signalChips(sig(null, false), "es")).toEqual(["Sin red", "Sin ubicación"]);
    expect(signalForAgent(sig(fixAt(FULTON, 20, 5)))).toBeUndefined();
  });
});

describe("best guess (#131)", () => {
  it("after a trip with no signal: off the trip's train at its station, with the train part and the exit", () => {
    const g = bestGuess({ ...base, trip, signal: sig(null, false), partFor: (id) => (id === "A38" ? "at the front" : null) });
    expect(g).toMatchObject({ from: "trip", stage: "off", station: "Fulton St", line: "4", part: "front", exit: "Fulton St & Nassau St · NE corner" });
    expect(guessText(g, "en")).toBe("You're probably at Fulton St, just off the 4 train. The stairs to your exit are at the front of the train. Your exit: Fulton St & Nassau St · NE corner. Is that right?");
    expect(guessText(g, "es")).toContain("recién bajado del tren 4");
    expect(guessText(g, "zh")).toContain("前部");
  });
  it("an old fix at the boarding station means you have not ridden yet", () => {
    const fix = fixAt(GCT, 30, 600);
    const g = bestGuess({ ...base, trip, fix, signal: sig(fix) });
    expect(g).toMatchObject({ stage: "waiting", station: "Grand Central-42 St", line: "4" });
    expect(guessText(g, "en")).toBe("You're probably at Grand Central-42 St, waiting for the 4 train. Is that right?");
  });
  it("a good fresh fix names the station it is in", () => {
    const fix = fixAt(FULTON, 25, 10);
    expect(bestGuess({ ...base, trip, fix, signal: sig(fix) })).toMatchObject({ from: "gps", stage: "off", station: "Fulton St", line: "4" });
    expect(bestGuess({ ...base, fix, signal: sig(fix) })).toMatchObject({ from: "gps", stage: "at", station: "Fulton St", line: null });
  });
  it("a followed train's card: on that train, toward its next stop", () => {
    const g = bestGuess({ ...base, ctx: { from: "train", line: "A", nextStop: "Fulton St" }, signal: sig(null) });
    expect(guessText(g, "en")).toBe("You're probably on the A train, heading to Fulton St. Is that right?");
  });
  it("a train followed long ago no longer counts", () => {
    const g = bestGuess({ ...base, train: { line: "A", nextStop: "Fulton St", at: NOW - 3_600_000 }, signal: sig(null) });
    expect(g.stage).toBeNull();
  });
  it("only an old fix: the station by it, and how old", () => {
    const fix = fixAt(FULTON, 40, 300);
    const g = bestGuess({ ...base, fix, signal: sig(fix) });
    expect(guessText(g, "en")).toBe("You're probably at Fulton St. That's from 5 min ago. Is that right?");
  });
  it("nothing known: asks which station", () => {
    expect(guessText(bestGuess({ ...base, signal: sig(null) }), "en")).toMatch(/^I can't tell where you are/);
  });
  it("a walk: where to and the landmark", () => {
    const g = bestGuess({ ...base, ctx: { from: "walk", walkingTo: "Fulton St", landmark: "St. Paul's Chapel" }, signal: sig(null) });
    expect(guessText(g, "en")).toBe("You're on your walk to Fulton St. Look for St. Paul's Chapel. Is that right?");
  });
  it("reads the station walk's train parts", () => {
    expect(partOf("between the middle and the back")).toBe("backMid");
    expect(partOf("somewhere")).toBeNull();
  });
  it("offline, the exit's signs are the way meanwhile", () => {
    expect(offlineReply("Fulton St & Nassau St", "en")).toBe("No connection here. I'll send this when you're back online. Meanwhile, follow the Exit signs for Fulton St & Nassau St.");
  });
});

describe("a trip with no subway ride (live, 2026-11-12)", () => {
  it("guesses the station the trip ends at, not 'I can't tell'", () => {
    const g = bestGuess({ ...base, trip: busTrip, signal: sig(null) });
    expect(g).toMatchObject({ from: "trip", stage: "at", station: "Fulton St", stationId: "A38" });
    expect(guessText(g, "en")).toBe("You're probably at Fulton St. Is that right?");
  });
  it("still asks when the trip ends at a street address", () => {
    const g = bestGuess({ ...base, trip: { ...busTrip, destination: { label: "Fulton St & Nassau St", at: [-74.0083, 40.7103] } }, signal: sig(null) });
    expect(g.stage).toBeNull();
  });
});
