import { describe, expect, it } from "vitest";
import { findCorner, parseCorner, type CornerTable } from "./corner";
import { geocode } from "./services";

// Two Manhattan corners and one in Brooklyn, in the shipped table's shape.
const table: CornerTable = {
  "1": { names: ["BROADWAY", "FULTON ST", "W 42 ST", "E 42 ST", "5 AVE"], nodes: [[-7400906, 4071089, 0, 1], [-7398641, 4075582, 0, 2], [-7398089, 4075349, 2, 3, 4]] },
  "3": { names: ["BROADWAY", "FULTON ST"], nodes: [[-7390046, 4067713, 0, 1]] },
};

describe("parseCorner", () => {
  it("reads two streets and the borough", () => {
    expect(parseCorner("Fulton Street and Broadway, New York")).toEqual({ a: "Fulton Street", b: "Broadway", borough: "1" });
    expect(parseCorner("corner of W 42nd St & 8th Ave, Manhattan")).toEqual({ a: "W 42nd St", b: "8th Ave", borough: "1" });
    expect(parseCorner("Broadway and Fulton St, Brooklyn")?.borough).toBe("3");
  });

  it("leaves places, stations and addresses alone", () => {
    for (const t of ["Aldi at Rego Park", "Fulton Street Station, Fulton Street & Broadway, Manhattan", "14 Fulton Street, New York", "Times Square", "Bryant Park and the library"]) {
      expect(parseCorner(t)).toBeNull();
    }
  });
});

describe("findCorner", () => {
  it("finds where the streets meet, in the named borough", () => {
    expect(findCorner(parseCorner("Fulton Street and Broadway, New York")!, table)?.at).toEqual([-74.00906, 40.71089]);
    expect(findCorner(parseCorner("Broadway and Fulton St, Brooklyn")!, table)?.at).toEqual([-73.90046, 40.67713]);
  });

  it("tries East and West for a bare street number", () => {
    expect(findCorner(parseCorner("Broadway and 42nd Street")!, table)?.at).toEqual([-73.98641, 40.75582]);
    expect(findCorner(parseCorner("42nd St & 5th Ave")!, table)?.at).toEqual([-73.98089, 40.75349]);
  });

  it("returns null when the streets don't meet there", () => {
    expect(findCorner(parseCorner("Fulton St and 5th Ave, Manhattan")!, table)).toBeNull();
    expect(findCorner(parseCorner("Fulton St and Broadway, Queens")!, table)).toBeNull();
  });

  it("knows Fulton St and Broadway in the shipped table", () => {
    const at = findCorner(parseCorner("Fulton Street and Broadway, New York")!)!.at;
    expect(at[0]).toBeCloseTo(-74.009, 3);
    expect(at[1]).toBeCloseTo(40.711, 3);
  });
});

describe("geocode with corners", () => {
  it("answers a corner before the address search", async () => {
    const geosearch = () => Promise.resolve([{ label: "14 Fulton Street, Manhattan", at: [-74.0035, 40.7066] as [number, number], confidence: 1 }]);
    const p = await geocode("Fulton Street and Broadway, New York", { stations: () => Promise.resolve([]), geosearch, corner: (c) => findCorner(c, table) });
    expect(p).toEqual({ label: "Fulton Street & Broadway, Manhattan", at: [-74.00906, 40.71089] });
  });

  it("falls back to the address search when the corner is unknown", async () => {
    const geosearch = () => Promise.resolve([{ label: "5 Avenue, Manhattan", at: [-73.98, 40.75] as [number, number], confidence: 1 }]);
    const p = await geocode("Fulton St and 5th Ave", { stations: () => Promise.resolve([]), geosearch, shops: () => Promise.resolve(null), corner: (c) => findCorner(c, table) });
    expect(p?.label).toBe("5 Avenue, Manhattan");
  });
});
