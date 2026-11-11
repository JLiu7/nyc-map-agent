import { describe, expect, it } from "vitest";
import type { Map as MapLibreMap } from "maplibre-gl";
import { cameraRay, eyePick } from "./eyePick";

const LAT = 40.73, LNG = -73.99, ky = 111_320, kx = 111_320 * Math.cos((LAT * Math.PI) / 180);
/** A building 40–60 m south of the map centre (the camera sits ~85 m south), 9 m tall. */
const box = (s: number, n: number, w: number, e: number) => [[[LNG + w / kx, LAT + s / ky], [LNG + e / kx, LAT + s / ky], [LNG + e / kx, LAT + n / ky], [LNG + w / kx, LAT + n / ky], [LNG + w / kx, LAT + s / ky]]];
function fakeMap(pitch: number, zoom = 19): MapLibreMap {
  return {
    getCanvas: () => ({ clientWidth: 800, clientHeight: 500 }),
    getVerticalFieldOfView: () => 36.87,
    getPitch: () => pitch,
    getBearing: () => 0,
    getZoom: () => zoom,
    getCenter: () => ({ lng: LNG, lat: LAT }),
    getCenterElevation: () => 0,
    getSource: () => ({}),
    querySourceFeatures: () => [{ geometry: { type: "Polygon", coordinates: box(-60, -40, -10, 10) }, properties: { h: 9, store: 1 } }],
  } as unknown as MapLibreMap;
}

describe("eyePick", () => {
  it("hits the facade ahead at eye-level pitch, not the ground behind it", () => {
    const hit = eyePick(fakeMap(85), 400, 250);
    expect(hit?.kind).toBe("building");
    if (hit?.kind !== "building") return;
    const north = (hit.lat - LAT) * ky;
    expect(north).toBeGreaterThan(-61);
    expect(north).toBeLessThan(-39);
  });
  it("misses to the side and above the roof line", () => {
    expect(eyePick(fakeMap(85), 5, 250)?.kind).not.toBe("building");
    expect(eyePick(fakeMap(85), 400, 0)?.kind ?? "sky").not.toBe("building");
  });
});

describe("cameraRay", () => {
  it("aims from the padded centre of the view, not the middle of the canvas", () => {
    // A phone with a sheet open pads the bottom by 179 px: the view's centre moves up by half of that.
    const plain = fakeMap(86), padded = { ...fakeMap(86), getPadding: () => ({ top: 0, bottom: 179, left: 0, right: 0 }) } as unknown as MapLibreMap;
    const a = cameraRay(plain, 400, 250)!, b = cameraRay(padded, 400, 250 - 89.5)!, low = cameraRay(padded, 400, 250)!;
    b.dir.forEach((v, i) => expect(v).toBeCloseTo(a.dir[i], 9));
    expect(low.dir[2]).toBeLessThan(a.dir[2]); // the same pixel now looks lower
  });
});
