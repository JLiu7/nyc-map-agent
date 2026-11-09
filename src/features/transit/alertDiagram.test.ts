import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { alertDiagram, cleanAlertText, isGap, laterSteps, periodWords, shortNotice, shuttleCorners, travelTips, type AlertDiagram, type DiagramStop } from "./alertDiagram";
import type { TransitAlert } from "./hooks";
import type { StaticSystem } from "./model";

const sys = JSON.parse(readFileSync("public/transit/subway.json", "utf8")) as StaticSystem;
// MTA alerts as the live site served them on 2026-11-07, cut before "What's happening?".
// oneCorners, jCorners and sevenMain are from 2026-11-08 and carry the MTA's per-station shuttle notes.
const live = JSON.parse(readFileSync(new URL("./alertDiagram.fixtures.json", import.meta.url), "utf8")) as Record<"aSkip" | "dLocal" | "oneShuttle" | "jSuspended" | "aBranch" | "oneCorners" | "jCorners" | "sevenMain", TransitAlert>;

const stops = (d: AlertDiagram) => d.rows.filter((r): r is DiagramStop => !isGap(r));
const states = (d: AlertDiagram) => stops(d).map((r) => `${r.name}:${r.state}`);

describe("alertDiagram", () => {
  it("draws a skip-stop notice in travel order, with where to change", () => {
    const d = alertDiagram(live.aSkip, sys, "A")!;
    expect(d.kind).toBe("skip");
    expect(d.heading).toBe("Uptown A");
    // Uptown: 59 St at the top, riding up to 125 St.
    expect(states(d)).toEqual([
      "59 St-Columbus Circle:transfer", "72 St:skip", "81 St-Museum of Natural History:skip", "86 St:skip", "96 St:skip",
      "103 St:skip", "Cathedral Pkwy (110 St):skip", "116 St:skip", "125 St:transfer",
    ]);
    expect(d.steps.map((s) => s.text)).toEqual([
      "Uptown A trains skip 7 stops, 72 Street to 116 Street.",
      "Going to these stops: ride to 125 Street and change to a downtown A or D.",
      "Starting at these stops: take the A or D to 59 Street-Columbus Circle and change to an uptown A.",
    ]);
    expect(d.steps[1].ids).toEqual(["A15"]);
    expect(d.steps[2].ids).toEqual(["A24"]);
  });

  it("draws a run-local notice on the track that has the local stops", () => {
    const d = alertDiagram(live.dLocal, sys, "D")!;
    expect(d.kind).toBe("local");
    expect(d.heading).toBe("Downtown D");
    // Downtown: 125 St at the top; the D's usual stops stay plain, the new ones are marked.
    expect(states(d)[0]).toBe("125 St:open");
    expect(states(d).at(-1)).toBe("59 St-Columbus Circle:open");
    expect(stops(d).filter((r) => r.state === "local")).toHaveLength(7);
    expect(d.steps.map((s) => s.text)).toEqual([
      "Downtown D trains run local from 125 Street to 59 Street-Columbus Circle.",
      "They also stop at 7 stops, 116 Street to 72 Street.",
    ]);
  });

  it("draws a shuttle bus over a suspended stretch, and the station off the line to change at", () => {
    const d = alertDiagram(live.oneShuttle, sys, "1")!;
    expect(d.kind).toBe("shuttle");
    expect(d.heading).toBe("No 1 trains");
    // North at the top: Van Cortlandt Park down to Dyckman St, where the 1 still runs.
    expect(states(d).slice(0, 7)).toEqual([
      "Van Cortlandt Park-242 St:shuttle", "238 St:shuttle", "231 St:shuttle", "Marble Hill-225 St:shuttle", "215 St:shuttle", "207 St:shuttle", "Dyckman St:transfer",
    ]);
    expect(stops(d).at(-1)).toMatchObject({ name: "Inwood-207 St", state: "transfer", off: ["A"] });
    // This copy of the notice has no station notes: the guide says so rather than guess a corner.
    expect(d.steps.map((s) => s.text)).toEqual([
      "No 1 trains between Dyckman Street and Van Cortlandt Park-242 Street. Free shuttle buses run instead.",
      "Ride the 1 to Dyckman Street and go up to the street.",
      "The notice does not say where the shuttle bus stops at Dyckman Street.",
      "It stops near 6 stops, Van Cortlandt Park-242 Street to 207 Street. The notice does not say at which corners.",
      "Coming back, take the shuttle bus to Dyckman Street and get back on the 1 there.",
      "You can also change between the bus and the A at Inwood-207 Street.",
    ]);
    expect(d.steps[0].ids).not.toContain("109");
    expect(d.steps[1].ids).toEqual(["109"]);
    expect(d.steps.at(-1)!.ids).toEqual(["A02"]);
  });

  it("keeps a part suspension with no bus closed, and the bus stretch as a bus", () => {
    const d = alertDiagram(live.jSuspended, sys, "J")!;
    const byName = Object.fromEntries(stops(d).map((r) => [r.name, r.state]));
    expect(byName["Marcy Av"]).toBe("shuttle");
    expect(byName["Canal St"]).toBe("closed");
    expect(byName["Broad St"]).toBe("closed");
    expect(d.steps[1].text).toBe("Ride the J to Myrtle Avenue and go up to the street.");
  });

  it("follows a branch the line's track order leaves out (the A to Lefferts Blvd)", () => {
    const d = alertDiagram(live.aBranch, sys, "A")!;
    expect(states(d)).toEqual(["Rockaway Blvd:transfer", "104 St:shuttle", "111 St:shuttle", "Ozone Park-Lefferts Blvd:shuttle"]);
  });

  it("has nothing to draw for a notice with no stations", () => {
    const delay: TransitAlert = { id: "d", kind: "delay", type: "Delays", reroute: false, text: "[SIR] trains are running with delays in both directions because of late ferry arrivals.", agency: "MTASBWY", routes: ["SI"], stops: [] };
    expect(alertDiagram(delay, sys, "SI")).toBeNull();
    // Station names the line does not have: nothing to draw either.
    expect(alertDiagram({ ...delay, routes: ["A"], text: "Uptown [A] skips Nowhere St" }, sys, "A")).toBeNull();
  });
});

