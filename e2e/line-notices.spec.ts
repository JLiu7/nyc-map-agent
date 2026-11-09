import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { expectLayout, SIZES } from "./layout";
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

// Owner, 2026-11-07: notices read as paragraphs, and "Other ways" was no use. A tapped notice is its stretch
// of line, read aloud a step at a time, with Stop and the MTA's words one tap away.
for (const size of SIZES) {
  test(`a skip notice opens as a line diagram that walks its steps at ${size.width}×${size.height}`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    // A voice that records what it is asked to say and never finishes, so the walk holds on its first step.
    await page.addInitScript(() => {
      const said: string[] = [];
      Object.assign(window, { __said: said });
      Object.defineProperty(window, "speechSynthesis", { configurable: true, value: {
        speaking: false, paused: false, pending: false, getVoices: () => [], addEventListener: () => undefined, removeEventListener: () => undefined,
        speak: (u: SpeechSynthesisUtterance) => said.push(u.text), cancel: () => undefined, pause: () => undefined, resume: () => undefined,
      } });
    });
    await mockNetwork(page);
    const body = JSON.parse(liveNow()) as { alerts: { alerts: unknown[] } };
    const names = ["Christopher St-Stonewall", "Houston St"];
    body.alerts.alerts.push({
      id: "lmm:planned_work:e2e", kind: "planned", type: "Planned - Stops Skipped", reroute: true, agency: "MTASBWY", routes: ["2"], stops: ["133S", "134S"],
      text: "In Manhattan, downtown [2] skips Christopher St-Stonewall and Houston St",
      description: "For service to these stations, take the [2] to Canal St and transfer to an uptown [1].\n\nFor service from these stations, take the [2] to 14 St and transfer to a downtown [1].",
      changes: [{ alertId: "lmm:planned_work:e2e", route: "2", kind: "skip", names, toward: "Downtown", notice: "Skipped Downtown-bound" }], skipNames: names,
    });
    await page.route("**/api/transit-live*", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(body) }));
    await page.route("**/api/transit", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ bus: false }) }));
    await page.goto("/");
    await page.getByRole("button", { name: "My train" }).click({ timeout: slow(15_000) });
    await page.getByRole("button", { name: /^7 Avenue Express/ }).first().click({ timeout: slow(15_000) });
    const panel = page.getByTestId("line-panel");
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("button", { name: "Other ways" })).toHaveCount(0);
    const notice = panel.locator("[data-notice]", { hasText: "skips" });
    await notice.scrollIntoViewIfNeeded();
    await notice.click();

    const diagram = panel.getByTestId("notice-diagram");
    await expect(diagram).toBeVisible();
    // Downtown, top to bottom: 14 St, the two skipped stops, Canal St.
    await expect(diagram.locator("[data-stop]")).toHaveText([/14 Street/, /Christopher Street-Stonewall.*Skipped/, /Houston Street.*Skipped/, /Canal Street/]);
    await expect(panel.getByTestId("notice-step").first()).toHaveText("Downtown 2 trains skip Christopher Street-Stonewall and Houston Street.");
    // The tap started the walk: the first step's stations are lit, and Stop ends it.
    const walk = panel.getByTestId("notice-walk");
    await expect(walk).toHaveAttribute("data-step", "0");
    await expect(diagram.locator("[data-lit]")).toHaveCount(2);
    await expect.poll(() => page.evaluate(() => (window as unknown as { __said: string[] }).__said.join(" "))).toContain("Christopher Street-Stonewall");
    await expectLayout(page);
    await walk.getByRole("button", { name: "Stop" }).click();
    await expect(walk).not.toHaveAttribute("data-step");
    await expect(walk.getByRole("button", { name: "Read it to me" })).toBeVisible();
    // The MTA's own words stay one tap away.
    await walk.getByRole("button", { name: "Full notice" }).click();
    await expect(walk.getByTestId("notice-full")).toContainText("transfer to an uptown 1");
    await expectLayout(page);
  });
}

/** A 2-line shuttle notice with the MTA's station notes, as the feed carries them (#55). */
function shuttleAlert() {
  return {
    id: "lmm:planned_work:e2e-bus", kind: "planned", type: "Planned - Part Suspended", reroute: true, agency: "MTASBWY", routes: ["2"], stops: ["127", "128", "132"],
    text: "No [2] between Times Sq-42 St and 14 St",
    description: "[2] trains run between Wakefield-241 St and Times Sq-42 St.\n\n[shuttle bus icon] Free shuttle buses run between Times Sq-42 St and 14 St.\nTransfer between [2] and [shuttle bus icon] buses at Times Sq-42 St.",
    period: "Nov 14 - 15, Sat 3:45 AM to Sun 10:00 PM",
    changes: [{ alertId: "lmm:planned_work:e2e-bus", route: "2", kind: "suspended", names: ["Times Sq-42 St", "14 St"], notice: "No trains" }],
    alternatives: [
      { stop: "127", notes: "[shuttle bus icon] 7 Av at 42 St" },
      { stop: "128", notes: "[shuttle bus icon] 7 Av at 34 St" },
      { stop: "132", notes: "[1][3]\n[shuttle bus icon] 7 Av at 14 St" },
    ],
  };
}

