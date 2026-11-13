import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { planSigns, walkPlaces, type DollhouseModel } from "./three/dollhouse";
import { answer, best, prior, signsFromPlans, stationSpots } from "./stationPlace";
import { fultonCorner } from "./fultonCorners";

const model = JSON.parse(readFileSync("public/transit/fulton-model.json", "utf8")) as DollhouseModel;

describe("Fulton St's exit corners without map tiles", () => {
  it("names a corner for every exit the model reaches", () => {
    for (const w of model.walks) expect(fultonCorner(w.exit)).toMatch(/St|Broadway|Ln/);
  });

  it("lets typed Exit sign words place someone with no tiles loaded", () => {
    // Live on 2026-11-13 the map was in midtown, so "Exit Fulton St & Nassau St" matched nothing.
    const signs = signsFromPlans(model.walks.flatMap((w) => planSigns(model, w, fultonCorner(w.exit))));
    const gates = model.walks.flatMap((w, i) => { const g = walkPlaces(w.path).gates; return g ? [{ walk: i, at: g.at }] : []; });
    const spots = stationSpots(model.walks, signs, gates);
    const r = answer(spots, prior(spots, null), { q: "sign", text: "Exit Fulton St & Nassau St" }, signs);
    expect(r.matched).toBe(true);
    expect(best(spots, r.w).spot.on.some((o) => o.walk === 0 || o.walk === 1)).toBe(true);
  });
});
