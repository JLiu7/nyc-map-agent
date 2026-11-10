import { expect, test, type Page } from "@playwright/test";
import { expectLayout, SIZES } from "./layout";
import { mockNetwork } from "./mocks";
import { slow } from "./slow";

/**
 * Street view walks into a station: down a street stair at Fulton St to the
 * platforms, where the view below the street takes over, with the layout bar
 * holding over it. Elevated platforms are drawn on the map itself (no overlay).
 */
type Eye = { z?: number; inside?: boolean };
/** One metre short of a mapped Fulton St street stair, facing down it. */
const FULTON_STAIR = { lon: -74.00672087, lat: 40.70951234, heading: 32.55, exact: true };

const eye = (page: Page) => page.evaluate(() => (window as unknown as { __eye?: () => Eye | null }).__eye?.() ?? null);

for (const size of SIZES) {
  test(`walking down into a station keeps the layout at ${size.name} ${size.width}×${size.height}`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await mockNetwork(page);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/");
    await expect(page.locator("canvas.maplibregl-canvas").first()).toBeVisible();
    await expect.poll(() => page.evaluate(() => typeof (window as unknown as { __walk?: unknown }).__walk), { timeout: slow(15_000) }).toBe("function");
    await page.evaluate((at) => (window as unknown as { __walk: (a: unknown) => void }).__walk(at), FULTON_STAIR);
    // The station data loads on the first walk; until it has, the stair top is plain pavement. Feet height shows it has.
    await expect.poll(async () => (await eye(page))?.z, { timeout: slow(20_000) }).toBe(0);
    await page.keyboard.down("w");
    await expect.poll(async () => (await eye(page))?.z ?? 0, { timeout: slow(20_000) }).toBeLessThan(-1.5);
    await page.keyboard.up("w");
    await expect(page.getByTestId("station-inside")).toBeVisible();
    expect((await eye(page))?.inside).toBe(true);
    expect(errors).toEqual([]);
    await expectLayout(page);
    // The Exit signs are hung again with their street corners once the map settles; that must not throw or move anything.
    await page.waitForTimeout(1500);
    await expect(page.getByTestId("station-inside")).toBeVisible();
    expect(errors).toEqual([]);
    await expectLayout(page);
  });
}
