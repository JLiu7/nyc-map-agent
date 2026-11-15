import { expect, test } from "@playwright/test";
import { expectLayout, SIZES } from "./layout";
import { mockNetwork } from "./mocks";
import { slow } from "./slow";

/**
 * The 3D preview page at /station-3d (#186): Fulton St as a cloud of points
 * that fills in along a walk. It is drawn from the station model, not from a
 * video, so it needs no camera and no network beyond the model file.
 */
for (const size of SIZES) {
  test(`the 3D preview keeps the layout at ${size.name} ${size.width}×${size.height} and fills in as it plays`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewportSize({ width: size.width, height: size.height });
    await mockNetwork(page);
    await page.goto("/station-3d");
    await expect(page.getByTestId("station-3d")).toBeVisible({ timeout: slow(15_000) });
    await expect(page.locator("#shell-bar")).toHaveCount(0);
    const play = page.getByTestId("station-3d-play");
    await expect(play).toBeEnabled({ timeout: slow(15_000) });
    const points = () => page.getByTestId("station-3d-canvas").evaluate((c) => Number((c as HTMLElement).dataset.points));
    const before = await points();
    await expectLayout(page);

    await play.click();
    await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
    await expect.poll(points, { timeout: slow(15_000) }).toBeGreaterThan(before + 500);
    await page.getByRole("button", { name: "Pause" }).click();
    await expect(page.getByRole("button", { name: "Play" })).toBeVisible();
    await expectLayout(page);
    expect(errors, errors.join("\n")).toEqual([]);
  });
}
