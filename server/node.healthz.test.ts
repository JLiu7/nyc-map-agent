import { existsSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createRoot } from "./node";

describe("root app", () => {
  it("answers /healthz with JSON", async () => {
    const res = await createRoot().fetch(new Request("http://x/healthz"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("serves the SPA shell for a client route when dist exists", async () => {
    // `serveStatic` resolves its root against the working directory, which is the
    // repo root under vitest. CI checks out without dist, so the expectation
    // follows what is on disk rather than pretending the build always ran.
    const built = existsSync("dist/index.html");
    const res = await createRoot().fetch(new Request("http://x/some/client/route"));
    expect(res.status).toBe(built ? 200 : 404);
  });

  it("answers a missing build file with 404, not the SPA shell", async () => {
    const res = await createRoot().fetch(new Request("http://x/assets/MyDay-oldbuild.js"));
    expect(res.status).toBe(404);
  });

  it("lets browsers keep a hashed build file for a year", async () => {
    const file = existsSync("dist/assets") ? readdirSync("dist/assets").find((f) => f.endsWith(".js")) : undefined;
    if (!file) return;
    const res = await createRoot().fetch(new Request(`http://x/assets/${file}`));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
  });

  it("has the offline worker asked for again every time, so a new one reaches phones at once (#132)", async () => {
    if (!existsSync("dist/sw.js")) return;
    const res = await createRoot().fetch(new Request("http://x/sw.js"));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-cache");
  });
});
