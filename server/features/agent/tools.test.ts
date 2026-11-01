import { describe, expect, it, vi } from "vitest";
import { describeStep } from "./drive/router";
import { MTA_TOLLS, tolls } from "./drive/context";
import { args, hideHere, isShortReply, makeTools, pickStation } from "./tools";
import { nyLocalToDate, toNyLocal } from "./trip";
import { octant } from "./transit";

describe("tool argument schemas", () => {
  it("transit_plan defaults from to 'here' and takes the user's time words (resolved server-side)", () => {
    expect(args.transit_plan.parse({ to: "Grand Central", depart: "2026-10-22T09:00", language: "en" }).from).toBe("here");
    expect(args.transit_plan.parse({ to: "Grand Central", depart: "tomorrow 9am", language: "en" }).depart).toBe("tomorrow 9am");
    expect(args.transit_plan.parse({ to: "Grand Central", language: "en" }).depart).toBe("now");
  });
  it("playFlythrough accepts 2x/5x/10x/30x", () => {
    expect(args.playFlythrough.parse({ tripId: "t" }).speed).toBe(10);
    expect(args.playFlythrough.parse({ tripId: "t", speed: 5 }).speed).toBe(5);
    expect(() => args.playFlythrough.parse({ tripId: "t", speed: 3 })).toThrow();
  });
  it("drive_plan and weather validate", () => {
    expect(args.drive_plan.safeParse({ to: "JFK", depart: "2026-10-22T07:30" }).success).toBe(true);
    expect(args.weather_forecast.safeParse({ time: "" }).success).toBe(false);
  });
});

describe("transit_plan resolves the time on the server", () => {
  it("plans 'tomorrow 9am' at that New York time and marks what is not known", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    const asked: string[] = [];
    const tools = makeTools({
      location: { lon: -73.99, lat: 40.735 },
      now: nyLocalToDate("2026-10-24T14:30"),
      emit: () => {},
      deps: {
        otp: { plan: (_o, _d, local) => { asked.push(local); return Promise.resolve([]); } },
        planner: { plan: () => Promise.resolve(null) },
        changes: [],
      },
    });
    const run = tools.transit_plan.execute as unknown as (a: unknown, o: unknown) => Promise<{ depart: string; whenNote?: string }>;
    const brief = await run({ from: "here", to: "here", depart: "tomorrow 9am", arriveBy: false, language: "en" }, { toolCallId: "x", messages: [] });
    expect(asked).toEqual(["2026-10-25T09:00"]);
    expect(brief.depart).toBe("2026-10-25T09:00");
    expect(brief.whenNote).toMatch(/Sun, Oct 25, 9:00 AM.*live delays are not known/);
    await expect(run({ from: "here", to: "here", depart: "whenever", arriveBy: false }, { toolCallId: "y", messages: [] })).rejects.toThrow(/Could not read the time/);
    fetchSpy.mockRestore();
  });
});

describe("the model never sees the user's position as numbers (#374)", () => {
  const me = { lon: -73.990312, lat: 40.735901 };
  it("turns points at the user's location into here and leaves other places alone", () => {
    expect(hideHere({ label: "your location", at: [me.lon, me.lat] }, me)).toEqual({ label: "your location", at: "here" });
    expect(hideHere({ name: "a", lon: -73.9905, lat: 40.7358, open: true }, me)).toEqual({ name: "a", at: "here", open: true });
    expect(hideHere({ to: { at: [-73.9772, 40.7527] } }, me)).toEqual({ to: { at: [-73.9772, 40.7527] } });
    expect(hideHere([1, 2, "x"], me)).toEqual([1, 2, "x"]);
  });
  it("geocode of here hands the model no numbers, while flyTo still moves the map to the exact point", async () => {
    const sent: unknown[] = [];
    const tools = makeTools({ location: me, now: new Date(), emit: (c) => sent.push(c) });
    const call = (t: { execute?: unknown }, a: unknown) => (t.execute as (a: unknown, o: unknown) => Promise<unknown>)(a, { toolCallId: "g", messages: [] });
    const out = JSON.stringify(await call(tools.geocode, { text: "here" }));
    expect(out).not.toMatch(/73\.99|40\.73/);
    expect(out).toContain("here");
    await call(tools.flyTo, { place: "here", zoom: 16 });
    expect(JSON.stringify(sent)).toMatch(/73\.990312/);
  });
});

