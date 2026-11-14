import { describe, expect, it } from "vitest";
import { asksForStationWalk } from "./stationWalkAsk";

describe("a question that asks for the walk inside the stations", () => {
  it("is recognised in the words riders use", () => {
    expect(asksForStationWalk("show me the inside walk between fulton to union square")).toBe(true);
    expect(asksForStationWalk("Step-free route from Cortlandt St to Union Sq")).toBe(true);
    expect(asksForStationWalk("wheelchair way from Fulton to 14th St")).toBe(true);
  });

  it("leaves ordinary trip questions to the model", () => {
    expect(asksForStationWalk("Take the 4 train from Fulton St to Union Square")).toBe(false);
    expect(asksForStationWalk("show me the inside walk at Times Square")).toBe(false);
    expect(asksForStationWalk("where is the nearest restroom")).toBe(false);
  });
});
