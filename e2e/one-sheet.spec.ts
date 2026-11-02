import { expect, test, type Page } from "@playwright/test";
import { expectLayout } from "./layout";
import { mockNetwork } from "./mocks";
import { slow } from "./slow";

// Owner, 2026-10-28: one sheet, like Google and Apple Maps. The ask box is always there; an answer
// and a map card share one left column on wide screens, and a phone's answer pulls up and down.
const stream = (events: unknown[]) => events.map((e) => JSON.stringify(e)).join("\n") + "\n";
const LONG = Array.from({ length: 14 }, (_, i) => `Step ${i + 1}: walk one more block north along Broadway and keep the park on your right.`).join("\n");

async function answer(page: Page) {
  await mockNetwork(page);
  await page.route("**/api/agent", (r) => r.fulfill({ contentType: "application/x-ndjson", body: stream([{ type: "text", text: LONG }, { type: "done" }]) }));
  await page.goto("/");
  await page.getByLabel("Ask the assistant").fill("How do I walk to Bryant Park?");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText("Step 14:")).toBeAttached();
}

test("a wide screen puts the answer and the ask box in one left column", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await answer(page);
  const home = page.getByTestId("agent-home");
  await expect(home).toHaveAttribute("data-layout", "column");
  const col = (await home.boundingBox())!;
  const bar = (await page.getByTestId("agent-bar").boundingBox())!;
  const answers = (await page.getByTestId("agent-answers").boundingBox())!;
  // Left side only: the middle of the map stays clear.
  expect(col.x).toBeLessThan(40);
  expect(col.x + col.width).toBeLessThanOrEqual(1280 * 0.45);
  // The ask box sits at the foot of the column, the answer above it, and a long answer gets more than the old 44% box.
  expect(bar.y + bar.height).toBeGreaterThan(800 - 40);
  expect(answers.y + answers.height).toBeLessThanOrEqual(bar.y);
  expect(answers.height).toBeGreaterThan(800 * 0.5);
  await expectLayout(page);
  // Closing the answer gives the bar back to the middle.
  await page.getByRole("button", { name: "Close answer", exact: true }).click();
  await expect(home).not.toHaveAttribute("data-layout", "column");
});

test("a phone's answer pulls up for more and down for more map", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await answer(page);
  const grip = page.getByTestId("answer-grip");
  const box = page.getByTestId("agent-answers");
  const usual = (await box.boundingBox())!.height;
  await grip.click();
  await expect.poll(async () => (await box.boundingBox())!.height).toBeGreaterThan(usual + 80);
  await expect(grip).toHaveAttribute("aria-label", "Show less");
  await expectLayout(page);
  await grip.click();
  await expect.poll(async () => (await box.boundingBox())!.height).toBeLessThan(usual);
  await expectLayout(page);
});

test("a wide screen keeps status chips in one row at the top of the left side", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await mockNetwork(page);
  await page.goto("/?flags=contextClean");
  await page.waitForFunction(() => typeof (window as unknown as { __pushPanel?: unknown }).__pushPanel === "function");
  await page.evaluate(() => (window as unknown as { __pushPanel: (c: object) => void }).__pushPanel({ id: "restroom:test", title: "Bryant Park restroom", subtitle: "Public restroom" }));
  // The clean-map chip comes up for an open place, and the row is drawn on wide screens.
  await expect(page.getByTestId("context-clean")).toBeVisible({ timeout: slow(15_000) });
  await expect(page.getByTestId("left-chips")).toBeAttached();
  const chip = page.getByTestId("left-chips").getByTestId("context-clean");
  await expect(chip).toBeVisible({ timeout: slow(15_000) });
  const box = (await chip.boundingBox())!;
  const card = (await page.getByTestId("left-slot").boundingBox())!;
  // Top left, above the card, not floating over the middle of the map.
  expect(box.x).toBeLessThan(40);
  expect(box.y + box.height).toBeLessThanOrEqual(card.y);
  expect(box.y).toBeLessThan(800 * 0.25);
  // The card keeps the app's theme: only the answer and the ask box are dark.
  const darkAbove = await page.getByTestId("details-sheet").evaluate((el) => {
    const d = el.closest(".dark");
    return d && d !== document.documentElement ? d.getAttribute("data-testid") ?? d.tagName : null;
  });
  expect(darkAbove).toBeNull();
  await expectLayout(page);
});

test("a minimized card on a wide screen waits in the chip row at the top left", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await mockNetwork(page);
  await page.goto("/");
  await page.waitForFunction(() => typeof (window as unknown as { __pushPanel?: unknown }).__pushPanel === "function");
  await page.evaluate(() => (window as unknown as { __pushPanel: (c: object) => void }).__pushPanel({ id: "restroom:test", title: "Bryant Park restroom", subtitle: "Public restroom" }));
  await page.getByRole("button", { name: "Minimize", exact: true }).click();
  const peek = page.getByTestId("left-chips").getByTestId("peek-chip");
  await expect(peek).toBeVisible({ timeout: slow(15_000) });
  const box = (await peek.boundingBox())!;
  // Top left, away from the ask box at the foot of the screen.
  expect(box.x).toBeLessThan(40);
  expect(box.y).toBeLessThan(800 * 0.25);
  await expectLayout(page);
  await peek.click();
  await expect(page.getByTestId("details-sheet")).toBeVisible();
});
