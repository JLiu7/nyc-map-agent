import { describe, expect, it, vi } from "vitest";
import { bestCandidate, matchLandmark, matchStation } from "./places";
import { businessQuery, geocode } from "./services";
import type { Station } from "./transit";

const st = (name: string, at: [number, number]): Station => ({ id: name, complexId: name, name, routes: [], structure: "Subway", at });
const stations = [st("Grand Central-42 St", [-73.9768, 40.7518]), st("34 St-Herald Sq", [-73.9879, 40.7496]), st("Atlantic Av-Barclays Ctr", [-73.9776, 40.6842]), st("Bedford Av", [-73.9571, 40.7173])];
const esplanade = { label: "700 ESPLANADE GD PLAZA, Manhattan, New York, NY", at: [-73.936, 40.82] as [number, number], confidence: 0.6 };

describe("geocode landmarks and stations", () => {
  it.each(["Grand Central", "grand central terminal", "Penn Station", "Port Authority", "Times Square", "Union Square", "Barclays Center", "WTC", "the Oculus", "Times Sq"])("%s is a curated landmark", (q) => {
    expect(matchLandmark(q)).not.toBeNull();
  });

  it("matches GTFS station names exactly", () => {
    expect(matchStation("Bedford Av", stations)?.name).toBe("Bedford Av");
    expect(matchStation("34 St - Herald Square station", stations)?.name).toBe("34 St-Herald Sq");
    expect(matchStation("Grand", stations)).toBeNull();
  });

  it("a read-back pick with its trains finds that one of several same-name stations", () => {
    const six = [st("86 St", [-73.97, 40.79]), { ...st("86 St", [-73.95, 40.78]), id: "b", routes: ["4", "5", "6"] }, { ...st("86 St", [-74.03, 40.62]), id: "c", routes: ["R"] }];
    six[0].routes = ["1"];
    expect(matchStation("86 St (4 5 6 trains)", six)?.id).toBe("b");
    expect(matchStation("86 St (R train) station", six)?.id).toBe("c");
    expect(matchStation("86 St (Q train)", six)).toBeNull();
  });

  // Asked "fulton street manhattan", the model looked up "Fulton Street, Manhattan, NY" and landed on 14 Fulton St (#77).
  it("a station still matches with several place words after it, and the borough picks which one", () => {
    const fulton = [{ ...st("Fulton St", [-74.0076, 40.7104]), id: "m", borough: "M" }, { ...st("Fulton St", [-73.9754, 40.6872]), id: "bk", borough: "Bk" }];
    for (const q of ["Fulton Street, Manhattan, NY", "Fulton St, Manhattan, New York", "Fulton Street, New York, NY", "Fulton Street station, Lower Manhattan", "fulton street manhattan"]) expect(matchStation(q, fulton)?.id, q).toBe("m");
    expect(matchStation("Fulton St, Brooklyn, NY", fulton)?.id).toBe("bk");
    expect(matchStation("fulton st brooklyn", fulton)?.id).toBe("bk");
    expect(matchStation("Fulton St, Queens", fulton)).toBeNull();
  });

  // "59 Street" with no borough went to Bay Ridge, Brooklyn (2026-11-12).
  it("a name several boroughs share is Manhattan's unless a borough or train says otherwise", () => {
    const fiftyNine = [{ ...st("59 St", [-74.0178, 40.6414]), id: "bk", borough: "Bk", routes: ["N", "R"] }, { ...st("59 St", [-73.9677, 40.7626]), id: "m", borough: "M", routes: ["4", "5", "6"] }];
    expect(matchStation("59 Street", fiftyNine)?.id).toBe("m");
    expect(matchStation("59 St, Brooklyn", fiftyNine)?.id).toBe("bk");
    expect(matchStation("59 St (R train)", fiftyNine)?.id).toBe("bk");
  });

  // Planning the trip, the model wrote "Fulton Street Station, Fulton Street & Broadway, Manhattan" (#79).
  it("a station named before its cross streets is that station; a bare name before a comma is left to the address search", () => {
    const fulton = [{ ...st("Fulton St", [-74.0076, 40.7104]), id: "m", borough: "M" }, { ...st("Fulton St", [-73.9754, 40.6872]), id: "bk", borough: "Bk" }];
    expect(matchStation("Fulton Street Station, Fulton Street & Broadway, Manhattan", fulton)?.id).toBe("m");
    expect(matchStation("Fulton St station, Lafayette Ave, Brooklyn", fulton)?.id).toBe("bk");
    expect(matchStation("Fulton St, 14 Fulton St, Manhattan", fulton)).toBeNull();
  });

  it("Grand Central beats GeoSearch's Esplanade Gardens", async () => {
    const geosearch = vi.fn().mockResolvedValue([esplanade]);
    const p = await geocode("Grand Central", { stations: () => Promise.resolve(stations), geosearch });
    expect(p?.label).toBe("Grand Central Terminal");
    expect(p!.at[1]).toBeCloseTo(40.75, 1);
    expect(geosearch).not.toHaveBeenCalled();
  });

  it("Times Square resolves to Midtown", async () => {
    expect((await geocode("Times Square", { stations: () => Promise.resolve([]), geosearch: vi.fn() }))?.label).toBe("Times Square");
  });

  it("station names come before GeoSearch", async () => {
    const geosearch = vi.fn();
    expect((await geocode("Bedford Av", { stations: () => Promise.resolve(stations), geosearch }))?.label).toBe("Bedford Av station");
    expect(geosearch).not.toHaveBeenCalled();
  });

  it("falls back to GeoSearch when the station list fails, preferring the highest confidence", async () => {
    const geosearch = vi.fn().mockResolvedValue([{ ...esplanade, confidence: 0.6 }, { label: "350 5 AVENUE", at: [-73.98, 40.75], confidence: 0.95 }]);
    const p = await geocode("350 5th Ave", { stations: () => Promise.reject(new Error("down")), geosearch });
    expect(p?.label).toBe("350 5 AVENUE");
  });

  it("drops low-confidence GeoSearch matches", () => {
    expect(bestCandidate([{ ...esplanade, confidence: 0.3 }])).toBeNull();
  });
});

