import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { mockNetwork } from "./mocks";

// Mocked LLM: /api/agent is answered with a canned NDJSON stream (a real trip shape, offline).
const trip = JSON.parse(readFileSync(new URL("./fixtures/agent-trip.json", import.meta.url), "utf8")) as Record<string, unknown>;
const nd = (evs: unknown[]) => evs.map((e) => JSON.stringify(e)).join("\n") + "\n";

test("smart mode: trip question draws the route, opens the trip card and waits for Play", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 40.7359, longitude: -73.9903 });
  await mockNetwork(page);
  await page.route("**/api/agent", async (route) => {
    const body = route.request().postDataJSON() as { messages: Array<{ content: string }>; location: unknown };
    expect(body.location).not.toBeNull();
    const preview = body.messages.at(-1)!.content.includes("preview");
    await route.fulfill({
      contentType: "application/x-ndjson",
      body: nd(
        preview
          ? [{ type: "command", command: { type: "playFlythrough", trip, speed: 30 } }, { type: "done", model: "mock", usage: { inputTokens: 0, outputTokens: 0 } }]
          : [
              { type: "tool", name: "transit_plan" },
              { type: "command", command: { type: "showRoute", trip } },
              { type: "command", command: { type: "openPanel", trip } },
              { type: "text", text: "Take the 4 and use the NW exit on E 41 St." },
              { type: "done", model: "mock", usage: { inputTokens: 0, outputTokens: 0 } },
            ],
      ),
    });
  });

  // The classic Ask sheet (agentHome off) keeps its own coverage here.
  await page.goto("/?flags=-agentHome");
  await expect(page.locator("canvas.maplibregl-canvas").first()).toBeVisible();
  // Location is shared only from a tap on My location; then the rail offers to stop.
  await page.getByRole("button", { name: "Layers & filters", exact: true }).click();
  await page.getByRole("button", { name: "My location" }).click();
  await expect(page.getByRole("button", { name: "Stop sharing location" }).first()).toBeVisible();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await page.getByLabel("Ask the assistant").fill("How will my trip be tomorrow from here to Grand Central at 9am?");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Take the 4 and use the NW exit on East 41 Street.")).toBeVisible();
  await expect(page.getByText(/Use the NW exit on E 41 St at Grand Central-42 St/).first()).toBeVisible();

  // Asking for the trip draws it and offers Play; nothing plays on its own.
  await expect(page.getByRole("region", { name: "Trip preview" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Play trip preview" })).toBeVisible();

  await page.getByLabel("Ask the assistant").fill("preview it");
  await page.getByRole("button", { name: "Send" }).click();
  const bar = page.getByRole("region", { name: "Trip preview" });
  await expect(bar).toBeVisible();
  // Loaded at the agent's speed, paused until the person presses Play.
  await expect(bar.getByRole("button", { name: "30x", exact: true })).toHaveAttribute("aria-pressed", "true");
  await bar.getByRole("button", { name: "Play preview" }).click();
  await bar.getByRole("button", { name: "5x", exact: true }).click();
  await expect(bar.getByRole("button", { name: "5x", exact: true })).toHaveAttribute("aria-pressed", "true");
  await bar.getByRole("button", { name: "2x", exact: true }).click();
  await expect(bar.getByRole("button", { name: "2x", exact: true })).toHaveAttribute("aria-pressed", "true");
  await bar.getByRole("button", { name: "Pause preview" }).click();
  await bar.getByRole("button", { name: "Skip to next leg" }).click();
  await bar.getByRole("button", { name: "Close preview" }).click();
  await expect(bar).toBeHidden();
});

test("a question in the desktop search bar is asked inside Ask the map", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockNetwork(page);
  let asked = "";
  await page.route("**/api/agent", async (route) => {
    const body = route.request().postDataJSON() as { messages: Array<{ content: string }> };
    asked = body.messages.at(-1)?.content ?? "";
    await route.fulfill({
      contentType: "application/x-ndjson",
      body: nd([
        { type: "text", text: "Take the A train toward the Rockaway peninsula." },
        { type: "done", model: "mock", usage: { inputTokens: 0, outputTokens: 0 } },
      ]),
    });
  });

  // The classic Ask sheet (agentHome off) keeps its own coverage here.
  await page.goto("/?flags=-agentHome");
  await expect(page.locator("canvas.maplibregl-canvas").first()).toBeVisible();
  const box = await page.getByTestId("topbar").boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(600);

  const q = "how do i get from union square to rockaway beach";
  await page.getByPlaceholder("Search neighborhoods, addresses, stations").fill(q);
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(page.getByText(q, { exact: true })).toBeVisible();
  await expect(page.getByText("Take the A train toward the Rockaway peninsula.")).toBeVisible();
  expect(asked).toBe(q);
  await expect(page.locator('input[placeholder="Search neighborhoods, addresses, stations"]')).toHaveValue("");
});

test("a from-here question offers Use my location, then plans the trip", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 40.7359, longitude: -73.9903 });
  await mockNetwork(page);
  let calls = 0;
  let location: unknown = null;
  await page.route("**/api/agent", async (route) => {
    calls += 1;
    location = (route.request().postDataJSON() as { location: unknown }).location;
    await route.fulfill({
      contentType: "application/x-ndjson",
      body: nd([
        { type: "text", text: "Take the 4 and use the NW exit on E 41 St." },
        { type: "done", model: "mock", usage: { inputTokens: 0, outputTokens: 0 } },
      ]),
    });
  });

  // The classic Ask sheet (agentHome off) keeps its own coverage here.
  await page.goto("/?flags=-agentHome");
  await expect(page.locator("canvas.maplibregl-canvas").first()).toBeVisible();
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await page.getByLabel("Ask the assistant").fill("How will my trip be tomorrow from here to Grand Central at 9am?");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Tap Use my location, or type a starting address.")).toBeVisible();
  expect(calls).toBe(0);

  await page.getByRole("button", { name: "Use my location" }).first().click();
  await expect(page.getByText("Take the 4 and use the NW exit on East 41 Street.")).toBeVisible();
  expect(calls).toBe(1);
  expect(location).toEqual({ lon: -73.9903, lat: 40.7359 });
});