describe("guidance (owner, 2026-11-08: \"guide me on whats going on where to take shuttle bus etc\")", () => {
  it("walks the 1's shuttle: where to leave the train, the bus corner, where to get back on, and when", () => {
    const d = alertDiagram(live.oneCorners, sys, "1")!;
    expect(d.steps.map((s) => s.text)).toEqual([
      "No 1 trains between Dyckman Street and Van Cortlandt Park-242 Street. Free shuttle buses run instead.",
      "Ride the 1 to Dyckman Street and go up to the street.",
      "The shuttle bus stops at Broadway at Dyckman Street (for the A) or Nagle Avenue at Dyckman Street (for the 1).",
      "It stops near 6 stops, Van Cortlandt Park-242 Street to 207 Street. The corners are on the map.",
      "Coming back, take the shuttle bus to Dyckman Street and get back on the 1 there.",
      "You can also change between the bus and the A at Inwood-207 Street, where it stops at Broadway at 207 Street.",
      "When: November 6 to 9, Friday 11:30 PM to Monday 5:00 AM.",
    ]);
    // The map marks the corners of the step's stations; every station row carries its own.
    expect(d.steps[2].corners).toEqual(["109"]);
    expect(stops(d).find((r) => r.name === "231 St")?.corners).toEqual([
      { text: "West 231 Street at Broadway", note: "southbound" }, { text: "Broadway at 231 Street", note: "northbound" },
    ]);
  });

  it("starts from the closed station nearest the rider", () => {
    const d = alertDiagram(live.oneCorners, sys, "1", { lon: -73.9045, lat: 40.8789 })!;
    expect(d.steps[1].text).toBe("Nearest to you is 231 Street. Its shuttle bus stops at West 231 Street at Broadway (southbound) or Broadway at 231 Street (northbound).");
    expect(d.steps[1].corners).toEqual(["104"]);
  });

  it("sends the rider to the train the far end's note names, with a GO ticket", () => {
    const d = alertDiagram(live.jCorners, sys, "J")!;
    const text = d.steps.map((s) => s.text);
    expect(text).toContain("Ride the J to Myrtle Avenue and go up to the street. Get a GO ticket on the way out, so you can get back in free.");
    expect(text).toContain("Get off the bus at Delancey Street-Essex Street and change to the F.");
    expect(d.steps.find((s) => s.bus?.length)).toMatchObject({ bus: ["B39"] });
  });

  it("leaves the closed end of a line to the train that still runs (the 7 at Flushing-Main St)", () => {
    const d = alertDiagram(live.sevenMain, sys, "7")!;
    expect(d.steps[1].text).toBe("Ride the 7 to Mets-Willets Point and go up to the street.");
    expect(d.steps[2].text).toBe("The shuttle bus stops at Roosevelt Avenue at station entrance.");
  });

  it("reads the station notes as corners", () => {
    const corners = shuttleCorners(live.oneCorners, sys);
    expect(corners.get("101")).toEqual([{ text: "Broadway at 242 Street" }]);
    expect(corners.get("109")).toEqual([{ text: "Broadway at Dyckman Street", note: "for the A" }, { text: "Nagle Avenue at Dyckman Street", note: "for the 1" }]);
  });

  it("turns travel tips into steps with the buses they name (the owner's 1 example)", () => {
    const text = "Travel tips: Transfer between uptown and downtown trains with fare-capped OMNY at 137 St-City College, or take the M4/M104 to 116 St* for 1. Consider the M125 to the 125 St A/C B/D Station. *(except when trains run express to 96 St). Note: Downtown [1] skips 125 St, 116 St-Columbia University, Cathedral Pkwy (110 St) and 103 St, Nov 13 - Dec 7, Fri 11:45 PM to Mon 5:00 AM (Weekends)";
    expect(travelTips(text)).toEqual([
      { text: "Transfer between uptown and downtown trains with fare-capped OMNY at 137 St-City College, or take the M4 or M104 to 116 St for 1.", bus: ["M4", "M104"] },
      { text: "You can also take the M125 to the 125 St A or C B or D Station.", bus: ["M125"] },
    ]);
    const steps = laterSteps({ id: "t", kind: "planned", type: "", reroute: true, text, agency: "MTASBWY", routes: ["1"], stops: [], period: "Nov 13 - Dec 7, Fri 11:45 PM to Mon 5:00 AM (Weekends)" }, sys, "1");
    expect(steps.map((s) => s.text).at(-1)).toBe("When: November 13 to December 7, Friday 11:45 PM to Monday 5:00 AM.");
    // The tip lights the stations it names on the 1: ride past to 137 St and come back.
    expect(steps[0].ids).toEqual(expect.arrayContaining(["115", "117"]));
  });

  it("says when in full words", () => {
    expect(periodWords("Beginning Nov 7, Sat 12:30 AM until Nov 16, Mon 5:00 AM")).toBe("Beginning November 7, Saturday 12:30 AM until November 16, Monday 5:00 AM");
  });
});

describe("notice text", () => {
  it("reads MTA bullets and icons as words", () => {
    expect(cleanAlertText("take the [4][5] or [6] to 59 St [accessibility icon] and transfer")).toBe("take the 4, 5 or 6 to 59 St and transfer");
    expect(cleanAlertText("[shuttle bus icon] Free shuttle buses")).toBe("shuttle Free shuttle buses");
  });

  it("trims a long notice to its first sentences", () => {
    const text = "[A] trains are running with delays in both directions while we conduct track maintenance along the line in Manhattan. Planned work reminder: in Manhattan, uptown A local skips 72 St, 81 St and 86 St. Expect longer waits.";
    expect(shortNotice(text)).toBe("A trains are running with delays in both directions while we conduct track maintenance along the line in Manhattan.");
  });
});
