import { describe, expect, it } from "vitest";
import { parseProse, replacementBuses, slimAlert } from "./alerts";

describe("MTA alert slimming", () => {
  it("keeps Mercury period, direction ids and skipped-stop ids", () => {
    const a = slimAlert({
      id: "lmm:1",
      alert: {
        active_period: [{ start: 100, end: 200 }],
        informed_entity: [{ agency_id: "MTASBWY", route_id: "F", stop_id: "F34" }, { agency_id: "MTASBWY", route_id: "F", stop_id: "F33" }],
        header_text: { translation: [{ text: "In Brooklyn, Manhattan-bound [F] skips Avenue P, Avenue N, Bay Pkwy and Avenue I", language: "en" }] },
        description_text: { translation: [{ text: "Take the [F] to 18 Av.", language: "en" }] },
        "transit_realtime.mercury_alert": { alert_type: "Planned - Stops Skipped", human_readable_active_period: { translation: [{ text: "Nov 17 - 20", language: "en" }] }, affected_stations: [{ stop_id: "F34", direction_id: 0 }] },
      },
    }, 150)!;
    expect(a).toMatchObject({ kind: "planned", reroute: true, routes: ["F"], stops: ["F34", "F33"], period: "Nov 17 - 20", direction: "Manhattan-bound", directionIds: [0], start: 100, end: 200 });
    expect(a.skipNames).toEqual(["Avenue P", "Avenue N", "Bay Pkwy", "Avenue I"]);
  });
  it("drops alerts outside their active period", () => {
    expect(slimAlert({ id: "x", alert: { active_period: [{ start: 500 }] } }, 100)).toBeNull();
    // A window that reaches it (the line panel's "This weekend") keeps it.
    expect(slimAlert({ id: "x", alert: { active_period: [{ start: 500, end: 900 }] } }, 100, 600)?.start).toBe(500);
    expect(slimAlert({ id: "x", alert: { active_period: [{ start: 500, end: 900 }] } }, 950, 2000)).toBeNull();
  });
  it("parses reroute lines and closed stations from the prose", () => {
    const p = parseProse("[F] is rerouted via Court Sq [E] between Roosevelt Av, Queens and Canal St, then via the [A] to Jay St-MetroTech\nNo [F] service at 21 St-Queensbridge, Roosevelt Island, East Broadway and York St.", "F");
    expect(p.via).toEqual(["E", "A"]);
    expect(p.skipNames).toEqual(["21 St-Queensbridge", "Roosevelt Island", "East Broadway", "York St"]);
  });
  it("reads a shuttle bus and the stretch of the line it covers", () => {
    const text = "No [6] between Hunts Point Av and 125 St\nFree T102 shuttle buses make all stops between 125 St and Hunts Point Av.";
    expect(replacementBuses(text)).toEqual({ routes: ["T102"], between: ["Hunts Point Av", "125 St"] });
    const a = slimAlert({
      id: "lmm:planned_work:34162",
      alert: {
        active_period: [{ start: 100 }],
        informed_entity: [{ agency_id: "MTASBWY", route_id: "6" }],
        header_text: { translation: [{ text: "No [6] between Hunts Point Av and 125 St", language: "en" }] },
        description_text: { translation: [{ text: "Free T102 shuttle buses make all stops between 125 St and Hunts Point Av.", language: "en" }] },
        "transit_realtime.mercury_alert": { alert_type: "Planned - Shuttle Bus" },
      },
    }, 150)!;
    expect(a.replacement).toEqual(["T102"]);
    expect(a.skipNames).toEqual(["Hunts Point Av", "125 St"]);
    expect(a.via).toEqual([]);
  });
});

describe("station notes (#55)", () => {
  it("keeps each station's shuttle note from the Mercury extension", () => {
    const a = slimAlert({ id: "x", alert: {
      active_period: [{ start: 0 }],
      informed_entity: [{ agency_id: "MTASBWY", route_id: "1", stop_id: "104" }],
      header_text: { translation: [{ text: "No [1] between Dyckman St and Van Cortlandt Park-242 St", language: "en" }] },
      "transit_realtime.mercury_alert": { station_alternative: [
        { affected_entity: { stop_id: "104" }, notes: { translation: [{ text: "[shuttle bus icon] Broadway at 231 St (N/B)", language: "en" }, { text: "<p>…</p>", language: "en-html" }] } },
        { affected_entity: { stop_id: "105" }, notes: { translation: [] } },
      ] },
    } }, 10)!;
    expect(a.alternatives).toEqual([{ stop: "104", notes: "[shuttle bus icon] Broadway at 231 St (N/B)" }]);
  });
});
