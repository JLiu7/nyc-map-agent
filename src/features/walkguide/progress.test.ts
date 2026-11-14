import { describe, expect, it } from "vitest";
import { countStep, dueAtNext, initialSteps, nearbyFirst, nextStop, placeAt, placeForSign, stepsToNextStop } from "./progress";
import { WALK, WRONG_WAYS } from "./walks";

const at = (id: string) => WALK.findIndex((c) => c.id === id);

describe("a filmed walk", () => {
  it("starts on the street at Cortlandt St and ends on the street at Union Sq", () => {
    expect(WALK[0].level).toBe("street");
    expect(WALK[0].station).toBe("Cortlandt St");
    expect(WALK[WALK.length - 1].level).toBe("street");
    expect(WALK[WALK.length - 1].station).toBe("14 St-Union Sq");
  });

  it("changes level only by elevator, and station only by train", () => {
    for (let j = 0; j < WALK.length - 1; j++) {
      const a = WALK[j], b = WALK[j + 1];
      if (a.station !== b.station) expect(a.by).toBe("train");
      else if (a.level !== b.level) expect(a.by).toBe("elevator");
    }
  });

  it("has one photo and one id for every sign", () => {
    const ids = [...WALK, ...WRONG_WAYS].map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const w of WRONG_WAYS) expect(at(w.near)).toBeGreaterThanOrEqual(0);
  });
});

describe("where the rider is", () => {
  it("moves the dot along the line by the steps counted, never past the next sign", () => {
    const i = at("us-corridor");
    const a = WALK[i].at, b = WALK[i + 1].at;
    expect(placeAt(WALK, { i, walked: 0 })).toEqual(a);
    const mid = placeAt(WALK, { i, walked: WALK[i].steps / 2 });
    expect(mid[0]).toBeCloseTo((a[0] + b[0]) / 2, 6);
    expect(placeAt(WALK, { i, walked: 9999 })).toEqual(b);
  });

  it("holds the dot at an elevator until the rider says they rode it", () => {
    const i = at("el728x");
    expect(placeAt(WALK, { i, walked: 50 })).toEqual(WALK[i].at);
    expect(dueAtNext(WALK, { i, walked: 50 })).toBe(false);
  });

  it("counts the steps left to the next elevator, not to the end", () => {
    const i = at("us-to-l");
    expect(nextStop(WALK, i).id).toBe("us-mural-elevator");
    expect(stepsToNextStop(WALK, { i, walked: 0 })).toBe(22 + 89 + 14 + 25 + 35 + 27);
    expect(stepsToNextStop(WALK, { i, walked: 10 })).toBe(12 + 89 + 14 + 25 + 35 + 27);
    expect(stepsToNextStop(WALK, { i: at("us-mural-elevator"), walked: 0 })).toBe(0);
  });

  it("says the next sign should be in view once its steps are walked", () => {
    const i = at("to-rwe");
    expect(dueAtNext(WALK, { i, walked: 39 })).toBe(false);
    expect(dueAtNext(WALK, { i, walked: 40 })).toBe(true);
  });
});

describe("a sign the rider names", () => {
  it("puts them at that sign with the step count cleared", () => {
    expect(placeForSign(WALK, WRONG_WAYS, "us-yellow")).toEqual({ place: { i: at("us-yellow"), walked: 0 }, wrong: null });
  });

  it("sends a wrong-way sign back to the route", () => {
    const r = placeForSign(WALK, WRONG_WAYS, "us-west-exit")!;
    expect(r.place.i).toBe(at("us-to-l"));
    expect(r.wrong?.id).toBe("us-west-exit");
    expect(placeForSign(WALK, WRONG_WAYS, "no-such-sign")).toBeNull();
  });

  it("offers the signs around the last known place first", () => {
    const i = at("us-yellow");
    const first = nearbyFirst(WALK, [...WALK, ...WRONG_WAYS], i).slice(0, 5).map((s) => s.id);
    expect(first[0]).toBe("us-yellow");
    expect(first).toContain("us-corridor");
    expect(first).toContain("us-sw-turnstiles");
  });
});

describe("the step counter", () => {
  it("counts one step for each swing and none while still", () => {
    let st = initialSteps();
    for (let k = 0; k < 100; k++) st = countStep(st, k * 0.02, 9.81);
    expect(st.steps).toBe(0);
    // Ten strides at two a second: a short swing up, then back to rest.
    for (let k = 0; k < 250; k++) {
      const t = 2 + k * 0.02;
      st = countStep(st, t, 9.81 + ((t * 2) % 1 < 0.2 ? 4 : 0));
    }
    expect(st.steps).toBe(10);
  });
});
