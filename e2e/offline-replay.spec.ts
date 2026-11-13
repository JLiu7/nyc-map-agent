import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { mockNetwork } from "./mocks";
import { slow } from "./slow";

/**
 * Below the street the signal drops (#132). With a trip to Fulton St on the 4 loaded, the network
 * goes off before Play, and the walk out of Fulton St still plays in the dollhouse view: the station
 * model, the walk's code and the x-ray stairs were fetched when the trip arrived, and the offline
 * worker kept them.
 */
const trip = JSON.parse(readFileSync(new URL("./fixtures/agent-trip-fulton.json", import.meta.url), "utf8")) as Record<string, unknown>;
const nd = (evs: unknown[]) => evs.map((e) => JSON.stringify(e)).join("\n") + "\n";


test("the Fulton St walk replays with the network off after the trip has loaded", async ({ page, context }) => {
  test.setTimeout(slow(150_000));
  await page.setViewportSize({ width: 1280, height: 800 });
  await mockNetwork(context);
  await context.route("**/api/agent", (route) =>
    route.fulfill({
      contentType: "application/x-ndjson",
      body: nd([{ type: "command", command: { type: "playFlythrough", trip, speed: 30 } }, { type: "done", model: "mock", usage: { inputTokens: 0, outputTokens: 0 } }]),
    }),
  );
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/?flags=-agentHome");
  await expect(page.locator("canvas.maplibregl-canvas").first()).toBeVisible({ timeout: slow(20_000) });
  // The offline worker is in control of this page.
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.ready.then(() => !!navigator.serviceWorker.controller)), { timeout: slow(20_000) }).toBe(true);

  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await page.getByLabel("Ask the assistant").fill("Take the 4 train from Grand Central to Fulton St");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("button", { name: "Play trip preview" })).toBeVisible({ timeout: slow(20_000) });

  // The trip's arrival fetched the station model and x-ray data, and the worker saved them.
  const saved = (path: string) => page.evaluate(async (p) => !!(await caches.match(p)), path);
  await expect.poll(() => saved("/transit/fulton-model.json"), { timeout: slow(30_000) }).toBe(true);
  await expect.poll(() => saved("/transit/xray.json"), { timeout: slow(30_000) }).toBe(true);

  await context.setOffline(true);
  expect(await page.evaluate(() => fetch("/robots.txt", { cache: "no-store" }).then(() => "online", () => "offline"))).toBe("offline");

  await page.getByRole("button", { name: "Play trip preview" }).click();
  // At 30x the preview soon reaches the exit leg at Fulton St; the figure walks the model there.
  const dollhouse = () => page.evaluate(() => !!(window as unknown as { __map?: { getLayer: (id: string) => unknown } }).__map?.getLayer("dollhouse"));
  await expect.poll(dollhouse, { timeout: slow(60_000), intervals: [500] }).toBe(true);
  await expect(page.getByText(/Fulton St/).first()).toBeVisible();
  expect(errors).toEqual([]);
  await context.setOffline(false);
});
