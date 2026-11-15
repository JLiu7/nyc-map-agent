import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { alertDiagram, causeOf, cleanAlertText, hasMore, isGap, laterSteps, periodWords, plainSteps, shortNotice, shuttleCorners, travelTips, type AlertDiagram, type DiagramStop } from "./alertDiagram";
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

// Notices with nothing to draw, as the live site served them on 2026-11-14 (#198). The card and the voice
// used to start from the description alone: "What's happening? Technical issue".
describe("plainSteps", () => {
  const notice = (over: Partial<TransitAlert>): TransitAlert => ({ id: "t", kind: "notice", type: "", reroute: false, text: "", agency: "MTASBWY", routes: ["1"], stops: [], ...over });
  const lines = (a: TransitAlert, route: string) => plainSteps(a, sys, route).map((s) => s.text);

  it("says which train, where and what changes before why and when", () => {
    const a = notice({
      type: "Information Outage", stops: ["117", "118", "119"], period: "Nov 14 - 16, Sat 12:01 AM to Mon 5:00 AM",
      text: "Downtown [1] trains are stopping at 116 St-Columbia University, Cathedral Pkwy-110 St, and 103 St, but real-time arrival information may be unavailable",
      description: "What's happening?\nTechnical issue",
    });
    expect(alertDiagram(a, sys, "1")).toBeNull();
    expect(lines(a, "1")).toEqual([
      "Downtown 1 trains are stopping at 116 Street-Columbia University, Cathedral Parkway-110 Street, and 103 Street.",
      "Live arrival times may be missing there.",
      "Why: Technical issue.",
      "When: November 14 to 16, Saturday 12:01 AM to Monday 5:00 AM.",
    ]);
    // The first line lights the notice's own stations; the MTA's words add nothing, so no "Full notice".
    expect(plainSteps(a, sys, "1")[0].ids).toEqual(["117", "118", "119"]);
    expect(hasMore(a, false)).toBe(false);
  });

  it("keeps the headline when the description gives advice", () => {
    const a = notice({
      type: "Boarding Change", routes: ["M"], period: "Nov 14 - 16 and Nov 21 - 23, Sat 12:01 PM to Mon 5:00 AM",
      text: "In Brooklyn, all [M] trains at Central Av and Knickerbocker Av board from the Manhattan-bound platform",
      description: "Please listen carefully to announcements and check the destination displayed on the train before boarding.\n\nNote: No [M] between Myrtle Av (Broadway) and Delancey St-Essex St during this time.\n\nWhat's happening?\nWe're replacing tracks",
    });
    expect(lines(a, "M")).toEqual([
      "In Brooklyn, all M trains at Central Avenue and Knickerbocker Avenue board from the Manhattan-bound platform.",
      "Please listen carefully to announcements and check the destination displayed on the train before boarding.",
      "Why: We're replacing tracks.",
      "When: November 14 to 16 and November 21 to 23, Saturday 12:01 PM to Monday 5:00 AM.",
    ]);
    // The note about the M's other change is only in the MTA's words.
    expect(hasMore(a, false)).toBe(true);
  });

  it("reads a run of line bullets as a list", () => {
    const a = notice({
      kind: "planned", type: "Reduced Service", routes: ["2", "3"], text: "[2][3] runs every 12 minutes",
      description: "[2][3] service operates on a modified schedule because [1][2] and [3] trains are sharing a track in Manhattan.\n\nWhat's happening?\nStructural maintenance",
    });
    expect(lines(a, "2")).toEqual([
      "2 and 3 runs every 12 minutes.",
      "2 and 3 service operates on a modified schedule because 1, 2 and 3 trains are sharing a track in Manhattan.",
      "Why: Structural maintenance.",
    ]);
  });

  it("gives each headline line its own step, and a delay's reason from 'What Happened?'", () => {
    const a = notice({
      kind: "delay", type: "Delays", routes: ["A", "C", "E"],
      text: "Uptown [C][E] trains are running with delays.\n[A] trains are running with delays in both directions.",
      description: "What Happened?\nWe requested EMS for a person in need on a train at 42 St-Port Authority Bus Terminal\n.\nPlanned Work Reminder:\n \nIn Brooklyn and Lower Manhattan, no Inwood-bound [A] at High St, Fulton St, Chambers St, Canal St, and Spring St.",
    });
    expect(lines(a, "A")).toEqual([
      "Uptown C and E trains are running with delays.",
      "A trains are running with delays in both directions.",
      "Why: We requested EMS for a person in need on a train at 42 Street-Port Authority Bus Terminal.",
    ]);
    // The planned work reminder stays one tap away.
    expect(hasMore(a, false)).toBe(true);
  });

  it("says a headline once when there is no description, and no reason when the MTA gives none", () => {
    const a = notice({ kind: "delay", type: "Delays", routes: ["4", "5"], text: "Downtown [4][5] trains are delayed while we request EMS for someone in need at 138 St-Grand Concourse." });
    expect(lines(a, "4")).toEqual(["Downtown 4 and 5 trains are delayed while we request EMS for someone in need at 138 Street-Grand Concourse."]);
    expect(hasMore(a, false)).toBe(false);
    expect(causeOf("When crushed by train wheels, fallen leaves leave a slippery residue on the rails.")).toBe("");
  });

  it("starts a delay with the delay, not with the planned work its description recalls", () => {
    const a = notice({
      kind: "delay", type: "Delays", stops: ["116S"],
      text: "Uptown [1] trains are running with delays after we conducted an investigation at 96 St.",
      description: "Planned Work Reminder\nDowntown [1] skips 125 St.",
      changes: [{ alertId: "t", route: "1", kind: "skip", names: ["125 St"], toward: "Downtown", notice: "Skipped Downtown-bound" }], skipNames: ["125 St"],
    });
    const d = alertDiagram(a, sys, "1")!;
    expect(d.steps.map((s) => s.text)).toEqual([
      "Uptown 1 trains are running with delays after we conducted an investigation at 96 Street.",
      "Downtown 1 trains skip 125 Street.",
    ]);
  });

  it("keeps a drawn notice's second headline line, after its opening step", () => {
    const a = notice({
      kind: "planned", type: "Planned - Stops Skipped", reroute: true, routes: ["7"], stops: [],
      text: "In Queens, Flushing-bound [7] skips 52 St and 69 St\nAll trains at Woodside-61 St board from the Manhattan-bound platform",
      changes: [{ alertId: "t", route: "7", kind: "skip", names: ["52 St", "69 St"], toward: "Flushing", notice: "Skipped Flushing-bound" }], skipNames: ["52 St", "69 St"],
    });
    expect(alertDiagram(a, sys, "7")!.steps.map((s) => s.text)).toEqual([
      "Flushing-bound 7 trains skip 52 Street and 69 Street.",
      "All trains at Woodside-61 Street board from the Manhattan-bound platform.",
    ]);
  });

  it("adds the reason to a drawn notice, before when", () => {
    const steps = laterSteps(notice({ kind: "planned", description: "For service to this station, take the [1] to 116 St.\n\nWhat's happening?\nWe're making station improvements\n\n[accessibility icon] This service change affects one or more ADA accessible stations.", period: "Through December 2026" }), sys, "1");
    expect(steps.map((s) => s.text)).toEqual(["Why: We're making station improvements.", "When: Through December 2026."]);
  });
});
