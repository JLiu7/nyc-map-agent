import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { expectLayout, SIZES } from "./layout";
import { mockNetwork } from "./mocks";
import { slow } from "./slow";

/**
 * The trip preview walks into the station at eye level: the station's walls,
 * with a guide line to the train, drawn over the map below the street (no
 * x-ray), and the layout bar holds over it. SHOTS=<dir> saves a screenshot
 * at each stage, for looking at it by eye.
 */
const trip = JSON.parse(readFileSync(new URL("./fixtures/agent-trip.json", import.meta.url), "utf8")) as Record<string, unknown>;
const nd = (evs: unknown[]) => evs.map((e) => JSON.stringify(e)).join("\n") + "\n";
const shots = process.env.SHOTS;

for (const size of SIZES) {
  test(`the trip preview walks through the station at eye level at ${size.name} ${size.width}×${size.height}`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await mockNetwork(page);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/api/agent", (route) =>
      route.fulfill({
        contentType: "application/x-ndjson",
        body: nd([{ type: "command", command: { type: "playFlythrough", trip, speed: 10 } }, { type: "done", model: "mock", usage: { inputTokens: 0, outputTokens: 0 } }]),
      }),
    );
    await page.goto("/?flags=-agentHome");
    await expect(page.locator("canvas.maplibregl-canvas").first()).toBeVisible();
    await page.getByRole("button", { name: "Ask", exact: true }).click();
    await page.getByLabel("Ask the assistant").fill("preview my trip");
    await page.getByRole("button", { name: "Send" }).click();
    // The preview loads paused; the answer's Play starts it (on a phone the chat covers the preview's own bar).
    await page.getByRole("button", { name: "Play trip preview" }).click();
    const inside = page.getByTestId("trip-station-inside");
    await expect(inside).toBeVisible({ timeout: slow(60_000) });
    if (shots) await page.screenshot({ path: `${shots}/${size.name}-1-inside.png` });
    await expect(page.getByText(/Wait here for the 4 train/).first()).toBeVisible({ timeout: slow(30_000) });
    if (shots) {
      await page.waitForTimeout(800);
      await page.screenshot({ path: `${shots}/${size.name}-2-wait.png` });
      await page.waitForTimeout(1200);
      await page.screenshot({ path: `${shots}/${size.name}-3-train.png` });
    }
    expect(errors).toEqual([]);
    await expectLayout(page);
  });
}
