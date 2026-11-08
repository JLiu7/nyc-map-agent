import { describe, expect, it, vi } from "vitest";
import { closeSheets, pullSheetMounted } from "./pullSheet";

describe("the phone's one sheet", () => {
  it("closes every view, newest first, and leaves nothing up", () => {
    const order: string[] = [];
    const station = pullSheetMounted(() => { order.push("station"); station.release(); });
    const line = pullSheetMounted(() => { order.push("line"); line.release(); });
    closeSheets();
    expect(order).toEqual(["line", "station"]);
    const again = vi.fn();
    const next = pullSheetMounted(again);
    next.release();
    closeSheets();
    expect(again).not.toHaveBeenCalled();
  });
});
