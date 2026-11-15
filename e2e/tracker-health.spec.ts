import { expect, test, type Page } from "@playwright/test";
import { expectLayout, SIZES } from "./layout";
import { mockNetwork } from "./mocks";
import { slow } from "./slow";

/**
 * The tracker health page at /tracker-health (#11) and the way into it. The
 * endpoints are mocked: coverage for two subway lines and 40 bus routes, one
 * line's stretches, and accuracy first empty (the day it ships) and then with data.
 */
const BANDS = [[0, 4], [5, 6], [7, 9], [10, 15], [16, 19], [20, 23]];
const coverage = () => {
  const rows = [];
  for (const sched of [1, 6, 7]) for (const [band] of BANDS) {
    rows.push({ system: "subway", route: "A", sched, band, segments: 117, used: 110, solid: 80 + band, samples: 1526 + band * 100 });
    rows.push({ system: "subway", route: "G", sched, band, segments: 40, used: 40, solid: 38, samples: 900 });
    for (let i = 1; i <= 40; i++) rows.push({ system: "bus", route: `M${i}`, sched, band, segments: 42 + i, used: 30, solid: 10 + (i % 7), samples: 136 * i });
  }
  return { ready: true, refreshedAt: "2026-11-15T02:00:00.000Z", bands: BANDS, rows };
};
const stops = ["A02", "A03", "A05", "A06", "A07"];
const subwaySegments = { route: "A", dow: 3, hour: 7, segments: stops.slice(1).flatMap((to, i) => [
  { dir: 0, from: `${stops[i]}N`, to: `${to}N`, kind: "travel", n: i === 1 ? 3 : 24, median: 95 + i * 30, p80: 130 + i * 30 },
  // The feed gives some lines one direction number both ways (the 1 on the live site): the page splits by platform.
  { dir: 0, from: `${to}S`, to: `${stops[i]}S`, kind: "travel", n: 18, median: 90, p80: 110 },
]) };
const busSegments = { route: "M40", dow: 3, hour: 7, segments: [1, 2, 3, 4].map((i) => ({ dir: 0, from: `40${i}`, to: `40${i + 1}`, kind: "travel", n: i + 1, median: 60 + i * 10 })) };
const busRoute = { route: "M40", lines: [], stops: [1, 2, 3, 4, 5].map((i) => ({ id: `MTA_40${i}`, name: `EAST BROADWAY/STOP NUMBER ${i} WITH A LONG NAME`, lon: -74, lat: 40.7 })) };
const stats = (n: number, m: number, b: number) => ({ n, maeModel: m, maeBase: b, w60Model: 0.8, w60Base: 0.7 });
const acc = (system: string, dim: string, key: string, n: number, m: number, b: number) => ({ system, dim, key, ...stats(n, m, b), learned: stats(Math.round(n / 2), m - 2, b + 3) });
const accuracy = {
  ready: true,
  rows: [
    acc("subway", "all", "", 4200, 24, 27), ...["1-3", "3-6", "6-10"].map((k, i) => acc("subway", "lead", k, 1400, 15 + i * 12, 16 + i * 15)),
    ...["0", "5", "7", "10", "16", "20"].map((k, i) => acc("subway", "band", k, 700, 20 + i, 24 + i)),
    ...["2-4", "5-9", "10+", "none"].map((k, i) => acc("subway", "samples", k, 1000, 40 - i * 6, 30)),
    ...Array.from({ length: 20 }, (_, i) => acc("subway", "route", i < 2 ? ["A", "G"][i] : `R${i}`, 200, 20 + i, 22 + i)),
    acc("bus", "all", "", 900, 66, 52),
  ],
  conditions: [
    acc("subway", "rush", "rush", 900, 31, 35), acc("subway", "rush", "off-peak", 3300, 22, 25),
    acc("subway", "notice", "yes", 1500, 34, 37), acc("subway", "notice", "no", 2700, 20, 22),
    acc("subway", "weather", "dry", 3800, 23, 26), acc("subway", "weather", "rain", 400, 36, 41),
    acc("bus", "traffic", "free", 60, 40, 44), acc("bus", "traffic", "jam", 25, 120, 110),
  ],
  stops: [
    { system: "subway", route: "A", stop: "A07N", n: 14, maeModel: 88, maeBase: 91, w60Model: 0.36 },
    { system: "bus", route: "M40", stop: "403", n: 9, maeModel: 140, maeBase: 120, w60Model: 0.2 },
  ],
  thin: [{ system: "subway", route: "A", dir: 0, from: "A03N", to: "A05N", n: 4, learnedN: 3, maeModel: 61, maeBase: 30 }],
  runs: [{ system: "subway", runs: 12, opened: 9000, resolved: 8100, unresolved: 900, stored: 4200, first: "2026-11-15T02:00:00.000Z", last: "2026-11-15T05:00:00.000Z" }],
};

