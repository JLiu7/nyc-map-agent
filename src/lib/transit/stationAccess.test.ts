import { describe, expect, it } from "vitest";
import { applyNotices, entranceNotices, fromStreet, matchWhere, sameStreet, stepFreeAt, streetKey, whereIn, type Door, type OutageSpan, type StreetLine, type Unit } from "./stationAccess";

// Two live notices on 2026-11-12, as the MTA wrote them.
const FIFTH = "Enter 5 Av/53 St [E][F] Station at 5 Av only\nMadison Av entrance will be exit only";
const DORP = "[SIR] New Dorp Station - St George-bound - east end entrance is closed until further notice";

// A made-up 5 Av/53 St: 5 Av and Madison Av run north-south, E 53 St east-west.
const streets: StreetLine[] = [
  { name: "5 AVE", line: [[-73.9760, 40.7590], [-73.9752, 40.7610]] },
  { name: "MADISON AVE", line: [[-73.9738, 40.7590], [-73.9730, 40.7610]] },
  { name: "E  53 ST", line: [[-73.9770, 40.7598], [-73.9720, 40.7602]] },
];
const door = (lon: number, lat: number, type = "Stair"): Door => ({ at: [lon, lat], type, entry: true, exit: true });
const fifthAv = door(-73.9755, 40.7601);
const madison = door(-73.9734, 40.7601);

describe("entranceNotices", () => {
  it("reads the 5 Av/53 St notice as 5 Av the only way in, Madison Av exit only", () => {
    const ns = entranceNotices({ id: "a", text: FIFTH, stopIds: ["F12"], stationName: "5 Av/53 St" });
    expect(ns.map((n) => [n.effect, n.where.streets])).toEqual([["only-entry", ["5 Av"]], ["no-entry", ["Madison Av"]]]);
    expect(ns.every((n) => n.stopIds[0] === "F12")).toBe(true);
  });

  it("reads New Dorp's east end entrance as closed", () => {
    const [n] = entranceNotices({ id: "b", text: DORP, stopIds: ["S22"] });
    expect(n.effect).toBe("closed");
    expect(n.where.end).toBe("east");
  });

  it("ignores a line that points nowhere", () => {
    expect(entranceNotices({ id: "c", text: "Trains are running with delays", stopIds: ["F12"] })).toEqual([]);
  });

  it("finds a corner", () => {
    expect(whereIn("the NE corner stair at 14 St & 6 Av")).toMatchObject({ corner: "NE", streets: ["14 St", "6 Av"] });
  });
});

describe("street names", () => {
  it("matches the city's spelling to the MTA's", () => {
    expect(streetKey("W 53rd Street")).toBe(streetKey("E  53 ST"));
    expect(sameStreet("Fifth Avenue", "5 AVE")).toBe(true);
    expect(sameStreet("Madison Av", "5 AVE")).toBe(false);
  });
});

describe("matchWhere and applyNotices", () => {
  it("places a street on the entrances beside it", () => {
    expect(matchWhere({ streets: ["Madison Av"] }, [fifthAv, madison], streets)).toEqual([1]);
    expect(matchWhere({ streets: ["Lexington Av"] }, [fifthAv, madison], streets)).toBeNull();
  });

  it("closes Madison Av to riders going in and keeps it as an exit", () => {
    const ns = entranceNotices({ id: "a", text: FIFTH, stopIds: ["F12"], stationName: "5 Av/53 St" });
    const r = applyNotices([fifthAv, madison], ns, streets);
    expect(r.doors.map((d) => [d.entry, d.exit])).toEqual([[true, true], [false, true]]);
    expect(r.applied).toHaveLength(2);
    expect(r.unplaced).toEqual([]);
  });

  it("closes the east end when the entrances are spread out", () => {
    const [n] = entranceNotices({ id: "b", text: DORP, stopIds: ["S22"] });
    const west = door(-74.1160, 40.5735), east = door(-74.1150, 40.5735);
    const r = applyNotices([west, east], [n], []);
    expect(r.doors.map((d) => d.entry)).toEqual([true, false]);
  });

  it("keeps a notice it cannot place, so the rider still reads it", () => {
    const [n] = entranceNotices({ id: "b", text: DORP, stopIds: ["S22"] });
    const r = applyNotices([door(-74.1160, 40.5735)], [n], []);
    expect(r.doors[0].entry).toBe(true);
    expect(r.unplaced).toEqual([n.text]);
  });
});

describe("stepFreeAt", () => {
  const lift: Unit = { id: "EL100", type: "EL", station: "Fulton St", stops: ["229"], serving: "Transit Center concourse to downtown 4/5 platform", ada: true, redundant: false, alternative: "Take the 4/5 to Bowling Green. Cross the platform and come back. Extra words that are cut." };
  const out = (unit: string, start = 0, end: number | null = 2_000_000_000): OutageSpan => ({ unit, station: "Fulton St", type: "EL", serving: "", ada: true, start, end, reason: "Repair", back: "12/17/2026 06:00:00 AM" });
  const st = { name: "Fulton St", stopIds: ["229"], ada: "1" };

  it("says a station with no elevator has none", () => {
    expect(stepFreeAt({ ...st, ada: "0" }, [], [], 1)).toMatchObject({ ok: false, why: "Fulton St has no elevator." });
  });

  it("says when the only elevator is out, when it is back, and the MTA's way round", () => {
    const r = stepFreeAt(st, [lift], [out("EL100")], 1_800_000_000);
    expect(r.ok).toBe(false);
    expect(r.why).toContain("is out, expected back 12/17/2026 06:00:00 AM");
    expect(r.alternative).toBe("Take the 4/5 to Bowling Green. Cross the platform and come back.");
  });

  it("counts a planned outage only while it is in force", () => {
    expect(stepFreeAt(st, [lift], [out("EL100", 1_900_000_000, 1_900_100_000)], 1_800_000_000).ok).toBe(true);
    expect(stepFreeAt(st, [lift], [out("EL100", 1_900_000_000, 1_900_100_000)], 1_900_050_000).ok).toBe(false);
  });

  it("is fine when another elevator does the same job", () => {
    expect(stepFreeAt(st, [{ ...lift, redundant: true }], [out("EL100")], 1).ok).toBe(true);
  });

  it("notes a partly step-free station", () => {
    expect(stepFreeAt({ ...st, ada: "2", adaNotes: "Uptown only" }, [], [], 1)).toMatchObject({ ok: true, why: "Fulton St is only partly step-free: Uptown only." });
  });

  it("tells a street elevator from a platform one", () => {
    expect(fromStreet({ serving: "42 St & Park Av (NE corner) to mezzanine" })).toBe(true);
    expect(fromStreet({ serving: "Mezzanine to downtown platform" })).toBe(false);
  });
});
