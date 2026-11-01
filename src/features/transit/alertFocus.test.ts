import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { alertGeometry, isSkipped, lineStatus, namedStations, skippedStations, stationChanges, suspendedBetween } from "./alertFocus";
import type { TransitAlert } from "./hooks";
import type { StaticSystem } from "./model";

const sub = JSON.parse(readFileSync("public/transit/subway.json", "utf8")) as StaticSystem;
const base: TransitAlert = { id: "x", kind: "planned", type: "Planned - Reroute", reroute: true, text: "", agency: "MTASBWY", routes: ["F"], stops: [] };

describe("alert focus geometry", () => {
  it("finds skipped F stations by name and draws the reroute over the E then the A", () => {
    const a: TransitAlert = { ...base, via: ["E", "A"], skipNames: ["21 St-Queensbridge", "Roosevelt Island", "Lexington Av/63 St", "York St"] };
    const names = skippedStations(a, sub, "F").map((id) => sub.stations.features.find((f) => f.properties.id === id)?.properties.name);
    expect(names).toEqual(expect.arrayContaining(["21 St-Queensbridge", "Roosevelt Island", "York St"]));
    const g = alertGeometry(a, sub);
    expect(g.affected).toHaveLength(1);
    expect(g.reroute.map((r) => r.route)).toEqual(["E", "A"]);
    // The A leg ends near Jay St-MetroTech (Brooklyn), not up in Inwood.
    const end = g.reroute[1].coords;
    const jay = sub.stations.features.find((f) => f.properties.id === "A41")!.geometry.coordinates;
    const last = [end[0], end[end.length - 1]].reduce((b, p) => (Math.hypot(p[0] - jay[0], p[1] - jay[1]) < Math.hypot(b[0] - jay[0], b[1] - jay[1]) ? p : b));
    expect(Math.hypot(last[0] - jay[0], last[1] - jay[1])).toBeLessThan(0.01);
    expect(g.bounds).not.toBeNull();
  });
  it("uses informed stop ids (with N/S suffixes) and highlights only the stretch around them", () => {
    const g = alertGeometry({ ...base, stops: ["F23N", "F25"], routes: ["F"] }, sub);
    expect(g.skipped.map((s) => s.id).sort()).toEqual(["F23", "F25"]);
    expect(g.affected[0].coords.length).toBeLessThan(sub.shapes.F.c.length / 2);
  });
  it("frames the stations an alert names instead of the whole line", () => {
    const name = (id: string) => sub.stations.features.find((f) => f.properties.id === id)?.properties.name;
    const one = { ...base, kind: "planned" as const, reroute: true, routes: ["7"], text: "In Queens, no [7] at Flushing-Main St" };
    expect(namedStations(one.text, sub, "7").map(name)).toEqual(["Flushing-Main St"]);
    const g = alertGeometry(one, sub);
    expect(g.affected[0].coords.length).toBeLessThan(sub.shapes["7"].c.length / 2);
    const many = "In Queens, Flushing-bound [7] skips 52 St and 69 St. All trains at Woodside-61 St board from the Manhattan-bound platform";
    expect(namedStations(many, sub, "7").map(name).sort()).toEqual(["52 St", "61 St-Woodside", "69 St"]);
  });
  it("a suspension breaks exactly the named stretch and skips only the stations inside it (owner report, 2026-10-25)", () => {
    const text = "No [M] between Myrtle Av (Broadway) and Delancey St-Essex St\nAll trains at Myrtle Av (Broadway) board from the Manhattan-bound platform";
    expect(suspendedBetween(text)).toEqual(["Myrtle Av (Broadway)", "Delancey St-Essex St"]);
    const g = alertGeometry({ ...base, routes: ["M"], text, skipNames: ["Myrtle Av (Broadway)", "Delancey St-Essex St", "Myrtle Av"], replacement: ["T432"] }, sub);
    expect(g.suspended).toBe(true);
    expect(g.ends.map((e) => e.name).sort()).toEqual(["Delancey St-Essex St", "Myrtle Av"]);
    const skipped = g.skipped.map((s) => s.name);
    expect(skipped).toEqual(expect.arrayContaining(["Marcy Av", "Hewes St", "Lorimer St", "Flushing Av"]));
    expect(skipped).not.toContain("Myrtle Av");
    expect(skipped).not.toContain("Delancey St-Essex St");
    expect(g.affected).toHaveLength(1);
  });
  it("other alerts are not suspensions", () => {
    expect(suspendedBetween("In Queens, no [7] at Flushing-Main St")).toBeNull();
    expect(alertGeometry({ ...base, kind: "delay", reroute: false, routes: ["Q"] }, sub).suspended).toBe(false);
  });
  it("highlights the whole line for a line-wide delay", () => {
    const g = alertGeometry({ ...base, kind: "delay", reroute: false, routes: ["Q"] }, sub);
    expect(g.affected[0].coords).toHaveLength(sub.shapes.Q.c.length);
  });
  it("ranks line status: delays, then detour, then planned work", () => {
    const d: TransitAlert = { ...base, kind: "delay", reroute: false, text: "Delays after a sick passenger" };
    expect(lineStatus([], "F")).toBe("Good service");
    expect(lineStatus([{ ...base, reroute: false }], "F")).toBe("Planned work");
    expect(lineStatus([base], "F")).toBe("Detour");
    expect(lineStatus([base, d], "F")).toBe("Delays");
  });
});

