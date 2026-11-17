import { expect, test, type Page } from "@playwright/test";
import { expectLayout, SIZES } from "./layout";
import { mockNetwork } from "./mocks";
import { slow } from "./slow";

/**
 * The Send on the review screen (#223, piece 4), against a stubbed server that
 * answers the three routes the server track builds: POST /api/recordings with
 * the data, PUT .../part with bytes, POST .../finish. No server code is
 * reached: e2e/mocks.ts leaves /api/recordings to the stub below, so every
 * other API answer is the shared fixture set as usual.
 *
 * The fake camera is a canvas whose colour changes every frame, as in
 * record.spec.ts, so the phone-less test browser records a real video.
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
    }, 20);
    const md = navigator.mediaDevices ?? ({} as MediaDevices);
    md.getUserMedia = () => Promise.resolve(canvas.captureStream(30));
    if (!navigator.mediaDevices) Object.defineProperty(navigator, "mediaDevices", { value: md });
  });

interface Stub {
  /** Every request the page made to the recording routes, in order. */
  calls: { method: string; path: string; from: number | null; bytes: number; dataFirst: boolean }[];
  /** What the server holds, in bytes of video. */
  held: number;
  /** Set to a status to refuse everything with that status; 0 to accept. */
  refuse: number;
  /** Answer this numbered part with 409 and the count the server really has. */
  conflictAt: number | null;
  chunk: number;
}

/** The three routes the server track builds, as a stub. */
async function stubServer(page: Page, chunk = 20_000): Promise<Stub> {
  const stub: Stub = { calls: [], held: 0, refuse: 0, conflictAt: null, chunk };
  let parts = 0;
  await page.route("**/api/recordings**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const json = (status: number, body: unknown) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    const method = req.method();
    const from = url.searchParams.has("from") ? Number(url.searchParams.get("from")) : null;
    const body = req.postDataBuffer();
    stub.calls.push({ method, path: url.pathname, from, bytes: body?.byteLength ?? 0, dataFirst: !!body && body.toString("utf8").startsWith("{") });
    if (stub.refuse) return json(stub.refuse, { error: "This recording is larger than a recording may be." });
    if (method === "POST" && url.pathname === "/api/recordings") {
      stub.held = 0;
      parts = 0;
      return json(200, { uploadId: "walk-1", received: 0, chunk: stub.chunk });
    }
    if (method === "PUT" && url.pathname.endsWith("/part")) {
      const size = body?.byteLength ?? 0;
      parts++;
      // The server already holds more than this part's start, as after an answer that never arrived.
      if (stub.conflictAt === parts) {
        stub.held = (from ?? 0) + Math.min(size, stub.chunk);
        return json(409, { received: stub.held, error: "This part was already stored." });
      }
      stub.held = (from ?? 0) + size;
      return json(200, { received: stub.held });
    }
    if (method === "POST" && url.pathname.endsWith("/finish")) return json(200, { ok: true, file: "walk-2026-11-14-170512.json", bytes: stub.held });
    return json(404, { error: "not_found" });
  });
  return stub;
}

/** Opens the recorder with the stub in place and returns the stub, so a test can set it to refuse. */
const open = async (page: Page): Promise<Stub> => {
  await page.setViewportSize({ width: SIZES[2].width, height: SIZES[2].height });
  await mockNetwork(page);
  const stub = await stubServer(page);
  await fakeCamera(page);
  await page.goto("/record");
  await expect(page.getByTestId("record-page")).toBeVisible({ timeout: slow(15_000) });
  await expect.poll(() => page.getByTestId("record-preview").evaluate((v: HTMLVideoElement) => v.videoWidth), { timeout: slow(10_000) }).toBeGreaterThan(0);
  return stub;
};

/**
 * A cut small enough to make at least three parts of the video the browser really recorded. It goes to the
 * page before Send is pressed, as the server's own answer would.
 */
async function partCut(page: Page): Promise<number> {
  await page.getByTestId("save-button").click();
  const href = (await page.getByTestId("file-video").getAttribute("href"))!;
  const size = await page.evaluate(async (u) => (await (await fetch(u)).blob()).size, href);
  return Math.max(1_000, Math.floor(size / 3));
}

/** Record three seconds with one mark, then stop, leaving the review screen up. */
async function recordAndStop(page: Page) {
  await page.getByRole("button", { name: "Record", exact: true }).click();
  await expect(page.getByTestId("record-timer")).toBeVisible({ timeout: slow(10_000) });
  await page.getByTestId("mark-sign").click();
  await expect(page.getByTestId("record-timer")).toHaveText(/0:0[3-9]|0:[1-9]/, { timeout: slow(25_000) });
  await page.getByRole("button", { name: "Stop" }).click();
  await expect(page.getByTestId("record-review")).toBeVisible({ timeout: slow(10_000) });
}


