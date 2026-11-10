import { afterEach, describe, expect, it, vi } from "vitest";
import { translateLines } from "./translateLines";

const reply = (lines: string[]) => Promise.resolve(new Response(JSON.stringify({ lines }), { status: 200 }));

describe("translateLines", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("asks nothing for English", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect((await translateLines(["Walk to Fulton St"], "en")).size).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns each line's translation by its English text, asking for a line once", async () => {
    const fetch = vi.fn((_url: string, init: { body: string }) => reply((JSON.parse(init.body) as { lines: string[] }).lines.map((l) => `es:${l}`)));
    vi.stubGlobal("fetch", fetch);
    const got = await translateLines(["Walk to Fulton St", "Walk to Fulton St", " Use the N exit "], "es");
    expect(got.get("Walk to Fulton St")).toBe("es:Walk to Fulton St");
    expect(got.get("Use the N exit")).toBe("es:Use the N exit");
    expect(fetch).toHaveBeenCalledTimes(1);
    // Remembered: the same lines again ask nothing.
    await translateLines(["Walk to Fulton St"], "es");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("sends at most 24 lines a call", async () => {
    const fetch = vi.fn((_url: string, init: { body: string }) => reply((JSON.parse(init.body) as { lines: string[] }).lines.map((l) => `fr:${l}`)));
    vi.stubGlobal("fetch", fetch);
    const got = await translateLines(Array.from({ length: 30 }, (_, i) => `step ${i}`), "fr");
    expect(got.size).toBe(30);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("leaves lines out when the server fails, so they show as written", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("no", { status: 502 }))));
    expect((await translateLines(["Board the 4 train"], "ko")).size).toBe(0);
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
    expect((await translateLines(["Board the 5 train"], "ko")).size).toBe(0);
  });
});