describe("direction-aware station skips on the 7", () => {
  const seven = (text: string): TransitAlert => ({ ...base, id: text.slice(0, 12), routes: ["7"], stops: ["713", "712", "711"], text, changes: undefined });
  const withChanges = async (a: TransitAlert) => ({ ...a, changes: (await import("@/lib/transit/serviceChanges")).serviceChanges(a) });
  const id = (name: string) => sub.stations.features.find((f) => (f.properties.name === name || f.properties.name === ({ "Woodside-61 St": "61 St-Woodside" } as Record<string, string>)[name]) && f.properties.routes.split(" ").includes("7"))!.properties.id;
  const ends = () => {
    const sm = sub.stopM["7"];
    return sm[id("Flushing-Main St")] > sm[id("34 St-Hudson Yards")] ? { flushing: 1 as const, manhattan: 0 as const } : { flushing: 0 as const, manhattan: 1 as const };
  };
  it("skips 52 St and 69 St Flushing-bound only, and moves Woodside's platform", async () => {
    const a = await withChanges(seven("In Queens, Flushing-bound [7] skips 52 St and 69 St\nAll trains at Woodside-61 St board from the Manhattan-bound platform"));
    const m = stationChanges([a], sub);
    const e = ends();
    for (const n of ["52 St", "69 St"]) {
      const c = m.get(id(n));
      expect(c?.skips[0].label).toBe("Skipped Flushing-bound · Manhattan-bound stops");
      expect(isSkipped(c, "7", e.flushing)).toBe(true);
      expect(isSkipped(c, "7", e.manhattan)).toBe(false);
    }
    expect(m.get(id("Woodside-61 St"))?.skips).toEqual([]);
    expect(m.get(id("Woodside-61 St"))?.platform[0].notice).toBe("Flushing-bound trains board from the Manhattan-bound platform");
    // The map marks skips on the named stations, not Woodside (an informed stop for the platform change).
    expect(alertGeometry(a, sub).skipped.map((s) => s.name).sort()).toEqual(["52 St", "69 St"]);
  });
  it("skips Manhattan-bound only in the other direction", async () => {
    const a = await withChanges(seven("In Queens, Manhattan-bound [7] skips 111 St and 82 St-Jackson Hts"));
    const c = stationChanges([a], sub).get(id("111 St"));
    const e = ends();
    expect(c?.skips[0].label).toBe("Skipped Manhattan-bound · Flushing-bound stops");
    expect(isSkipped(c, "7", e.manhattan)).toBe(true);
    expect(isSkipped(c, "7", e.flushing)).toBe(false);
  });
});

describe("the label at a suspension's end station (#647)", () => {
  it("says where to change from train to the replacement bus", async () => {
    const { endLabel } = await import("./alertFocus");
    expect(endLabel("Broadway Junction", ["T426"], "A")).toBe("Transfer to the T426 bus at Broadway Junction");
    expect(endLabel("Court Sq", ["T403", "T404"], "G")).toBe("Transfer to the T403 or T404 bus at Court Sq");
  });

  it("says no trains go past the station when no bus is named", async () => {
    const { endLabel } = await import("./alertFocus");
    expect(endLabel("Court Sq", [], "G")).toBe("No G past Court Sq");
  });
});
