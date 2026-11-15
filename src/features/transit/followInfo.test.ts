import { describe, expect, it } from "vitest";
import { alertTimeLabel, busNextName, classifyRouteAlerts, skipNamesFor, upcomingStops } from "./followInfo";
import type { TransitAlert } from "./hooks";

const alert = (p: Partial<TransitAlert>): TransitAlert => ({ id: "a", kind: "notice", type: "", reroute: false, text: "", agency: "", routes: [], stops: [], ...p });

describe("follow card alerts", () => {
  const list = [
    alert({ id: "d", kind: "delay", routes: ["F"], text: "Delays" }),
    alert({ id: "n", kind: "notice", routes: ["F"], text: "Notice" }),
    alert({ id: "p", kind: "planned", routes: ["F"], reroute: true, text: "Work" }),
    alert({ id: "o", kind: "delay", routes: ["A"], text: "Other" }),
  ];
  it("splits delays from notices for the followed route", () => {
    const g = classifyRouteAlerts(list, "F");
    expect(g.delays.map((a) => a.id)).toEqual(["d"]);
    expect(g.notices.map((a) => a.id)).toEqual(["n", "p"]);
  });
  it("uses the alert period, and says nothing when there is no time", () => {
    expect(alertTimeLabel({ period: "Weeknights 10pm – 5am" })).toBe("Weeknights 10pm – 5am");
    expect(alertTimeLabel({ start: 1_700_000_000 })).toMatch(/until further notice/);
    expect(alertTimeLabel({})).toBeNull();
    expect(alertTimeLabel(undefined)).toBeNull();
  });
  it("names the stations that trip skips", () => {
    const a = alert({
      routes: ["7"],
      changes: [{ alertId: "a", route: "7", kind: "skip", names: ["52 St", "69 St"], toward: "Flushing", notice: "Skipped Flushing-bound" }],
    });
    expect(skipNamesFor(a, "7")).toEqual(["52 St", "69 St"]);
    expect(skipNamesFor(a, "F")).toEqual([]);
  });
});

describe("follow card stops", () => {
  const trip = [["A", 100], ["B", 160], ["C", 220], ["D", 300]] as const;
  it("starts at the next stop, even when the one just left is still within 30 s", () => {
    expect(upcomingStops(trip, "C", 170).map(([id]) => id)).toEqual(["C", "D"]);
  });
  it("matches the next stop by station when the ids differ", () => {
    expect(upcomingStops(trip, "Cn", 0, (a, b) => a[0] === b[0]).map(([id]) => id)).toEqual(["C", "D"]);
  });
  it("falls back to the times without a next stop", () => {
    expect(upcomingStops(trip, undefined, 180).map(([id]) => id)).toEqual(["B", "C", "D"]);
    expect(upcomingStops(trip, "Z", 180).map(([id]) => id)).toEqual(["B", "C", "D"]);
  });
});

describe("the mini map's next bus stop", () => {
  const stops = [{ id: "MTA_405056", name: "NORTH END AV/WARREN ST" }];
  it("uses the trip's first call, the stop the follow card shows", () => {
    expect(busNextName("VESEY ST/NORTH END AV", stops, "405056")).toBe("Vesey Street/North End Avenue");
  });
  it("names the feed's stop id from the route until the trip has loaded", () => {
    expect(busNextName(undefined, stops, "405056")).toBe("North End Avenue/Warren Street");
    expect(busNextName(undefined, stops, "MTA_405056")).toBe("North End Avenue/Warren Street");
  });
  it("shows nothing rather than a bare stop id", () => {
    expect(busNextName(undefined, stops, "999999")).toBeNull();
    expect(busNextName(undefined, undefined, "405056")).toBeNull();
    expect(busNextName(undefined, stops, undefined)).toBeNull();
  });
});
