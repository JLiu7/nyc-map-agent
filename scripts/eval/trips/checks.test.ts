import { describe, expect, it } from "vitest";
import { checkTurn, isReadback } from "./checks";
import type { Expect, Observed } from "./types";

const ids = (e: Expect, o: Partial<Observed>) => checkTurn(e, { reply: "ok", tools: [], commands: [], ...o }).map((v) => v.check);

// Each case below is a failure seen in the 2026-11-01 traces (#23).
describe("trip checks on real failures", () => {
  it("catches the restroom answer to \"get to times square\"", () => {
    const got = ids({ trip: true }, { tools: ["nearest_restroom"], reply: "The closest restroom is in Union Square Park." });
    expect(got).toEqual(["no-plan-without-tool", "wrong-topic-tool"]);
  });

  it("catches a route told in words with nothing drawn", () => {
    expect(ids({ trip: true }, { tools: ["geocode", "transit_plan"], reply: "Take the R uptown to Times Sq-42 St." })).toEqual(["no-route-drawn"]);
  });

  it("catches a route invented without the planner", () => {
    expect(ids({ trip: true }, { reply: "Take the 4 to Brooklyn Bridge-City Hall, then walk across." })).toEqual(["no-plan-without-tool"]);
  });

  it("catches a \"yes\" that drew and started nothing", () => {
    expect(ids({ yes: true }, { tools: ["geocode"], reply: "Where would you like to go?" })).toEqual(["yes-did-nothing"]);
  });

  it("catches the suggest_layer loop with an empty reply", () => {
    expect(ids({}, { tools: Array(8).fill("suggest_layer"), reply: " " })).toEqual(["tool-loop", "empty-reply"]);
  });

  it("catches an internal name in the reply", () => {
    expect(ids({}, { tools: ["nearest_restroom"], reply: "Tap the walkToNearest button to go there." })).toEqual(["wrong-topic-tool", "internal-name-leak"]);
    expect(ids({}, { reply: "Your trip 3f2a9c1e-1b2c-4d5e-8f90-1234567890ab is ready." })).toEqual(["internal-name-leak"]);
  });
});

describe("trip checks pass good turns", () => {
  it("a planned and drawn trip", () => {
    expect(ids({ trip: true }, { tools: ["geocode", "transit_plan", "showRoute", "openPanel"], commands: ["showRoute", "openPanel"] })).toEqual([]);
  });

  it("a trip the planner drew by itself", () => {
    expect(ids({ trip: true }, { tools: ["route_walk"], commands: ["showRoute"] })).toEqual([]);
  });

  it("a \"yes\" that starts the flythrough", () => {
    expect(ids({ yes: true }, { tools: ["playFlythrough"], commands: ["playFlythrough"] })).toEqual([]);
  });

  it("a restroom question that uses the restroom tool", () => {
    expect(ids({ restroom: true }, { tools: ["nearest_restroom"] })).toEqual([]);
  });

  it("a vague request answered with a question", () => {
    expect(ids({ ask: true }, { reply: "Where in Brooklyn, and what time tomorrow?" })).toEqual([]);
    expect(ids({ ask: true }, { tools: ["transit_plan"], commands: ["showRoute"], reply: "Here is a trip to Downtown Brooklyn. Did you mean somewhere else?" })).toEqual([]);
    expect(ids({ ask: true }, { tools: ["transit_plan"], commands: ["showRoute"], reply: "Take the 4 to Borough Hall." })).toEqual(["guessed-when-vague"]);
  });

  it("three calls of one tool are not a loop", () => {
    expect(ids({}, { tools: ["geocode", "geocode", "geocode"] })).toEqual([]);
  });
});

describe("the app's readback", () => {
  it("is recognised by its fixed opening", () => {
    expect(isReadback("Just to check: did you mean Eastern Pkwy-Brooklyn Museum (2 3 trains)?")).toBe(true);
  });

  it("is not any reply that asks a question", () => {
    expect(isReadback("Which Brooklyn do you mean: a neighborhood or a station?")).toBe(false);
  });
});
