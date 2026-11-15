import { describe, expect, it } from "vitest";
import { lineNotices } from "./lineNotices";
import type { Outage, TransitAlert } from "./hooks";
import type { StaticSystem } from "./model";

const st = (id: string, name: string, routes: string, lon: number): GeoJSON.Feature<GeoJSON.Point, { id: string; name: string; routes: string }> => ({
  type: "Feature", properties: { id, name, routes }, geometry: { type: "Point", coordinates: [lon, 40.75] },
});
const sys = {
  system: "subway",
  routes: {},
  lines: { type: "FeatureCollection", features: [] },
  stations: { type: "FeatureCollection", features: [st("A27", "42 St-Port Authority Bus Terminal", "A C E", -73.99), st("A28", "34 St-Penn Station", "A C E", -73.993), st("A31", "14 St", "A C E L", -74.0)] },
  shapes: { A: { c: [[-73.99, 40.75], [-73.993, 40.75], [-74.0, 40.75]], m: [0, 1000, 2000], g: ["underground", "underground", "underground"] } },
  stopM: { A: { A27: 0, A28: 1000, A31: 2000 } },
} as unknown as StaticSystem;

const alert = (over: Partial<TransitAlert>): TransitAlert => ({ id: "x", kind: "notice", type: "", reroute: false, text: "", agency: "MTASBWY", routes: ["A"], stops: [], ...over });

describe("lineNotices", () => {
  it("keeps only this line's subway alerts, the skip ahead of the delay, and rings a delay's named station", () => {
    const out = lineNotices("A", [
      alert({ id: "d", kind: "delay", text: "[A] trains are delayed while we fix a signal problem at 42 St-Port Authority Bus Terminal.", start: 100 }),
      alert({ id: "w", kind: "planned", text: "Downtown [A] skips 34 St-Penn Station", stops: ["A28S"], skipNames: ["34 St-Penn Station"], period: "Sat and Sun" }),
      alert({ id: "other", kind: "delay", routes: ["6"], text: "6 delays" }),
      alert({ id: "mnr", agency: "MNR", text: "A" }),
    ], [], sys, 200);
    expect(out.map((n) => n.id)).toEqual(["w", "d"]);
    expect(out[1].title).toContain("A trains are delayed");
    expect(out[1].stations.map((s) => s.label)).toEqual(["Delays"]);
    expect(out[1].stations[0].id).toBe("A27");
    expect(out[0].meta).toBe("Planned work · Sat and Sun");
    expect(out[0].stations).toEqual([{ id: "A28", name: "34 St-Penn Station", coord: [-73.993, 40.75], label: "34 St-Penn Station · Downtown skipped" }]);
  });

  it("turns an elevator outage into an access notice ringed at its station", () => {
    const o: Outage = { id: "EL1", station: "14 St", routes: ["A", "C", "E"], stops: ["A31"], equipment: "Elevator", serving: "Street to mezzanine", reason: "Repair", since: "", back: "Nov 2", ada: "yes", alternative: "" };
    const [n] = lineNotices("A", [], [o], sys);
    expect(n.tone).toBe("access");
    expect(n.title).toBe("Elevator out at 14 St");
    expect(n.meta).toBe("Street to mezzanine · until Nov 2");
    expect(n.stations[0].label).toBe("No elevator");
  });

  it("puts every unit out at one station on one card, an up and down pair as one row", () => {
    const esc = (id: string, serving: string, back: string): Outage => ({ id, station: "14 St", routes: ["A", "C", "E"], stops: ["A31"], equipment: "Escalator", serving, reason: "Capital Replacement", since: "", back, ada: "not-ada", alternative: "" });
    // The latest one first, as the MTA feed can list them: the range still reads soonest to latest.
    const units = [
      esc("ES3", "platform to mezzanine", "12/31/2026 11:59:00 PM"),
      esc("ES1", "mezzanine to 14 St & 8 Av (NE corner)", "10/31/2026 11:59:00 PM"),
      esc("ES2", "14 St & 8 Av (NE corner) to mezzanine", "10/31/2026 11:59:00 PM"),
    ];
    const elevator: Outage = { ...esc("EL9", "street to mezzanine", "11/02/2026 09:00:00 PM"), equipment: "Elevator", ada: "yes" };
    const other: Outage = { ...esc("ES7", "street to mezzanine", ""), station: "34 St-Penn Station", stops: ["A28"] };
    const out = lineNotices("A", [], [...units, other], sys);
    expect(out.map((n) => n.title)).toEqual(["3 escalators out at 14 St", "Escalator out at 34 St-Penn Station"]);
    const [n] = out;
    expect(n.meta).toBe(`until ${new Date(2026, 9, 31).toLocaleDateString([], { month: "short", day: "numeric" })} to ${new Date(2026, 11, 31).toLocaleDateString([], { month: "short", day: "numeric" })}`);
    expect(n.body.split("\n")).toHaveLength(3);
    expect(n.body).toContain("mezzanine to 14 St & 8 Av (NE corner), both ways");
    expect(n.body).toContain("Out of service: capital replacement.");
    expect(n.stations).toHaveLength(1);
    expect(n.stations[0].label).toBe("No escalator");
    const [mixed] = lineNotices("A", [], [units[2], elevator], sys);
    expect(mixed.title).toBe("Elevator and escalator out at 14 St");
    expect(mixed.body).toMatch(/^• Elevator: street to mezzanine/m);
    expect(mixed.stations[0].label).toBe("No elevator");
  });

  it("is empty without the static system", () => {
    expect(lineNotices("A", [alert({})], [], undefined)).toEqual([]);
  });
});

