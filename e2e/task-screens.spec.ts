import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { expectLayout } from "./layout";
import { mockNetwork } from "./mocks";
import { slow } from "./slow";

const trip = JSON.parse(readFileSync(new URL("./fixtures/agent-trip.json", import.meta.url), "utf8")) as Record<string, unknown>;
const stream = (events: unknown[]) => events.map((e) => JSON.stringify(e)).join("\n") + "\n";
async function ask(page: Page, text: string) {
  await page.getByLabel("Ask the assistant").fill(text);
  await page.getByRole("button", { name: "Send", exact: true }).click();
}

for (const width of [390, 1280]) {
  test(`trip preview keeps chat clear at ${width}px and starts only on Play`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await mockNetwork(page);
    await page.route("**/api/agent", (r) => r.fulfill({ contentType: "application/x-ndjson", body: stream([
      { type: "command", command: { type: "showRoute", trip } },
      { type: "command", command: { type: "openPanel", trip } },
      { type: "text", text: "Take this route." }, { type: "done" },
    ]) }));
    await page.goto("/");
    await ask(page, "Plan a trip from Union Square to Grand Central");
    const preview = page.getByRole("region", { name: "Trip preview" });
    await expect(preview).toBeVisible();
    await expect(preview.getByLabel("Play preview", { exact: true })).toBeVisible();
    const speed = preview.getByRole("button", { name: "5×", exact: true });
    // A phone keeps the speeds off the trip card; they wait in the pulled-up sheet once the preview plays.
    if (width >= 640) {
      await speed.click();
      await expect(speed).toHaveAttribute("aria-pressed", "true");
    } else await expect(speed).toHaveCount(0);
    await preview.getByLabel("Play preview", { exact: true }).click();
    await expect(preview.getByLabel("Pause preview")).toBeVisible();
    if (width < 640) {
      // Playing, the sheet is one bar: the step in words, back / pause / next, and how far along.
      await expect(preview).toHaveAttribute("data-level", "0");
      await expect(page.getByTestId("trip-caption")).not.toBeEmpty();
      await expect(page.getByTestId("trip-step")).toContainText("/");
      await expect(preview.getByRole("button", { name: "Use this route", exact: true })).toHaveCount(0);
      // Paused, so the preview does not move on by itself between the taps (a slow machine was at step 4 by then).
      await preview.getByLabel("Pause preview").click();
      const step = async () => Number((await page.getByTestId("trip-step").textContent())?.split("/")[0]);
      const at = await step();
      await preview.getByLabel("Next step").click();
      await expect.poll(step).toBe(at + 1);
      await preview.getByLabel("Previous step").click();
      await expect.poll(step).toBe(at);
      await page.getByTestId("sheet-grip").click();
      await speed.click();
      await expect(speed).toHaveAttribute("aria-pressed", "true");
      await page.getByTestId("sheet-grip").click();
      await page.getByTestId("sheet-grip").click();
    }
    const panel = await preview.boundingBox();
    const bar = await page.getByTestId("agent-bar").boundingBox();
    expect(panel).not.toBeNull();
    expect(bar).not.toBeNull();
    expect(panel!.y + panel!.height).toBeLessThan(bar!.y);
    // A desktop: the trip is a card in the one left column, the ask box at its foot (owner, 2026-10-28).
    if (width >= 1024) {
      await expect(page.getByTestId("left-slot").getByRole("region", { name: "Trip preview" })).toBeVisible();
      expect(panel!.x).toBeLessThan(40);
      expect(bar!.x).toBeLessThan(40);
      await expectLayout(page);
    }
    await page.getByRole("button", { name: "Close trip", exact: true }).click();
    await expect(preview).toBeHidden();
    await expect(page.getByTestId("agent-bar")).toBeVisible();
  });
}

