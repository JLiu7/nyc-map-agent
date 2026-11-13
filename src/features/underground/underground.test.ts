import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ActiveTrip } from "@/lib/transit/activeTrip";
import { matchUnit, parseCorner, type StreetUnit } from "@/lib/transit/equipment";
import { alongLabel, alongPlatform, describePrompt, landmarkLine, pickLandmarks, signStreet, signText, trainCue, trainEndOf } from "./cues";
import { ageLabel, bearing, cornerOf, exitKind, octant, rankExits, stationEntrances, turnHint, type Pt, type SubwayStatic } from "./exits";
import { meetPoint } from "./offline";
import { buildStore, clipSketch, loadStore, outageLabel, packFor, saveStore, tripStations, tripStops } from "./pack";
import { accuracyWorsened, boardingStation, endedVisits, promptStale, stationAtEntrance, stationToAsk } from "./prompt";
import { backoffMs, enqueue, isConnected, markFailed, markSent, nextDue } from "./queue";
import { CalibrationStep, ExitPointer, SAFETY_LINE } from "./steps";
import { bboxAround, packTileUrls, tilesFor } from "./tiles";

// Grand Central-42 St (631), roughly; entrances on each side.
const ST: Pt = [-73.9768, 40.7518];
const sys: SubwayStatic = {
  stations: {
    features: [
      { geometry: { coordinates: ST }, properties: { id: "631", name: "Grand Central-42 St" } },
      { geometry: { coordinates: [-73.9819, 40.7466] }, properties: { id: "632", name: "33 St" } },
      { geometry: { coordinates: [-73.9878, 40.7397] }, properties: { id: "633", name: "28 St" } },
    ],
  },
  entrances: {
    features: [
      { geometry: { coordinates: [-73.9762, 40.7524] }, properties: { id: "631", name: "Grand Central-42 St", kind: "Stair" } }, // NE
      { geometry: { coordinates: [-73.9774, 40.7512] }, properties: { id: "631", name: "Grand Central-42 St", kind: "Stair" } }, // SW
      { geometry: { coordinates: [-73.9762, 40.7512] }, properties: { id: "631", name: "Grand Central-42 St", kind: "Elevator" } }, // SE
      { geometry: { coordinates: [-73.9765, 40.7519] }, properties: { id: "631", name: "Grand Central-42 St", kind: "Easement - Passage" } },
      { geometry: { coordinates: [-73.9785, 40.752] }, properties: { id: "723", name: "Grand Central-42 St", kind: "Stair" } },
      { geometry: { coordinates: [-73.977, 40.7519] }, properties: { id: "999", name: "Elsewhere", kind: "Stair" } },
    ],
  },
};
const station = { id: "631", name: "Grand Central-42 St", at: ST };

// A southbound 6 train arriving at Grand Central from the north: travel bearing ~ south-west.
const RIDE: Pt[] = [
  [-73.9727, 40.7575],
  [-73.9748, 40.7546],
  ST,
];
const trip: ActiveTrip = {
  id: "t1",
  destination: { label: "Chrysler Building", at: [-73.9755, 40.7516] },
  legs: [
    { kind: "enter", station: { id: "629", name: "59 St", lon: -73.9727, lat: 40.7625 } },
    { kind: "ride", mode: "subway", coords: RIDE, stops: [{ at: ST, text: "Grand Central-42 St" }] },
    { kind: "exit", station: { id: "631", name: "Grand Central-42 St", lon: ST[0], lat: ST[1] }, portal: { lon: -73.9762, lat: 40.7512, label: "SE exit" } },
    { kind: "walk", coords: [[-73.9762, 40.7512], [-73.9755, 40.7516]] },
  ],
};