describe("a which-exit answer stays a small card", () => {
  const station = { id: "127", complexId: "611", name: "Times Sq-42 St", routes: ["1", "2", "3"], structure: "Subway", at: [-73.9873, 40.7553] as [number, number] };
  const deps = {
    entrances: { stations: () => Promise.resolve([station]), entrances: () => Promise.resolve([{ complexId: "611", at: [-73.9868, 40.7558] as [number, number], type: "Stair", entry: true, exit: true }]) },
    walk: () => Promise.resolve({ coords: [[-73.9868, 40.7558], [-73.99, 40.735]] as [number, number][], durationS: 300, distanceM: 400, turns: [] }),
  };
  const call = (t: { execute?: unknown }, a: unknown) => (t.execute as (a: unknown, o: unknown) => Promise<unknown>)(a, { toolCallId: "e", messages: [] });

  it("the route and trip sheet wait for the yes, then open from the same trip in the next request", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    const sent: { type: string }[] = [];
    const ctx = { location: { lon: -73.99, lat: 40.735 }, now: new Date(), emit: (c: { type: string }) => sent.push(c), deps: deps as never };
    const tools = makeTools(ctx);
    const out = (await call(tools.station_exit, { station: "Times Sq", to: "here" })) as { walkFromExit: { tripId: string } | null };
    const tripId = out.walkFromExit?.tripId;
    expect(tripId).toBeTruthy();
    expect(await call(tools.openPanel, { tripId })).toMatchObject({ ok: false });
    expect(await call(tools.showRoute, { tripId })).toMatchObject({ ok: false });
    expect(sent).toEqual([]);
    // Other tools still move the map in that answer.
    await call(tools.flyTo, { place: "here" });
    expect(sent.map((c) => c.type)).toEqual(["flyTo"]);
    // The yes is the next request, with new tools: the same trip draws and opens.
    const next = makeTools(ctx);
    expect(await call(next.showRoute, { tripId })).toEqual({ ok: true });
    expect(await call(next.openPanel, { tripId })).toEqual({ ok: true });
    expect(sent.map((c) => c.type)).toEqual(["flyTo", "showRoute", "openPanel"]);
    fetchSpy.mockRestore();
  });

  it("on the yes the model looks the exit up again, and then the walk opens", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    const sent: { type: string }[] = [];
    const tools = makeTools({ location: { lon: -73.99, lat: 40.735 }, now: new Date(), emit: (c: { type: string }) => sent.push(c), deps: deps as never, replying: true });
    const out = (await call(tools.station_exit, { station: "Times Sq", to: "here" })) as { walkFromExit: { tripId: string } | null };
    await call(tools.showRoute, { tripId: out.walkFromExit?.tripId });
    await call(tools.openPanel, { tripId: out.walkFromExit?.tripId });
    expect(sent.map((c) => c.type)).toEqual(["showRoute", "openPanel"]);
    fetchSpy.mockRestore();
  });

  it("a short reply to an answer is not a new question", () => {
    const asked = { role: "user", content: "Which exit at Times Sq for Bryant Park?" };
    const answer = { role: "assistant", content: "Take the south exit on Broadway. Want to start?" };
    expect(isShortReply([asked, answer, { role: "user", content: "yes" }])).toBe(true);
    expect(isShortReply([asked, answer, { role: "user", content: "sí, vamos" }])).toBe(true);
    expect(isShortReply([asked, answer, { role: "user", content: "是的" }])).toBe(true);
    expect(isShortReply([asked])).toBe(false);
    expect(isShortReply([{ role: "user", content: "exit for MoMA" }])).toBe(false);
    expect(isShortReply([asked, answer, { role: "user", content: "which exit for MoMA?" }])).toBe(false);
    expect(isShortReply([asked, answer, { role: "user", content: "and which exit would be best for the Museum of Modern Art" }])).toBe(false);
  });
});

describe("time + geometry helpers", () => {
  it("New York local time is DST-correct", () => {
    expect(nyLocalToDate("2026-10-22T09:00").toISOString()).toBe("2026-10-22T13:00:00.000Z");
    expect(nyLocalToDate("2026-12-22T09:00").toISOString()).toBe("2026-12-22T14:00:00.000Z");
    expect(toNyLocal(new Date("2026-10-22T13:00:00Z"))).toBe("2026-10-22T09:00");
  });
  it("octant names exits by compass corner", () => {
    expect(octant([-73.977, 40.752], [-73.976, 40.753])).toBe("NE");
  });
});

describe("drive helpers", () => {
  it("turns OSRM lanes into a lane hint", () => {
    const text = describeStep({
      name: "East 9th Street",
      maneuver: { type: "turn", modifier: "left", location: [0, 0] },
      intersections: [{ lanes: [{ valid: true, indications: ["left"] }, { valid: false, indications: ["none"] }, { valid: false, indications: ["none"] }] }],
    });
    expect(text).toBe("Turn left onto East 9th Street — use the left lane");
  });
  it("skips non-decision steps", () => {
    expect(describeStep({ name: "x", maneuver: { type: "depart", location: [0, 0] }, intersections: [] })).toBeNull();
  });
  it("finds tolls only for crossings on the route", () => {
    const rfk = MTA_TOLLS[0].at;
    expect(tolls([[rfk[0] - 0.001, rfk[1]], rfk, [rfk[0] + 0.001, rfk[1]]])).toHaveLength(1);
    expect(tolls([[-74.0, 40.7], [-73.99, 40.71]])).toHaveLength(0);
  });
});

describe("pickStation", () => {
  const st = (name: string, at: [number, number]) => ({ id: name, complexId: name, name, routes: [], structure: "Subway", at });
  const all = [st("34 St-Herald Sq", [-73.9879, 40.7497]), st("86 St", [-73.9762, 40.7888]), st("86 St", [-73.9557, 40.7795]), st("Times Sq-42 St", [-73.9873, 40.7553])];

  it("finds the station by the short name riders use", () => {
    expect(pickStation(all, "Herald Sq", [-73.9857, 40.7484])?.name).toBe("34 St-Herald Sq");
  });
  it("picks the one nearest the destination when several share a name", () => {
    expect(pickStation(all, "86 St", [-73.9540, 40.7790])?.at).toEqual([-73.9557, 40.7795]);
  });
  it("returns null for a name no station has", () => {
    expect(pickStation(all, "Hogwarts", [-73.98, 40.75])).toBeNull();
  });
});
