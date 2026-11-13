import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { pickWalk, type DollhouseModel } from "./dollhouse";
import { walkCallouts } from "./dollhouseCallouts";

const model = JSON.parse(readFileSync("public/transit/fulton-model.json", "utf8")) as DollhouseModel;

describe("what the voice says on the Fulton St walk", () => {
  const walk = pickWalk(model, [-74.0075959, 40.710219])!;
  const lines = walkCallouts(model, walk.path, "Fulton St & Nassau St · NE corner");

  it("first says where on the train the figure got off, and the side the train leaves on", () => {
    expect(lines[0].wait).toBe(true);
    expect(lines[0].text).toMatch(/^You got off (near the front|in the middle|near the back) of the train, about car \d+ of 10\. The train pulls out on your (left|right)\.$/);
  });

  it("gives turns, stairs and the fare line in order, and ends on the street corner", () => {
    const texts = lines.map((l) => l.text);
    expect(texts.some((t) => /^(Turn|Bear) (left|right)\.$|first (left|right)/.test(t))).toBe(true);
    expect(texts.some((t) => /stairs/.test(t))).toBe(true);
    expect(texts).toContain("Out through the turnstiles or the exit gate.");
    expect(texts.at(-1)).toBe("You're on the street at Fulton St & Nassau St · NE corner.");
    for (let i = 1; i < lines.length; i++) expect(lines[i].f).toBeGreaterThan(lines[i - 1].f);
  });
});
