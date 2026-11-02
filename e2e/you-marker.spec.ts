import { expect, test, type Page } from "@playwright/test";
import { expectLayout } from "./layout";
import { mockNetwork } from "./mocks";
import { slow } from "./slow";

type MapHandle = { getSource: (id: string) => { getData: () => Promise<{ features?: unknown[] }> } | undefined; getCenter: () => { lng: number; lat: number } };
const youShown = (page: Page) => page.evaluate(async () => {
  const src = (window as unknown as { __map?: MapHandle }).__map?.getSource("you");
  const data = src ? await src.getData() : null;
  return Array.isArray(data?.features) ? data.features.length : -1;
});

for (const size of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
  test(`the pretend trip shows you and the map follows at ${size.width}px`, async ({ page }) => {
    await page.setViewportSize(size);
    await mockNetwork(page);
    await page.goto("/?sim=walk");
    const locate = page.getByTestId("locate-button").first();
    await expect(locate).toHaveAttribute("data-camera", "follow");
    await expect.poll(() => youShown(page), { timeout: slow(15_000) }).toBe(1);
    // Following keeps you in the middle while you move.
    const before = await page.evaluate(() => (window as unknown as { __map: MapHandle }).__map.getCenter());
    await expect.poll(async () => {
      const now = await page.evaluate(() => (window as unknown as { __map: MapHandle }).__map.getCenter());
      return Math.hypot(now.lng - before.lng, now.lat - before.lat) > 0.0002;
    }, { timeout: slow(15_000) }).toBe(true);
    // Dragging the map hands the camera back to you.
    const box = (await page.locator(".maplibregl-canvas").boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 3);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 3 + 40, { steps: 6 });
    await page.mouse.up();
    await expect(locate).toHaveAttribute("data-camera", "off");
    // The marker stays on after following stops.
    expect(await youShown(page)).toBe(1);
    await locate.click();
    await expect(locate).toHaveAttribute("data-camera", "follow");
    await expectLayout(page);
  });
}

test("another feature turning the map keeps following you", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockNetwork(page);
  await page.goto("/?sim=walk");
  const locate = page.getByTestId("locate-button").first();
  await expect.poll(() => youShown(page), { timeout: slow(15_000) }).toBe(1);
  await expect(locate).toHaveAttribute("data-camera", "follow");
  // The underground helper turns the map with the compass like this; you stay on screen.
  await page.evaluate(() => (window as unknown as { __map: { easeTo: (o: object) => void } }).__map.easeTo({ bearing: 40, duration: 300 }));
  await page.waitForTimeout(800);
  await expect(locate).toHaveAttribute("data-camera", "follow");
  // A move that leaves you off screen does stop it.
  await page.evaluate(() => (window as unknown as { __map: { jumpTo: (o: object) => void } }).__map.jumpTo({ center: [-73.95, 40.8] }));
  await expect(locate).toHaveAttribute("data-camera", "off");
  await expectLayout(page);
});

test("walking points a cone the way you go, sized by how sure it is", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await mockNetwork(page);
  await page.goto("/?sim=walk");
  await expect.poll(() => youShown(page), { timeout: slow(15_000) }).toBe(1);
  // Walking through the park gives a heading from movement: the middle cone.
  await expect.poll(() => page.evaluate(async () => {
    const src = (window as unknown as { __map?: MapHandle }).__map?.getSource("you");
    const f = (src ? await src.getData() : null)?.features?.[0] as { properties?: { heading?: number; beam?: string } } | undefined;
    return typeof f?.properties?.heading === "number" ? f.properties.beam : null;
  }), { timeout: slow(20_000) }).toBe("you-beam");
  const images = await page.evaluate(() => {
    const m = (window as unknown as { __map: { hasImage: (id: string) => boolean } }).__map;
    return ["you-beam-narrow", "you-beam", "you-beam-wide"].map((id) => m.hasImage(id));
  });
  expect(images).toEqual([true, true, true]);
  await expectLayout(page);
});

test("the station question goes away once the pretend ride carries you off", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await mockNetwork(page);
  await page.goto("/?sim=walk");
  const question = page.getByText(/Are you in the station\?.*14 St-Union Sq/);
  await expect(question).toBeVisible({ timeout: slow(45_000) });
  await expect(question).toBeHidden({ timeout: slow(60_000) });
  await expectLayout(page);
});
