import { describe, expect, it } from "vitest";
import type { XrayStation, XrayWay } from "../src/features/transit/model";
import { applyXrayOverrides, loadOverrides, unreachablePlatforms, type XrayOverride } from "./xray-overrides";

// About 10 m apart: 0.0001° of latitude is 11 m.
const street: XrayWay = { k: "steps", c: [[-74, 40.7], [-74, 40.70003]], from: -1, to: 0 };
const mezz: XrayWay = { k: "corridor", c: [[-74, 40.70003], [-74, 40.7003]], from: -1, to: -1 };
const down: XrayWay = { k: "steps", c: [[-74, 40.7003], [-74, 40.70033]], from: -2, to: -1 };
const platform: XrayWay = { k: "platform", c: [[-74.0001, 40.70033], [-73.9999, 40.70033], [-73.9999, 40.7004], [-74.0001, 40.7004], [-74.0001, 40.70033]], from: -2, to: -2 };

describe("unreachablePlatforms", () => {
  it("walks street stairs, a passage and more stairs down to the platform", () => {
    expect(unreachablePlatforms({ ways: [street, mezz, down, platform], elevators: [] })).toEqual([]);
  });
  it("flags a platform with no stairs down to its level", () => {
    expect(unreachablePlatforms({ ways: [street, mezz, platform], elevators: [] })).toEqual([2]);
  });
  it("doesn't join ways on different levels that only line up on the map", () => {
    const deep = { ...platform, from: -3, to: -3 };
    expect(unreachablePlatforms({ ways: [street, mezz, down, deep], elevators: [] })).toEqual([3]);
  });
});

describe("the committed overrides", () => {
  const overrides = loadOverrides();
  it("reach every platform from the street", () => {
    for (const o of overrides) expect(unreachablePlatforms(o), o.name).toEqual([]);
  });
  it("cover all four Fulton St stations with the A/C three levels down", () => {
    const f = overrides.find((o) => o.name === "Fulton St")!;
    expect(f.ids.sort()).toEqual(["229", "418", "A38", "M22"]);
    expect(f.ways.filter((w) => w.k === "platform").map((w) => w.from).sort((a, b) => a - b)).toEqual([-3, -2, -2, -1, -1, -1]);
  });
});

describe("applyXrayOverrides", () => {
  it("puts the layout under every station id and leaves others alone", () => {
    const other: XrayStation = { ways: [platform], elevators: [] };
    const o: XrayOverride = { name: "T", ids: ["a", "b"], ways: [street, mezz, down, platform], elevators: [] };
    const out = applyXrayOverrides({ a: other, c: other }, [o]);
    expect(out.a.ways).toHaveLength(4);
    expect(out.b.ways).toHaveLength(4);
    expect(out.c).toBe(other);
  });
  it("refuses an override with a platform you can't walk to", () => {
    expect(() => applyXrayOverrides({}, [{ name: "T", ids: ["a"], ways: [street, platform], elevators: [] }])).toThrow(/can't be reached/);
  });
});
