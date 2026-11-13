import { expect, test, type Page } from "@playwright/test";
import { expectLayout, SIZES } from "./layout";
import { mockNetwork } from "./mocks";
import { slow } from "./slow";

/**
 * The sign camera (a prototype behind `?flags=+signCamera`): words read off a
 * station sign are matched to the app's own signs for that station. The test
 * browser has no camera, so the words are handed in where the reader would
 * give them. Fulton St's name hangs all along its platforms, so it only says
 * which station; Clark St's two exit signs hang together, so "Exit" is a spot.
 */
const FULTON = { lon: -74.00672087, lat: 40.70951234 };
const CLARK = { lon: -73.99309, lat: 40.69747 };

const feed = async (page: Page, at: { lon: number; lat: number }, text: string) => {
  await expect.poll(() => page.evaluate(() => typeof (window as unknown as { __signCam?: unknown }).__signCam), { timeout: slow(15_000) }).toBe("function");
  await page.evaluate((p) => (window as unknown as { __signCam: (p: unknown) => Promise<void> }).__signCam(p), { ...at, text });
};

for (const size of SIZES) {
  test(`the sign camera keeps the layout at ${size.name} ${size.width}×${size.height}`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await mockNetwork(page);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/?flags=+signCamera");
    await expect(page.locator("canvas.maplibregl-canvas").first()).toBeVisible();
    const sheet = page.getByTestId("sign-camera");
    await expect(sheet).toBeVisible({ timeout: slow(15_000) });
    await expect(sheet.getByRole("button", { name: "Start camera" })).toBeVisible();
    await expectLayout(page);

    // A station's name is on signs all over it: the station is known, the spot is not.
    await feed(page, FULTON, "FultonSt A Cc J (Z");
    await expect(page.getByTestId("sign-near")).toHaveText("Fulton St", { timeout: slow(20_000) });
    await expect(sheet).toContainText("You are in");
    await expect(page.getByTestId("sign-exit")).toHaveCount(0);
    await expectLayout(page);

    // Words on no sign here change nothing.
    await feed(page, FULTON, "Dunkin Donuts open 24 hours");
    await expect(page.getByTestId("sign-near")).toHaveText("Fulton St");

    // Signs that hang in one place give the spot, and the exit with it.
    await feed(page, CLARK, "Exit");
    // With street names on the map the sign also names its corner ("Exit · Clark St & Henry St").
    await expect(page.getByTestId("sign-near")).toHaveText(/^Exit/, { timeout: slow(20_000) });
    await expect(sheet).toContainText("You are near");
    await expect(page.getByTestId("sign-exit")).toContainText("This exit");
    await expectLayout(page);

    // Closing it gives the map back.
    await sheet.getByRole("button", { name: "Close" }).click();
    await expect(sheet).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

// A phone busy drawing the map can hold frames back for a second, and a ResizeObserver only reports
// on a frame. Here it never reports: Center on my location still has to clear the grown sheet's grip.
test("Center on my location clears the sheet as it grows, before the next frame", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
  });
  await mockNetwork(page);
  await page.goto("/?flags=+signCamera");
  const sheet = page.getByTestId("sign-camera");
  await expect(sheet).toBeVisible({ timeout: slow(15_000) });
  await feed(page, FULTON, "Fulton St");
  await expect(page.getByTestId("sign-near")).toHaveText("Fulton St", { timeout: slow(20_000) });
  await feed(page, CLARK, "Exit");
  await expect(page.getByTestId("sign-exit")).toContainText("This exit", { timeout: slow(20_000) });
  const grip = (await sheet.getByTestId("sheet-grip").boundingBox())!;
  const locate = (await page.getByTestId("locate-button").first().boundingBox())!;
  expect(locate.y + locate.height).toBeLessThanOrEqual(grip.y);
  await expectLayout(page);
});

test("the sign camera speaks the app's language", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await mockNetwork(page);
  await page.addInitScript(() => localStorage.setItem("nma.lang", "es"));
  await page.goto("/?flags=+signCamera");
  const sheet = page.getByTestId("sign-camera");
  await expect(sheet.getByRole("button", { name: "Abrir cámara" })).toBeVisible({ timeout: slow(15_000) });
  await feed(page, FULTON, "Fulton St");
  // The caption is translated; the sign's own words are not.
  await expect(sheet).toContainText("Estás en");
  await expect(page.getByTestId("sign-near")).toHaveText("Fulton St");
  await expectLayout(page);
});
