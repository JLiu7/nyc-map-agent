import { beforeEach, describe, expect, it, vi } from "vitest";
import { recording } from "./fixture";
import {
  CHUNK_BYTES,
  FINISH,
  MAX_PART_BYTES,
  POST,
  PUT,
  assemble,
  clearUploads,
  getUpload,
  isSafeName,
  recordingName,
  sentToday,
  videoExt,
} from "./upload";
import { Context } from "hono";

/**
 * The recording upload routes (#223) as the recorder's contract describes them: the JSON first and
 * read before any byte is stored, the video in parts answered by byte count, then one whole file at
 * Octo. Octo is a fetch stub here; nothing leaves the test.
 */

const ENV = { OCTO_API_KEY: "octo_tmp_test", OCTO_WORKSPACE_ID: "ws-1", OCTO_BASE_URL: "https://octo.test" };
const mb = 1024 * 1024;

/** A fetch stub that answers each call from `responses` in turn, and keeps what it was asked. */
function stubFetch(...responses: Array<() => Response>) {
  const calls: Array<{ url: string; init: RequestInit; body: Record<string, unknown> }> = [];
  let i = 0;
  vi.stubGlobal("fetch", vi.fn((url: string, init: RequestInit = {}) => {
    calls.push({ url: String(url), init, body: JSON.parse(typeof init.body === "string" ? init.body : "{}") as Record<string, unknown> });
    const answer = responses[i++] ?? (() => Response.json({ id: `file-${i}` }));
    return Promise.resolve(answer());
  }));
  return calls;
}

const start = (body: unknown, env: Record<string, string | undefined> = ENV) =>
  POST(new Request("http://x/api/recordings", { method: "POST", body: JSON.stringify(body) }), env);

const withJson = (over: Parameters<typeof recording>[0] = {}, bytes: number | undefined = 4) => ({
  device: "Pixel 8",
  json: recording(over),
  ...(bytes === undefined ? {} : { bytes }),
});

/** A PUT reaches the handler through Hono (it reads :id), so the context is built the way Hono would. */
const put = async (id: string, from: number, body: Uint8Array) => PUT(context(`http://x/api/recordings/${id}/part?from=${from}`, id, body));

function context(url: string, id: string, body?: Uint8Array): Context {
  const request = new Request(url, { method: "PUT", body });
  return { req: { param: () => id, url, raw: request } } as unknown as Context;
}

const done = async (id: string, env: Record<string, string | undefined> = ENV, f: typeof fetch = fetch) =>
  FINISH(context(`http://x/api/recordings/${id}/finish`, id), env, f);

const json = <T>(r: Response) => r.json() as Promise<T>;