describe("exit ranking", () => {
  it("keeps the station's street exits, including its complex, and drops passages and other stations", () => {
    const ents = stationEntrances(sys, station);
    expect(ents).toHaveLength(4);
    expect(ents.some((e) => /passage/i.test(e.kind))).toBe(false);
  });

  it("counts exits up through a building as street exits (Hoyt-Schermerhorn has only those)", () => {
    const hoyt = { id: "A42", name: "Hoyt-Schermerhorn Sts", at: [-73.985, 40.6884] as Pt };
    const only: SubwayStatic = { ...sys, entrances: { features: [
      { geometry: { coordinates: [-73.98586, 40.68903] }, properties: { id: "A42", name: "Hoyt-Schermerhorn Sts", kind: "Easement - Street" } },
      { geometry: { coordinates: [-73.9843, 40.68843] }, properties: { id: "A42", name: "Hoyt-Schermerhorn Sts", kind: "Easement - Street" } },
    ] } };
    expect(stationEntrances(only, hoyt)).toHaveLength(2);
    expect(exitKind("Easement - Street")).toBe("through a building");
  });

  it("puts the exit nearest the destination first (straight line)", () => {
    expect(rankExits(station, stationEntrances(sys, station), [-73.974, 40.754])[0].side).toBe("NE");
    expect(rankExits(station, stationEntrances(sys, station), [-73.98, 40.749])[0].side).toBe("SW");
  });

  it("without a destination uses compass order and claims no closest", () => {
    const ranked = rankExits(station, stationEntrances(sys, station), null);
    expect(ranked.every((e) => e.toDestM === null)).toBe(true);
  });

  it("finds where two simplified street lines would cross, for the corner name", () => {
    const lines = [
      { name: "A St", coords: [[-73.98, 40.75], [-73.9705, 40.75]] as Pt[] },
      { name: "B Av", coords: [[-73.97, 40.7503], [-73.97, 40.76]] as Pt[] }, // stops short of A St
    ];
    const p = meetPoint(lines, "A St", "B Av", [-73.9699, 40.7501])!;
    expect(p[0]).toBeCloseTo(-73.97, 5);
    expect(p[1]).toBeCloseTo(40.75, 5);
    expect(cornerOf(p, [-73.9699, 40.7501])).toBe("NE");
    expect(meetPoint(lines, "A St", "C St", [-73.97, 40.75])).toBeNull();
  });

  it("bearings, corners, turn hints and ages", () => {
    expect(bearing([0, 0], [0, 1])).toBe(0);
    expect(bearing([0, 0], [1, 0])).toBe(90);
    expect(octant([0, 0], [-1, -1])).toBe("SW");
    expect(cornerOf([0, 0], [0.001, 0.001])).toBe("NE");
    expect(cornerOf([0, 0], [-0.001, -0.001])).toBe("SW");
    expect(turnHint(0, 90)).toBe("Turn about 90° to your right");
    expect(turnHint(0, 180)).toBe("You are heading away from it: turn around");
    expect(exitKind("Elevator")).toBe("elevator");
    expect(ageLabel(0, 12 * 60_000)).toBe("12 min ago");
  });
});