import { readFileSync } from "node:fs";
import { heldNotices } from "./lineNotices";
describe("heldNotices", () => {
  const real = JSON.parse(readFileSync(new URL("../../../public/transit/subway.json", import.meta.url), "utf8")) as StaticSystem;
  // Real ids from the MTA BDFM feed captured 2026-10-21: F 094550 STOPPED_AT Bay Pkwy (F32S), bound for Coney Island (D43S).
  const NOW = 1792616621;
  const f = { tripId: "094550_F..S", route: "F", kind: "Holding" as const, stop: "F32S", stopped: true, since: NOW - 300, toward: "D43S" };
  it("says which train is held, where, toward where and for how long, and rings that station", () => {
    const [n] = heldNotices("F", [f], real, NOW);
    expect(n.title).toBe("F train held at Bay Pkwy");
    expect(n.meta).toBe("To Coney Island-Stillwell Av · 5 min");
    expect(n.tone).toBe("delay");
    expect(n.stations).toEqual([expect.objectContaining({ id: "F32", name: "Bay Pkwy", label: "Held" })]);
  });
  it("keeps only this line's trains, longest hold first, and says 'before' a stop not yet reached", () => {
    const out = heldNotices("F", [f, { ...f, tripId: "a", route: "A", stop: "A41S" }, { ...f, tripId: "older", stop: "F33S", stopped: false, since: NOW - 900 }], real, NOW);
    expect(out.map((n) => n.id)).toEqual(["held:older", "held:094550_F..S"]);
    expect(out[0].title).toMatch(/^F train held before /);
  });
});

describe("skip direction on the map", () => {
  it("names the direction from the parsed change", () => {
    const out = lineNotices("A", [alert({ id: "s", kind: "planned", text: "[A] skips 34 St-Penn Station", stops: ["A28S"], skipNames: ["34 St-Penn Station"], changes: [{ alertId: "s", kind: "skip", route: "A", names: ["34 St-Penn Station"], toward: "Far Rockaway", notice: "" }] })], [], sys, 200);
    expect(out[0].stations[0].label).toBe("34 St-Penn Station · Far Rockaway-bound skipped");
  });
  it("says plain Skipped when no direction is known", () => {
    const out = lineNotices("A", [alert({ id: "s", kind: "planned", text: "[A] skips 34 St-Penn Station", stops: ["A28S"], skipNames: ["34 St-Penn Station"] })], [], sys, 200);
    expect(out[0].stations[0].label).toBe("34 St-Penn Station · Skipped");
  });
});

describe("outage tag icons", async () => {
  const { tagIcon } = await import("./LinePanel");
  it("draws an elevator or escalator, nothing for other tags", () => {
    expect(tagIcon("No elevator")).toContain("<rect");
    expect(tagIcon("No escalator")).toContain("<path");
    expect(tagIcon("Delays")).toBeNull();
  });
});
