import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { expectLayout, SIZES } from "./layout";

/**
 * /record, the walk recorder. The test browser has no camera, so a drawn
 * canvas stands in for it; everything after that is the page's own code:
 * the recorder, the marks, the review screen and the two saved files.
 */
async function fakeCamera(page: Page) {
  await page.addInitScript(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 360;
    const ctx = canvas.getContext("2d");
    let n = 0;
    setInterval(() => { if (ctx) { ctx.fillStyle = n++ % 2 ? "#135" : "#246"; ctx.fillRect(0, 0, 640, 360); } }, 100);
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: () => Promise.resolve(canvas.captureStream(10)) } });
  });
}

async function openCamera(page: Page) {
  await fakeCamera(page);
  await page.goto("/record");
  await page.getByRole("button", { name: "Open camera" }).click();
  await expect(page.getByRole("button", { name: "Record", exact: true })).toBeVisible();
}

for (const size of SIZES) {
  test.describe(`walk recorder layout at ${size.name} ${size.width}×${size.height}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
    });

    test("the tips before the first recording", async ({ page }) => {
      await page.goto("/record");
      await expect(page.getByText("Hold the phone steady at chest height.")).toBeVisible();
      await expect(page.getByText("Walk at an even pace.")).toBeVisible();
      await expect(page.getByText("Pause at each sign.")).toBeVisible();
      await expectLayout(page);
    });

    test("the camera, recording and review", async ({ page }) => {
      await openCamera(page);
      await expectLayout(page);
      await page.getByRole("button", { name: "Record", exact: true }).click();
      await expect(page.getByTestId("record-timer")).toBeVisible();
      for (const name of ["Sign", "Stairs", "Elevator"]) await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
      await expectLayout(page);
      await page.getByRole("button", { name: "Stop", exact: true }).click();
      await expect(page.getByRole("button", { name: "Save", exact: true })).toBeVisible();
      await expectLayout(page);
    });
  });
}

test("a recording saves one JSON file in the recording format, with its marks, and the video", async ({ page }) => {
  await openCamera(page);
  // The tips show once: a second visit opens straight on the camera.
  await page.reload();
  await expect(page.getByRole("button", { name: "Record", exact: true })).toBeVisible();

  const before = Date.now();
  await page.getByRole("button", { name: "Record", exact: true }).click();
  await expect(page.getByTestId("record-timer")).toBeVisible();
  await page.getByRole("button", { name: "Sign", exact: true }).click();
  await page.getByRole("button", { name: "Elevator", exact: true }).click();
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: "Stop", exact: true }).click();

  const marks = page.getByRole("list", { name: "Marks" }).getByRole("listitem");
  await expect(marks).toHaveCount(2);
  await expect(marks.nth(0)).toContainText("sign");
  await expect(marks.nth(1)).toContainText("elevator");
  await expect(page.getByLabel("Recorded walk")).toBeVisible();

  const files: Array<{ name: string; path: string }> = [];
  page.on("download", (d) => { void d.path().then((path) => files.push({ name: d.suggestedFilename(), path })); });
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(() => files.length).toBe(2);
  const json = files.find((f) => f.name.endsWith(".json"));
  const video = files.find((f) => !f.name.endsWith(".json"));
  expect(json?.name).toMatch(/^walk-\d{8}-\d{6}\.json$/);
  expect(video?.name).toMatch(/^walk-\d{8}-\d{6}\.(mp4|webm)$/);
  const rec = JSON.parse(readFileSync(json?.path ?? "", "utf8")) as { v: number; startedAt: number; marks: Array<{ t: number; kind: string }>; video?: { file: string }; baro: unknown[]; steps: unknown[] };
  expect(rec.v).toBe(1);
  expect(rec.startedAt).toBeGreaterThanOrEqual(before);
  expect(rec.marks.map((m) => m.kind)).toEqual(["sign", "elevator"]);
  expect(rec.marks.every((m) => m.t >= rec.startedAt && m.t <= Date.now())).toBe(true);
  expect(rec.video?.file).toBe(video?.name);
  expect([rec.baro, rec.steps]).toEqual([[], []]);

  // Delete goes back to the camera, ready for the next segment.
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByRole("button", { name: "Record", exact: true })).toBeVisible();
});
