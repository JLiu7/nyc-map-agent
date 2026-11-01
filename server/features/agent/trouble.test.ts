/**
 * line_status end to end on recorded MTA data (#361): two real alerts from the
 * camsys feed (2026-10-23; the G one trimmed to three station notes), real
 * 39hk-dx4f rows, and a recorded live Q train at Canal St.
 */
import { describe, expect, it } from "vitest";
import { mapAction, type MapAction } from "../../../src/features/agent/schema";
import type { FeedAlert, LiveVehicle } from "../../../src/lib/transit/trouble";
import { troubleActions } from "./mapActions";
import { makeTools } from "./tools";
import type { Station, StationEntrances } from "./transit";
import { lineTroubles } from "../../../src/lib/transit/trouble";
import { troubleStations } from "./services";

const NOW_S = 1792816022;
const delayNQ: FeedAlert = { id: "lmm:alert:273280:26", alert: { active_period: [{ start: 1792813698 }], informed_entity: [{ route_id: "N" }, { route_id: "Q" }], header_text: { translation: [{ text: "Downtown [N][Q] trains are running with delays after FDNY extinguished a track fire earlier at Canal St.", language: "en" }] }, "transit_realtime.mercury_alert": { alert_type: "Delays" } } };
const gSuspended: FeedAlert = {
  id: "lmm:planned_work:35870",
  alert: {
    active_period: [{ start: NOW_S - 600, end: NOW_S + 3600 }],
    informed_entity: ["G22", "G24", "G26", "G28", "G29", "G30", "G31", "G32"].map((stop_id) => ({ route_id: "G", stop_id })),
    header_text: { translation: [{ text: "No [G] between Bedford-Nostrand Avs and Court Sq", language: "en" }] },
    description_text: { translation: [{ text: "[G] runs between Church Av and Bedford-Nostrand Avs, the last stop.\n\n[shuttle bus icon] Free T403 shuttle buses make stops between Bedford-Nostrand Avs and Court Sq.\nTransfer between [G] and [shuttle bus icon] at Bedford-Nostrand Avs.\nWhat's happening?\nStructural maintenance", language: "en" }] },
    "transit_realtime.mercury_alert": {
      alert_type: "Planned - Part Suspended",
      station_alternative: [
        { affected_entity: { stop_id: "G33" }, notes: { translation: [{ text: "[G]\n[shuttle bus icon] Lafayette Av at Nostrand Av\n\nIf you're exiting at this station, get a GO ticket for re-entry into the subway.", language: "en" }] } },
        { affected_entity: { stop_id: "G32" }, notes: { translation: [{ text: "[shuttle bus icon] Nostrand Av at Myrtle Av (to Bedford-Nostrand Avs)\n[shuttle bus icon] Marcy Av at Willoughby Av (to Court Sq)", language: "en" }] } },
        { affected_entity: { stop_id: "G22" }, notes: { translation: [{ text: "[accessibility icon] (E, southbound) | [7][E]\n[shuttle bus icon] Jackson Av at 23 St\n[shuttle bus icon] Jackson Av at 45 Av", language: "en" }] } },
      ],
    },
  },
};
// [gtfs id, complex, name, daytime routes, lon, lat, north label, south label] from 39hk-dx4f.
const ROWS: Array<[string, string, string, string, number, number, string, string]> = [
  ["Q01", "623", "Canal St", "N Q", -74.00046, 40.71838, "Uptown", "Downtown"],
  ["R23", "623", "Canal St", "R W", -74.00177, 40.71953, "Uptown", "Downtown"],
  ["G22", "606", "Court Sq", "G", -73.94383, 40.74655, "Last Stop", "Brooklyn"],
  ["G24", "282", "21 St", "G", -73.94972, 40.74406, "Court Square", "Brooklyn"],
  ["G26", "283", "Greenpoint Av", "G", -73.95445, 40.73135, "Queens", "Southbound"],
  ["G28", "284", "Nassau Av", "G", -73.95128, 40.72463, "Queens", "Southbound"],
  ["G29", "629", "Metropolitan Av", "G", -73.95142, 40.71279, "Queens", "Southbound"],
  ["G30", "286", "Broadway", "G", -73.95031, 40.70609, "Queens", "Southbound"],
  ["G31", "287", "Flushing Av", "G", -73.95023, 40.70038, "Queens", "Southbound"],
  ["G32", "288", "Myrtle-Willoughby Avs", "G", -73.94905, 40.69457, "Queens", "Southbound"],
  ["G33", "289", "Bedford-Nostrand Avs", "G", -73.95352, 40.68963, "Queens", "Southbound"],
  ["719", "606", "Court Sq", "7", -73.94526, 40.74702, "Outbound", "Manhattan"],
  ["F09", "606", "Court Sq-23 St", "E F", -73.946, 40.74785, "Outbound", "Manhattan"],
];
const stations: Station[] = ROWS.map(([gtfsId, complexId, name, routes, lon, lat, north, south]) => ({ id: gtfsId, gtfsId, complexId, name, routes: routes.split(" "), structure: "Subway", at: [lon, lat], north, south }));
const entrances: StationEntrances = { stations: () => Promise.resolve(stations), entrances: () => Promise.resolve([]) };
const stuckQ: LiveVehicle = { tripId: "143600_Q..S39R", route: "Q", stopId: "Q01S", stopped: true, ts: NOW_S - 371, remaining: 20, atOrigin: false };

