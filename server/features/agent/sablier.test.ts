import { describe, expect, it, vi } from "vitest";
import { createWaker } from "./sablier";

const BASE = "http://sablier:10000";
const answer = (status: number) => vi.fn<typeof fetch>(() => Promise.resolve(new Response(null, { status })));
// The waker always passes a URL string.
const called = (f: ReturnType<typeof answer>) => f.mock.calls.map(([u]) => u as string);

describe("createWaker", () => {
  it("does nothing without SABLIER_URL", async () => {
    const f = answer(200);
    const w = createWaker({ url: "", fetch: f });
    w.poke(["nyc-map-otp"]);
    expect(await w.ready("nyc-map-otp", 75)).toBe(true);
    expect(f).not.toHaveBeenCalled();
  });

  it("pokes both containers without waiting, at most once a minute", () => {
    let t = 0;
    const f = answer(200);
    const w = createWaker({ url: `${BASE}/`, fetch: f, now: () => t });
    w.poke(["nyc-map-otp", "nyc-map-valhalla"]);
    t = 59_000;
    w.poke(["nyc-map-otp", "nyc-map-valhalla"]);
    expect(called(f)).toEqual([`${BASE}/api/strategies/poke?names=nyc-map-otp&names=nyc-map-valhalla`]);
    t = 60_000;
    w.poke(["nyc-map-otp"]);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("waits for one container with its timeout, and shares the wait between callers", async () => {
    const f = answer(200);
    const w = createWaker({ url: BASE, fetch: f });
    const [a, b] = await Promise.all([w.ready("nyc-map-otp", 75), w.ready("nyc-map-otp", 75)]);
    expect([a, b]).toEqual([true, true]);
    expect(called(f)).toEqual([`${BASE}/api/strategies/blocking?names=nyc-map-otp&timeout=75s`]);
  });

  it("skips the call for 30 s after a container was ready", async () => {
    let t = 0;
    const f = answer(200);
    const w = createWaker({ url: BASE, fetch: f, now: () => t });
    await w.ready("nyc-map-otp", 75);
    t = 29_000;
    await w.ready("nyc-map-otp", 75);
    expect(f).toHaveBeenCalledTimes(1);
    t = 30_000;
    await w.ready("nyc-map-otp", 75);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("says not ready on a timeout or when Sablier is down, and asks again next time", async () => {
    const late = answer(504);
    const w = createWaker({ url: BASE, fetch: late });
    expect(await w.ready("nyc-map-otp", 75)).toBe(false);
    expect(await w.ready("nyc-map-otp", 75)).toBe(false);
    expect(late).toHaveBeenCalledTimes(2);
    const down = vi.fn(() => Promise.reject(new TypeError("fetch failed")));
    expect(await createWaker({ url: BASE, fetch: down }).ready("nyc-map-valhalla", 20)).toBe(false);
  });
});
