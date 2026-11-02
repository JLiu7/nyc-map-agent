import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { expectLayout } from "./layout";
import { mockNetwork } from "./mocks";
import { slow } from "./slow";

// The 2 line with one elevator outage at Times Sq-42 St (captured from /api/transit-live, trimmed).
const FIXTURE = JSON.parse(readFileSync(new URL("./fixtures/transit-live-2-line.json", import.meta.url), "utf8")) as {
  at: number; systems: { subway: { at: number; trips: Array<{ stops: Array<[string, number]>; vt: number }> } }; alerts: { at: number };
};

/** The fixture's times moved to now, so the trains are live and the feed is fresh. */
function liveNow(): string {
  const now = Math.floor(Date.now() / 1000);
  const shift = now - Math.min(...FIXTURE.systems.subway.trips.map((t) => t.vt));
  const d = structuredClone(FIXTURE);
  d.at = d.systems.subway.at = d.alerts.at = now;
  for (const t of d.systems.subway.trips) { t.vt += shift; t.stops = t.stops.map(([s, at]) => [s, at + shift]); }
  return JSON.stringify(d);
}

for (const [width, height] of [[375, 667], [320, 568]]) {
  test(`tapping an elevator notice takes the map to its station, above the line sheet, at ${width}×${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await mockNetwork(page);
    await page.route("**/api/transit-live*", (r) => r.fulfill({ contentType: "application/json", body: liveNow() }));
    await page.route("**/api/transit", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ bus: false }) }));
    await page.goto("/");
    await page.getByRole("button", { name: "My train" }).click({ timeout: slow(15_000) });
    await page.getByRole("button", { name: /^7 Avenue Express/ }).first().click({ timeout: slow(15_000) });
    const sheet = page.getByTestId("line-panel");
    await expect(sheet).toBeVisible();

    // Fully up, the sheet covers most of a small phone: the station must still come into view above it.
    await page.getByTestId("sheet-grip").click();
    await expect(sheet).toHaveAttribute("data-level", "2");
    const notice = page.locator("[data-notice]", { hasText: "Elevator out at Times Sq-42 St" });
    await notice.scrollIntoViewIfNeeded();
    const zoom = () => page.evaluate(() => (window as unknown as { __map: { getZoom(): number } }).__map.getZoom());
    // The whole line is in view: far out, so a station is a dot among many.
    expect(await zoom()).toBeLessThan(13);
    await notice.click();

    const ring = page.locator(".maplibregl-marker", { hasText: "No elevator" });
    await expect(ring).toBeVisible();
    // Tapping the notice is asking where it is: the map goes in close on the station.
    await expect.poll(zoom, { timeout: slow(5_000) }).toBeGreaterThan(14);
    // Then the ring sits in the open map: on screen and above the sheet.
    await expect.poll(async () => {
      const r = (await ring.boundingBox())!;
      const s = (await sheet.boundingBox())!;
      return r.y >= 0 && r.x >= 0 && r.x + 34 <= width && r.y + 34 <= s.y;
    }, { timeout: slow(5_000) }).toBe(true);
  });
}

test("escalators out at one station are one card, and the Lines list counts what the sheet shows", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await mockNetwork(page);
  // Two more units at 34 St-Penn Station: one up, one down, listed separately by the MTA.
  const esc = (id: string, serving: string) => ({ id, station: "34 St-Penn Station", routes: ["1", "2", "3"], stops: ["128"], equipment: "Escalator", serving, reason: "Capital Replacement", since: "", back: "12/31/2099 11:00:00 PM", ada: "not-ada", alternative: "" });
  const body = JSON.parse(liveNow()) as { alerts: { outages: unknown[] } };
  body.alerts.outages.push(esc("ES1", "mezzanine to 7 Av & 34 St (NE corner)"), esc("ES2", "7 Av & 34 St (NE corner) to mezzanine"));
  await page.route("**/api/transit-live*", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(body) }));
  await page.route("**/api/transit", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ bus: false }) }));
  await page.goto("/");
  await page.getByRole("button", { name: "My train" }).click({ timeout: slow(15_000) });
  const row = page.locator('[data-line="2"] button');
  await expect(row).toContainText("2 notices", { timeout: slow(15_000) });
  await row.click();
  const sheet = page.getByTestId("line-panel");
  await expect(sheet.locator("[data-notice]")).toHaveCount(2);
  const card = sheet.locator("[data-notice]", { hasText: "2 escalators out at 34 St-Penn Station" });
  await card.scrollIntoViewIfNeeded();
  await card.click();
  await expect(card).toContainText("mezzanine to 7 Av & 34 St (NE corner), both ways");
});

// Owner, 2026-10-27: on a weekday the 7's weekend work was nowhere on the map. "This weekend" shows it.
for (const [width, height] of [[375, 667], [1280, 800]]) {
  test(`the line panel shows this weekend's planned work at ${width}×${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await mockNetwork(page);
    await page.route("**/api/transit-live*", (r) => r.fulfill({ contentType: "application/json", body: liveNow() }));
    await page.route("**/api/transit", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ bus: false }) }));
    const asked: string[] = [];
    await page.route("**/api/transit/alerts?from=*", async (r) => {
      asked.push(r.request().url());
      const now = Math.floor(Date.now() / 1000);
      await r.fulfill({ contentType: "application/json", body: JSON.stringify({ at: now, outages: [], alerts: [{
        id: "lmm:planned_work:wk2", kind: "planned", type: "Planned - Stops Skipped", reroute: true, agency: "MTASBWY", routes: ["2"], stops: [],
        text: "In Manhattan, downtown [2] skips Christopher St-Stonewall and Houston St", description: "", start: now + 86_400, end: now + 2 * 86_400, period: "Sat and Sun",
        changes: [], skipNames: ["Christopher St-Stonewall", "Houston St"] }] }) });
    });
    await page.goto("/");
    await page.getByRole("button", { name: "My train" }).click({ timeout: slow(15_000) });
    await page.getByRole("button", { name: /^7 Avenue Express/ }).first().click({ timeout: slow(15_000) });
    await expect(page.getByTestId("line-panel")).toBeVisible();
    const days = page.getByTestId("line-day");
    await expect(days.getByRole("button", { name: "Now" })).toHaveAttribute("aria-pressed", "true");
    await days.getByRole("button", { name: "This weekend" }).click();
    await expect(days.getByRole("button", { name: "This weekend" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("[data-notice]", { hasText: "skips" })).toBeVisible();
    expect(asked.length).toBeGreaterThan(0);
    await expectLayout(page);
  });
}

