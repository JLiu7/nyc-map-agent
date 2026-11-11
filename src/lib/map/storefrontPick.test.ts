import { describe, expect, it } from "vitest";
import { pickSign, type PickRay, type StorefrontSign } from "./storefrontPick";

const LAT = 40.7105, LNG = -74.0092, ky = 111_320, kx = 111_320 * Math.cos((LAT * Math.PI) / 180);
/** A sign `east` metres along a wall 20 m north of the camera, facing south at it. */
const sign = (name: string, east: number, over: Partial<StorefrontSign> = {}): StorefrontSign =>
  ({ name, cat: "food", brg: 180, sw: 6, fl: 0, lng: LNG + east / kx, lat: LAT + 20 / ky, ...over });
/** A ray from eye height (1.7 m) to a point on that wall: `east` metres along it, `z` metres up. */
function rayTo(east: number, z: number, f?: number): PickRay {
  const d = [east, 20, z - 1.7], n = Math.hypot(d[0], d[1], d[2]);
  return { lng: LNG, lat: LAT, alt: 1.7, dir: [d[0] / n, d[1] / n, d[2] / n], f };
}

describe("pickSign", () => {
  const cafe = sign("Gong Cha", 0), upstairs = sign("Shake Shack", 0, { fl: 2 }), next = sign("Chase", 12, { cat: "money" });
  const all = [next, upstairs, cafe];

  it("picks the shop whose sign or window the tap is on", () => {
    expect(pickSign(rayTo(0, 3.2), all)?.name).toBe("Gong Cha"); // the sign plate
    expect(pickSign(rayTo(-2, 1.2), all)?.name).toBe("Gong Cha"); // the shop window
    expect(pickSign(rayTo(12, 3.2), all)?.name).toBe("Chase");
  });

  it("picks the shop upstairs from its own sign, not the one under it", () => {
    expect(pickSign(rayTo(0, 3.2 + 2 * 3.5), all)?.name).toBe("Shake Shack");
    expect(pickSign(rayTo(0, 2), all)?.name).toBe("Gong Cha");
  });

  it("opens nothing on the bare wall between two shops or above them", () => {
    expect(pickSign(rayTo(6, 1.5), all)).toBeNull();
    expect(pickSign(rayTo(0, 5.5), all)).toBeNull();
    expect(pickSign(rayTo(0, 14), all)).toBeNull();
  });

  it("does not pick a sign through the back of its building or through a nearer wall", () => {
    const behind = sign("Around the corner", 0, { brg: 0 }); // faces north, away from the camera
    expect(pickSign(rayTo(0, 3.2), [behind])).toBeNull();
    expect(pickSign(rayTo(0, 3.2), all, 12)).toBeNull(); // a wall 12 m away stands in front
    expect(pickSign(rayTo(0, 3.2), all, 22)?.name).toBe("Gong Cha");
  });

  it("gives a far sign a finger-sized target", () => {
    // 0.5 m above the plate at 80 m is a miss by geometry, and inside 12 px on a phone (f ≈ 1218 px at 812 px tall).
    const far = sign("Far", 0, { lat: LAT + 80 / ky });
    const d = [0, 80, 3.2 + 0.4 + 0.5 - 1.7], n = Math.hypot(d[0], d[1], d[2]);
    const ray: PickRay = { lng: LNG, lat: LAT, alt: 1.7, dir: [d[0] / n, d[1] / n, d[2] / n] };
    expect(pickSign(ray, [far])).toBeNull();
    expect(pickSign({ ...ray, f: 1218 }, [far])?.name).toBe("Far");
  });

  it("opens a mall's directory from its main sign and from the Directory board beside it", () => {
    const mall = sign("10 shops", 0, { cat: "mall", main: 1, sw: 8, dir: "Ann Cleaners|DP" });
    expect(pickSign(rayTo(0, 3.2), [mall])?.name).toBe("10 shops");
    // The board hangs to the wall's own left (east for a south-facing wall is -x along it).
    const board = [rayTo(4.9, 1.6), rayTo(-4.9, 1.6)].map((r) => pickSign(r, [{ ...mall, w: 3 }])?.name ?? null);
    expect(board.filter(Boolean)).toEqual(["10 shops"]);
  });
});