describe("cues people can see", () => {
  it("says front or back of the train from the ride line, and omits it near the middle", () => {
    // Travel is from north-east to south-west; the SW exit is ahead (front), the NE one behind (back).
    expect(trainEndOf(RIDE, ST, [-73.9774, 40.7512])).toBe("front");
    expect(trainEndOf(RIDE, ST, [-73.9762, 40.7524])).toBe("back");
    expect(trainEndOf(RIDE, ST, [-73.9768, 40.7518])).toBeNull();
    expect(trainEndOf(null, ST, [-73.9774, 40.7512])).toBeNull();
    // Too far off the line to say.
    expect(trainEndOf(RIDE, ST, [-73.99, 40.75])).toBeNull();
    expect(trainCue("front")).toMatch(/FRONT of the train. Walk the way the train was going/);
  });

  it("measures the exit along the platform from the station point", () => {
    const a = alongPlatform(RIDE, ST, [-73.9774, 40.7512])!;
    expect(a).toBeGreaterThan(60);
    expect(a).toBeLessThan(100);
    expect(alongPlatform(RIDE, ST, [-73.9762, 40.7524])!).toBeLessThan(-60);
    expect(alongLabel(80)).toBe("Exit about 80 m toward the front (approximate)");
    expect(alongLabel(-12)).toBe("Exit near the middle of the platform (approximate)");
  });

  it("writes street names the way MTA signs do", () => {
    expect(signStreet("West 42nd Street")).toBe("W 42 St");
    expect(signStreet("7th Avenue")).toBe("7 Av");
    expect(signStreet("Broadway")).toBe("Broadway");
    expect(signText(["West 42nd Street", "7th Avenue"], "NE")).toBe("Exit · W 42 St & 7 Av · NE corner");
    expect(signText(null, "NE")).toBeNull();
  });

  it("picks landmarks in front first, then behind, and skips ones to the side or too far", () => {
    const from: Pt = [-73.9762, 40.7512];
    const toward = 0; // facing north
    const picks = pickLandmarks(from, toward, [
      { name: "North Tower", at: [-73.9762, 40.757], tall: true }, // front
      { name: "South Tower", at: [-73.9762, 40.746], tall: true }, // behind
      { name: "East Shop", at: [-73.9757, 40.7512], tall: false }, // side
      { name: "Far Shop", at: [-73.9762, 40.7545], tall: false }, // shops only count close by
    ]);
    expect(picks).toEqual([
      { name: "North Tower", where: "front" },
      { name: "South Tower", where: "behind" },
    ]);
    expect(landmarkLine(picks[0])).toBe("North Tower should be in front of you. If it is behind you, turn around.");
    expect(pickLandmarks(from, toward, [])).toEqual([]);
  });

  it("asks the assistant for cue-based directions", () => {
    const q = describePrompt({ station: "Times Sq-42 St", sign: "Exit · W 42 St & 7 Av · NE corner", destination: "Bryant Park", seen: "a big red staircase" });
    expect(q).toContain("Times Sq-42 St");
    expect(q).toContain("not compass directions");
  });
});

describe("MTA elevator and escalator text", () => {
  it("parses the corner it reaches", () => {
    expect(parseCorner("E 14 St and Avenue A (SW corner) to Canarsie-bound platform")).toEqual({ streets: ["E 14 St", "Avenue A"], corner: "SW" });
    expect(parseCorner("A/C/E intermediate mezzanine to 42 St & 8th Ave (SE corner)")).toEqual({ streets: ["42 St", "8th Ave"], corner: "SE" });
    expect(parseCorner("Mezzanine to platform")).toBeNull();
  });

  it("matches a unit only when type, stop, corner and a street agree", () => {
    const units: StreetUnit[] = [
      { id: "EL1", type: "EL", stops: ["631", "723"], serving: "42 St & Lexington Ave (SE corner) to mezzanine", streets: ["42 St", "Lexington Ave"], corner: "SE" },
      { id: "ES1", type: "ES", stops: ["631"], serving: "x", streets: ["42 St", "Park Ave"], corner: "SE" },
    ];
    expect(matchUnit(units, { kind: "Elevator", stopIds: ["631"], corner: "SE", streets: ["East 42nd Street", "Lexington Avenue"] })?.id).toBe("EL1");
    expect(matchUnit(units, { kind: "Elevator", stopIds: ["631"], corner: "NE", streets: null })).toBeNull();
    expect(matchUnit(units, { kind: "Stair", stopIds: ["631"], corner: "SE", streets: null })).toBeNull();
  });
});