// A station or place card opened over a trip is not covered by the trip's top and bottom panels (owner, 2026-10-27).
test("a card opened over a trip preview is not covered by it", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await mockNetwork(page);
  await page.route("**/api/agent", (r) => r.fulfill({ contentType: "application/x-ndjson", body: stream([
    { type: "command", command: { type: "showRoute", trip } },
    { type: "command", command: { type: "openPanel", trip } },
    { type: "text", text: "Take this route." }, { type: "done" },
  ]) }));
  await page.goto("/");
  await ask(page, "Plan a trip from Union Square to Grand Central");
  const preview = page.getByRole("region", { name: "Trip preview" });
  await expect(preview).toBeVisible();
  // As a station tap does: the station card opens while the trip is up.
  await page.evaluate(() => (window as unknown as { __pushPanel: (c: object) => void }).__pushPanel({ id: "transit:station:subway:631", title: "Grand Central-42 St", subtitle: "Subway station" }));
  await expect(page.getByTestId("details-sheet")).toBeVisible();
  await expect(preview).toBeHidden();
  await expect(page.getByTestId("trip-heading")).toHaveCount(0);
  await expectLayout(page);
});

// Owner, 2026-10-28: restroom pins stayed on the map after the answer was closed.
test("closing a restroom answer takes its restrooms off the map", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockNetwork(page);
  await page.route("**/api/agent", (r) => r.fulfill({ contentType: "application/x-ndjson", body: stream([
    { type: "text", text: "Bryant Park is the closest open restroom." },
    { type: "actions", actions: [{ kind: "showRestroom", id: "restroom:bp", label: "Show the nearest restroom", restroom: { name: "Bryant Park", lon: -73.9832, lat: 40.7536, distanceM: 420, hours: "8am-8pm" } }] },
    { type: "done" },
  ]) }));
  await page.goto("/");
  await ask(page, "Where is the nearest restroom?");
  await expect(page.getByText("Bryant Park is the closest open restroom.")).toBeVisible();
  await expect(page).toHaveURL(/restrooms=1/);
  await page.getByRole("button", { name: "Close answer", exact: true }).click();
  await expect(page).not.toHaveURL(/restrooms=1/);
  await expectLayout(page);
});

test("a restroom answer's map button leaves restrooms off once the answer closes", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockNetwork(page);
  await page.route("**/api/agent", (r) => r.fulfill({ contentType: "application/x-ndjson", body: stream([
    { type: "text", text: "Bryant Park is the closest open restroom." },
    { type: "actions", actions: [{ kind: "showRestroom", id: "restroom:bp", label: "Show the nearest restroom", restroom: { name: "Bryant Park", lon: -73.9832, lat: 40.7536, distanceM: 420, hours: "8am-8pm" } }] },
    { type: "done" },
  ]) }));
  await page.goto("/");
  await ask(page, "Where is the nearest restroom?");
  await expect(page.getByText("Bryant Park is the closest open restroom.")).toBeVisible();
  const show = page.getByRole("button", { name: "Show the nearest restroom" });
  if (await show.count()) await show.first().click();
  await expect(page).toHaveURL(/restrooms=1/);
  const close = page.getByRole("button", { name: "Close answer", exact: true });
  if (await close.count()) await close.click();
  else await page.keyboard.press("Escape");
  await expect(page).not.toHaveURL(/restrooms=1/);
  await expectLayout(page);
});

test("answer follow-ups ask the agent even when extra map actions exist", async ({ page }) => {
  await mockNetwork(page);
  const questions: string[] = [];
  await page.route("**/api/agent", (r) => {
    const body = r.request().postDataJSON() as { messages: Array<{ content: string }> };
    questions.push(body.messages.at(-1)!.content);
    return r.fulfill({ contentType: "application/x-ndjson", body: stream([
      { type: "text", text: "Bryant Park is nearby." },
      { type: "actions", actions: [
        { kind: "flyTo", id: "one", label: "Show Bryant Park", lon: -73.983, lat: 40.754 },
        { kind: "flyTo", id: "two", label: "Show another place", lon: -73.98, lat: 40.755 },
      ] }, { type: "done" },
    ]) });
  });
  await page.goto("/");
  await ask(page, "Show Bryant Park");
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("button", { name: "What's nearby", exact: true }).click();
  await expect.poll(() => questions.length).toBe(2);
  expect(questions[1]).toMatch(/landmarks/i);
  expect(questions[1]).not.toMatch(/food|caf[eé]|shop/i);
  // Only follow-ups that fit: with no trip there is no "Other routes".
  await page.getByRole("button", { name: "More", exact: true }).click();
  await expect(page.getByRole("button", { name: "What's nearby", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Other (routes|options)$/ })).toHaveCount(0);
});

