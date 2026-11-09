import { expect, test } from "@playwright/test";
import { expectLayout } from "./layout";
import { mockNetwork } from "./mocks";

/**
 * Street view paints roads at their real width in ground metres (an 11 m side
 * street with 3.75 m sidewalks), and does not paint a raised overpass flat on
 * the street under it: the three.js overpass layer draws it in the air.
 */
const ROAD = (id: string) => ({ id, type: "line", source: "roads", paint: { "line-color": "#fff", "line-width": 2 } });
const STYLE = JSON.stringify({
  version: 8,
  sources: { roads: { type: "geojson", data: { type: "FeatureCollection", features: [] } } },
  layers: [
    { id: "background", type: "background", paint: { "background-color": "#e5e7eb" } },
    ROAD("road_minor_casing"),
    ROAD("road_minor"),
    ROAD("bridge_motorway"),
  ],
});

// Desktop only: phones use the chat-first layout, where the old street controls are not shown.
for (const size of [{ width: 1280, height: 800 }]) {
  test(`street view draws roads in metres and lifts overpasses off the street at ${size.width}px`, async ({ page }) => {
    await page.setViewportSize(size);
    await mockNetwork(page);
    await page.route("https://tiles.openfreemap.org/styles/**", (route) => route.fulfill({ contentType: "application/json", body: STYLE }));
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/?flags=-agentHome");
    await expect(page.locator("canvas.maplibregl-canvas").first()).toBeVisible();
    await page.getByTestId("view-switcher").getByRole("button", { name: "Street", exact: true }).click();
    await page.waitForTimeout(2500);
    const paint = await page.evaluate(() => {
      const map = (window as unknown as { __map: { getPaintProperty: (l: string, p: string) => unknown } }).__map;
      return {
        road: map.getPaintProperty("road_minor", "line-width") as [string, unknown, unknown, number, number, number, number],
        casing: map.getPaintProperty("road_minor_casing", "line-width") as [string, unknown, unknown, number, number, number, number],
        bridge: map.getPaintProperty("bridge_motorway", "line-opacity"),
      };
    });
    // Ground metres at z15: metres × 2^15 / 118 700.
    expect(paint.road[4]).toBeCloseTo((11 * 2 ** 15) / 118_700, 3);
    expect(paint.casing[4]).toBeCloseTo((18.5 * 2 ** 15) / 118_700, 3);
    expect(JSON.stringify(paint.bridge)).toContain("motorway");
    expect(errors).toEqual([]);
    await expectLayout(page);
  });
}
