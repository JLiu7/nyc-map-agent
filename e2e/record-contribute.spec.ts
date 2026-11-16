import { expect, test, type Page } from "@playwright/test";
import { expectLayout, SIZES } from "./layout";
import { mockNetwork } from "./mocks";
import { slow } from "./slow";

/**
 * The recorder work on #223, as scenarios (docs/specs/RECORDER_CONTRIBUTIONS.md). Each one is skipped
 * while its control is not on the page and runs as soon as it is, so a pull request that adds a piece
 * is checked without anyone switching a test on. The fake camera lists two devices and notes which
 * one each request asks for.
 */
const fakeCameras = (page: Page, count: number) =>
  page.addInitScript((n) => {
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 240;
    const g = canvas.getContext("2d")!;
    let f = 0;
    setInterval(() => { g.fillStyle = `hsl(${(f++ * 7) % 360} 60% 50%)`; g.fillRect(0, 0, 320, 240); }, 50);
    const asked: unknown[] = [];
    (window as unknown as { __cameraAsked: unknown[] }).__cameraAsked = asked;
    const md = navigator.mediaDevices ?? ({} as MediaDevices);
    md.getUserMedia = (c?: MediaStreamConstraints) => { asked.push(c?.video ?? null); return Promise.resolve(canvas.captureStream(20)); };
    md.enumerateDevices = () => Promise.resolve(Array.from({ length: n }, (_, i) => ({ deviceId: `cam${i}`, groupId: "g", kind: "videoinput", label: i ? "Back camera" : "Front camera", toJSON: () => ({}) }) as MediaDeviceInfo));
    if (!navigator.mediaDevices) Object.defineProperty(navigator, "mediaDevices", { value: md });
  }, count);

const open = async (page: Page, cameras = 2, size = SIZES[2]) => {
  await page.setViewportSize({ width: size.width, height: size.height });
  await mockNetwork(page);
  await fakeCameras(page, cameras);
  await page.goto("/record");
  await expect(page.getByTestId("record-page")).toBeVisible({ timeout: slow(15_000) });
};
/** Past the first-time screens, if this build has them, to the live camera. */
const toCamera = async (page: Page) => {
  const intro = page.getByTestId("record-intro");
  if (await intro.count()) await page.getByTestId("intro-agree").click();
  await expect.poll(() => page.getByTestId("record-preview").evaluate((v: HTMLVideoElement) => v.videoWidth), { timeout: slow(10_000) }).toBeGreaterThan(0);
};
const built = async (page: Page, testId: string) => (await page.getByTestId(testId).count()) > 0;

test("switch camera: a second camera can be chosen, and one camera shows no control", async ({ page }) => {
  await open(page, 2);
  await toCamera(page);
  test.skip(!(await built(page, "switch-camera")), "piece 1 of #223 is not built yet");
  const before = await page.evaluate(() => (window as unknown as { __cameraAsked: unknown[] }).__cameraAsked.length);
  await page.getByTestId("switch-camera").click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __cameraAsked: unknown[] }).__cameraAsked.length), { timeout: slow(5_000) }).toBeGreaterThan(before);
  const last = await page.evaluate(() => JSON.stringify((window as unknown as { __cameraAsked: unknown[] }).__cameraAsked.at(-1)));
  expect(last).toMatch(/cam[01]/);
  for (const size of SIZES) { await page.setViewportSize({ width: size.width, height: size.height }); await expectLayout(page); }

  await page.context().clearCookies();
  const one = await page.context().newPage();
  await open(one, 1);
  await toCamera(one);
  await expect(one.getByTestId("switch-camera")).toHaveCount(0);
});

test("switch camera: the chosen camera is named on screen and opened again on the next visit", async ({ page }) => {
  await open(page, 2);
  await toCamera(page);
  test.skip(!(await built(page, "switch-camera")), "piece 1 of #223 is not built yet");
  await page.getByTestId("switch-camera").click();
  await expect(page.getByTestId("camera-name")).toHaveText(/(Front|Back) camera/, { timeout: slow(5_000) });
  const chosen = (await page.getByTestId("camera-name").textContent())!.startsWith("Back") ? "cam1" : "cam0";
  await page.reload();
  await expect(page.getByTestId("record-page")).toBeVisible({ timeout: slow(15_000) });
  await toCamera(page);
  const first = await page.evaluate(() => JSON.stringify((window as unknown as { __cameraAsked: unknown[] }).__cameraAsked[0]));
  expect(first).toContain(chosen);
  await expect(page.getByTestId("camera-name")).toHaveText(chosen === "cam1" ? "Back camera" : "Front camera");
  // The control is for before recording: it steps away while a recording runs.
  await page.getByRole("button", { name: "Record", exact: true }).click();
  await expect(page.getByTestId("record-timer")).toBeVisible({ timeout: slow(10_000) });
  await expect(page.getByTestId("switch-camera")).toHaveCount(0);
});