for (const width of [390, 1280]) {
  test(`walking checkpoints keep the overhead map and chat usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await mockNetwork(page);
    const coords = [[-73.9875, 40.7557], [-73.986, 40.757], [-73.9851, 40.758]];
    const walk = { ...trip, id: "walk-check", mode: "walk", origin: { label: "7 Av", at: coords[0] }, destination: { label: "Times Square", at: coords[2] }, routes: [], alternatives: [], legs: [{ kind: "walk", label: "Walk to Times Square", coords, durationS: 360, distanceM: 450, turns: [] }] };
    await page.route("**/api/agent", (r) => r.fulfill({ contentType: "application/x-ndjson", body: stream([
      { type: "command", command: { type: "showRoute", trip: walk } },
      { type: "command", command: { type: "openPanel", trip: walk } }, { type: "done" },
    ]) }));
    await page.route("**/routed-foot/route/**", (r) => r.fulfill({ json: { code: "Ok", routes: [{ distance: 450, duration: 360, geometry: { type: "LineString", coordinates: coords }, legs: [{ steps: coords.map((location, i) => ({ distance: 150, name: "W 42 St", maneuver: { location, type: i === 2 ? "arrive" : "depart", bearing_after: 30 } })) }] }] } }));
    await page.goto("/");
    await ask(page, "Walk from 7 Av to Times Square");
    await page.getByRole("button", { name: "Use this route", exact: true }).click();
    await expect(page.getByRole("region", { name: "Walking guidance", exact: true })).toBeVisible();
    const checkpoint = page.getByRole("region", { name: "Landmark checkpoint" });
    await expect(checkpoint).toBeVisible();
    const panel = await checkpoint.boundingBox();
    const bar = await page.getByTestId("agent-bar").boundingBox();
    expect(panel!.y + panel!.height).toBeLessThan(bar!.y);
    await checkpoint.getByRole("button", { name: "Not yet" }).click();
    await expect(checkpoint.getByRole("button", { name: "Not yet" })).toHaveAttribute("aria-expanded", "true");
    await expect(checkpoint.getByRole("img", { name: /^Look for/ })).toBeVisible();
    await page.getByLabel("Stop walking guidance").click();
    await expect(checkpoint).toBeHidden();
    await expect(page.getByTestId("agent-bar")).toBeVisible();
  });
}

// A button that hands a question to the chat ("I'm lost", "Other ways") once re-sent it forever and froze
// the page: it must ask exactly once and leave the page answering.
test("I'm lost asks the agent once and the page stays responsive", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await mockNetwork(page);
  const coords = [[-73.9875, 40.7557], [-73.986, 40.757], [-73.9851, 40.758]];
  const walk = { ...trip, id: "walk-lost", mode: "walk", origin: { label: "7 Av", at: coords[0] }, destination: { label: "Times Square", at: coords[2] }, routes: [], alternatives: [], legs: [{ kind: "walk", label: "Walk to Times Square", coords, durationS: 360, distanceM: 450, turns: [] }] };
  const questions: string[] = [];
  await page.route("**/api/agent", (r) => {
    const body = r.request().postDataJSON() as { messages?: Array<{ role: string; content: string }> };
    questions.push(body.messages?.filter((m) => m.role === "user").at(-1)?.content ?? "");
    return r.fulfill({ contentType: "application/x-ndjson", body: stream(questions.length === 1 ? [
      { type: "command", command: { type: "showRoute", trip: walk } },
      { type: "command", command: { type: "openPanel", trip: walk } }, { type: "done" },
    ] : [{ type: "text", text: "Look for the big red stairs on your left." }, { type: "done" }]) });
  });
  await page.route("**/routed-foot/route/**", (r) => r.fulfill({ json: { code: "Ok", routes: [{ distance: 450, duration: 360, geometry: { type: "LineString", coordinates: coords }, legs: [{ steps: coords.map((location, i) => ({ distance: 150, name: "W 42 St", maneuver: { location, type: i === 2 ? "arrive" : "depart", bearing_after: 30 } })) }] }] } }));
  await page.goto("/");
  await ask(page, "Walk from 7 Av to Times Square");
  await page.getByRole("button", { name: "Use this route", exact: true }).click();
  await page.getByRole("button", { name: "I'm lost", exact: true }).first().click();
  await expect.poll(() => questions.length).toBe(2);
  expect(questions[1]).toMatch(/lost/i);
  // Still exactly two after a pause, and the page answers a script promptly.
  await page.waitForTimeout(1500);
  expect(questions.length).toBe(2);
  const t0 = Date.now();
  await page.evaluate(() => 1);
  expect(Date.now() - t0).toBeLessThan(1000);
});

// The trip card hides the chat answer, so it carries the ways to go itself: one tap asks once (owner, 2026-10-26).
test("the trip card asks again with the least walking", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await mockNetwork(page);
  const coords = [[-73.9875, 40.7557], [-73.986, 40.757], [-73.9851, 40.758]];
  const walk = { ...trip, id: "walk-choice", mode: "walk", origin: { label: "7 Av", at: coords[0] }, destination: { label: "Times Square", at: coords[2] }, routes: [], alternatives: [], legs: [{ kind: "walk", label: "Walk to Times Square", coords, durationS: 360, distanceM: 450, turns: [] }] };
  const questions: string[] = [];
  await page.route("**/api/agent", (r) => {
    const body = r.request().postDataJSON() as { messages?: Array<{ role: string; content: string }> };
    questions.push(body.messages?.filter((m) => m.role === "user").at(-1)?.content ?? "");
    return r.fulfill({ contentType: "application/x-ndjson", body: stream(questions.length === 1 ? [
      { type: "command", command: { type: "showRoute", trip: walk } },
      { type: "command", command: { type: "openPanel", trip: walk } }, { type: "done" },
    ] : [{ type: "text", text: "This one has the least walking." }, { type: "done" }]) });
  });
  await page.goto("/");
  await ask(page, "Walk from 7 Av to Times Square");
  const choices = page.getByTestId("trip-choices");
  await expect(choices).toBeVisible();
  await choices.getByRole("button", { name: "Least walking", exact: true }).click();
  await expect.poll(() => questions.length).toBe(2);
  expect(questions[1]).toMatch(/least walking/i);
  expect(questions[1]).toContain("Times Square");
  await page.waitForTimeout(1000);
  expect(questions.length).toBe(2);
});

// Owner report, 2026-10-28: asking in street view threw the camera overhead under the street bar, and the
// entrance labels, still allowed to overlap, piled on each other.
test("asking in street view keeps the camera at eye level", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await mockNetwork(page);
  await page.route("**/api/agent", (r) => r.fulfill({ contentType: "application/x-ndjson", body: stream([
    { type: "text", text: "Bryant Park is the closest open restroom." }, { type: "done" },
  ]) }));
  await page.goto("/");
  await page.waitForFunction(() => Boolean((window as unknown as { __map?: unknown }).__map), null, { timeout: slow(15_000) });
  await page.getByTestId("map-view-switch").getByRole("radio", { name: "Street", exact: true }).click();
  await expect(page.getByTestId("street-minimap")).toBeVisible({ timeout: slow(15_000) });
  const pitch = () => page.evaluate(() => (window as unknown as { __map: { getPitch(): number } }).__map.getPitch());
  await expect.poll(pitch, { timeout: slow(15_000) }).toBeGreaterThan(60);
  await ask(page, "Where is the nearest restroom?");
  await expect(page.getByText("Bryant Park is the closest open restroom.")).toBeVisible();
  await page.waitForTimeout(1000);
  expect(await pitch()).toBeGreaterThan(60);
  await expect(page.getByTestId("street-minimap")).toBeVisible();
  await expectLayout(page);
});

// Owner report, 2026-10-29: in street view a restroom question from the ask box said "tap Use my location";
// the spot you stand on is "here".
test("a question from the ask box in street view is asked from the street spot", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await mockNetwork(page);
  const bodies: Array<{ context?: { source?: string; lon?: number } }> = [];
  await page.route("**/api/agent", (r) => {
    bodies.push(r.request().postDataJSON() as { context?: { source?: string; lon?: number } });
    return r.fulfill({ contentType: "application/x-ndjson", body: stream([{ type: "text", text: "Bryant Park is the closest open restroom." }, { type: "done" }]) });
  });
  await page.goto("/");
  await page.waitForFunction(() => Boolean((window as unknown as { __map?: unknown }).__map), null, { timeout: slow(15_000) });
  await page.getByTestId("map-view-switch").getByRole("radio", { name: "Street", exact: true }).click();
  await expect(page.getByTestId("street-minimap")).toBeVisible({ timeout: slow(15_000) });
  await ask(page, "Where is the nearest restroom?");
  await expect(page.getByText("Bryant Park is the closest open restroom.")).toBeVisible();
  expect(bodies[0].context?.source).toBe("street-view");
  expect(typeof bodies[0].context?.lon).toBe("number");
  await expect(page.getByRole("button", { name: "Use my location" })).toHaveCount(0);
  await expectLayout(page);
});

// Owner report, 2026-10-29: in street view, work wrenches, skip marks and elevator badges of far stations
// stood in a row on the horizon. Like station names, they show only near where you stand.
test("street view draws station markers only near you", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await mockNetwork(page);
  await page.goto("/");
  await page.waitForFunction(() => Boolean((window as unknown as { __map?: unknown }).__map), null, { timeout: slow(15_000) });
  await page.getByTestId("map-view-switch").getByRole("radio", { name: "Street", exact: true }).click();
  await expect(page.getByTestId("street-minimap")).toBeVisible({ timeout: slow(15_000) });
  const near = (id: string) => page.evaluate((layer) => {
    const m = (window as unknown as { __map: { getLayer(id: string): unknown; getFilter(id: string): unknown } }).__map;
    return m.getLayer(layer) ? JSON.stringify(m.getFilter(layer)).includes("distance") : null;
  }, id);
  for (const id of ["transit-work", "transit-skip", "transit-access"]) {
    await expect.poll(() => near(id), { timeout: slow(15_000), message: id }).not.toBe(false);
  }
  await expectLayout(page);
});

// Owner report, 2026-10-29: at 800×1000 in street view, a restroom answer flew the camera overhead, and as
// the answer sheet opened the walk pad jumped to the top left and the mini map rode up under the street bar.
test("a restroom answer in street view on a tablet keeps the camera, pad and mini map in place", async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 1000 });
  await mockNetwork(page);
  await page.route("**/api/agent", (r) => r.fulfill({ contentType: "application/x-ndjson", body: stream([
    { type: "text", text: "Bryant Park is the closest open restroom." },
    // Two restrooms: one is flown to, more are fitted from above, and both left the street.
    { type: "actions", actions: [
      { kind: "showRestroom", id: "restroom:bp", label: "Show the nearest restroom", restroom: { name: "Bryant Park", lon: -73.9832, lat: 40.7536, distanceM: 420, hours: "8am-8pm" } },
      { kind: "showRestroom", id: "restroom:nypl", label: "Show the library restroom", restroom: { name: "Library", lon: -73.9822, lat: 40.7532, distanceM: 520, hours: "10am-6pm" } },
    ] },
    { type: "done" },
  ]) }));
  await page.goto("/");
  await page.waitForFunction(() => Boolean((window as unknown as { __map?: unknown }).__map), null, { timeout: slow(15_000) });
  await page.getByTestId("map-view-switch").getByRole("radio", { name: "Street", exact: true }).click();
  await expect(page.getByTestId("street-minimap")).toBeVisible({ timeout: slow(15_000) });
  const pitch = () => page.evaluate(() => (window as unknown as { __map: { getPitch(): number } }).__map.getPitch());
  await expect.poll(pitch, { timeout: slow(15_000) }).toBeGreaterThan(60);
  const zoom = () => page.evaluate(() => (window as unknown as { __map: { getZoom(): number } }).__map.getZoom());
  const eyeZoom = await zoom();
  await ask(page, "Where is the nearest restroom?");
  await expect(page.getByText("Bryant Park is the closest open restroom.")).toBeVisible();
  await page.waitForTimeout(1200);
  expect(await pitch()).toBeGreaterThan(60);
  expect(Math.abs((await zoom()) - eyeZoom)).toBeLessThan(0.5);
  const pad = await page.getByRole("group", { name: "Street-level camera controls" }).boundingBox();
  const mini = await page.getByTestId("street-minimap").boundingBox();
  const sheet = await page.getByTestId("agent-answers").boundingBox();
  const bar = await page.getByTestId("walk-bar").boundingBox();
  // Both stay in the lower part of the screen, clear of the sheet and the street bar.
  expect(pad!.y).toBeGreaterThan(1000 / 2);
  expect(pad!.x).toBeGreaterThanOrEqual(sheet!.x + sheet!.width);
  expect(mini!.y).toBeGreaterThan(bar!.y + bar!.height + 100);
  await expectLayout(page);
});
