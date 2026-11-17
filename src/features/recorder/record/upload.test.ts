import { afterEach, describe, expect, it, vi } from "vitest";
import type { Recording } from "../format";
import { addCount, CHUNK_BYTES, checkUpload, chunkPlan, MAX_BYTES, PER_DAY, readCount, safeName, send, uploadName } from "./upload";

const T = new Date(2026, 10, 14, 17, 5, 12).getTime();
const rec = (o: Partial<Recording> = {}): Recording => ({ v: 1, startedAt: T, device: "iPhone", motion: [], heading: [], gps: [], baro: [], steps: [], marks: [], ...o });

/** A seeded stream of whole numbers below n, so a rewrite of chunkPlan can be run against the same inputs. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

describe("chunkPlan", () => {
  it("cuts a file into pieces of the chunk size, in order, with nothing missing or doubled", () => {
    expect(chunkPlan(10, 4)).toEqual([[0, 4], [4, 8], [8, 10]]);
    expect(chunkPlan(8, 4)).toEqual([[0, 4], [4, 8]]);
  });

  it("starts at the confirmed byte and never past the end, whatever it is told", () => {
    for (let seed = 1; seed <= 80; seed++) {
      const r = seeded(seed), size = Math.floor(r() * 900_000), chunk = 1 + Math.floor(r() * 70_000), confirmed = Math.floor(r() * (size + 300_000));
      const plan = chunkPlan(size, chunk, confirmed);
      expect(plan.every(([from, to]) => from >= 0 && to > from && to - from <= chunk)).toBe(true);
      expect(plan.reduce((sum, [from, to]) => sum + (to - from), 0) + Math.min(Math.max(confirmed, 0), size)).toBe(size);
      const first = plan.length ? plan[0][0] : size;
      expect(first).toBe(Math.min(Math.max(confirmed, 0), size));
    }
  });

  it("has one piece at a time when asked from a part's edge, which is how the caller resumes", () => {
    const plan = chunkPlan(1_000, 300, 450);
    expect(plan[0]).toEqual([450, 750]);
    expect(chunkPlan(1_000, CHUNK_BYTES)).toEqual([[0, 1_000]]);
  });
});

describe("checkUpload", () => {
  const limits = { maxBytes: MAX_BYTES, perDay: PER_DAY };

  it("lets a recording inside both limits go", () => {
    expect(checkUpload({ bytes: 12_000, sentToday: 0 }, limits)).toBeNull();
    expect(checkUpload({ bytes: MAX_BYTES, sentToday: PER_DAY - 1 }, limits)).toBeNull();
  });

  it("refuses over the size limit with its own size and the limit, in one sentence", () => {
    const why = checkUpload({ bytes: MAX_BYTES + 1, sentToday: 0 }, limits)!;
    expect(why).toContain("200 MB");
    // The file's own size, so the person can see how far over it is.
    expect(why).toMatch(/^This recording is 200\.0 MB, more than the 200 MB/);
    expect(why).not.toContain("\n");
  });

  it("refuses the sixth recording of the day and says to try tomorrow", () => {
    const why = checkUpload({ bytes: 1_000, sentToday: PER_DAY }, limits)!;
    expect(why).toMatch(/5/);
    expect(why).toMatch(/tomorrow/);
    // The day's limit is said before the size one: sending again today will not help whatever the file weighs.
    expect(checkUpload({ bytes: MAX_BYTES + 1, sentToday: PER_DAY }, limits)).toBe(why);
  });
});

describe("the name a recording goes up under", () => {
  it("comes from the recording's own start time, as the saved file's name does", () => {
    expect(uploadName(T)).toBe("walk-2026-11-14-170512");
  });

  it("is a plain run of letters, digits and dashes", () => {
    expect(safeName("walk-2026-11-14-170512")).toBe("walk-2026-11-14-170512");
    expect(safeName("My walk / ../ 2026 (1)")).toBe("My-walk-2026-1");
    expect(safeName("---")).toBe("walk");
    expect(safeName("")).toBe("walk");
    expect(safeName("a".repeat(200)).length).toBeLessThanOrEqual(80);
  });

  it("still has a name when the start time is not a time", () => {
    expect(uploadName(Number.NaN)).toMatch(/^walk-\d{4}-\d{2}-\d{2}-\d{6}$/);
    expect(uploadName(Number.POSITIVE_INFINITY)).toMatch(/^walk-\d{4}-\d{2}-\d{2}-\d{6}$/);
  });
});

describe("the screen's copy of the daily count", () => {
  const store = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  };

  it("starts at nothing and counts each send", () => {
    const s = store();
    expect(readCount(s, "iPhone", T)).toEqual({ day: "2026-11-14", sent: 0 });
    expect(addCount(s, "iPhone", T).sent).toBe(1);
    expect(readCount(s, "iPhone", T + 60_000).sent).toBe(1);
  });

  it("keeps each device's count apart", () => {
    const s = store();
    addCount(s, "iPhone", T);
    expect(readCount(s, "Android (Pixel 8)", T).sent).toBe(0);
  });

  it("forgets yesterday and reads a broken store as nothing", () => {
    const s = store();
    addCount(s, "iPhone", T);
    expect(readCount(s, "iPhone", T + 2 * 86_400_000).sent).toBe(0);
    s.setItem("recorder.sent.iPhone", "{not json");
    expect(readCount(s, "iPhone", T).sent).toBe(0);
    expect(readCount(null, "iPhone", T).sent).toBe(0);
  });
});

/** A server that answers the three routes the way the server track builds them, and records what it was asked. */
function stubServer(o: { chunk?: number; failEveryPart?: number; conflict?: number; conflictAt?: number }) {
  const seen: { method: string; url: string; body: unknown }[] = [];
  let stored = 0;
  let parts = 0;
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const fetchStub = vi.fn((url: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    const sent = init.body as Blob | string | undefined;
    seen.push({ method, url, body: sent instanceof Blob ? { size: sent.size } : sent });
    if (method === "POST" && url === "/api/recordings") { parts = 0; return json(200, { uploadId: "up-1", received: 0, chunk: o.chunk ?? 4 }); }
    if (method === "PUT") {
      const from = Number(new URL(url, "http://x").searchParams.get("from"));
      // The body arrives as bytes; a server reading the part's length needs it whole.
      const size = (init.body as Blob).size;
      parts++;
      if (o.conflict !== undefined && parts === o.conflict) return json(409, { received: o.conflictAt ?? from + 2, error: "already part-way" });
      if (o.failEveryPart) return json(o.failEveryPart, { error: "The server is busy, so nothing was stored." });
      stored = from + size;
      return json(200, { received: stored });
    }
    if (method === "POST" && url.endsWith("/finish")) return json(200, { ok: true, file: "walk-1.json", bytes: 10 + stored });
    return json(404, { error: "no such route" });
  });
  return { fetchStub, seen };
}

