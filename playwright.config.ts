import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 4319);

/** Smoke e2e: vite preview of an Octo-mode build; /api and every outside host are fixture-mocked in e2e/mocks.ts. */
export default defineConfig({
  testDir: "e2e",
  timeout: process.env.CI ? 120_000 : 60_000,
  retries: process.env.CI ? 1 : 0,
  // The org-pool runners share one 12-core VPS with other CI jobs, and SwiftShader draws the map on
  // the CPU. Six workers there left the map canvas missing its 5 s wait on every run (#31).
  workers: process.env.CI ? 2 : undefined,
  expect: { timeout: process.env.CI ? 15_000 : 5_000 },
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "off",
    launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm exec vite preview --outDir .e2e-build --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
  },
});
