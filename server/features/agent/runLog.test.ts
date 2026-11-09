import { describe, expect, it, vi } from "vitest";
import { RunLog, type RunRecord } from "./runLog";
import { exportTrace, type SpanSpec } from "../../lib/tracing";

vi.mock("../../lib/tracing", () => ({ exportTrace: vi.fn() }));

const clock = () => {
  let t = 1_000;
  return { now: () => t, tick: (ms: number) => { t += ms; } };
};

describe("RunLog", () => {
  it("records the first step, first words, each tool's time and the model that answered", () => {
    const c = clock();
    const write = vi.fn<(r: RunRecord) => Promise<void>>(() => Promise.resolve());
    const log = vi.fn();
    const run = new RunLog("cb/a", write, c.now, log, 60_000);
    c.tick(2_000); run.stepStart("t1", "geocode");
    c.tick(150); run.stepEnd("t1", true);
    c.tick(1_000); run.text(); run.text();
    run.note("[agent] model cb/a slow to start");
    run.usedModel("cb/b");
    c.tick(500); run.finish("done", { inputTokens: 10, outputTokens: 5 });
    const r = write.mock.calls[0][0];
    expect(r).toMatchObject({ model: "cb/b", outcome: "done", firstStepMs: 2_000, firstTextMs: 3_150, totalMs: 3_650, steps: [{ name: "geocode", ms: 150, status: "done" }], inputTokens: 10 });
    expect(r.notes).toHaveLength(1);
    expect(log.mock.calls[0][0]).toMatch(/^\[agent-run\] \{/);
  });

  it("writes once: a second finish is ignored", () => {
    const write = vi.fn(() => Promise.resolve());
    const run = new RunLog("m", write, Date.now, vi.fn(), 60_000);
    run.finish("done", null);
    run.finish("error", null);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("writes a stuck row, with the step still running, when nothing finishes in time", () => {
    vi.useFakeTimers();
    const write = vi.fn<(r: RunRecord) => Promise<void>>(() => Promise.resolve());
    const run = new RunLog("m", write, Date.now, vi.fn(), 45_000);
    run.stepStart("t1", "transit_plan");
    vi.advanceTimersByTime(45_000);
    expect(write.mock.calls[0][0]).toMatchObject({ outcome: "stuck", steps: [{ name: "transit_plan", status: "running" }] });
    run.finish("done", null);
    expect(write.mock.calls[1][0].outcome).toBe("done");
    vi.useRealTimers();
  });

  it("never stores message text: the record has no field for it", () => {
    const run = new RunLog("m", () => Promise.resolve(), Date.now, vi.fn(), 60_000);
    expect(Object.keys(run.record("done", null)).sort()).toEqual(["firstStepMs", "firstTextMs", "id", "inputTokens", "model", "notes", "outcome", "outputTokens", "startedAt", "steps", "totalMs"]);
    run.finish("done", null);
  });

  it("traces what each tool was given and returned, and the map commands sent, but keeps them out of the log and the row", () => {
    const c = clock();
    const write = vi.fn<(r: RunRecord) => Promise<void>>(() => Promise.resolve());
    const log = vi.fn();
    const run = new RunLog("m", write, c.now, log, 60_000);
    run.stepStart("t1", "geocode", { text: "fulton street manhattan" });
    c.tick(100); run.stepEnd("t1", true, { label: "Fulton St station", at: [-74.0076, 40.7104] });
    run.stepStart("t2", "flyTo", { place: "Fulton St" });
    c.tick(50); run.command({ type: "flyTo", lon: -74.0076, lat: 40.7104 });
    run.stepEnd("t2", false, new Error("Could not find it"));
    run.stepStart("t3", "transit_plan", { to: "x".repeat(5_000) });
    run.stepEnd("t3", true, "ok");
    run.finish("done", null);

    const root = vi.mocked(exportTrace).mock.calls.at(-1)![0];
    const tool = (name: string) => root.children!.find((s: SpanSpec) => s.name === name)!.attributes!;
    expect(tool("geocode")["input.value"]).toBe('{"text":"fulton street manhattan"}');
    expect(tool("geocode")["output.value"]).toContain("Fulton St station");
    expect(tool("flyTo")["output.value"]).toBe("Could not find it");
    expect(String(tool("transit_plan")["input.value"]).length).toBe(4_001);
    expect(root.attributes!["map.commands"]).toBe('+150ms {"type":"flyTo","lon":-74.0076,"lat":40.7104}');
    expect(JSON.stringify(write.mock.calls[0][0])).not.toContain("fulton");
    expect(log.mock.calls[0][0]).not.toContain("-74.0076");
  });
});
