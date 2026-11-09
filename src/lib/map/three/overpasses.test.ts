import { describe, expect, it } from "vitest";
import { DECK_TOP_M, deckHeights, deckWidth, densify, isLowHighwayDeck, overpassPieces } from "./overpasses";

const eye = { lng: -73.99, lat: 40.71 };
const kx = 111_320 * Math.cos((eye.lat * Math.PI) / 180);
/** A line `m` metres long due east of the eye, as lng/lat. */
const east = (from: number, to: number): Array<[number, number]> => [
  [eye.lng + from / kx, eye.lat],
  [eye.lng + to / kx, eye.lat],
];
const bridge = (props: Record<string, unknown>, coords: Array<[number, number]>) => ({
  properties: { brunnel: "bridge", class: "motorway", layer: 1, ...props },
  geometry: { type: "LineString", coordinates: coords },
});

describe("overpasses", () => {
  it("lifts motorway and trunk decks one level up, not streets or the tall decks", () => {
    expect(isLowHighwayDeck({ brunnel: "bridge", class: "motorway", layer: 1 })).toBe(true);
    expect(isLowHighwayDeck({ brunnel: "bridge", class: "trunk" })).toBe(true);
    expect(isLowHighwayDeck({ brunnel: "bridge", class: "minor", layer: 1 })).toBe(false);
    expect(isLowHighwayDeck({ brunnel: "bridge", class: "motorway", layer: 2 })).toBe(false);
    expect(isLowHighwayDeck({ class: "motorway", layer: 1 })).toBe(false);
  });

  it("sizes a carriageway, a two-way deck and a ramp", () => {
    expect(deckWidth({ class: "motorway", oneway: 1 })).toBe(12);
    expect(deckWidth({ class: "trunk" })).toBe(20);
    expect(deckWidth({ class: "motorway", ramp: 1, oneway: 1 })).toBe(8);
  });

  it("ramps a loose end down to the road and holds deck height in the middle", () => {
    const pts = densify([[0, 0], [300, 0]]);
    const h = deckHeights(pts, true, false);
    expect(h[0]).toBeLessThan(0.1);
    expect(h[h.length - 1]).toBe(DECK_TOP_M);
    expect(h[Math.floor(h.length / 2)]).toBe(DECK_TOP_M);
    // Monotonic up the ramp.
    for (let i = 1; i < h.length; i++) expect(h[i]).toBeGreaterThanOrEqual(h[i - 1]);
  });

  it("keeps the end that joins another deck up, and lets the loose one come down", () => {
    const pieces = overpassPieces([bridge({}, east(0, 200)), bridge({}, east(200, 400))], eye);
    expect(pieces).toHaveLength(2);
    expect(pieces[0]).toMatchObject({ startFree: true, endFree: false });
    expect(pieces[1]).toMatchObject({ startFree: false, endFree: true });
  });

  it("leaves a deck the city tiles already draw high to them", () => {
    const ring: Array<[number, number]> = [
      [eye.lng - 0.01, eye.lat - 0.001], [eye.lng + 0.01, eye.lat - 0.001], [eye.lng + 0.01, eye.lat + 0.001], [eye.lng - 0.01, eye.lat + 0.001], [eye.lng - 0.01, eye.lat - 0.001],
    ];
    expect(overpassPieces([bridge({}, east(0, 200))], eye, [ring])).toHaveLength(0);
  });

  it("draws a deck split across two tiles once, carrying on over the tile edge", () => {
    // Two copies of one line, each tagged with its own z14 tile: each keeps only its part.
    const n = 2 ** 14;
    const tx = Math.floor(((eye.lng + 180) / 360) * n);
    const edge = (tx + 1) / n * 360 - 180;
    const ty = Math.floor(((1 - Math.asinh(Math.tan((eye.lat * Math.PI) / 180)) / Math.PI) / 2) * n);
    const line: Array<[number, number]> = [[edge - 0.002, eye.lat], [edge + 0.002, eye.lat]];
    const at = (x: number) => ({ ...bridge({}, line), _x: x, _y: ty, _z: 14 });
    const pieces = overpassPieces([at(tx), at(tx + 1)], { lng: edge, lat: eye.lat });
    expect(pieces).toHaveLength(2);
    const covered = pieces.reduce((m, p) => m + Math.abs(p.pts[p.pts.length - 1][0] - p.pts[0][0]), 0);
    expect(covered).toBeCloseTo(0.004 * 111_320 * Math.cos((eye.lat * Math.PI) / 180), 0);
    expect(pieces.map((p) => [p.startFree, p.endFree])).toEqual([[true, false], [false, true]]);
  });
});