describe("exit packs", () => {
  const units: StreetUnit[] = [{ id: "EL1", type: "EL", stops: ["631"], serving: "42 St & Lexington Ave (SE corner) to mezzanine", streets: ["42 St", "Lexington Ave"], corner: "SE" }];
  const placeAt = (at: Pt) => ({ streets: ["East 42nd Street", "Lexington Avenue"] as [string, string], corner: cornerOf([-73.9765, 40.7515], at), landmarks: [] });

  it("lists every station the trip gets off at and the stops it rides", () => {
    expect(tripStations(sys, trip).map((s) => s.station.id)).toEqual(["631"]);
    expect(tripStops(sys, trip).map((s) => s.id)).toEqual(["629", "631"]);
  });

  it("holds exits, MTA wording, the track bearing and a small street sketch, and nothing else", () => {
    const lines = [{ name: "East 42nd Street", coords: [[-73.98, 40.7514], [-73.97, 40.7514], [-73.95, 40.7514]] as Pt[] }];
    const store = buildStore(sys, units, { trip, near: null, placeAt, lines, now: 5 })!;
    const pack = packFor(store, "631")!;
    expect(store.destination?.label).toBe("Chrysler Building");
    expect(Object.keys(pack).sort()).toEqual(["exits", "sketch", "station", "trackBearing"]);
    expect(pack.trackBearing).toBeGreaterThan(180);
    expect(pack.exits[0].side).toBe("SE");
    const el = pack.exits.find((e) => e.kind === "Elevator")!;
    expect(el.unit?.id).toBe("EL1");
    expect(el.cornerApprox).toBe(false);
    expect(pack.exits.find((e) => e.kind === "Stair")!.cornerApprox).toBe(true);
    // The sketch keeps the street segment passing the station, not the far one.
    expect(pack.sketch).toEqual([{ name: "East 42nd Street", coords: [[-73.98, 40.7514], [-73.97, 40.7514]] }]);
    expect(JSON.stringify(store).length).toBeLessThan(8000);
  });

  it("without a trip uses the nearest station, and none when too far", () => {
    expect(buildStore(sys, [], { trip: null, near: [-73.9769, 40.7519] })?.packs[0].station.id).toBe("631");
    expect(buildStore(sys, [], { trip: null, near: [-73.9, 40.8] })).toBeNull();
    expect(clipSketch([{ name: "x", coords: [[0, 0], [1, 1]] }], ST)).toEqual([]);
  });

  it("round-trips through storage and survives broken storage", () => {
    const mem = new Map<string, string>();
    const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
    const s = buildStore(sys, units, { trip, near: null, now: 5 });
    saveStore(s, store);
    expect(loadStore(store)).toEqual(s);
    const broken = { getItem: () => "{not json", setItem: () => { throw new Error("full"); }, removeItem: () => {} };
    expect(loadStore(broken)).toBeNull();
    expect(() => saveStore(s, broken)).not.toThrow();
  });

  it("labels outage status with its age and never shows a stale one as current", () => {
    const status = { at: 0, out: ["EL1"] };
    expect(outageLabel(status, "EL1", 8 * 60_000)).toBe("Out of service (as of 8 min ago)");
    expect(outageLabel(status, "EL2", 30_000)).toBe("Working (as of just now)");
    expect(outageLabel(status, "EL1", 40 * 60_000)).toBe("Was out of service (as of 40 min ago; may have changed)");
    expect(outageLabel(null, "EL1", 0)).toBe("Elevator/escalator status not known");
    expect(outageLabel(status, null, 0)).toBeNull();
  });

  it("covers the station area with a few z14 tiles that also draw zooms 15–18", () => {
    const b = bboxAround([ST, [-73.9774, 40.7512]])!;
    expect(b[0]).toBeLessThan(ST[0]);
    expect(tilesFor(b, 14).length).toBeGreaterThanOrEqual(1);
    const urls = packTileUrls(["https://tiles.example/planet/{z}/{x}/{y}.pbf"], [ST], 14);
    expect(urls.length).toBeLessThanOrEqual(4);
    expect(urls.every((u) => u.includes("/14/"))).toBe(true);
    expect(packTileUrls([], [ST], 14)).toEqual([]);
  });
});