describe("businesses by name", () => {
  it("asks for a store with its area, and leaves addresses to GeoSearch", () => {
    expect(businessQuery("Aldi at Rego Park")).toBe("Aldi, Rego Park");
    expect(businessQuery("Trader Joe's near Union Square")).toBe("Trader Joe's, Union Square");
    expect(businessQuery("61-11 Junction Blvd")).toBeNull();
    expect(businessQuery("55 Fulton St")).toBeNull();
    // A store whose name starts with a number is still a store.
    expect(businessQuery("55 Fulton Market")).toBe("55 Fulton Market");
  });

  it("uses the store over GeoSearch's nearest address when one is found", async () => {
    const geosearch = vi.fn();
    const shops = vi.fn().mockResolvedValue({ label: "Aldi, 61-11 Junction Boulevard, Rego Park", at: [-73.86, 40.73] });
    const p = await geocode("Aldi at Rego Park", { stations: () => Promise.resolve([]), geosearch, shops });
    expect(p?.label).toContain("Aldi");
    expect(geosearch).not.toHaveBeenCalled();
  });

  it("falls back to GeoSearch when the store lookup fails", async () => {
    const geosearch = vi.fn().mockResolvedValue([]);
    await geocode("Some Place in Queens", { stations: () => Promise.resolve([]), geosearch, shops: () => Promise.reject(new Error("down")) });
    expect(geosearch).toHaveBeenCalled();
  });
});

describe("neighbourhood names", () => {
  it("a bare neighbourhood is its centre, not a venue that shares the name", () => {
    expect(matchLandmark("Flushing")?.label).toMatch(/^Flushing \(Main St/);
    expect(matchLandmark("Flushing, Queens")?.label).toMatch(/^Flushing \(/);
    expect(matchLandmark("jackson heights")?.label).toMatch(/^Jackson Heights/);
  });
  it("a station that carries the name still wins as a station", () => {
    expect(matchLandmark("Flushing-Main St")).toBeNull();
  });
});