beforeEach(() => {
  clearUploads();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("POST /api/recordings", () => {
  it("reads the JSON, keeps nothing else, and offers 8 MB parts", async () => {
    const res = await start(withJson({}, 90 * mb));
    expect(res.status).toBe(200);
    const body = await json<{ uploadId: string; received: number; chunk: number }>(res);
    expect(body.chunk).toBe(CHUNK_BYTES);
    expect(body.received).toBe(0);
    const stored = getUpload(body.uploadId);
    expect(stored?.device).toBe("Pixel 8");
    expect(stored?.expected).toBe(90 * mb);
    expect(stored?.parts).toEqual([]);
  });

  it("starts the same way with the JSON sent alone", async () => {
    const res = await start({ json: recording({ video: undefined }) });
    expect(res.status).toBe(200);
    expect((await json<{ received: number }>(res)).received).toBe(0);
  });

  it("refuses a recording that does not parse, in one sentence, before storing a byte", async () => {
    const res = await start({ device: "Pixel 8", json: { v: 1, startedAt: "yesterday" }, bytes: 4 });
    expect(res.status).toBe(400);
    const body = await json<{ error: string }>(res);
    expect(body.error.startsWith("This recording could not be read:")).toBe(true);
    expect(body.error.split(".").filter(Boolean).length).toBe(1);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("refuses a video over the size limit with 413", async () => {
    const res = await start(withJson({}, 201 * mb));
    expect(res.status).toBe(413);
    expect((await json<{ error: string }>(res)).error).toContain("201 MB");
  });

  it("takes the limit from RECORDING_MAX_BYTES", async () => {
    const res = await start(withJson({}, 11 * mb), { ...ENV, RECORDING_MAX_BYTES: String(10 * mb) });
    expect(res.status).toBe(413);
  });

  it("refuses a sixth recording from one phone in a day with 429, and lets the next day through", async () => {
    const env = { ...ENV, RECORDING_PER_DAY: "2" };
    const a = await json<{ uploadId: string }>(await start(withJson({}, 2), env));
    await put(a.uploadId, 0, new Uint8Array([1, 2]));
    stubFetch();
    expect((await done(a.uploadId, env)).status).toBe(200);
    const b = await json<{ uploadId: string }>(await start(withJson({}, 2), env));
    await put(b.uploadId, 0, new Uint8Array([1, 2]));
    expect((await done(b.uploadId, env)).status).toBe(200);
    expect(sentToday("Pixel 8")).toBe(2);
    const third = await start(withJson({}, 2), env);
    expect(third.status).toBe(429);
    expect((await json<{ error: string }>(third)).error).toContain("already sent 2 recordings today");
  });

  it("does not count a start that is never finished, and counts by device", async () => {
    const env = { ...ENV, RECORDING_PER_DAY: "1" };
    await start(withJson({}, 2), env);
    await start(withJson({}, 2), env);
    expect(sentToday("Pixel 8")).toBe(0);
    // Another phone is another sender.
    expect((await start({ ...withJson({ device: "iPhone 15" }, 2), device: "iPhone 15" }, env)).status).toBe(200);
  });

  it("answers 400 when the body is not a JSON object, or names no device", async () => {
    expect((await start([1, 2, 3])).status).toBe(400);
    expect((await start({ json: recording({ device: "" }) })).status).toBe(400);
  });
});

describe("PUT /api/recordings/:id/part", () => {
  const started = async () => json<{ uploadId: string }>(await start(withJson({}, 6)));

  it("appends the exact range and answers with the new total", async () => {
    const { uploadId } = await started();
    expect(await json<{ received: number }>(await put(uploadId, 0, new Uint8Array([1, 2, 3])))).toEqual({ received: 3 });
    expect(await json<{ received: number }>(await put(uploadId, 3, new Uint8Array([4, 5, 6])))).toEqual({ received: 6 });
    expect(getUpload(uploadId)?.received).toBe(6);
  });

  it("refuses a part from the wrong offset with 409 and where it really is, so the phone resumes from there", async () => {
    const { uploadId } = await started();
    await put(uploadId, 0, new Uint8Array([1, 2, 3, 4]));
    // The phone thought its second part was the first. It asked for a resume and gets the truth.
    const stale = await put(uploadId, 0, new Uint8Array([1, 2, 3, 4]));
    expect(stale.status).toBe(409);
    expect(await json<{ received: number }>(stale)).toEqual({ received: 4 });
    // Resuming from the answer covers the rest of the file.
    expect(await json<{ received: number }>(await put(uploadId, 4, new Uint8Array([5, 6])))).toEqual({ received: 6 });
  });

  it("refuses a part over 16 MB and keeps what it had", async () => {
    const { uploadId } = await started();
    await put(uploadId, 0, new Uint8Array([1]));
    const tooBig = await put(uploadId, 1, new Uint8Array(MAX_PART_BYTES + 1));
    expect(tooBig.status).toBe(413);
    expect((await json<{ received: number }>(tooBig)).received).toBe(1);
  });

  it("answers 404 for an upload it has forgotten, 400 for no offset or an empty part", async () => {
    const { uploadId } = await started();
    expect((await put("gone", 0, new Uint8Array([1]))).status).toBe(404);
    expect((await PUT(context(`http://x/api/recordings/${uploadId}/part?from=`, uploadId, new Uint8Array([1])))).status).toBe(400);
    expect((await put(uploadId, 0, new Uint8Array(0))).status).toBe(400);
  });
});

describe("POST /api/recordings/:id/finish", () => {
  it("uploads the JSON and the joined video once each, and answers with the file name and size", async () => {
    const calls = stubFetch();
    const { uploadId } = await json<{ uploadId: string }>(await start(withJson({}, 6)));
    await put(uploadId, 0, new Uint8Array([1, 2, 3]));
    await put(uploadId, 3, new Uint8Array([4, 5, 6]));
    const res = await done(uploadId);
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ ok: true, file: "walk-20261116-140506.mp4", bytes: 6 });

    expect(calls).toHaveLength(2);
    // Both files reach Octo through its vault relay, because the key is a working key.
    expect(calls.every((c) => c.url === "https://octo.test/api/vault/proxy")).toBe(true);
    expect(calls[0].init.headers).toMatchObject({ "x-octo-target": "https://octo.test/api/files/upload" });
    // The JSON goes first: the walk's own record is what makes the video worth anything.
    expect(calls[0].body).toMatchObject({ workspaceId: "ws-1", name: "walk-20261116-140506-json.json", mimeType: "application/json", dataEncoding: "base64" });
    expect(JSON.parse(Buffer.from(String(calls[0].body.data), "base64").toString("utf8"))).toMatchObject({ v: 1, device: "Pixel 8" });
    expect(calls[1].body).toMatchObject({ workspaceId: "ws-1", name: "walk-20261116-140506.mp4", mimeType: "video/mp4" });
    expect([...Buffer.from(String(calls[1].body.data), "base64")]).toEqual([1, 2, 3, 4, 5, 6]);
    // Sent, and the parts are gone.
    expect(getUpload(uploadId)).toBeUndefined();
    expect(sentToday("Pixel 8")).toBe(1);
  });

  it("counts the recording as sent only when the store took it", async () => {
    stubFetch(() => new Response("nope", { status: 500 }));
    const { uploadId } = await json<{ uploadId: string }>(await start(withJson({}, 2)));
    await put(uploadId, 0, new Uint8Array([1, 2]));
    const res = await done(uploadId);
    expect(res.status).toBe(502);
    expect((await json<{ error: string }>(res)).error).toContain("still on the phone");
    expect(sentToday("Pixel 8")).toBe(0);
    expect(getUpload(uploadId)).toBeDefined();
  });

  it("answers 503, with no store configured, and keeps the bytes", async () => {
    const calls = stubFetch();
    const { uploadId } = await json<{ uploadId: string }>(await start(withJson({}, 2), {}));
    await put(uploadId, 0, new Uint8Array([1, 2]));
    const res = await done(uploadId, {});
    expect(res.status).toBe(503);
    expect(await json(res)).toEqual({ error: "no recording store" });
    expect(calls).toHaveLength(0);
    expect(getUpload(uploadId)?.received).toBe(2);
  });

  it("refuses parts that do not add up to the size the phone promised, with how far it got", async () => {
    stubFetch();
    const { uploadId } = await json<{ uploadId: string }>(await start(withJson({}, 6)));
    await put(uploadId, 0, new Uint8Array([1, 2, 3]));
    const res = await done(uploadId);
    expect(res.status).toBe(409);
    expect((await json<{ received: number }>(res)).received).toBe(3);
  });

  it("answers 404 for an upload it has forgotten", async () => {
    stubFetch();
    expect((await done("gone")).status).toBe(404);
  });
});

describe("names and names that try to get out of the folder", () => {
  it("takes the walk's name from its start time, not from anything the caller typed", () => {
    expect(recordingName(Date.parse("2026-11-16T14:05:06Z"), "mp4")).toBe("walk-20261116-140506.mp4");
    expect(recordingName(Date.parse("2026-11-16T14:05:06Z"), "json", "-json")).toBe("walk-20261116-140506-json.json");
    expect(recordingName(Number.NaN, "mp4")).toBe("walk-unknown.mp4");
  });

  it("keeps only a known extension from the file name the JSON carries", () => {
    expect(videoExt("../../etc/passwd")).toBe("mp4");
    expect(videoExt("../../evil.html")).toBe("mp4");
    expect(videoExt("clip.MOV")).toBe("mov");
    expect(videoExt("walk.webm")).toBe("webm");
    expect(videoExt(null)).toBe("mp4");
  });

  it("accepts only the names this code makes, so a name that climbs is refused at the store", () => {
    for (const bad of ["../secret.mp4", "walk-../../x.mp4", "a/b.mp4", "walk-20261116-140506.mp4/../x", ".hidden", "walk-20261116-140506.php", "walk-20261116-140506.mp4\0"]) {
      expect(isSafeName(bad)).toBe(false);
    }
    expect(isSafeName("walk-20261116-140506.mp4")).toBe(true);
    expect(isSafeName("walk-20261116-140506-json.json")).toBe(true);
  });

  it("a recording whose video name tries to climb is stored under a derived name", async () => {
    const calls = stubFetch();
    const { uploadId } = await json<{ uploadId: string }>(await start(withJson({ video: { file: "../../../etc/cron.d/evil.mp4", startedAt: 0 } }, 1)));
    await put(uploadId, 0, new Uint8Array([7]));
    expect(await json<{ file: string }>(await done(uploadId))).toMatchObject({ file: "walk-20261116-140506.mp4" });
    expect(String(calls[1].body.name)).toBe("walk-20261116-140506.mp4");
  });
});

describe("assemble", () => {
  it("joins the parts in the order they arrived", async () => {
    const { uploadId } = await json<{ uploadId: string }>(await start(withJson({}, 6)));
    await put(uploadId, 0, new Uint8Array([1, 2]));
    await put(uploadId, 2, new Uint8Array([3, 4, 5, 6]));
    expect([...assemble(getUpload(uploadId)!)]).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
