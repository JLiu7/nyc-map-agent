import { expect, test, type Page } from "@playwright/test";
import { expectLayout, SIZES } from "./layout";
import { mockNetwork } from "./mocks";
import { slow } from "./slow";

/**
 * The station replay (a demo page behind `?flags=+stationReplay`): the film of
 * the step-free trip from Cortlandt St to 14 St-Union Sq, and the map with a
 * dot that moves in step with it and carries its level. Two things on screen,
 * with Play and a scrubber. Built for a 1920×1080 screen first, and held to
 * the phone layout bar too. The test browser cannot decode the film, so the
 * dot is checked through the page's own clock.
 */
type Hook = { seek: (s: number) => void; dot: () => [number, number]; time: () => number };
const replay = async (page: Page) => {
  await expect.poll(() => page.evaluate(() => typeof (window as unknown as { __stationReplay?: unknown }).__stationReplay), { timeout: slow(15_000) }).toBe("object");
  return {
    seek: (s: number) => page.evaluate((x) => (window as unknown as { __stationReplay: Hook }).__stationReplay.seek(x), s),
    dot: () => page.evaluate(() => (window as unknown as { __stationReplay: Hook }).__stationReplay.dot()),
    time: () => page.evaluate(() => (window as unknown as { __stationReplay: Hook }).__stationReplay.time()),
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
    const place = page.getByTestId("replay-place");
    const level = page.getByTestId("replay-level");
    const film = page.getByTestId("replay-film");
    const map = page.locator("canvas.maplibregl-canvas").first();

    // It opens at the start of the trip: the street entrance at Cortlandt St.
    await expect(place).toHaveText("Cortlandt St");
    await expect(level).toHaveText("Street", { timeout: slow(15_000) });
    await expect(film).toBeVisible();
    await expect(card.getByRole("button", { name: "Play" })).toBeVisible();
    await expect(page.getByTestId("replay-scrubber")).toBeVisible();

    // The film and the map, and nothing from the old page.
    for (const gone of ["replay-graph", "replay-google", "replay-sign", "replay-speed", "replay-now", "replay-gaps"]) await expect(page.getByTestId(gone)).toHaveCount(0);
    await expect(card.locator("img, select, p, figcaption")).toHaveCount(0);
    await expect(card).not.toContainText("No GPS signal");

    // The film is large, and on a phone it sits above the map's open part; on a desktop it is in the left column.
    const f = (await film.boundingBox())!;
    const m = (await map.boundingBox())!;
    expect(f.height).toBeGreaterThan(size.height * 0.25);
    if (size.width >= 1024) {
      expect(f.x + f.width).toBeLessThan(size.width * 0.45);
      expect(f.height).toBeGreaterThan(size.height * 0.5);
    } else {
      expect(f.y + f.height).toBeLessThan(size.height * 0.62);
    }
    expect(m.width).toBeGreaterThan(size.width - 2);

    const r = await replay(page);
    // Let the camera frame the station before the layout is measured.
    await page.waitForTimeout(3500);
    await expectLayout(page, { focus: await r.dot() });

    // Down the first elevator, in the passage under Dey St.
    await r.seek(24);
    await expect(level).toHaveText("Concourse");
    await expect(place).toHaveText("Cortlandt St");

    // On the train between the two stations: the map shows both.
    await r.seek(52);
    await expect(level).toHaveText("Train");
    await expect(place).toHaveText("R or W train");
    await page.waitForTimeout(1500);
    await expectLayout(page, { focus: await r.dot() });

    // Off the train at 14 St-Union Sq, then up to the mezzanine and the street.
    await r.seek(60);
    await expect(level).toHaveText("Platform");
    await expect(place).toHaveText("14 St-Union Sq");
    await r.seek(80);
    await expect(level).toHaveText("Mezzanine");
    await page.waitForTimeout(1500);
    await expectLayout(page, { focus: await r.dot() });
    await r.seek(110);
    await expect(level).toHaveText("Street");

    // The scrubber moves the dot, and Play moves it on by itself.
    await page.getByTestId("replay-scrubber").fill("30");
    await expect(level).toHaveText("Concourse");
    const before = await r.dot();
    await card.getByRole("button", { name: "Play" }).click();
    await expect.poll(() => r.time(), { timeout: slow(5_000) }).toBeGreaterThan(30.5);
    await card.getByRole("button", { name: "Pause" }).click();
    expect(await r.dot()).not.toEqual(before);
    const stopped = await r.time();
    await page.waitForTimeout(400);
    expect(await r.time()).toBe(stopped);

    expect(errors).toEqual([]);
  });
}
