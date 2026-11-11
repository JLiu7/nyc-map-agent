import { describe, expect, it } from "vitest";
import { placeUrl, shopLine, streetPhotoUrl } from "./storefrontLinks";

// Gong Cha on Broadway at Fulton Street: its wall faces north-west (303°).
const shop = { name: "Gong Cha", lng: -74.009181, lat: 40.710566, brg: 303, fl: 0, kind: "cafe", cat: "food" };

describe("shop links", () => {
  it("opens the street photo from in front of the shop, looking at it", () => {
    const u = new URL(streetPhotoUrl(shop));
    expect(u.searchParams.get("map_action")).toBe("pano");
    expect(u.searchParams.get("heading")).toBe("123"); // 303° turned round
    const [lat, lng] = u.searchParams.get("viewpoint")!.split(",").map(Number);
    // 8 m out of the wall: north and west of the sign.
    expect((lat - shop.lat) * 111_320).toBeCloseTo(8 * Math.cos((303 * Math.PI) / 180), 1);
    expect(lng).toBeLessThan(shop.lng);
  });

  it("searches Google Maps for the shop by name at its door", () => {
    expect(placeUrl({ ...shop, name: "Ben & Jerry's" })).toBe("https://www.google.com/maps/search/Ben%20%26%20Jerry's/@40.710566,-74.009181,19z");
  });

  it("says what the place is in one short line", () => {
    expect(shopLine(shop)).toBe("Cafe");
    expect(shopLine({ ...shop, kind: "fast_food", fl: 2 })).toBe("Fast food · Upstairs");
    expect(shopLine({ ...shop, kind: undefined, cat: "money", fl: -1 })).toBe("Bank · Downstairs");
    expect(shopLine({ ...shop, kind: undefined, cat: undefined })).toBe("");
  });
});
