import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { planSigns, walkLength, walkPlaces, type DollhouseModel } from "@/lib/map/three/dollhouse";
import { walkCallouts } from "@/lib/map/three/dollhouseCallouts";
import { signsFromPlans, stationSpots } from "@/lib/map/stationPlace";
import type { StationPlaceKit } from "@/lib/map/dollhousePreview";
import { Placer } from "./placeFlow";
import { answerLabel, spotText } from "./placeText";

// The kit as loadStationPlace builds it, from the Fulton St model, with made-up corner names.
const m = JSON.parse(readFileSync("public/transit/fulton-model.json", "utf8")) as DollhouseModel;
const corners = m.walks.map((_, i) => `Corner ${String.fromCharCode(65 + i)}`);
const signs = signsFromPlans(m.walks.flatMap((w, i) => planSigns(m, w, corners[i])));
const gates = m.walks.flatMap((w, i) => { const g = walkPlaces(w.path).gates; return g ? [{ walk: i, at: g.at }] : []; });
const kit: StationPlaceKit = {
  walks: m.walks, signs, spots: stationSpots(m.walks, signs, gates), corners, lines: "4/5",
  walkTo: () => 0,
  steps: (walk, fromM) => { const len = walkLength(m.walks[walk].path); return walkCallouts(m, m.walks[walk].path, corners[walk]).filter((c) => !c.wait && c.f * len >= fromM - 1).map((c) => c.text); },
};

describe("the where-am-I questions at Fulton St (#143)", () => {
  it("someone on the platform who says so is placed there, with the walk out to the trip's exit", () => {
    const p = new Placer(kit, 0);
    expect(p.next()).toBeTruthy();
    p.tap({ q: "where", a: "platform" });
    for (let q = p.next(); q; q = p.next()) {
      if (q === "down") p.tap({ q, a: 0 });
      else if (q === "up") p.tap({ q, a: 0 });
      else if (q === "paid") p.tap({ q, a: true });
      else break;
    }
    const at = p.placed();
    expect(at.spot.kind).toBe("platform");
    expect(spotText(at.spot, at.signWords, kit.lines, "en")).toMatch(/^on the 4\/5 platform/);
    const way = p.way();
    expect(way.backM).toBe(0);
    expect(way.steps.at(-1)).toMatch(/street at Corner A/);
  });

  it("Not there moves the guess somewhere else", () => {
    const p = new Placer(kit, 0);
    p.tap({ q: "where", a: "hall" });
    const first = p.placed().spot.stretch;
    p.notThere();
    expect(p.placed().spot.stretch).not.toBe(first);
  });

  it("labels tap answers in the app's language", () => {
    expect(answerLabel({ q: "paid", a: true }, "es")).toBe("No, sigo adentro");
    expect(answerLabel({ q: "down", a: 2 }, "en")).toBe("Two or more");
  });
});
