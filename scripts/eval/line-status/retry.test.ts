import { describe, expect, it } from "vitest";
import { UnreachableModel, withRetry } from "./retry";

const instant = () => Promise.resolve();
const noSleep = { attempts: 3, delayMs: 10, sleep: instant };

describe("withRetry", () => {
  it("returns the first result and never waits when the call works", async () => {
    let slept = 0;
    const out = await withRetry(() => Promise.resolve("ok"), { ...noSleep, sleep: () => { slept += 1; return instant(); } });
    expect(out).toBe("ok");
    expect(slept).toBe(0);
  });

  it("retries a failure and returns the later result", async () => {
    let calls = 0;
    const out = await withRetry(() => {
      calls += 1;
      return calls < 3 ? Promise.reject(new Error("connect ECONNREFUSED")) : Promise.resolve("third time");
    }, noSleep);
    expect(out).toBe("third time");
    expect(calls).toBe(3);
  });

  it("backs off further before each retry", async () => {
    const waits: number[] = [];
    await withRetry(() => Promise.reject(new Error("down")), {
      attempts: 3,
      delayMs: 100,
      sleep: (ms) => { waits.push(ms); return instant(); },
    }).catch(() => {});
    expect(waits).toEqual([100, 200]);
  });

  it("rethrows the last failure once the attempts are spent", async () => {
    let calls = 0;
    await expect(withRetry(() => {
      calls += 1;
      return Promise.reject(new Error(`fail ${calls}`));
    }, noSleep)).rejects.toThrow("fail 3");
    expect(calls).toBe(3);
  });

  it("tells the reader what to check when the model stays unreachable", () => {
    const err = new UnreachableModel("a-trouble/plain/base", 2, new Error("connect ECONNREFUSED 127.0.0.1:18199"));
    expect(err.message).toContain("a-trouble/plain/base");
    expect(err.message).toContain("No row was recorded");
    expect(err.message).toContain("Check the model endpoint");
    expect(err).toBeInstanceOf(Error);
  });
});
