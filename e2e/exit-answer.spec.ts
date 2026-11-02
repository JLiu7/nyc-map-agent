import { expect, test } from "@playwright/test";
import { expectLayout } from "./layout";
import { mockNetwork } from "./mocks";
import { slow } from "./slow";

const stream = (events: unknown[]) => events.map((e) => JSON.stringify(e)).join("\n") + "\n";
const SHOTS = process.env.EXIT_SHOTS;
const exit: [number, number] = [-73.98798, 40.74967];
const dest: [number, number] = [-73.98566, 40.74844];

for (const [width, height] of [[375, 667], [320, 568]]) {
  test(`a which-exit answer is the map, with a small card, at ${width}×${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await mockNetwork(page);
    await page.route("**/api/agent", (r) => r.fulfill({ contentType: "application/x-ndjson", body: stream([
      { type: "text", text: "Take the NE exit on West 34 Street. About 3 minutes on foot." },
      { type: "actions", actions: [{
        kind: "showExit", id: "exit:test", label: "Show the NE exit on West 34 Street exit", station: "34 St-Herald Sq",
        exit: { at: exit, label: "NE exit on West 34 Street", elevatorOnly: false },
        destination: { at: dest, label: "Empire State Building" },
        path: [exit, [-73.987, 40.7492], dest], walkMin: 3,
      }] },
      { type: "done" },
    ]) }));
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Restroom" })).toBeVisible({ timeout: slow(15_000) });
    await page.getByLabel("Ask the assistant").fill("Which exit for the Empire State Building?");
    await page.getByRole("button", { name: "Send", exact: true }).click();

    // The answer stays small so the exit and its walk show on the map above it.
    const card = page.locator('[data-testid="answer-card"][data-compact]');
    await expect(card).toContainText("NE exit on West 34 Street");
    const box = (await card.boundingBox())!;
    expect(box.y).toBeGreaterThan(height * 0.45);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    // Let the camera finish framing the exit before the picture.
    if (SHOTS) { await page.waitForTimeout(1500); await page.screenshot({ path: `${SHOTS}/exit-${width}.png` }); }

    // More opens the full answer.
    await card.getByRole("button", { name: "More" }).click();
    await expect(page.locator('[data-testid="answer-card"]:not([data-compact])')).toBeVisible();
  });
}

test("walking away from the place after an exit answer says to turn around", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  // A location we move by hand: every watcher hears each step.
  await page.addInitScript(([lon, lat]) => {
    const watchers = new Map<number, PositionCallback>();
    let at = { lon, lat };
    let next = 1;
    const fix = () => ({ coords: { longitude: at.lon, latitude: at.lat, accuracy: 8, heading: null, speed: null, altitude: null, altitudeAccuracy: null }, timestamp: Date.now() }) as unknown as GeolocationPosition;
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: {
      watchPosition: (ok: PositionCallback) => { const id = next++; watchers.set(id, ok); setTimeout(() => ok(fix()), 50); return id; },
      clearWatch: (id: number) => watchers.delete(id),
      getCurrentPosition: (ok: PositionCallback) => setTimeout(() => ok(fix()), 50),
    } });
    (window as unknown as { __moveTo: (lon: number, lat: number) => void }).__moveTo = (lo, la) => { at = { lon: lo, lat: la }; watchers.forEach((w) => w(fix())); };
  }, exit);
  const moveTo = (lon: number, lat: number) => page.evaluate(([lo, la]) => (window as unknown as { __moveTo: (lon: number, lat: number) => void }).__moveTo(lo, la), [lon, lat]);
  await mockNetwork(page);
  await page.route("**/api/agent", (r) => r.fulfill({ contentType: "application/x-ndjson", body: stream([
    { type: "text", text: "Take the NE exit on West 34 Street. About 3 minutes on foot." },
    { type: "actions", actions: [{
      kind: "showExit", id: "exit:test", label: "Show the NE exit on West 34 Street exit", station: "34 St-Herald Sq",
      exit: { at: exit, label: "NE exit on West 34 Street", elevatorOnly: false },
      destination: { at: dest, label: "Empire State Building" },
      path: [exit, [-73.987, 40.7492], dest], walkMin: 3,
    }] },
    { type: "done" },
  ]) }));
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Restroom" })).toBeVisible({ timeout: slow(15_000) });
  // Share location from Center on my location.
  await page.getByTestId("locate-button").first().click();
  await expect(page.getByTestId("locate-button").first()).toHaveAttribute("data-camera", "follow");
  // Wait until the shared location is drawn as your dot.
  await expect.poll(() => page.evaluate(async () => {
    const src = (window as unknown as { __map?: { getSource: (id: string) => { getData: () => Promise<{ features?: unknown[] }> } | undefined } }).__map?.getSource("you");
    return (src ? await src.getData() : null)?.features?.length ?? 0;
  }), { timeout: slow(15_000) }).toBe(1);
  await page.getByLabel("Ask the assistant").fill("Which exit for the Empire State Building?");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  const card = page.locator('[data-testid="answer-card"][data-compact]');
  await expect(card).toContainText("NE exit on West 34 Street");
  await expect(page.getByTestId("wrong-way")).toHaveCount(0);
  // Walk west, away from the Empire State Building to the east.
  for (const lon of [-73.9883, -73.9886, -73.9889, -73.9892, -73.9896, -73.99]) {
    await moveTo(lon, exit[1]);
    await page.waitForTimeout(500);
  }
  await expect(page.getByTestId("wrong-way")).toHaveText("Turn around, Empire State Building is behind you");
  // Walking back clears it.
  await moveTo(exit[0], exit[1]);
  await expect(page.getByTestId("wrong-way")).toHaveCount(0);
  await expectLayout(page);
});
