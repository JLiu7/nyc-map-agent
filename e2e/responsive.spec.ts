import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { expectLayout, SIZES } from "./layout";
import { mockNetwork } from "./mocks";
import { slow } from "./slow";

/**
 * Every main screen meets the layout bar in e2e/layout.ts at every size in
 * SIZES: nothing off the side, no tap target under 24 px, nothing covering a
 * control, and the map's focus clear of every panel. A new screen adds a case here.
 */
const trip = JSON.parse(readFileSync(new URL("./fixtures/agent-trip.json", import.meta.url), "utf8")) as Record<string, unknown>;
const stream = (events: unknown[]) => events.map((e) => JSON.stringify(e)).join("\n") + "\n";
const RESTROOM = { name: "Bryant Park", lon: -73.9832, lat: 40.7536, distanceM: 420, hours: "8am-8pm" };


async function ask(page: Page, text: string) {
  await page.getByLabel("Ask the assistant").fill(text);
  await page.getByRole("button", { name: "Send", exact: true }).click();
}

/** The app with the network mocked; `answer` is what the agent says (registered after the mocks, so it wins). */
async function open(page: Page, answer: unknown[] = []) {
  await mockNetwork(page);
  if (answer.length) await page.route("**/api/agent", (r) => r.fulfill({ contentType: "application/x-ndjson", body: stream([...answer, { type: "done" }]) }));
  await page.goto("/");
  await expect(page.locator("canvas.maplibregl-canvas").first()).toBeVisible();
}