async function mock(page: Page, withAccuracy: boolean) {
  await mockNetwork(page);
  const json = (body: unknown) => (r: { fulfill: (o: { json: unknown }) => Promise<void> }) => r.fulfill({ json: body });
  await page.route("**/api/transit-health/coverage", json(coverage()));
  await page.route("**/api/transit-health/accuracy", json(withAccuracy ? accuracy : { ready: true, rows: [acc("subway", "all", "", 37, 20, 22)], thin: [], runs: [{ ...accuracy.runs[0], runs: 1, stored: 37 }] }));
  await page.route("**/api/transit-segments?*", json(subwaySegments));
  await page.route("**/api/transit-segments/all?*", json({ dow: 3, hour: 7, routes: { A: [...subwaySegments.segments, { dir: 0, from: "A03N", to: "A03N", kind: "dwell", n: 20, median: 31, p80: 40 }], G: [] } }));
  await page.route("**/api/transit-bus-segments?*", json(busSegments));
  await page.route("**/api/transit-health/hours?*", json({ ready: true, system: "subway", route: null, cells: [1, 6, 7].flatMap((sched) => Array.from({ length: 24 }, (_, hour) => ({ sched, hour, segments: 100, solid: 60 + hour, enough: hour < 5 ? 10 : 40 + hour * 2, samples: hour < 5 ? 300 : 20000 + hour * 950 }))) }));
  await page.route("**/api/transit-health/bus-speeds?*", json({ ready: true, route: "M40", dow: 3, hour: 7, since: "2026-08-01", importedAt: "2026-11-15T06:00:00.000Z", segments: [
    { direction: "E", order: 1, from: "401", to: "404", seconds: 372, metres: 1500, trips: 240 },
    { direction: "E", order: 4, from: "404", to: "409", seconds: 505, metres: 2100, trips: 238 },
  ] }));
  await page.route("**/api/transit/bus-route?*", json(busRoute));
}