test("Send: the data goes up first, then the video in parts, and nothing at all before the button", async ({ page }) => {
  const stub = await open(page);
  await recordAndStop(page);
  // Cuts are decided on the video the browser really recorded: on a slow machine a fixed chunk may be bigger than it.
  stub.chunk = await partCut(page);
  await expectLayout(page);

  // The review can sit there as long as it likes: no upload starts until the tap.
  await page.waitForTimeout(1500);
  expect(stub.calls).toEqual([]);

  await page.getByTestId("review-send").click();
  await expect(page.getByTestId("send-status")).toContainText(/^Sent/, { timeout: slow(60_000) });

  expect(stub.calls[0].method).toBe("POST");
  expect(stub.calls[0].path).toBe("/api/recordings");
  // The body starts with "{" , so what went up first is the recording's data, not video bytes.
  expect(stub.calls[0].dataFirst).toBe(true);
  expect(stub.calls.some((c) => c.path === "/api/recordings/walk-1/finish")).toBe(true);

  const parts = stub.calls.filter((c) => c.method === "PUT");
  expect(parts.length).toBeGreaterThan(1);
  parts.forEach((p, i) => expect(p.from).toBe(i === 0 ? 0 : parts[i - 1].from! + parts[i - 1].bytes));
  expect(parts.every((p) => p.bytes <= stub.chunk)).toBe(true);

  // Sent does not take the recording away: it is still here, and still fits the four sizes.
  await expect(page.getByTestId("record-review")).toBeVisible();
  for (const size of SIZES) {
    await page.setViewportSize({ width: size.width, height: size.height });
    await expectLayout(page);
  }
});

test("Send: a 409 is answered from the server's own byte count, not by sending the whole video again", async ({ page }) => {
  const stub = await open(page);
  await recordAndStop(page);
  const chunk = await partCut(page);
  stub.chunk = chunk;
  // The second part arrives when the server already holds more than its start.
  stub.conflictAt = 2;
  await page.getByTestId("review-send").click();
  await expect(page.getByTestId("send-status")).toContainText(/^Sent/, { timeout: slow(60_000) });

  const parts = stub.calls.filter((c) => c.method === "PUT");
  // The third put starts where the 409 said the server really is, not where the client thought.
  expect(parts[1].from).toBe(chunk);
  expect(parts[2].from).toBe(2 * chunk);
  // Nothing went up before the first part twice, and the run ends with the finish.
  expect(stub.calls.at(-1)!.path).toBe("/api/recordings/walk-1/finish");
});

test("Send: a refusal says why and keeps the recording, which can then be sent", async ({ page }) => {
  const stub = await open(page);
  await recordAndStop(page);
  stub.refuse = 413;
  await page.getByTestId("review-send").click();
  await expect(page.getByTestId("send-status")).toContainText(/^Not sent/, { timeout: slow(30_000) });
  await expect(page.getByTestId("send-status")).toContainText(/larger than a recording may be/);
  // Still on screen, with Save beside it, and the server holds nothing.
  await expect(page.getByTestId("record-review")).toBeVisible();
  await expect(page.getByTestId("save-button")).toBeVisible();
  expect(stub.held).toBe(0);

  stub.refuse = 0;
  await page.getByTestId("review-send").click();
  await expect(page.getByTestId("send-status")).toContainText(/^Sent/, { timeout: slow(60_000) });
});

test("Send: once the day's five are used the screen says so and posts nothing", async ({ page }) => {
  const stub = await open(page);
  // Five already sent today from this device. The page keeps them under session.ts deviceName's reading of the
  // browser, so this test learns that name from the page instead of guessing the user agent's.
  await page.getByRole("button", { name: "Record", exact: true }).click();
  await expect(page.getByTestId("record-timer")).not.toHaveText("0:00", { timeout: slow(15_000) });
  await page.getByRole("button", { name: "Stop" }).click();
  await expect(page.getByTestId("record-review")).toBeVisible({ timeout: slow(10_000) });
  await page.getByTestId("save-button").click();
  await expect(page.getByTestId("file-json")).toHaveAttribute("download", /^walk-/);
  const href = (await page.getByTestId("file-json").getAttribute("href"))!;
  const device = (JSON.parse(await page.evaluate(async (u) => (await fetch(u)).text(), href)) as { device: string }).device;
  await page.evaluate((d) => localStorage.setItem(`recorder.sent.${d}`, JSON.stringify({ day: new Date().toISOString().slice(0, 10), sent: 5 })), device);

  // A reload starts a fresh review; the count stays on the device.
  await page.reload();
  await expect(page.getByTestId("record-page")).toBeVisible({ timeout: slow(15_000) });
  await expect.poll(() => page.getByTestId("record-preview").evaluate((v: HTMLVideoElement) => v.videoWidth), { timeout: slow(10_000) }).toBeGreaterThan(0);
  await recordAndStop(page);
  await expect(page.getByTestId("send-limit")).toContainText(/today's recordings have been sent/i);
  await page.getByTestId("review-send").click();
  await expect(page.getByTestId("send-status")).toContainText(/^Not sent/, { timeout: slow(10_000) });
  expect(stub.calls).toEqual([]);
  await expect(page.getByTestId("save-button")).toBeVisible();
});
