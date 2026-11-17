import { readFileSync, statSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { expectLayout, SIZES } from "./layout";
import { mockNetwork } from "./mocks";
import { slow } from "./slow";

/**
 * The recorder page at /record (#185). The test browser has no camera, so a
 * fake one is put in before the page loads: a canvas whose colour changes
 * every frame, handed out as the camera's stream. Like a laptop, the browser
 * sends no motion, so the page records video and marks and says that motion
 * needs a phone.
 */
const fakeCamera = (page: Page) =>
  page.addInitScript(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 240;
    const g = canvas.getContext("2d")!;
    let n = 0;
    setInterval(() => {
      g.fillStyle = `hsl(${(n++ * 7) % 360} 60% 50%)`;
      g.fillRect(0, 0, 320, 240);
    }, 50);
    const md = navigator.mediaDevices ?? ({} as MediaDevices);
    md.getUserMedia = () => Promise.resolve(canvas.captureStream(20));
    if (!navigator.mediaDevices) Object.defineProperty(navigator, "mediaDevices", { value: md });
  });

/** The MediaRecorder options the page asked for, kept so the check can read the bitrate it set. */
const recordOptions = (page: Page) =>
  page.addInitScript(() => {
    const asked: unknown[] = [];
    (window as unknown as { __recorderOptions: unknown[] }).__recorderOptions = asked;
    const Real = window.MediaRecorder;
    class Spy extends Real {
      constructor(stream: MediaStream, options?: MediaRecorderOptions) {
        asked.push(options ?? null);
        super(stream, options);
      }
    }
    (window as unknown as { MediaRecorder: typeof MediaRecorder }).MediaRecorder = Spy;
  });

const open = async (page: Page, size: { width: number; height: number }) => {
  await page.setViewportSize({ width: size.width, height: size.height });
  await mockNetwork(page);
  await fakeCamera(page);
  await page.goto("/record");
  await expect(page.getByTestId("record-page")).toBeVisible({ timeout: slow(15_000) });
  await expect.poll(() => page.getByTestId("record-preview").evaluate((v: HTMLVideoElement) => v.videoWidth), { timeout: slow(10_000) }).toBeGreaterThan(0);
};

for (const size of SIZES) {
  test(`the recorder keeps the layout at ${size.name} ${size.width}×${size.height}, from Record to the review`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await open(page, size);
    await expect(page.getByRole("button", { name: "Record" })).toBeVisible();
    await expect(page.locator("#shell-bar")).toHaveCount(0);
    // No motion arrives in the test browser, as on a laptop, and the page says so.
    await expect(page.getByTestId("motion-note")).toContainText("motion needs a phone", { timeout: slow(5_000) });
    await expectLayout(page);

    await page.getByRole("button", { name: "Record" }).click();
    await expect(page.getByTestId("record-timer")).toBeVisible({ timeout: slow(10_000) });
    await page.getByTestId("mark-sign").click();
    await page.getByTestId("mark-stairs").click();
    await page.getByTestId("mark-elevator").click();
    await expect(page.getByTestId("record-marks")).toHaveText("3 marks");
    await expect(page.getByTestId("record-timer")).not.toHaveText("0:00", { timeout: slow(5_000) });
    await expectLayout(page);

    await page.getByRole("button", { name: "Stop" }).click();
    await expect(page.getByTestId("record-review")).toBeVisible({ timeout: slow(10_000) });
    await expect(page.getByTestId("review-video")).toBeVisible();
    await expect(page.getByTestId("count-marks")).toHaveText("3");
    await expect(page.getByTestId("count-motion")).toHaveText("0");
    await expect(page.getByTestId("review-marks").locator("li")).toHaveText([/Sign/, /Stairs/, /Elevator/]);
    await expect(page.getByTestId("review-path")).toContainText("No location in this recording");
    await expectLayout(page);
    expect(errors).toEqual([]);
  });
}