describe('"Are you in the station?"', () => {
  const near = { id: "631", name: "Grand Central-42 St", at: ST };
  const base = { nearStation: null, online: true, baselineAccuracy: 8, accuracy: 8, here: null, boarding: null, asked: new Set<string>(), declined: new Set<string>() };

  it("asks near an entrance when the network drops or GPS gets much worse", () => {
    expect(stationAtEntrance(sys, [-73.9762, 40.7525])?.id).toBe("631");
    expect(stationToAsk({ ...base, nearStation: near })).toBeNull();
    expect(stationToAsk({ ...base, nearStation: near, online: false })?.id).toBe("631");
    expect(stationToAsk({ ...base, nearStation: near, accuracy: 120 })?.id).toBe("631");
    expect(accuracyWorsened(8, 30)).toBe(false);
  });

  it("asks when the trip boards and the shared position is at that station, not while it is only planned", () => {
    const b = boardingStation(trip)!;
    expect(b.id).toBe("629");
    expect(stationToAsk({ ...base, boarding: b, here: b.at })?.id).toBe("629");
    expect(stationToAsk({ ...base, boarding: b })).toBeNull();
    expect(stationToAsk({ ...base, boarding: b, here: [-73.9, 40.8] })).toBeNull();
  });

  it("asks once per visit and never again after a No", () => {
    expect(stationToAsk({ ...base, nearStation: near, online: false, asked: new Set(["631"]) })).toBeNull();
    expect(stationToAsk({ ...base, nearStation: near, online: false, declined: new Set(["631"]) })).toBeNull();
    expect(endedVisits(new Map([["631", ST]]), [-73.99, 40.75])).toEqual(["631"]);
  });

  it("drops the question once a ride carries you away, and does not ask about the station you left", () => {
    const unionSq = { id: "635", name: "14 St-Union Sq", at: [-73.98995, 40.73467] as Pt };
    const atGrandCentral: Pt = [-73.9768, 40.7518];
    expect(promptStale(unionSq, [-73.9899, 40.7348])).toBe(false);
    expect(promptStale(unionSq, atGrandCentral)).toBe(true);
    expect(promptStale(null, atGrandCentral)).toBe(false);
    expect(stationToAsk({ ...base, nearStation: unionSq, accuracy: 120, here: atGrandCentral })).toBeNull();
    expect(stationToAsk({ ...base, nearStation: unionSq, accuracy: 120, here: unionSq.at })?.id).toBe("635");
  });
});

describe('"Describe what you see" queue and connectivity', () => {
  it("queues while offline and sends when the connection is back", () => {
    let q = enqueue([], "  I see a Duane Reade ", 0, "a");
    expect(q[0].text).toBe("I see a Duane Reade");
    expect(nextDue(q, false, 0)).toBeNull();
    expect(nextDue(q, true, 0)?.id).toBe("a");
    q = markFailed(q, "a", 1000);
    expect(nextDue(q, true, 1000 + backoffMs(1) - 1)).toBeNull();
    expect(nextDue(q, true, 1000 + backoffMs(1))?.id).toBe("a");
    expect(markSent(q, "a")).toEqual([]);
    expect(enqueue([], "   ", 0)).toEqual([]);
    expect(backoffMs(20)).toBe(5 * 60_000);
  });

  it("does not trust navigator.onLine after a failed request", () => {
    expect(isConnected({ navigatorOnLine: false, lastOkAt: 5, lastFailAt: null })).toBe(false);
    expect(isConnected({ navigatorOnLine: true, lastOkAt: null, lastFailAt: null })).toBe(true);
    expect(isConnected({ navigatorOnLine: true, lastOkAt: 1, lastFailAt: 2 })).toBe(false);
    expect(isConnected({ navigatorOnLine: true, lastOkAt: 3, lastFailAt: 2 })).toBe(true);
  });
});

describe("safety text", () => {
  it("renders with the calibration step, which asks only to point the phone", () => {
    const html = renderToStaticMarkup(createElement(CalibrationStep, { raw: null, waiting: false, onDone: () => {}, onSkip: () => {} }));
    expect(html).toContain(SAFETY_LINE.replace("—", "—"));
    expect(html).toContain("Stay behind the yellow line");
    expect(html).toContain("Hold your phone flat, pointing the way the train went, for 5 seconds");
    expect(html).not.toMatch(/walk (toward|along) the tracks/i);
  });

  it("renders with the pointer's first appearance", () => {
    const first = renderToStaticMarkup(createElement(ExitPointer, { rotation: 10, visible: true, distanceM: 80, firstTime: true, hiddenReason: null }));
    expect(first).toContain("Stay behind the yellow line");
    expect(first).toContain("Approximate");
    const later = renderToStaticMarkup(createElement(ExitPointer, { rotation: 10, visible: true, distanceM: 80, firstTime: false, hiddenReason: null }));
    expect(later).not.toContain("Stay behind the yellow line");
  });
});

