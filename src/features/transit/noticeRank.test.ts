import { describe, expect, it } from "vitest";
import type { TransitAlert } from "./hooks";
import { alertTrouble, byRank, RANK } from "./noticeRank";

const alert = (over: Partial<TransitAlert>): TransitAlert => ({ id: "t", kind: "planned", type: "", reroute: false, text: "", agency: "MTASBWY", routes: ["A"], stops: [], ...over });

// Headlines and types as the live site served them on 2026-11-14.
describe("alertTrouble", () => {
  it("reads no trains on a stretch, with or without a borough in front", () => {
    expect(alertTrouble(alert({ type: "Planned - Part Suspended", text: "In Queens, no [A] between Rockaway Blvd and Ozone Park-Lefferts Blvd" }))).toBe("suspended");
    expect(alertTrouble(alert({ text: "No [5] between E 180 St, Bronx and Bowling Green, Manhattan" }))).toBe("suspended");
    expect(alertTrouble(alert({ type: "Planned - Part Suspended", text: "In Queens, no [7] at Flushing-Main St" }))).toBe("suspended");
    expect(alertTrouble(alert({ type: "Planned - Substitute Buses", text: "Buses replace [A] trains" }))).toBe("suspended");
  });

  it("reads skipped stops, and no trains one way at named stations as a skip", () => {
    expect(alertTrouble(alert({ type: "Planned - Stops Skipped", reroute: true, text: "In Manhattan, uptown [C] skips 72 St and 86 St" }))).toBe("skip");
    expect(alertTrouble(alert({ type: "Planned - Reroute", reroute: true, text: "In Brooklyn and Lower Manhattan, no Inwood-bound [A] at High St, Fulton St, Chambers St, Canal St and Spring St" }))).toBe("skip");
  });

  it("reads trains running another way", () => {
    expect(alertTrouble(alert({ type: "Planned - Reroute", reroute: true, text: "In Brooklyn and Manhattan, [C] service is rerouted via [D] and [F] in both directions" }))).toBe("reroute");
    expect(alertTrouble(alert({ type: "Planned - Express to Local", text: "In Manhattan, downtown [A] stops at 50 St, 23 St and Spring St" }))).toBe("reroute");
  });

  it("reads delays and slow service, and keeps a delay a delay when its description recalls a skip", () => {
    expect(alertTrouble(alert({ kind: "delay", type: "Delays", text: "Uptown [1] trains are running with delays after we conducted an investigation at 96 St.", description: "Planned Work Reminder\nDowntown [1] skips 125 St.", changes: [{ alertId: "t", route: "1", kind: "skip", names: ["125 St"], toward: "Downtown", notice: "Skipped Downtown-bound" }], skipNames: ["125 St"] }), "1")).toBe("delay");
    expect(alertTrouble(alert({ type: "Reduced Service", text: "[1] runs every 8 minutes" }))).toBe("delay");
    expect(alertTrouble(alert({ kind: "notice", type: "Expect Delays", text: "Fallen leaves may slow [SIR] service" }))).toBe("delay");
  });

  it("leaves the rest as other: trains run and stop as usual", () => {
    expect(alertTrouble(alert({ kind: "notice", type: "Information Outage", text: "Downtown [1] trains are stopping at 116 St-Columbia University, Cathedral Pkwy-110 St, and 103 St, but real-time arrival information may be unavailable" }))).toBe("other");
    expect(alertTrouble(alert({ kind: "notice", type: "Boarding Change", text: "In Queens, all [M] trains at Fresh Pond Rd, Forest Av and Seneca Av board from the Metropolitan Av-bound platform" }))).toBe("other");
    expect(alertTrouble(alert({ kind: "notice", type: "Station Notice", text: "[airplane icon] JFK AirTrain service is suspended and replaced by free shuttle buses" }))).toBe("other");
    expect(alertTrouble(alert({ kind: "notice", type: "Station Notice", text: "The east-end staircase on the Tottenville-bound platform at Oakwood Heights is closed" }))).toBe("other");
  });

  it("counts a skip on another line of a shared notice only for that line", () => {
    const a = alert({ kind: "notice", type: "Boarding Change", routes: ["A", "C"], text: "Trains board on the express platform", changes: [{ alertId: "t", route: "C", kind: "skip", names: ["72 St"], toward: null, notice: "Skipped" }] });
    expect(alertTrouble(a, "C")).toBe("skip");
    expect(alertTrouble(a, "A")).toBe("other");
  });
});

describe("byRank", () => {
  it("puts no trains first, then skips and reroutes, delays, the rest, and elevators last", () => {
    const list = [
      { id: "lift", rank: RANK.outage }, { id: "info", rank: RANK.other }, { id: "delay", rank: RANK.delay },
      { id: "skip", rank: RANK.skip }, { id: "bus", rank: RANK.suspended }, { id: "reroute", rank: RANK.reroute },
    ];
    expect(byRank(list, 1000).map((x) => x.id)).toEqual(["bus", "skip", "reroute", "delay", "info", "lift"]);
  });

  it("within a rank, what is in effect now comes before what starts later, then the earlier start", () => {
    const list = [
      { id: "next-week", rank: 2, start: 5000 }, { id: "tomorrow", rank: 2, start: 2000 },
      { id: "now-newer", rank: 2, start: 900 }, { id: "now-older", rank: 2, start: 100 }, { id: "no-time", rank: 2 },
    ];
    expect(byRank(list, 1000).map((x) => x.id)).toEqual(["no-time", "now-older", "now-newer", "tomorrow", "next-week"]);
  });

  it("keeps the given order when nothing tells two notices apart, so the list does not reshuffle", () => {
    const list = [{ id: "a", rank: 3 }, { id: "b", rank: 3 }, { id: "c", rank: 3 }];
    expect(byRank(list, 0).map((x) => x.id)).toEqual(["a", "b", "c"]);
    expect(byRank(byRank(list, 0), 0).map((x) => x.id)).toEqual(["a", "b", "c"]);
  });
});
