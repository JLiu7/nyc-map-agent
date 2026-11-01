import { describe, expect, it } from "vitest";
import { yesNo } from "./guard";

describe("yesNo: code decides what counts as a yes", () => {
  it.each(["yes", "Yeah", "yep, that one", "correct", "that's right", "sure"])("%s is a yes", (t) => {
    expect(yesNo(t)).toBe("yes");
  });

  it.each(["no", "nope", "wrong", "not that one", "that's not it", "wait"])("%s is a no", (t) => {
    expect(yesNo(t)).toBe("no");
  });

  it("a hedge or a condition is never a yes", () => {
    expect(yesNo("maybe")).toBe("unclear");
    expect(yesNo("yes I guess")).toBe("unclear");
    expect(yesNo("yes but the other one")).toBe("unclear");
    expect(yesNo("yes if it has an elevator")).toBe("unclear");
  });

  it("a question or a long sentence is not a yes", () => {
    expect(yesNo("sure, is it far?")).toBe("unclear");
    expect(yesNo("yes and then can you also tell me where the restroom is please")).toBe("unclear");
  });
});