// Owner, 2026-10-28: one sheet. On a desktop the line is a card at the top of the left column, not a panel on the right.
test("a desktop line card sits in the left column", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await mockNetwork(page);
  await page.route("**/api/transit-live*", (r) => r.fulfill({ contentType: "application/json", body: liveNow() }));
  await page.route("**/api/transit", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ bus: false }) }));
  await page.goto("/");
  await page.getByRole("button", { name: "My train" }).click({ timeout: slow(15_000) });
  await page.getByRole("button", { name: /^7 Avenue Express/ }).first().click({ timeout: slow(15_000) });
  const line = page.getByTestId("left-slot").getByTestId("line-panel");
  await expect(line).toBeVisible();
  expect((await line.boundingBox())!.x).toBeLessThan(40);
  await expect(page.getByTestId("agent-home")).toHaveAttribute("data-layout", "column");
  await expectLayout(page);
  await page.getByRole("button", { name: "Close line" }).click();
  await expect(page.getByTestId("line-panel")).toHaveCount(0);
  await expect(page.getByTestId("agent-home")).not.toHaveAttribute("data-layout", "column");
});

// Owner report, 2026-10-28: in the old layout's street view, picking a line from the Lines list did nothing.
test("the old layout's Lines list opens the picked line from street view", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await mockNetwork(page);
  await page.route("**/api/transit-live*", (r) => r.fulfill({ contentType: "application/json", body: liveNow() }));
  await page.route("**/api/transit", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ bus: false }) }));
  await page.goto("/?flags=-agentHome");
  await expect(page.locator("canvas.maplibregl-canvas").first()).toBeVisible();
  await page.getByTestId("view-switcher").getByRole("button", { name: "Street", exact: true }).click();
  await expect(page.getByTestId("street-minimap")).toBeVisible({ timeout: slow(15_000) });
  await page.getByTestId("lines-button").click();
  await page.getByRole("button", { name: /^7 Avenue Express/ }).first().click({ timeout: slow(15_000) });
  await expect(page.getByTestId("line-panel")).toBeVisible({ timeout: slow(15_000) });
  // Street level goes to the flat map on the line.
  await expect(page.getByTestId("street-minimap")).toHaveCount(0, { timeout: slow(15_000) });
  await expectLayout(page);
});