test("first-time screens: shown once before the camera, and a control brings them back", async ({ page }) => {
  await open(page, 2);
  test.skip(!(await built(page, "record-intro")), "piece 2 of #223 is not built yet");
  await expect(page.getByRole("button", { name: "Record", exact: true })).toHaveCount(0);
  for (const size of SIZES) { await page.setViewportSize({ width: size.width, height: size.height }); await expectLayout(page); }
  await page.getByTestId("intro-agree").click();
  await expect(page.getByTestId("record-intro")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Record", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("record-page")).toBeVisible({ timeout: slow(15_000) });
  await expect(page.getByTestId("record-intro")).toHaveCount(0);
  await page.getByTestId("intro-open").click();
  await expect(page.getByTestId("record-intro")).toBeVisible();
});

test("up or down: a Stairs tap asks which way, and the answer is in the recording", async ({ page }) => {
  await open(page, 2);
  await toCamera(page);
  await page.getByRole("button", { name: "Record", exact: true }).click();
  await expect(page.getByTestId("record-timer")).toBeVisible({ timeout: slow(10_000) });
  await page.getByTestId("mark-stairs").click();
  test.skip(!(await built(page, "mark-up")), "piece 3 of #223 is not built yet");
  await expect(page.getByTestId("mark-down")).toBeVisible();
  await expectLayout(page);
  await page.getByTestId("mark-down").click();
  await expect(page.getByTestId("mark-up")).toHaveCount(0);
  await page.getByRole("button", { name: "Stop" }).click();
  await expect(page.getByTestId("record-review")).toBeVisible({ timeout: slow(10_000) });
  const href = await page.getByTestId("file-json").getAttribute("href");
  const text = await page.evaluate(async (u) => (await fetch(u!)).text(), href);
  const saved = JSON.parse(text) as { marks: { kind: string; dir?: string }[] };
  expect(saved.marks.filter((m) => m.kind === "stairs").map((m) => m.dir)).toEqual(["down"]);
});

test("send: the recording's data goes up first, the screen says it was sent, and a refusal keeps the recording", async ({ page }) => {
  const bodies: string[] = [];
  let refuse = false;
  await page.route("**/api/recordings**", async (route) => {
    bodies.push(route.request().headers()["content-type"] ?? "");
    await route.fulfill(refuse ? { status: 413, contentType: "application/json", body: JSON.stringify({ error: "too large" }) } : { status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, id: "walk-1", confirmed: 1e12 }) });
  });
  await open(page, 2);
  await toCamera(page);
  await page.getByRole("button", { name: "Record", exact: true }).click();
  await expect(page.getByTestId("record-timer")).not.toHaveText("0:00", { timeout: slow(10_000) });
  await page.getByRole("button", { name: "Stop" }).click();
  await expect(page.getByTestId("record-review")).toBeVisible({ timeout: slow(10_000) });
  test.skip(!(await built(page, "review-send")), "piece 4 of #223 is not built yet");
  for (const size of SIZES) { await page.setViewportSize({ width: size.width, height: size.height }); await expectLayout(page); }

  refuse = true;
  await page.getByTestId("review-send").click();
  await expect(page.getByTestId("send-status")).toContainText(/not sent|could not|too large|try again/i, { timeout: slow(15_000) });
  await expect(page.getByTestId("file-json")).toBeVisible();

  refuse = false;
  bodies.length = 0;
  await page.getByTestId("review-send").click();
  await expect(page.getByTestId("send-status")).toContainText(/sent/i, { timeout: slow(20_000) });
  expect(bodies.length).toBeGreaterThan(0);
  expect(bodies[0]).toContain("json");
});
