import { expect, test, type Page } from "@playwright/test";
import { expectLayout, SIZES } from "./layout";
import { mockNetwork } from "./mocks";
import { slow } from "./slow";

/**
 * A trip with a bus leg (owner, 2026-11-13): the walk ends at the stop, the camera holds there,
 * the bus pulls in and the rider gets on, then the ride follows the bus. The preview is paused and
 * dragged to each stage, since the software-drawn map runs too slowly to catch them in passing.
 * SHOTS=<dir> saves a screenshot of each stage, for looking at it by eye.
 */
const stop: [number, number] = [-74.0094, 40.7101];
const trip = {
  id: "bus-e2e", mode: "transit", origin: { label: "Fulton St", at: [-74.0087, 40.7102] }, destination: { label: "Houston St", at: [-74.0023, 40.7253] },
  departIso: "2026-11-13T10:00", arriveIso: "2026-11-13T10:20", routes: ["M55"], alerts: [], elevators: [], hazards: [], context: [], stubbed: [],
  legs: [
    { kind: "walk", label: "Walk to Broadway/Fulton St", coords: [[-74.0087, 40.7102], stop], durationS: 60, distanceM: 60, turns: [] },
    { kind: "ride", mode: "bus", route: "M55", label: "M55 bus Broadway/Fulton St → Houston St", fromStop: "Broadway/Fulton St", toStop: "Houston St",
      coords: [stop, [-74.0072, 40.7146], [-74.0023, 40.7253]], durationS: 600, stops: [{ at: [-74.0072, 40.7146], text: "Chambers St" }], underground: false, geometrySource: "gtfs-shape" },
  ],
};
// At 10x: the walk 4 s, then the bus leg 17 s, the first 7 of them at the stop. Spots on the bar, of 1000.
const AT_STOP = 280, BOARDING = 440, RIDING = 800;
const stream = (events: unknown[]) => events.map((e) => JSON.stringify(e)).join("\n") + "\n";
const shots = process.env.SHOTS;
type TestMap = { getSource: (id: string) => { serialize?: () => { data?: { features?: Array<{ geometry: { coordinates: number[][][] } }> } } } | undefined };
/** The trip's bus on the map: its middle, or null when it is not there. */
const busAt = (page: Page) => page.evaluate(() => {
  const f = (window as unknown as { __map?: TestMap }).__map?.getSource("agent-vehicle")?.serialize?.().data?.features?.[0];
  const ring = f?.geometry.coordinates[0];
  return ring ? [(ring[0][0] + ring[2][0]) / 2, (ring[0][1] + ring[2][1]) / 2] : null;
});
const metres = (a: number[], b: number[]) => Math.hypot((a[0] - b[0]) * 84_300, (a[1] - b[1]) * 111_320);

for (const size of SIZES) {
  test(`a bus trip shows the stop, the bus pulling in and getting on at ${size.name} ${size.width}×${size.height}`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await mockNetwork(page);
    await page.route("**/api/agent", (r) => r.fulfill({ contentType: "application/x-ndjson", body: stream([
      { type: "command", command: { type: "showRoute", trip } }, { type: "command", command: { type: "openPanel", trip } },
      { type: "text", text: "Take the M55." }, { type: "done" },
    ]) }));
    await page.goto("/");
    await expect(page.locator("canvas.maplibregl-canvas").first()).toBeVisible();
    await page.getByLabel("Ask the assistant").fill("Bus to Houston St");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    const preview = page.getByRole("region", { name: "Trip preview" });
    await preview.getByLabel("Play preview", { exact: true }).click();
    await preview.getByLabel("Pause preview").click();
    const seek = preview.getByLabel("Preview progress");
    const caption = page.getByTestId("trip-caption");

    // At the stop: the bus still up the road.
    await seek.fill(String(AT_STOP));
    await expect(caption).toHaveText("Wait for the M55 bus at Broadway/Fulton St", { timeout: slow(10_000) });
    await expect.poll(async () => { const b = await busAt(page); return b ? metres(b, stop) : -1; }, { timeout: slow(10_000) }).toBeGreaterThan(20);
    if (shots) { await page.waitForTimeout(3000); await page.screenshot({ path: `${shots}/bus-${size.name}-1-stop.png` }); }
    await expectLayout(page);

    // The bus has pulled in and the rider is stepping on.
    await seek.fill(String(BOARDING));
    await expect.poll(async () => { const b = await busAt(page); return b ? metres(b, stop) : -1; }, { timeout: slow(10_000) }).toBeLessThan(2);
    await expect(caption).toHaveText("Wait for the M55 bus at Broadway/Fulton St");
    if (shots) { await page.waitForTimeout(3000); await page.screenshot({ path: `${shots}/bus-${size.name}-2-boarding.png` }); }

    // On the way: the bus carries the rider along the route.
    await seek.fill(String(RIDING));
    await expect(caption).toHaveText("Chambers St", { timeout: slow(10_000) });
    await expect.poll(async () => { const b = await busAt(page); return b ? metres(b, stop) : -1; }, { timeout: slow(10_000) }).toBeGreaterThan(300);
    if (shots) { await page.waitForTimeout(3000); await page.screenshot({ path: `${shots}/bus-${size.name}-3-ride.png` }); }
    await expectLayout(page);
  });
}