describe("send", () => {
  afterEach(() => vi.unstubAllGlobals());

  const video = (n: number) => new Blob([new Uint8Array(n)], { type: "video/webm" });

  it("puts the data up first and then the video in parts, and says it was sent", async () => {
    const { fetchStub, seen } = stubServer({ chunk: 4 });
    vi.stubGlobal("fetch", fetchStub);
    const progress: number[] = [];
    const r = await send({ recording: rec(), json: '{"v":1}', video: video(10), name: "walk-2026-11-14-170512", onProgress: (p) => progress.push(p.done) });

    expect(r).toEqual({ ok: true, file: "walk-1.json", bytes: 20 });
    expect(seen.map((s) => `${s.method} ${s.url}`)).toEqual([
      "POST /api/recordings",
      "PUT /api/recordings/up-1/part?from=0",
      "PUT /api/recordings/up-1/part?from=4",
      "PUT /api/recordings/up-1/part?from=8",
      "POST /api/recordings/up-1/finish",
    ]);
    expect(JSON.parse(String(seen[0].body))).toEqual({ device: "iPhone", name: "walk-2026-11-14-170512", json: '{"v":1}' });
    expect(progress.at(-1)).toBe(1);
  });

  it("sends no part when the recording has no video", async () => {
    const { fetchStub, seen } = stubServer({});
    vi.stubGlobal("fetch", fetchStub);
    const r = await send({ recording: rec(), json: '{"v":1}', video: null, name: "walk" });
    expect(r.ok).toBe(true);
    expect(seen.map((s) => s.method)).toEqual(["POST", "POST"]);
  });

  it("carries on from the byte count the server gives after a 409, instead of sending the whole video again", async () => {
    // The server already holds 6 bytes when the third part goes up; it says so with 409.
    const { fetchStub, seen } = stubServer({ chunk: 4, conflict: 3, conflictAt: 6 });
    vi.stubGlobal("fetch", fetchStub);
    const r = await send({ recording: rec(), json: "{}", video: video(10), name: "walk" });
    expect(r.ok).toBe(true);
    const puts = seen.filter((s) => s.method === "PUT").map((s) => s.url.split("?from=")[1]);
    // The fourth put starts where the server said it really is (6), not where the client thought (8).
    expect(puts).toEqual(["0", "4", "8", "6"]);
  });

  it("tries a failed part again and then gives its reason, keeping the recording", async () => {
    // Every part fails, so the retries run out and the reason comes through.
    const { fetchStub } = stubServer({ chunk: 4, failEveryPart: 503 });
    vi.stubGlobal("fetch", fetchStub);
    const r = await send({ recording: rec(), json: "{}", video: video(10), name: "walk" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.why).toBe("Not sent. The server is busy, so nothing was stored. The recording is still on this phone.");
  });

  it("gives the server's own sentence when it refuses the data", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(JSON.stringify({ error: "This recording is larger than 200 MB." }), { status: 413 }))));
    const r = await send({ recording: rec(), json: "{}", video: null, name: "walk" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.why).toBe("Not sent. This recording is larger than 200 MB. The recording is still on this phone.");
  });

  it("has a sentence of its own when the server sends none, and when there is no server to reach", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("", { status: 429 }))));
    const r = await send({ recording: rec(), json: "{}", video: null, name: "walk" });
    if (!r.ok) expect(r.why).toMatch(/^Not sent\. .*Too many recordings/);

    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))));
    const off = await send({ recording: rec(), json: "{}", video: null, name: "walk" });
    if (!off.ok) expect(off.why).toMatch(/^Not sent\. .*could not be reached.*still on this phone/i);
  });
});
