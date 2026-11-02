import { expect, test, type ConsoleMessage } from "@playwright/test";
import { mockNetwork } from "./mocks";
import { slow } from "./slow";

// Network refusals we cause on purpose (mocks.ts) are not app bugs.
const EXPECTED = [/ERR_BLOCKED_BY_CLIENT/, /Failed to load resource/];

test("map loads, search opens a panel, street level toggles, no console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m: ConsoleMessage) => {
    if (m.type() === "error" && !EXPECTED.some((re) => re.test(m.text()))) errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await mockNetwork(page);

  // Neighbourhood outlines arrive early; the crime and noise summaries load only with an analytics layer on.
  const areas = page.waitForResponse((r) => r.url().includes("/api/areas"));
  await page.goto("/?flags=-agentHome");

  // Map loads: the MapLibre canvas is up and our neighbourhood data arrived.
  await expect(page.locator("canvas.maplibregl-canvas").first()).toBeVisible();
  await areas;

  // Search a neighbourhood and open its panel.
  const search = page.getByPlaceholder("Search neighborhoods, addresses, stations");
  await search.fill("Greenpoint");
  await page.getByRole("option", { name: /Greenpoint/ }).first().click();
  await expect(page.getByText("Greenpoint").first()).toBeVisible();

  // Street level on from the view switcher, then back up with Top.
  await page.getByTestId("view-switcher").getByRole("button", { name: "Street", exact: true }).click();
  await expect(page.getByTestId("street-minimap")).toBeVisible({ timeout: slow(15_000) });
  await page.getByTestId("view-switcher").getByRole("button", { name: "Top", exact: true }).click();
  await expect(page.getByTestId("street-minimap")).toHaveCount(0, { timeout: slow(15_000) });
  await expect(page.getByTestId("view-switcher").getByRole("button", { name: "Street", exact: true })).toHaveAttribute("aria-pressed", "false");

  expect(errors, errors.join("\n")).toEqual([]);
});
