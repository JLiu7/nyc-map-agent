import { beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../../app";
import { recording } from "./fixture";
import { CHUNK_BYTES, clearUploads } from "./upload";

/**
 * The routes through the real app, on both prefixes, so the mount in server/app.ts and the OpenAPI
 * bodies are exercised the way a phone reaches them. Octo is a stub; nothing leaves the test.
 */
const body = (bytes = 4) => ({ device: "Pixel 8", json: recording(), bytes });

beforeEach(() => {
  clearUploads();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("the recording routes in the app", () => {
  it("starts an upload on /api/recordings and /api/v1/recordings alike", async () => {
    for (const path of ["/api/recordings", "/api/v1/recordings"]) {
      const res = await app.request(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body()) });
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ received: 0, chunk: CHUNK_BYTES });
    }
  });

  it("reads the raw part bytes through the app and answers with the total", async () => {
    const started = await app.request("/api/recordings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body(4)) });
    const { uploadId } = (await started.json()) as { uploadId: string };
    const put = await app.request(`/api/recordings/${uploadId}/part?from=0`, { method: "PUT", body: new Uint8Array([1, 2, 3, 4]) });
    expect(put.status).toBe(200);
    expect(await put.json()).toEqual({ received: 4 });
    // A stale offset is answered with where the server really is.
    const stale = await app.request(`/api/recordings/${uploadId}/part?from=0`, { method: "PUT", body: new Uint8Array([1]) });
    expect(stale.status).toBe(409);
    expect(await stale.json()).toEqual({ received: 4 });
  });

  it("finishes to the fake Octo, and says 503 with no store configured", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(Response.json({ id: "f" }))));
    vi.stubEnv("OCTO_API_KEY", "octo_tmp_test");
    vi.stubEnv("OCTO_WORKSPACE_ID", "ws-1");
    vi.stubEnv("OCTO_BASE_URL", "https://octo.test");
    const started = await app.request("/api/recordings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body(2)) });
    const { uploadId } = (await started.json()) as { uploadId: string };
    await app.request(`/api/recordings/${uploadId}/part?from=0`, { method: "PUT", body: new Uint8Array([1, 2]) });
    const finished = await app.request(`/api/recordings/${uploadId}/finish`, { method: "POST" });
    expect(finished.status).toBe(200);
    expect(await finished.json()).toEqual({ ok: true, file: "walk-20261116-140506.mp4", bytes: 2 });

    vi.stubEnv("OCTO_API_KEY", "");
    const second = await app.request("/api/v1/recordings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body(2)) });
    const { uploadId: other } = (await second.json()) as { uploadId: string };
    const refused = await app.request(`/api/v1/recordings/${other}/finish`, { method: "POST" });
    expect(refused.status).toBe(503);
    expect(await refused.json()).toEqual({ error: "no recording store" });
  });

  it("documents all three routes under /api/v1, with the legacy alias beside them", async () => {
    const spec = (await (await app.request("/api/v1/openapi.json")).json()) as { paths: Record<string, Record<string, unknown>> };
    for (const p of ["/api/v1/recordings", "/api/v1/recordings/{id}/part", "/api/v1/recordings/{id}/finish"]) expect(Object.keys(spec.paths)).toContain(p);
    for (const p of ["/api/recordings", "/api/recordings/{id}/part", "/api/recordings/{id}/finish"]) {
      expect(Object.values(spec.paths[p])[0]).toMatchObject({ deprecated: true });
    }
  });
});
