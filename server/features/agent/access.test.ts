import { describe, expect, it } from "vitest";
import { noticesIn, nyFeedTime, stepFreeImpacts, toSpans, toUnits, type AccessData } from "./access";
import type { Station } from "./transit";

describe("the MTA's elevator feeds", () => {
  it("reads feed times as New York time, winter and summer", () => {
    expect(nyFeedTime("12/16/2026 10:00:00 PM")).toBe(Date.UTC(2026, 11, 17, 3) / 1000);
    expect(nyFeedTime("07/04/2026 09:30:00 AM")).toBe(Date.UTC(2026, 6, 4, 13, 30) / 1000);
    expect(nyFeedTime("soon")).toBeNull();
  });

  it("counts a current outage from now and a planned one from its start", () => {
    const row = { station: "Fulton St", equipment: "EL1", equipmenttype: "EL", serving: "Street to mezzanine", ADA: "Y", outagedate: "11/10/2026 08:00:00 AM", estimatedreturntoservice: "12/16/2026 10:00:00 PM", reason: "Repair" };
    const [now, later] = toSpans([row, { ...row, isupcomingoutage: "Y" }]);
    expect(now.start).toBe(0);
    expect(later.start).toBe(nyFeedTime("11/10/2026 08:00:00 AM"));
    expect(now.end).toBe(nyFeedTime("12/16/2026 10:00:00 PM"));
  });

  it("keeps active elevators and escalators from the equipment list", () => {
    const units = toUnits([
      { equipmentno: "EL1", equipmenttype: "EL", station: "Fulton St", serving: "x", ADA: "Y", isactive: "Y", redundant: 0, elevatorsgtfsstopid: "229/A38" },
      { equipmentno: "EL2", equipmenttype: "EL", station: "Fulton St", serving: "x", isactive: "N" },
      { equipmentno: "PW1", equipmenttype: "PW", station: "Fulton St", serving: "x" },
    ]);
    expect(units).toEqual([{ id: "EL1", type: "EL", station: "Fulton St", serving: "x", stops: ["229", "A38"], ada: true, redundant: false, alternative: undefined }]);
  });
});

describe("station notices", () => {
  const entity = (start: number, end: number) => ({
    id: "lmm:planned_work:1",
    alert: {
      active_period: [{ start, end }],
      informed_entity: [{ stop_id: "F12N" }, { stop_id: "F12S" }],
      header_text: { translation: [{ text: "Enter 5 Av/53 St [E][F] Station at 5 Av only", language: "en" }] },
    },
  });

  it("reads a notice in force, filed under the station's stop", () => {
    const [n] = noticesIn([entity(100, 200)], 150);
    expect(n).toMatchObject({ effect: "only-entry", stopIds: ["F12"] });
  });

  it("skips one that is not in force", () => {
    expect(noticesIn([entity(100, 200)], 300)).toEqual([]);
  });
});

describe("stepFreeImpacts", () => {
  const station = (id: string, name: string, at: [number, number], ada: string): Station => ({ id, complexId: id, gtfsId: id, name, routes: ["4"], structure: "Subway", at, ada });
  const d: AccessData = {
    stations: [station("631", "Grand Central-42 St", [-73.9768, 40.7518], "1"), station("418", "Fulton St", [-74.0091, 40.7104], "0")],
    units: [], outages: [], notices: [], at: 1,
  };

  it("blocks a trip that ends at a station with no elevator", () => {
    const out = stepFreeImpacts([{ route: "4", from: [-73.9768, 40.7518], to: [-74.0091, 40.7104], toName: "Fulton St" }], d);
    expect(out).toEqual([{ route: "4", text: "Not step-free: Fulton St has no elevator.", blocks: true }]);
  });
});
