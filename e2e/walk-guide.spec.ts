import { expect, test, type Page } from "@playwright/test";
import { expectLayout, SIZES } from "./layout";
import { mockNetwork } from "./mocks";
import { slow } from "./slow";

/**
 * The walk guide (a prototype behind `?flags=+walkGuide`): a filmed step-free
 * walk from the street elevator at Cortlandt St to the street at 14 St-Union
 * Sq, one sign at a time. The test browser has no motion sensor, so steps and
 * a named sign are handed in where the phone would give them.
 */
type Hook = { pick: (id: string) => void; walk: (n: number) => void; simulate: () => void };
const hook = async (page: Page, fn: "pick" | "walk", arg: string | number) => {
  await expect.poll(() => page.evaluate(() => typeof (window as unknown as { __walkGuide?: unknown }).__walkGuide), { timeout: slow(15_000) }).toBe("object");
  await page.evaluate(([f, a]) => ((window as unknown as { __walkGuide: Hook }).__walkGuide[f as "pick"] as (x: unknown) => void)(a), [fn, arg] as const);
};

for (const size of SIZES) {
  test(`the walk guide keeps the layout at ${size.name} ${size.width}×${size.height}`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await mockNetwork(page);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/?flags=+walkGuide");
    await expect(page.locator("canvas.maplibregl-canvas").first()).toBeVisible();
    const sheet = page.getByTestId("walk-guide");
    await expect(sheet).toBeVisible({ timeout: slow(15_000) });
    await expect(page.getByTestId("walk-level")).toHaveText("Cortlandt St · Street");
    await expect(sheet.getByRole("button", { name: "Start the guide" })).toBeVisible();
    await expectLayout(page);

    // Naming a sign puts the rider there: the level and the steps to the elevator follow.
    await hook(page, "pick", "us-yellow");
    await expect(page.getByTestId("walk-level")).toHaveText("14 St-Union Sq · Mezzanine");
    await expect(page.getByTestId("walk-togo")).toHaveText("About 100 steps to the elevator");
    await expect(page.getByTestId("walk-next")).toContainText("SW corner");
    await expectLayout(page);

    // Steps counted since then come off what is left.
    await hook(page, "walk", 14);
    await expect(page.getByTestId("walk-togo")).toHaveText("About 85 steps to the elevator");
    await expect(sheet).toContainText("You should see");

    // A sign off the route says so and points back to it.
    await hook(page, "pick", "us-west-exit");
    await expect(page.getByTestId("walk-wrong")).toContainText("west side");
    await expectLayout(page);

    // Lost: the signs to choose from, the nearest first.
    await sheet.getByRole("button", { name: "Lost" }).click();
    // The camera scan sits above the photos; the test browser has no camera, so it only has to fit.
    await expect(page.getByTestId("walk-scan").getByRole("button", { name: "Point the camera at a sign" })).toBeVisible();
    await expect(page.getByTestId("walk-signs").getByRole("button").first()).toContainText("Elevator to L");
    await expectLayout(page);
    await page.getByTestId("walk-signs").getByRole("button", { name: /Red Exit sign/ }).click();
    await expect(page.getByTestId("walk-togo")).toHaveText("Elevator");

    // The film of the trip opens in the sheet, with a way to keep it.
    await page.getByTestId("walk-film-toggle").click();
    await expect(page.getByTestId("walk-film")).toBeVisible();
    await expect(sheet.getByRole("link", { name: "Download the film" })).toHaveAttribute("href", "/walks/trip.mp4");
    await expectLayout(page);
    await page.getByTestId("walk-film-toggle").click();
    await expect(page.getByTestId("walk-film")).toHaveCount(0);

    // The simulated trip walks on by itself and says it is a simulation.
    await hook(page, "pick", "us-downtown-sign");
    await sheet.getByRole("button", { name: "Simulate the trip" }).click();
    await expect(page.getByTestId("walk-level")).toContainText("Simulation · 14 St-Union Sq");
    await expect(page.getByTestId("walk-level")).toContainText("Street", { timeout: slow(30_000) });
    await expectLayout(page);
    // At the last sign it stops by itself.
    await expect(page.getByTestId("walk-level")).not.toContainText("Simulation", { timeout: slow(30_000) });
    await expect(sheet.getByRole("button", { name: "Simulate the trip" })).toBeVisible();

    await sheet.getByRole("button", { name: "Close" }).click();
    await expect(sheet).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