// Sunday-only work this weekend (NOW_S is just after midnight, Saturday 24 Oct, New York): Sunday 9:30 am to 5:30 pm.
const sundayOnly7: FeedAlert = { id: "lmm:planned_work:sun7", alert: { active_period: [{ start: NOW_S + 33 * 3600, end: NOW_S + 41 * 3600 }], informed_entity: [{ route_id: "7" }],
  header_text: { translation: [{ text: "In Queens, no [7] at Flushing-Main St", language: "en" }] }, "transit_realtime.mercury_alert": { alert_type: "Planned - Stops Skipped" } } };

function lineStatus(followedTrain: string | null = null) {
  const offered: MapAction[] = [];
  const tools = makeTools({
    location: null,
    emit: () => undefined,
    actions: (a) => offered.push(...a),
    followedTrain,
    deps: { otp: null, entrances, alerts: () => Promise.resolve([]), alertEntities: () => Promise.resolve([delayNQ, gSuspended, sundayOnly7]), vehicles: () => Promise.resolve([stuckQ]), now: () => NOW_S * 1000 },
  });
  const exec = tools.line_status.execute as unknown as (input: { lines: string[]; when?: string }, o: unknown) => Promise<Record<string, unknown>>;
  return { offered, run: (lines: string[], when?: string) => exec({ lines, when }, { toolCallId: "t", messages: [] }) };
}

describe("line_status with MTA trouble", () => {
  // Owner, 2026-10-27: asked on a weekday about the weekend, the 7's weekend work never showed.
  it("looks across the whole weekend when asked about it, and opens the line on that weekend", async () => {
    const { run, offered } = lineStatus();
    expect((await run(["7"])).trouble).toEqual([]);
    const out = await run(["7"], "this weekend");
    expect((out.trouble as Array<{ line: string }>).map((t) => t.line)).toEqual(["7"]);
    expect(out.checkedFor).toMatch(/^the weekend of Sat, Oct 24/);
    const line = offered.filter((a) => a.kind === "showLine").at(-1);
    expect(line && "day" in line ? line.day?.label : null).toBe("This weekend");
    expect(line?.label).toBe("Show the 7 work this weekend");
  });

  it("says what is wrong, where to board the shuttle, where to get the train back", async () => {
    const { run, offered } = lineStatus();
    const out = await run(["G"]);
    const g = (out.trouble as Array<{ line: string; summary: string; otherLinesThatStillStopAtSkippedStations?: Record<string, string[]> }>)[0];
    expect(g.summary).toContain("T403 shuttle buses run between Bedford-Nostrand Avs and Court Sq.");
    expect(g.summary).toContain("Get the G train back at Bedford-Nostrand Avs.");
    // Which train instead: the 7, E and F share the Court Sq complex.
    expect(g.otherLinesThatStillStopAtSkippedStations?.["Court Sq"]).toEqual(["7", "E", "F"]);
    expect(out.trainsNotMoving).toBeUndefined();
    const shuttle = offered.find((a) => a.id === "trouble:shuttle:lmm:planned_work:35870");
    expect(shuttle && "points" in shuttle ? shuttle.points.map((p) => p.name) : []).toEqual([
      "Shuttle buses end at Bedford-Nostrand Avs",
      "Shuttle buses end at Court Sq",
      "Shuttle bus: Lafayette Av at Nostrand Av",
      "Shuttle bus: Nostrand Av at Myrtle Av (to Bedford-Nostrand Avs)",
      "Shuttle bus: Marcy Av at Willoughby Av (to Court Sq)",
      "Shuttle bus: Jackson Av at 23 St",
      "Shuttle bus: Jackson Av at 45 Av",
      "Get the G train at Bedford-Nostrand Avs",
    ]);
    expect(offered.some((a) => a.kind === "showStops" && a.skipped && a.route === "G")).toBe(true);
  });

  it("flags the stuck Q at Canal St on a delayed line, and whether it is the user's train", async () => {
    const mine = await lineStatus("subway:143600_Q..S39R").run(["Q"]);
    expect(mine.trainsNotMoving).toEqual([{ line: "Q", toward: "Downtown", station: "Canal St", stoppedAtStation: true, minutesWithoutMoving: 6, isTheTrainTheUserFollows: true }]);
    const { run, offered } = lineStatus();
    expect(((await run(["Q"])).trainsNotMoving as Array<Record<string, unknown>>)[0].isTheTrainTheUserFollows).toBeUndefined();
    expect(offered.map((a) => a.id)).toEqual(["trouble:stuck:143600_Q..S39R", "trouble:problem:Q", "line:Q"]);
  });
});

describe("troubleActions", () => {
  it("every button validates against the stream schema", () => {
    const ts = lineTroubles([delayNQ, gSuspended], troubleStations(stations), ["G", "N", "Q"], NOW_S);
    const actions = troubleActions(ts, []);
    expect(actions.map((a) => a.label)).toEqual(["Show where the N problem is", "Show where the Q problem is", "Show the stops the G skips", "Show the G shuttle buses"]);
    for (const a of actions) expect(mapAction.safeParse(a).success).toBe(true);
  });
  it("no trouble, no buttons", () => {
    expect(troubleActions([], [])).toEqual([]);
  });
});
