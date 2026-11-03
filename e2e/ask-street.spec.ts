import { expect, test } from "@playwright/test";
import { mockNetwork } from "./mocks";
import { slow } from "./slow";

const nd = (evs: unknown[]) => evs.map((e) => JSON.stringify(e)).join("\n") + "\n";
const shots = process.env.QA_SHOTS_DIR;
const shot = async (page: import("@playwright/test").Page, name: string) => {
  if (shots) await page.screenshot({ path: `${shots}/ask-street-${name}.png` });
};

test("street level: Ask opens a compact sheet and sends the spot as context; hands-free listens and speaks", async ({ page }) => {
  // Fake Web Speech: one recognized phrase per start(); synthesis ends right away.
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    (w as { __said: string[] }).__said = [];
    class Rec {
      onresult: ((e: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      onstart: (() => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      start() {
        (w as { __starts?: number }).__starts = ((w as { __starts?: number }).__starts ?? 0) + 1;
        this.onstart?.();
        // A mid-sentence pause of 800 ms must not end the turn.
        const a = Object.assign([{ transcript: "which exit" }], { isFinal: true });
        const b = Object.assign([{ transcript: " for the 1 train" }], { isFinal: true });
        setTimeout(() => this.onresult?.({ resultIndex: 0, results: [a] }), 300);
        setTimeout(() => this.onresult?.({ resultIndex: 1, results: [a, b] }), 1100);
      }
      stop() { this.onend?.(); }
      abort() { this.onend = null; }
    }
    w.webkitSpeechRecognition = Rec;
    w.SpeechRecognition = Rec;
    const synth = {
      speaking: false, paused: false, pause() {}, resume() {},
      cancel() {}, getVoices: () => [], addEventListener() {}, removeEventListener() {},
      speak(u: { text: string; onstart?: () => void; onend?: () => void }) {
        (w as { __said: string[] }).__said.push(u.text);
        u.onstart?.();
        setTimeout(() => u.onend?.(), 400);
      },
    };
    Object.defineProperty(window, "speechSynthesis", { value: synth, configurable: true });
    w.SpeechSynthesisUtterance = class { text: string; constructor(t: string) { this.text = t; } };
  });
  await mockNetwork(page);
  const bodies: Array<{ context?: Record<string, unknown> }> = [];
  await page.route("**/api/agent", async (route) => {
    bodies.push(route.request().postDataJSON() as { context?: Record<string, unknown> });
    await route.fulfill({ contentType: "application/x-ndjson", body: nd([{ type: "text", text: "Use the stairs at 7 Av and W 43 St for the 1 train." }, { type: "done", model: "mock", usage: { inputTokens: 0, outputTokens: 0 } }]) });
  });

  await page.goto("/?flags=-agentHome");
  await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible();
  await page.getByTestId("view-switcher").getByRole("button", { name: "Street", exact: true }).click();
  await expect(page.getByTestId("view-switcher").getByRole("button", { name: "Top", exact: true })).toBeVisible();
  await shot(page, "1-button");

  await page.getByRole("button", { name: "Ask about this spot" }).click();
  const sheet = page.getByTestId("ask-compact");
  await expect(sheet).toBeVisible();
  // Non-modal: the street-level controls stay usable behind it.
  await expect(page.getByTestId("view-switcher").getByRole("button", { name: "Top", exact: true })).toBeEnabled();
  await sheet.getByLabel("Ask the assistant").fill("which exit should I use?");
  await sheet.getByRole("button", { name: "Send" }).click();
  await expect(sheet.getByText("Use the stairs at 7 Avenue and West 43 Street for the 1 train.")).toBeVisible();
  expect(bodies[0].context).toMatchObject({ source: "street-view" });
  expect(typeof bodies[0].context?.lon).toBe("number");
  expect(typeof bodies[0].context?.heading).toBe("number");
  await shot(page, "2-answer");

  await sheet.getByRole("button", { name: "Hands-free" }).click();
  await expect(sheet.getByRole("button", { name: "Hands-free" })).toHaveAttribute("aria-pressed", "true");
  await expect(sheet.getByTestId("voice-status")).toContainText("Listening");
  await shot(page, "3-listening");
  await expect.poll(() => bodies.length, { timeout: slow(10_000) }).toBeGreaterThanOrEqual(2);
  expect((bodies[1] as { messages: Array<{ content: string }> }).messages.at(-1)?.content).toBe("which exit for the 1 train");
  await expect.poll(() => page.evaluate(() => (window as unknown as { __said: string[] }).__said.length)).toBeGreaterThanOrEqual(1);
  // One question per tap: once the agent takes it, hands-free ends and the mic does not reopen.
  await expect(sheet.getByRole("button", { name: "Hands-free" })).toHaveAttribute("aria-pressed", "false");
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => (window as unknown as { __starts?: number }).__starts ?? 0)).toBe(1);
  await shot(page, "4-handsfree-done");
  await sheet.getByRole("button", { name: "Close Ask" }).click();
  await expect(sheet).toBeHidden();
});