/** A voice that finishes each line at once, except the one that names the first bus corner: the walk holds there. */
const voiceHoldingAtCorner = () => {
  const said: Array<{ text: string; lang: string }> = [];
  Object.assign(window, { __said: said });
  Object.defineProperty(window, "speechSynthesis", { configurable: true, value: {
    speaking: false, paused: false, pending: false, getVoices: () => [], addEventListener: () => undefined, removeEventListener: () => undefined,
    speak: (u: SpeechSynthesisUtterance) => {
      said.push({ text: u.text, lang: u.lang });
      if (!/7 Avenue at 42 Street/.test(u.text)) setTimeout(() => { u.onend?.(new Event("end") as SpeechSynthesisEvent); u.dispatchEvent(new Event("end")); }, 20);
    },
    cancel: () => undefined, pause: () => undefined, resume: () => undefined,
  } });
};

// Owner, 2026-11-08: "guide me on whats going on where to take shuttle bus etc", and the map follows the voice.
for (const size of SIZES) {
  test(`a shuttle notice guides to the bus corner and the map follows at ${size.width}×${size.height}`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.addInitScript(voiceHoldingAtCorner);
    await mockNetwork(page);
    const body = JSON.parse(liveNow()) as { alerts: { alerts: unknown[] } };
    body.alerts.alerts.push(shuttleAlert());
    await page.route("**/api/transit-live*", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(body) }));
    await page.route("**/api/transit", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ bus: false }) }));
    await page.goto("/");
    await page.getByRole("button", { name: "My train" }).click({ timeout: slow(15_000) });
    await page.getByRole("button", { name: /^7 Avenue Express/ }).first().click({ timeout: slow(15_000) });
    const panel = page.getByTestId("line-panel");
    const notice = panel.locator("[data-notice]", { hasText: "No 2" });
    await notice.scrollIntoViewIfNeeded();
    await notice.click();

    const walk = panel.getByTestId("notice-walk");
    // Each station row says where its bus stops, in the notice's own words with the streets spelled out.
    await expect(walk.locator('[data-stop="127"]')).toContainText("7 Avenue at 42 Street");
    await expect(walk.getByTestId("notice-step")).toContainText([
      "No 2 trains between Times Square-42 Street and 14 Street. Free shuttle buses run instead.",
      "Ride the 2 to Times Square-42 Street and go up to the street.",
      "The shuttle bus stops at 7 Avenue at 42 Street.",
      "Get off the bus at 14 Street and change to the 1 or 3.",
      "When: November 14 to 15, Saturday 3:45 AM to Sunday 10:00 PM.",
    ]);
    // The voice reached the corner step; the map marks that corner at Times Sq-42 St.
    await expect(walk).toHaveAttribute("data-step", "2", { timeout: slow(10_000) });
    await expect.poll(() => page.evaluate(async () => {
      const src = (window as unknown as { __map?: { getSource: (id: string) => { getData: () => Promise<{ features?: Array<{ properties?: { label?: string } }> }> } | undefined } }).__map?.getSource("transit-walk-corners");
      return (await src?.getData())?.features?.map((f) => f.properties?.label ?? "").join("|") ?? "";
    })).toContain("7 Avenue at 42 Street");
    await expectLayout(page);
  });
}

test("a notice is guided in the rider's language", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.addInitScript(() => localStorage.setItem("nma.lang", "es"));
  await page.addInitScript(voiceHoldingAtCorner);
  await mockNetwork(page);
  const body = JSON.parse(liveNow()) as { alerts: { alerts: unknown[] } };
  body.alerts.alerts.push(shuttleAlert());
  await page.route("**/api/transit-live*", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(body) }));
  await page.route("**/api/transit", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ bus: false }) }));
  // The model's part, stood in for: every line comes back marked, names untouched.
  await page.route("**/api/agent/translate", async (r) => {
    const { lines } = r.request().postDataJSON() as { lines: string[] };
    await r.fulfill({ contentType: "application/json", body: JSON.stringify({ lines: lines.map((l) => `ES ${l}`) }) });
  });
  await page.goto("/");
  await page.getByRole("button", { name: /Mi tren|My train/ }).click({ timeout: slow(15_000) });
  await page.getByRole("button", { name: /^7 Avenue Express/ }).first().click({ timeout: slow(15_000) });
  const panel = page.getByTestId("line-panel");
  const notice = panel.locator("[data-notice]", { hasText: "No 2" });
  await notice.scrollIntoViewIfNeeded();
  await notice.click();
  const walk = panel.getByTestId("notice-walk");
  await expect(walk.getByTestId("notice-step").first()).toHaveText("ES No 2 trains between Times Square-42 Street and 14 Street. Free shuttle buses run instead.");
  await expect(walk.locator('[data-stop="128"]')).toContainText("ES Shuttle bus");
  await expect.poll(() => page.evaluate(() => (window as unknown as { __said: Array<{ text: string; lang: string }> }).__said[0] ?? null)).toMatchObject({ text: expect.stringMatching(/^ES No 2/), lang: expect.stringMatching(/^es/) });
  await expectLayout(page);
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