test("Save downloads the recording and its video, and nothing is sent anywhere", async ({ page }) => {
  const sent: string[] = [];
  page.on("request", (r) => { if (r.method() !== "GET") sent.push(`${r.method()} ${r.url()}`); });
  await open(page, SIZES[2]);
  await page.getByRole("button", { name: "Record" }).click();
  await expect(page.getByTestId("record-timer")).toBeVisible({ timeout: slow(10_000) });
  await page.getByTestId("mark-stairs").click();
  await expect(page.getByTestId("record-timer")).not.toHaveText("0:00", { timeout: slow(5_000) });
  await page.getByRole("button", { name: "Stop" }).click();
  await expect(page.getByTestId("record-review")).toBeVisible({ timeout: slow(10_000) });

  const files: { name: string; path: string }[] = [];
  page.on("download", (d) => void d.path().then((path) => files.push({ name: d.suggestedFilename(), path })));
  await page.getByTestId("save-button").click();
  await expect.poll(() => files.length, { timeout: slow(10_000) }).toBe(2);

  const json = files.find((f) => f.name.endsWith(".json"))!;
  const video = files.find((f) => !f.name.endsWith(".json"))!;
  expect(json.name).toMatch(/^walk-\d{4}-\d\d-\d\d-\d{6}\.json$/);
  expect(video.name).toBe(json.name.replace(/\.json$/, video.name.endsWith(".mp4") ? ".mp4" : ".webm"));
  expect(statSync(video.path).size).toBeGreaterThan(1000);
  const rec = JSON.parse(readFileSync(json.path, "utf8")) as { v: number; startedAt: number; motion: unknown[]; baro: unknown[]; steps: unknown[]; marks: { t: number; kind: string }[]; video: { file: string; startedAt: number } };
  expect(rec.v).toBe(1);
  expect(rec.marks.map((m) => m.kind)).toEqual(["stairs"]);
  expect(rec.marks[0].t).toBeGreaterThanOrEqual(rec.startedAt);
  expect(rec.video.file).toBe(video.name);
  expect(rec.video.startedAt).toBeGreaterThanOrEqual(rec.startedAt);
  expect([rec.motion, rec.baro, rec.steps]).toEqual([[], [], []]);
  // Each file keeps its own link, for a phone that lets only one download through.
  await expect(page.getByTestId("file-json")).toHaveAttribute("download", json.name);
  await expect(page.getByTestId("file-video")).toHaveAttribute("download", video.name);
  expect(sent).toEqual([]);

  await page.getByTestId("delete-button").click();
  await page.getByTestId("delete-button").click();
  await expect(page.getByTestId("record-review")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Record" })).toBeVisible();
});

test("the review draws the path from the location fixes", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 40.735, longitude: -73.99, accuracy: 8 });
  await open(page, SIZES[2]);
  await page.getByRole("button", { name: "Record" }).click();
  await expect(page.getByTestId("record-timer")).toBeVisible({ timeout: slow(10_000) });
  // About 110 m north, then about 84 m east, as a phone's location would report it.
  await page.waitForTimeout(700);
  await context.setGeolocation({ latitude: 40.736, longitude: -73.99, accuracy: 8 });
  await page.waitForTimeout(700);
  await context.setGeolocation({ latitude: 40.736, longitude: -73.989, accuracy: 8 });
  await page.waitForTimeout(700);
  await page.getByRole("button", { name: "Stop" }).click();
  await expect(page.getByTestId("record-review")).toBeVisible({ timeout: slow(10_000) });
  await expect(page.getByTestId("count-location")).toHaveText("3");
  await expect(page.getByTestId("path-note")).toHaveText("195 m, from 3 location fixes. North is up.");
  expect((await page.getByTestId("path-line").getAttribute("points"))!.split(" ")).toHaveLength(3);
  await expectLayout(page);
});

test("the recorded picture is kept small: a set bitrate, not the browser's own", async ({ page }) => {
  await recordOptions(page);
  await open(page, SIZES[2]);
  await page.getByRole("button", { name: "Record" }).click();
  await expect(page.getByTestId("record-timer")).toBeVisible({ timeout: slow(10_000) });
  const asked = await page.evaluate(() => (window as unknown as { __recorderOptions: (MediaRecorderOptions | null)[] }).__recorderOptions);
  expect(asked.length).toBeGreaterThan(0);
  const options = asked[0] ?? {};
  // 1.2 Mbit/s at 720p: a ten-minute walk stays near 90 MB instead of the browser's 450.
  expect(options.videoBitsPerSecond).toBeGreaterThanOrEqual(1_100_000);
  expect(options.videoBitsPerSecond).toBeLessThanOrEqual(1_300_000);
  await page.getByRole("button", { name: "Stop" }).click();
  await expect(page.getByTestId("record-review")).toBeVisible({ timeout: slow(10_000) });
});