describe("offline cache list (public/sw.js)", () => {
  type Policy = { PRECACHE: string[]; strategyFor: (u: URL, r: { mode?: string; method?: string; origin: string; keep?: boolean }) => string; staleAsset: (date: string | null, now: number) => boolean; keptKey: (path: string, body: string, origin: string) => string };
  const src = readFileSync(new URL("../../../public/sw.js", import.meta.url), "utf8");
  const self: { UW?: Policy; addEventListener: () => void; location: { origin: string } } = { addEventListener: () => {}, location: { origin: "https://map.test" } };
  runInNewContext(src, { self });
  const { PRECACHE, strategyFor, staleAsset, keptKey } = self.UW!;
  const how = (path: string, mode = "cors", method = "GET") => strategyFor(new URL(path, "https://map.test"), { mode, method, origin: "https://map.test" });

  it("precaches the app shell, stations and entrances, and the equipment list; no station layouts", () => {
    expect(PRECACHE).toEqual(expect.arrayContaining(["/", "/transit/subway.json", "/transit/equipment.json"]));
    expect(PRECACHE).not.toContain("/transit/xray.json");
    expect(PRECACHE.some((u) => u.startsWith("/api"))).toBe(false);
  });

  it("never caches the assistant or live feeds; other hosts fall back only to saved station tiles", () => {
    expect(how("/api/agent", "cors", "POST")).toBe("bypass");
    expect(how("/api/agent")).toBe("bypass");
    expect(how("/api/transit/subway")).toBe("bypass");
    expect(how("/sw.js")).toBe("bypass");
    expect(how("https://tiles.openfreemap.org/planet/14/1/2.pbf")).toBe("network-then-tiles");
  });

  it("serves the shell, built assets and transit files from the cache when offline", () => {
    expect(how("/some/route?at=1,2", "navigate")).toBe("network-first-shell");
    expect(how("/assets/index-abc123.js")).toBe("cache-first");
    expect(how("/transit/subway.json")).toBe("network-first");
    expect(how("/transit/equipment.json")).toBe("network-first");
  });

  it("keeps the station data the trip preview walks once it has been seen (#132)", () => {
    expect(how("/transit/fulton-model.json")).toBe("network-first");
    expect(how("/transit/xray.json")).toBe("network-first");
    expect(how("/transit/../api/x.json")).toBe("bypass");
  });

  it("keeps the trip steps' translations and spoken lines, and only those (#132)", () => {
    const at = (path: string, keep: boolean, method = "POST") => strategyFor(new URL(path, "https://map.test"), { mode: "cors", method, origin: "https://map.test", keep });
    expect(at("/api/tts", true)).toBe("kept");
    expect(at("/api/agent/translate", true)).toBe("kept");
    expect(at("/api/tts", false)).toBe("bypass");
    expect(at("/api/agent", true)).toBe("bypass");
    expect(at("https://elsewhere.test/api/tts", true)).toBe("bypass");
    const body = (lang: string) => JSON.stringify({ text: "Up the stairs to Nassau St", lang });
    const a = keptKey("/api/tts", body("en"), "https://map.test");
    expect(a.startsWith("https://map.test/__kept/v1/api/tts?")).toBe(true);
    expect(keptKey("/api/tts", body("es"), "https://map.test")).not.toBe(a);
    expect(keptKey("/api/agent/translate", body("en"), "https://map.test")).not.toBe(a);
  });

  it("drops built files from deploys more than 30 days old, and keeps undated ones", () => {
    const now = Date.parse("2026-11-12T12:00:00Z");
    expect(staleAsset("Mon, 05 Oct 2026 12:00:00 GMT", now)).toBe(true);
    expect(staleAsset("Thu, 05 Nov 2026 12:00:00 GMT", now)).toBe(false);
    expect(staleAsset(null, now)).toBe(false);
  });
});

describe("the way up a stair", () => {
  it("carries the mapped way up for stairs, not elevators", () => {
    const st = { id: "X1", name: "Test St", at: [-73.98, 40.76] as [number, number] };
    const exits = rankExits(st, [{ at: [-73.9801, 40.7601], kind: "Stair", up: 30 }, { at: [-73.9799, 40.7599], kind: "Elevator", up: 30 }], null);
    expect(exits.find((e) => e.kind === "Stair")?.up).toBe(30);
    expect(exits.find((e) => e.kind === "Elevator")?.up).toBeNull();
  });
});
