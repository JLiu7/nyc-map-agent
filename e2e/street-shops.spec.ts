import { expect, test, type Page } from "@playwright/test";
import { expectLayout, SIZES } from "./layout";
import { mockNetwork } from "./mocks";
import { slow } from "./slow";

/**
 * Tapping a shop in street view opens that shop's card (owner, 2026-11-10:
 * "clicking on shop is a bit buggy as well as trying to see its picture and
 * location"). The e2e network has no city tiles, so the test hangs its own
 * signs on the street through `window.__storefronts` (e2e build only): a café
 * 90 m ahead of the walker with a barber on the floor above it.
 */
interface Sign { name: string; cat: string; kind: string; brg: number; sw: number; fl: number; lng: number; lat: number }

/** Where the walker's camera is, and the pixel a point in front of it is drawn at. Runs in the page. */
const VIEW = `(() => {
  const map = window.__map, cv = map.getCanvas(), W = cv.clientWidth, H = cv.clientHeight;
  const f = H / 2 / Math.tan((map.getVerticalFieldOfView() * Math.PI) / 360);
  const p = (map.getPitch() * Math.PI) / 180, th = (map.getBearing() * Math.PI) / 180;
  const c = map.getCenter(), kx = 111320 * Math.cos((c.lat * Math.PI) / 180);
  const dist = f * (40075016.686 * Math.cos((c.lat * Math.PI) / 180)) / (512 * 2 ** map.getZoom());
  const back = dist * Math.sin(p), alt = (map.getCenterElevation ? map.getCenterElevation() : 0) + dist * Math.cos(p);
  const pad = map.getPadding(), rect = cv.getBoundingClientRect();
  return {
    bearing: map.getBearing(), pitch: map.getPitch(), alt,
    // The camera's ground point, and a point "ahead" metres in front of it and "right" metres to its right.
    at: (ahead, right) => ({
      lng: c.lng + ((ahead - back) * Math.sin(th) + right * Math.cos(th)) / kx,
      lat: c.lat + ((ahead - back) * Math.cos(th) - right * Math.sin(th)) / 111320,
    }),
    px: (ahead, right, z) => {
      const fwd = ahead * Math.sin(p) - (z - alt) * Math.cos(p), up = ahead * Math.cos(p) + (z - alt) * Math.sin(p);
      return { x: rect.left + W / 2 + (pad.left - pad.right) / 2 + (right / fwd) * f, y: rect.top + H / 2 + (pad.top - pad.bottom) / 2 - (up / fwd) * f };
    },
  };
})()`;

// Far enough that the sign one floor up is still below the street header on a 568 px tall phone.
const AHEAD = 90;
const pixel = (page: Page, right: number, z: number) => page.evaluate<{ x: number; y: number }>(`${VIEW}.px(${AHEAD}, ${right}, ${z})`);
async function tap(page: Page, right: number, z: number) {
  const p = await pixel(page, right, z);
  await page.mouse.click(p.x, p.y);
  return p;
}

for (const size of SIZES) {
  test(`street view: tapping a shop opens its card with its photo and map links (${size.name})`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await mockNetwork(page);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    // East End Avenue at East 84 Street: no subway entrance or station label within reach of a tap.
    await page.goto("/?at=-73.9445,40.7745,0");
    await expect(page.locator("canvas.maplibregl-canvas").first()).toBeVisible({ timeout: slow(20_000) });
    // A phone opens the view menu from one button; wider screens show the three views side by side.
    const street = page.getByRole("radiogroup", { name: "View" }).getByRole("radio", { name: "Street" });
    if (await street.isVisible()) await street.click();
    else {
      await page.getByRole("button", { name: "Change view" }).click();
      await page.getByRole("menu", { name: "Change view" }).getByText("Street", { exact: true }).click();
    }
    // Eye level, and the sign layer's code has arrived (it loads with the street's 3D city).
    await page.waitForFunction(() => {
      const map = (window as unknown as { __map?: { getPitch(): number; getLayer(id: string): unknown } }).__map;
      return !!map && map.getPitch() > 80 && !!map.getLayer("city3d-storefront-signs");
    }, undefined, { timeout: slow(30_000) });
    await page.waitForTimeout(800);

    const signs = await page.evaluate<Sign[]>(`(() => {
      const v = ${VIEW}, here = v.at(${AHEAD}, 0), brg = (v.bearing + 180) % 360;
      const cafe = { name: "Corner Cafe", cat: "food", kind: "cafe", brg, sw: 3, fl: 0, ...here };
      window.__storefronts = [cafe, { ...cafe, name: "Upstairs Barber", cat: "shop", kind: "hairdresser", fl: 1 }];
      window.__map.triggerRepaint();
      return window.__storefronts;
    })()`);
    expect(signs).toHaveLength(2);
    const sheet = page.getByTestId("details-sheet");
    const phone = size.width < 640;

    // The café's sign plate, 3.2 m up.
    const plate = await tap(page, 0, 3.2);
    await expect(sheet).toContainText("Corner Cafe");
    await expect(sheet).not.toContainText("Upstairs Barber");
    // Its real photo, from the street in front and facing it; and its Google Maps page.
    const photo = new URL((await sheet.getByTestId("shop-photo").getAttribute("href"))!);
    expect(photo.searchParams.get("map_action")).toBe("pano");
    expect(Number(photo.searchParams.get("heading"))).toBeCloseTo(((signs[0].brg + 180) % 360), 0);
    expect(await sheet.getByTestId("shop-place").getAttribute("href")).toMatch(/^https:\/\/www\.google\.com\/maps\/search\/Corner%20Cafe\/@40\.77\d+,-73\.94\d+,19z$/);
    for (const id of ["shop-photo", "shop-place"]) await expect(sheet.getByTestId(id)).toHaveAttribute("target", "_blank");
    if (phone) {
      // The card is two short lines on the chat bar: the shop that was tapped stays in view above it.
      const box = (await sheet.boundingBox())!;
      expect(box.height).toBeLessThanOrEqual(100);
      expect(box.y).toBeGreaterThan(plate.y + 40);
      expect(box.y).toBeGreaterThan(size.height * 0.6);
    }
    // A phone under 600 px tall has no room for the street map between the quick buttons and a card.
    if (size.height < 600) await expect(page.getByTestId("street-minimap")).toBeHidden();
    else await expect(page.getByTestId("street-minimap")).toBeVisible();
    await expectLayout(page);

    // With the card up a phone pads the map's bottom, which moves the picture: the tap must follow it.
    await page.waitForTimeout(600);
    await tap(page, 0, 3.2 + 3.5);
    await expect(sheet).toContainText("Upstairs Barber");
    await page.waitForTimeout(400);
    await tap(page, -0.8, 1.2); // the shop window
    await expect(sheet).toContainText("Corner Cafe");

    // The bare wall beside the shop front opens nothing, and clears the card.
    await page.waitForTimeout(400);
    await tap(page, -5, 1.2);
    await expect(sheet).toHaveCount(0);

    // Pulled up: what kind of place it is, and directions.
    await page.waitForTimeout(600);
    await tap(page, 0, 3.2);
    await sheet.getByRole("button", { name: "Corner Cafe" }).click();
    await expect(sheet.getByTestId("shop-kind")).toHaveText("Cafe");
    await expect(sheet.getByRole("button", { name: "Directions from here" })).toBeVisible();
    expect(errors).toEqual([]);
  });
}
