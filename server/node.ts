/**
 * Node entry: the API plus the built SPA from dist/, on one port.
 *
 *   pnpm build && pnpm start        (PORT, default 8080; OCTO_* in the environment)
 */
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { app as api } from "./app";

/** Exported so tests can exercise routing without binding a port. */
export function createRoot(): Hono {
  const root = new Hono();
  // Before the SPA fallback, so a health check never receives index.html.
  root.get("/healthz", (c) => c.json({ ok: true }));
  root.route("/", api);
  // Build files carry a content hash in their name, so a phone can keep them until the name changes.
  root.use("/assets/*", async (c, next) => {
    await next();
    if (c.res.status === 200) c.res.headers.set("cache-control", "public, max-age=31536000, immutable");
  });
  // The offline worker must reach phones as soon as it changes (#132): no copy kept by the browser or Cloudflare's edge
  // without asking again. Without this header Cloudflare kept it four hours.
  root.use("/sw.js", async (c, next) => {
    await next();
    if (c.res.status === 200) c.res.headers.set("cache-control", "no-cache");
  });
  root.use("/*", serveStatic({ root: "./dist" }));
  // A build file that is not there (an older build's chunk) is a 404, not the SPA shell served as script.
  root.get("/assets/*", (c) => c.notFound());
  // Client-side routes fall back to the SPA shell.
  root.get("*", serveStatic({ path: "./dist/index.html" }));
  return root;
}

if (process.env.NODE_ENV !== "test") {
  const port = Number(process.env.PORT ?? 8080);
  serve({ fetch: createRoot().fetch, port }, () => console.log(`nyc-map-agent on :${port}`));
}
