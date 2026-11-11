import { describe, expect, it } from "vitest";
import type { Map as MapLibreMap } from "maplibre-gl";
import { cameraRay } from "./eyePick";
import { busStopsShown, pickAt, setBusStopsShown, setPickTargets, subscribeBusStops } from "./streetPick";

// A phone at eye level looking north, with a sheet open: the map pads its bottom, which lifts the view's centre.
const W = 375, H = 812, PITCH = 86, PAD = 179;
const map = {
  getCanvas: () => ({ clientWidth: W, clientHeight: H }),
  getVerticalFieldOfView: () => 36.87,
  getPitch: () => PITCH,
  getBearing: () => 0,
  getZoom: () => 22.78,
  getCenter: () => ({ lng: -73.988, lat: 40.718 }),
  getCenterElevation: () => 1,
  getPadding: () => ({ top: 0, bottom: PAD, left: 0, right: 0 }),
} as unknown as MapLibreMap;
const eye = cameraRay(map, W / 2, H / 2)!;
const kx = 111_320 * Math.cos((eye.lat * Math.PI) / 180);
/** A point `east` and `north` metres from the walker. */
const at = (east: number, north: number) => ({ lng: eye.lng + east / kx, lat: eye.lat + north / 111_320 });
/** The screen pixel where a point `east`, `north` of the walker and `z` metres up is drawn. */
function px(east: number, north: number, z: number): [number, number] {
  const p = (PITCH * Math.PI) / 180, f = eye.f;
  const v = [east, north, z - eye.alt];
  const fwd = v[1] * Math.sin(p) - v[2] * Math.cos(p), up = v[1] * Math.cos(p) + v[2] * Math.sin(p);
  return [W / 2 + (v[0] / fwd) * f, (H - PAD) / 2 - (up / fwd) * f];
}

describe("pickAt", () => {
  const kiosk = { kind: "restroom" as const, id: "r1", ...at(0, 8), h: 2.4, props: { name: "Seward Park" } };
  const behind = { kind: "busstop" as const, id: "b1", ...at(-166, -63), h: 3.53, props: { name: "CHURCH ST/LIBERTY ST" } };
  const farPole = { kind: "busstop" as const, id: "b2", ...at(0, 120), h: 3.53, props: { name: "Far stop" } };
  it("stands at eye height", () => {
    expect(eye.alt).toBeGreaterThan(1.5);
    expect(eye.alt).toBeLessThan(1.9);
  });
  it("hits the kiosk body from its base to its top", () => {
    setPickTargets([kiosk]);
    expect(pickAt(map, ...px(0, 8, 2.2))?.id).toBe("r1");
    expect(pickAt(map, ...px(0.3, 8, 0.4))?.id).toBe("r1");
  });
  it("misses beside it and above it", () => {
    setPickTargets([kiosk]);
    expect(pickAt(map, ...px(2, 8, 1.2))).toBeNull();
    expect(pickAt(map, ...px(0, 8, 4))).toBeNull();
  });
  it("never picks a pole behind the walker", () => {
    setPickTargets([behind]);
    // A shop sign 23 m ahead, 3.2 m up, and three more taps across the screen: none of them is the bus stop.
    for (const [x, y] of [px(0, 23, 3.2), [40, 200], [187, 400], [330, 620]] as Array<[number, number]>) expect(pickAt(map, x, y)).toBeNull();
    setPickTargets([behind, kiosk]);
    expect(pickAt(map, ...px(0, 8, 1.2))?.id).toBe("r1");
  });
  it("keeps a far pole a small target, and the nearer model wins", () => {
    setPickTargets([farPole]);
    expect(pickAt(map, ...px(0, 120, 2))?.id).toBe("b2");
    const [x, y] = px(0, 120, 2);
    expect(pickAt(map, x, y - 60)).toBeNull(); // the wall above it
    expect(pickAt(map, x + 40, y)).toBeNull();
    setPickTargets([farPole, kiosk]);
    expect(pickAt(map, ...px(0, 8, 1.8))?.id).toBe("r1");
    setPickTargets([]);
  });
});

describe("bus stop poles", () => {
  it("notifies the furniture layer when the switch changes", () => {
    const seen: boolean[] = [];
    const stop = subscribeBusStops(() => seen.push(busStopsShown()));
    setBusStopsShown(false);
    setBusStopsShown(false);
    setBusStopsShown(true);
    stop();
    expect(seen).toEqual([false, true]);
    expect(busStopsShown()).toBe(true);
  });
});
