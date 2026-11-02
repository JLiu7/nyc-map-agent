import { expect, test } from "@playwright/test";
import { expectLayout } from "./layout";
import { mockNetwork } from "./mocks";
import { slow } from "./slow";

test("boarding the downtown 6 by mistake says to get off and cross over", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 375, height: 812 });
  await mockNetwork(page);
  // The pretend trip plans the uptown 6 to Grand Central but rides it downtown.
  await page.goto("/?sim=wrongway");
  const warning = page.getByTestId("trip-warning");
  await expect(warning).toHaveText(/^This train is going downtown\. Get off at .+ and cross over\.$/, { timeout: slow(120_000) });
  // One line in the bottom sheet, with the ask box still there.
  await expect(page.getByLabel("Ask the assistant")).toBeVisible();
  await expectLayout(page);
  await page.getByRole("region", { name: "Trip warning" }).getByRole("button", { name: "Dismiss" }).click();
  await expect(warning).toHaveCount(0);
});
