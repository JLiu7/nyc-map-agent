import { expect, test } from "@playwright/test";
import { expectLayout, SIZES } from "./layout";
import { mockNetwork } from "./mocks";
import { slow } from "./slow";

/**
 * In Street view at a Fulton St stair, "Walk inside Fulton St" shows and opens the walk down to the
 * platform and the train (#126; owner, 2026-11-13). Away from the stairs it is not there.
 */
const BROADWAY_DEY: [number, number] = [-74.00927, 40.71046];

for (const size of SIZES) {
  test(`${size.name}: Street view at a Fulton St stair offers the walk inside`, async ({ page }) => {
    await page.setViewportSize(size);
    await mockNetwork(page);
    await page.goto("/?flags=-agentHome");
    await expect(page.locator("canvas.maplibregl-canvas").first()).toBeVisible();
    await page.getByTestId("view-switcher").getByRole("button", { name: "Street", exact: true }).click();
    await expect(page.getByTestId("walk-bar")).toBeVisible({ timeout: slow(15_000) });
    const entry = page.getByTestId("street-walk-inside");
    await expect(entry).toHaveCount(0);
    await page.evaluate((c) => (window as unknown as { __map: { jumpTo(o: object): void } }).__map.jumpTo({ center: c }), BROADWAY_DEY);
    await expect(entry).toBeVisible({ timeout: slow(10_000) });
    // The older desktop street bar and walk pad overlap under the search row, a known overlap left
    // out here as in minimap.spec.ts.
    await expectLayout(page, { ignore: ['[data-testid="walk-bar"]', '[aria-label="Street-level camera controls"]'] });
    await entry.click();
    const walk = page.getByTestId("station-walk");
    await expect(walk).toBeVisible();
    await expect(walk.locator("canvas")).toBeVisible({ timeout: slow(30_000) });
    await page.getByTestId("station-walk-close").click();
    await expect(walk).toHaveCount(0);
  });
}