for (const size of SIZES) {
  test.describe(`${size.name} ${size.width}×${size.height}`, () => {
    test.use({ viewport: { width: size.width, height: size.height } });

    test("tracker health shows coverage, the week grid, one line and accuracy, and keeps the layout", async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await mock(page, true);
      await page.goto("/tracker-health");
      await expect(page.getByTestId("tracker-health")).toBeVisible({ timeout: slow(15_000) });
      await expect(page.locator("#shell-bar")).toHaveCount(0);
      // Subway: two lines, sorted by samples, A first; its stretches carry station names, not stop ids.
      await expect(page.getByTestId("coverage-row")).toHaveCount(2);
      await expect(page.getByTestId("coverage-row").first()).toHaveAttribute("data-route", "A");
      await expect(page.getByTestId("grid-system").getByTestId("grid-cell")).toHaveCount(18);
      await expect(page.getByTestId("line-count")).toHaveText("4 stretches · 1 under 5 samples");
      await expect(page.getByTestId("line-direction").locator("option")).toHaveCount(2);
      await expect(page.getByTestId("stretch").first()).toContainText("Inwood-207 St → Dyckman St", { timeout: slow(15_000) });
      // Stations: 447 places (496 station ids, same name within 400 m grouped), least-learned first; five have mocked rows.
      await expect(page.getByTestId("station-total")).toContainText("447 stations · 442 with no data · 2 with a line under 5 samples", { timeout: slow(15_000) });
      await expect(page.getByTestId("station-row")).toHaveCount(20);
      await expect(page.getByTestId("accuracy-data")).toBeVisible();
      await expect(page.getByTestId("accuracy-waiting")).toHaveCount(0);
      // Error split by the conditions at the time, and the worst-predicted stop by name.
      await expect(page.getByTestId("accuracy-rush")).toContainText("off-peak");
      await expect(page.getByTestId("accuracy-notice")).toContainText("active");
      await expect(page.getByTestId("accuracy-weather")).toContainText("rain");
      await expect(page.getByTestId("accuracy-traffic")).toHaveCount(0);
      await expect(page.getByTestId("accuracy-stops")).toContainText("A 175 St");
      // Per-hour counts: 24 cells for each of the three schedules.
      await expect(page.getByTestId("hour-cell")).toHaveCount(72);
      await expect(page.getByTestId("mta-compare")).toHaveCount(0);
      await expect(page.getByTestId("source").first()).toContainText("GET /api/transit-health/coverage · loaded");
      await expectLayout(page);

      // Tapping a stretch opens its first station: each line and direction with the time in, the dwell and the time out.
      await page.getByTestId("stretch-station").nth(1).click();
      const detail = page.getByTestId("station-detail");
      await expect(detail).toContainText("Dyckman St");
      await expect(detail.getByTestId("station-line")).toHaveCount(2);
      await expect(detail.getByTestId("station-line").first()).toContainText("to 190 St");
      await expect(detail.getByTestId("station-line").first()).toContainText("in 1:35 n 24dwell 31 s n 20out 2:05 n 3");
      await expectLayout(page);
      await page.getByTestId("station-clear").click();
      await expect(page.getByTestId("station-row").first()).toBeVisible();

      // Coverage order, then one schedule and band from the grid.
      await page.getByTestId("sort-coverage").click();
      await expect(page.getByTestId("coverage-row").first()).toHaveAttribute("data-route", "G");
      await page.getByTestId("grid-system").getByTestId("grid-cell").nth(2).click();
      await expect(page.getByTestId("coverage-total")).toContainText("Mon–Fri 07–10");
      await expect(page.getByTestId("line-detail").getByTestId("source")).toContainText("dow=3&hour=7");
      await expectLayout(page);

      // Buses: 40 routes, 30 shown until asked; a route's stops are named.
      await page.getByTestId("system-bus").click();
      await expect(page.getByTestId("coverage-row")).toHaveCount(30);
      await page.getByTestId("coverage-all").click();
      await expect(page.getByTestId("coverage-row")).toHaveCount(40);
      await expect(page.getByTestId("stretch").first()).toContainText("STOP NUMBER 1");
      await expect(page.getByTestId("station-total")).toContainText(/5 stops on M\d+ · 0 with no data/);
      // The MTA's published time between timepoints beside ours: 401 to 404 is three of our stretches, 404 to 409 has no full chain.
      await expect(page.getByTestId("mta-row")).toHaveCount(2);
      await expect(page.getByTestId("mta-row").first()).toContainText("6:12 · 240 trips / 4:00 · 3 stretches · least n 2");
      await expect(page.getByTestId("mta-row").nth(1)).toContainText("no full chain");
      await expect(page.getByTestId("accuracy-traffic")).toContainText("jam");
      await expect(page).toHaveURL(/system=bus/);
      await expectLayout(page);
      expect(errors, errors.join("\n")).toEqual([]);
    });

    test("the accuracy panel says so when there is not enough data yet", async ({ page }) => {
      await mock(page, false);
      await page.goto("/tracker-health");
      await expect(page.getByTestId("accuracy-waiting")).toContainText("Not enough data yet · 37 scored predictions · 1 runs", { timeout: slow(15_000) });
      await expectLayout(page);
    });

    test("Settings links to tracker health only while Advanced is on", async ({ page }) => {
      await mock(page, true);
      const phone = size.width < 640; // the menu row (and its Settings dropdown) starts at the sm breakpoint
      const openSettings = async () => {
        await page.getByTestId(phone ? "settings-chip" : "menu-settings").click();
        return page.getByTestId(phone ? "settings-sheet" : "settings-panel");
      };
      await page.goto("/");
      let panel = await openSettings();
      await expect(panel).toBeVisible({ timeout: slow(20_000) });
      await expect(page.getByTestId("open-tracker-health")).toHaveCount(0);
      await page.evaluate(() => localStorage.setItem("nma:advancedMode", "1"));
      await page.reload();
      panel = await openSettings();
      const link = panel.getByTestId("open-tracker-health");
      await expect(link).toBeVisible({ timeout: slow(20_000) });
      await expectLayout(page);
      // A phone's sheet opens half way and the link is at its foot, so pull it up as a person would.
      // The layout is not measured again here: with the sheet fully up, the home screen's Record
      // button overlaps the sheet's Close button, which is older than this page (see the pull request).
      if (phone) {
        await panel.getByTestId("sheet-grip").click();
        await expect(panel).toHaveAttribute("data-level", "2");
      }
      await link.click();
      await expect(page).toHaveURL(/\/tracker-health$/);
      await expect(page.getByTestId("tracker-health")).toBeVisible({ timeout: slow(15_000) });
      await page.getByTestId("tracker-health-back").click();
      await expect(page).toHaveURL(/\/$/);
    });
  });
}
