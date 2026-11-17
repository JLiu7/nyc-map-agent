import { readFileSync } from "node:fs";
import type { BrowserContext, Page } from "@playwright/test";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8");

/** Offline basemap: a blank vector style so MapLibre still builds its canvas and our data layers. */
const STYLE = JSON.stringify({
  version: 8,
  sources: {},
  layers: [{ id: "background", type: "background", paint: { "background-color": "#e5e7eb" } }],
});

/**
 * Every request leaves through here: our /api from fixtures (trimmed real Octo
 * output), the basemap style from STYLE, everything else outside is refused,
 * so the test is deterministic and never touches an upstream. Pass the browser context instead of the
 * page when the offline service worker is allowed: only context routes see the worker's own requests.
 *
 * /api/recordings is left alone: the recorder's Send (#223) is checked against a stub each spec writes
 * itself (e2e/record-send.spec.ts), and Playwright tries the routes in the order they were added, so a
 * catch-all here would answer the Send first and the spec's stub would never be asked.
 */
export async function mockNetwork(page: Page | BrowserContext): Promise<void> {
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    const local = url.hostname === "localhost";
    const json = (body: string, status = 200) => route.fulfill({ status, contentType: "application/json", body });
    if (local && url.pathname === "/api/areas") return json(fixture("areas-nta"));
    if (local && url.pathname === "/api/aggregate") {
      return json(fixture(url.searchParams.get("dataset") === "crashes" ? "aggregate-crashes" : "aggregate-noise"));
    }
    if (local && url.pathname === "/api/sources") return json(JSON.stringify({ sources: [] }));
    if (local && url.pathname.startsWith("/api/recordings")) return route.fallback();
    if (local && url.pathname.startsWith("/api/")) return json(JSON.stringify({ error: "not_found" }), 404);
    if (local) return route.continue();
    if (url.hostname === "tiles.openfreemap.org" && url.pathname.startsWith("/styles/")) return json(STYLE);
    if (url.hostname === "geosearch.planninglabs.nyc") return json(JSON.stringify({ features: [] }));
    if (url.hostname === "graph.mapillary.com") return json(JSON.stringify({ data: [] }));
    return route.abort("blockedbyclient");
  });
}
