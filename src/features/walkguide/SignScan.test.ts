import { afterEach, describe, expect, it, vi } from "vitest";
import { askSign } from "./SignScan";

const SIGNS = [{ id: "us-to-l", sign: "Elevator to L (overhead)", photo: "us-to-l" }];
afterEach(() => vi.unstubAllGlobals());

describe("asking which sign a photo shows", () => {
  it("sends the photo with only each sign's id and words, and gives back the id", async () => {
    const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(() => Promise.resolve(Response.json({ id: "us-to-l" })));
    vi.stubGlobal("fetch", fetchMock);
    expect(await askSign("data:image/jpeg;base64,/9j/AAAA", SIGNS)).toBe("us-to-l");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/api\/agent\/see-sign$/);
    expect(JSON.parse(init.body as string)).toEqual({ image: "data:image/jpeg;base64,/9j/AAAA", signs: [{ id: "us-to-l", sign: "Elevator to L (overhead)" }] });
  });

  it("gives null when the photo shows none of them, and throws when the server fails", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(Response.json({ id: null }))));
    expect(await askSign("x", SIGNS)).toBeNull();
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(Response.json({ error: "too many" }, { status: 429 }))));
    await expect(askSign("x", SIGNS)).rejects.toThrow("see-sign 429");
  });
});
