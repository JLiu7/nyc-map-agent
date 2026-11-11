import { describe, expect, it } from "vitest";
import { lastWalkLabel } from "./arrivalWalk";

describe("lastWalkLabel", () => {
  it("names the street climb when the trip ends at the station it arrives at", () => {
    expect(lastWalkLabel("Fulton St", "Fulton St station")).toBe("Come up to the street at Fulton St");
    expect(lastWalkLabel("Fulton St", "Fulton Street Station")).toBe("Come up to the street at Fulton St");
  });
  it("keeps the walk to any other place", () => {
    expect(lastWalkLabel("Fulton St", "One World Trade Center")).toBe("Walk from Fulton St to One World Trade Center");
    expect(lastWalkLabel("Fulton St", "Fulton St & Broadway")).toBe("Walk from Fulton St to Fulton St & Broadway");
  });
});
