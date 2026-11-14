import { expect, test, type Page } from "@playwright/test";
import { expectLayout, SIZES } from "./layout";
import { mockNetwork } from "./mocks";
import { slow } from "./slow";

/**
 * The station replay (a demo page behind `?flags=+stationReplay`): Friday's
 * real walk out of 14 St-Union Sq on the map, its three levels from the
 * barometer, and the same phone's Google Maps saying "No GPS signal". Built
 * for a 1920×1080 screen first, and held to the phone layout bar too.
 */
type Hook = { seek: (s: number) => void; dot: () => [number, number] | null };
const replay = async (page: Page) => {
  await expect.poll(() => page.evaluate(() => typeof (window as unknown as { __stationReplay?: unknown }).__stationReplay), { timeout: slow(15_000) }).toBe("object");
  return {
    seek: (s: number) => page.evaluate((x) => (window as unknown as { __stationReplay: Hook }).__stationReplay.seek(x), s),
    dot: () => page.evaluate(() => (window as unknown as { __stationReplay: Hook }).__stationReplay.dot()),
  };
};

const sizes = [...SIZES, { name: "big screen", width: 1920, height: 1080 }] as const;

for (const size of sizes) {
  test(`the station replay keeps the layout at ${size.name} ${size.width}×${size.height}`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await mockNetwork(page);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/?flags=+stationReplay");
    await expect(page.locator("canvas.maplibregl-canvas").first()).toBeVisible();
    const card = page.getByTestId("station-replay");
    await expect(card).toBeVisible({ timeout: slow(15_000) });
    await expect(page.getByTestId("replay-now")).toContainText("5:04:37 pm · Platform", { timeout: slow(15_000) });
    await expect(page.getByTestId("replay-graph")).toBeVisible();
    await expect(page.getByTestId("replay-google")).toContainText("No GPS signal");
    await expect(page.getByTestId("replay-film").locator("video")).toBeAttached();
    await expect(page.getByTestId("replay-sign")).toContainText("14 Street");
    const r = await replay(page);
    // Let the camera frame the walk before the layout is measured.
    await page.waitForTimeout(3500);
    await expectLayout(page, { focus: (await r.dot())! });

    // On the mezzanine, between the two elevators.
    await r.seek(400);
    await expect(page.getByTestId("replay-now")).toContainText("5:11:07 pm · Mezzanine");
    await expect(page.getByTestId("replay-sign")).not.toContainText("14 Street, with");
    await expectLayout(page, { focus: (await r.dot())! });

    // Out on 14th St: Google has its GPS back.
    await r.seek(700);
    await expect(page.getByTestId("replay-now")).toContainText("Street");
    await expect(page.getByTestId("replay-google")).not.toContainText("No GPS signal");

    // Play moves the clock on by itself, faster at 30×.
    await r.seek(100);
    await page.getByTestId("replay-speed").selectOption("30");
    await card.getByRole("button", { name: "Play" }).click();
    await expect(page.getByTestId("replay-now")).not.toContainText("5:06:07 pm", { timeout: slow(5_000) });
    await card.getByRole("button", { name: "Pause" }).click();

    await card.getByRole("button", { name: "Close" }).click();
    await expect(card).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