for (const size of SIZES) {
  test.describe(`layout at ${size.name} ${size.width}×${size.height}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
    });

    test("home", async ({ page }) => {
      await open(page);
      await expect(page.getByTestId("agent-bar")).toBeVisible();
      await expectLayout(page);
    });

    test("home with the live trains moving", async ({ page }) => {
      await open(page);
      await expect(page.getByTestId("agent-bar")).toBeVisible();
      await page.waitForTimeout(1500); // a few ticks of the live train layer (#643)
      await expectLayout(page);
    });

    test("a text answer", async ({ page }) => {
      await open(page, [{ type: "text", text: "Bryant Park has the nearest public restroom, about 6 minutes on foot." }]);
      await ask(page, "Nearest restroom?");
      await expect(page.getByTestId("answer-card")).toBeVisible();
      await expectLayout(page);
    });

    // Station shorthand is spelled out in the answer (#37): "Times Sq-42 St" reads "Times Square-42 Street".
    test("an answer spells out station names", async ({ page }) => {
      await open(page, [{ type: "text", text: "Take the 7 to Times Sq-42 St, then walk to Jackson Hts-Roosevelt Av." }]);
      await ask(page, "How do I get to Times Square?");
      await expect(page.getByText("Take the 7 to Times Square-42 Street, then walk to Jackson Heights-Roosevelt Avenue.")).toBeVisible();
      await expectLayout(page);
    });

    test("a restroom answer keeps the restroom in view", async ({ page }) => {
      await open(page, [
        { type: "text", text: "Bryant Park is the closest open restroom." },
        { type: "actions", actions: [{ kind: "showRestroom", id: "restroom:bp", label: "Show the nearest restroom", restroom: RESTROOM }] },
      ]);
      await ask(page, "Where is the nearest restroom?");
      await expect(page.getByText("Bryant Park is the closest open restroom.")).toBeVisible();
      await expectLayout(page, { focus: [RESTROOM.lon, RESTROOM.lat] });
    });

    test("a trip card", async ({ page }) => {
      await open(page, [
        { type: "command", command: { type: "showRoute", trip } },
        { type: "command", command: { type: "openPanel", trip } },
        { type: "text", text: "Take this route." },
      ]);
      await ask(page, "Plan a trip from Union Square to Grand Central");
      await expect(page.getByRole("region", { name: "Trip preview" })).toBeVisible();
      await expectLayout(page);
    });

    // A trip the day's service changes break says so whole, on the card (owner, 2026-10-27: the 7's weekend work never reached the plan).
    test("a trip the weekend's changes block", async ({ page }) => {
      const blocked = { ...trip, departIso: "2026-11-14T10:00", arriveIso: "2026-11-14T10:40",
        impacts: [{ route: "4", text: "The 4 won't stop at Grand Central-42 St, so you can't get off there.", blocks: true }] };
      await open(page, [
        { type: "command", command: { type: "showRoute", trip: blocked } },
        { type: "command", command: { type: "openPanel", trip: blocked } },
        { type: "text", text: "This way doesn't work on Saturday." },
      ]);
      await ask(page, "Plan a trip from Union Square to Grand Central this weekend");
      const box = page.getByTestId("trip-impact");
      await expect(box).toBeVisible();
      await expect(box).toContainText("can't get off there");
      await expectLayout(page);
    });

    // "Use this route" on a train trip walks you to the station first, then shows your train (owner, 2026-10-27).
    test("a train trip walks to the station, then shows the train", async ({ page }) => {
      await open(page, [
        { type: "command", command: { type: "showRoute", trip } },
        { type: "command", command: { type: "openPanel", trip } },
        { type: "text", text: "Take this route." },
      ]);
      const walk = (trip.legs as { kind: string; coords?: number[][] }[])[0].coords!;
      await page.route("**/routed-foot/route/**", (r) => r.fulfill({ json: { code: "Ok", routes: [{ distance: 105, duration: 90, geometry: { type: "LineString", coordinates: walk }, legs: [{ steps: walk.map((location, i) => ({ distance: 50, name: "E 14 St", maneuver: { location, type: i === walk.length - 1 ? "arrive" : "depart", bearing_after: 30 } })) }] }] } }));
      await ask(page, "Plan a trip from Union Square to Grand Central");
      await page.getByRole("button", { name: "Use this route", exact: true }).click();
      await expect(page.getByRole("region", { name: "Walking guidance", exact: true })).toBeVisible();
      const next = page.getByRole("region", { name: "Next on this trip" });
      await expect(next).toContainText("Then the 4 train");
      await expectLayout(page);
      await next.getByRole("button", { name: "I'm at the station" }).click();
      await expect(page.getByRole("region", { name: "Walking guidance", exact: true })).toBeHidden();
      await page.waitForTimeout(800);
      await expect(page.getByTestId("locate-button").first()).toBeVisible();
      await expectLayout(page);
    });

    test("a second quick question is held, then answered (no refusal)", async ({ page }) => {
      await open(page);
      let n = 0;
      await page.route("**/api/agent", (r) => {
        n += 1;
        return r.fulfill({ contentType: "application/x-ndjson", body: stream([{ type: "text", text: n === 1 ? "First answer." : "Times Square is 12 minutes away on the 1 train." }, { type: "done" }]) });
      });
      await ask(page, "Nearest restroom?");
      await expect(page.getByText("First answer.")).toBeVisible();
      await ask(page, "Plan my trip to Times Square, leaving now.");
      await expect(page.getByText(/Sending in a moment/).first()).toBeVisible();
      await expectLayout(page);
      await expect(page.getByText("Times Square is 12 minutes away on the 1 train.")).toBeVisible({ timeout: slow(10_000) });
      await expect(page.getByText(/between questions/)).toHaveCount(0);
      await expectLayout(page);
    });

    // Settings → Model: Smart or Dev, with the smart chain's health; the pick goes with each question (#35).
    test("the model switch in Settings", async ({ page }) => {
      await open(page);
      await page.route("**/api/agent/health", (r) => r.fulfill({ json: { profile: "smart", smart: [{ id: "deepseek", label: "DeepSeek (InferHub)", model: "m", ok: true }, { id: "qwen", label: "Qwen (yolo)", model: "y", ok: false }] } }));
      const sent: Array<{ profile?: string }> = [];
      await page.route("**/api/agent", (r) => {
        sent.push(r.request().postDataJSON() as { profile?: string });
        return r.fulfill({ contentType: "application/x-ndjson", body: stream([{ type: "text", text: "Dev answered." }, { type: "done" }]) });
      });
      const phone = size.width < 640; // the menu row (and its Settings dropdown) starts at the sm breakpoint
      await page.getByTestId(phone ? "settings-chip" : "menu-settings").click();
      const panel = page.getByTestId(phone ? "settings-sheet" : "settings-panel");
      await expect(panel.getByTestId("model-health")).toHaveText("DeepSeek (InferHub) · 1/2");
      await expectLayout(page);
      await panel.getByLabel("Model").selectOption("dev");
      await expect(panel.getByTestId("model-health")).toHaveCount(0);
      if (phone) await panel.getByRole("button", { name: /^Close/ }).click();
      else await page.keyboard.press("Escape");
      await ask(page, "Nearest restroom?");
      await expect(page.getByText("Dev answered.")).toBeVisible();
      expect(sent.at(-1)?.profile).toBe("dev");
    });

    // Language is one tap from the home screen on every size (#54): the phone rail's chip, or Settings on wider screens.
    test("changing the language", async ({ page }) => {
      await open(page);
      const phone = size.width < 640;
      if (phone) {
        const chip = page.getByTestId("lang-chip");
        await expect(chip).toBeVisible();
        await expectLayout(page);
        await chip.getByLabel("Language").selectOption("es");
        await expect(chip.getByLabel("Idioma")).toHaveValue("es");
      } else {
        await page.getByTestId("menu-settings").click();
        await page.getByTestId("settings-panel").getByLabel("Language").selectOption("es");
        await page.keyboard.press("Escape");
      }
      await expect(page.getByRole("button", { name: "Baño" })).toBeVisible();
      await expectLayout(page);
    });

    test("home with the transit layers drawn", async ({ page }) => {
      await open(page);
      await expect(page.getByTestId("agent-bar")).toBeVisible();
      await page.waitForTimeout(1000); // the live layers, including the alert marker layers (#647), are mounted
      await expectLayout(page);
    });

    test("a line panel", async ({ page }) => {
      await open(page, [
        { type: "text", text: "The 7 is running with delays." },
        { type: "actions", actions: [{ kind: "showLine", id: "line:7", label: "See the 7 trains live", route: "7" }] },
      ]);
      await ask(page, "How is the 7?");
      await page.getByRole("button", { name: "See the 7 trains live" }).click();
      await page.waitForTimeout(800);
      await expectLayout(page);
    });

    // Owner, 2026-11-07: the station sheet and the line sheet stacked and cut each other off. A phone has one
    // sheet: the line comes up as its next view, Back returns to the station, and Close empties it (#53).
    test("a station, one of its lines, and back", async ({ page }) => {
      const phone = size.width < 640;
      const sheets = page.locator(".pull-sheet");
      await open(page);
      await page.waitForFunction(() => typeof (window as unknown as { __openStation?: unknown }).__openStation === "function", null, { timeout: slow(15_000) });
      await page.evaluate(() => (window as unknown as { __openStation: (s: string, id: string, name: string) => void }).__openStation("subway", "G13", "Elmhurst Av"));
      const station = page.getByTestId("details-sheet");
      await expect(station).toBeVisible();
      if (phone) await station.getByTestId("sheet-grip").click();
      await page.getByRole("button", { name: "Show only the M line" }).click();
      const line = page.getByTestId("line-panel");
      await expect(line).toBeVisible();
      if (!phone) {
        await expectLayout(page);
        return;
      }
      await expect(station).toHaveCount(0);
      await expect(sheets).toHaveCount(1);
      await expectLayout(page);

      await line.getByTestId("sheet-back").click();
      await expect(line).toHaveCount(0);
      await expect(station).toBeVisible();
      await expect(page.getByRole("button", { name: "Show only the M line" })).toBeVisible();
      await expect(sheets).toHaveCount(1);
      await expectLayout(page);

      await page.getByRole("button", { name: "Show only the M line" }).click();
      await expect(sheets).toHaveCount(1);
      await line.getByRole("button", { name: "Close line" }).click();
      await expect(sheets).toHaveCount(0);
      await expect(station).toHaveCount(0);
    });
  });
}

test("Escape while typing a follow-up leaves the answer open", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await open(page, [{ type: "text", text: "Bryant Park has the nearest public restroom." }]);
  await ask(page, "Nearest restroom?");
  await expect(page.getByTestId("answer-card")).toBeVisible();
  const box = page.getByLabel("Ask the assistant");
  await box.fill("and is it op");
  await box.press("Escape");
  await expect(page.getByTestId("answer-card")).toBeVisible();
  await box.fill("");
  await box.press("Escape");
  await expect(page.getByTestId("answer-card")).toHaveCount(0);
});
