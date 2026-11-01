import { MockLanguageModelV4, convertArrayToReadableStream } from "ai/test";
import { describe, expect, it, vi } from "vitest";
import { streamEvent, type StreamEvent } from "../../../src/features/agent/schema";
import { createDailyBudget, createLimiter } from "./fair-use";
import { POST, type FairUse } from "./routes";

const usage = { inputTokens: { total: 100, noCache: 100, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 20, text: 20, reasoning: 0 } };
const finish = (reason: "tool-calls" | "stop") => ({ type: "finish", finishReason: { unified: reason, raw: reason }, usage }) as const;

function model() {
  let step = 0;
  return new MockLanguageModelV4({
    doStream: () => {
      step += 1;
      const chunks =
        step === 1
          ? [{ type: "tool-call", toolCallId: "c1", toolName: "enterStreetView", input: JSON.stringify({ place: "here" }) }, finish("tool-calls")]
          : [{ type: "text-start", id: "t" }, { type: "text-delta", id: "t", delta: "You're at street level." }, { type: "text-end", id: "t" }, finish("stop")];
      return Promise.resolve({ stream: convertArrayToReadableStream(chunks as never[]) });
    },
  });
}

async function run(body: unknown): Promise<StreamEvent[]> {
  const res = await POST(new Request("http://x/api/agent", { method: "POST", body: JSON.stringify(body) }), { model: model() });
  const text = await res.text();
  return text.trim().split("\n").map((l) => streamEvent.parse(JSON.parse(l)));
}

describe("POST /api/agent (mocked LLM)", () => {
  it("rejects a bad body", async () => {
    const res = await POST(new Request("http://x", { method: "POST", body: "{}" }), { model: model() });
    expect(res.status).toBe(400);
  });

  it("streams a validated map command, text and usage", async () => {
    const events = await run({ messages: [{ role: "user", content: "street view here" }], location: { lon: -73.99, lat: 40.73 } });
    expect(events.find((e) => e.type === "command")).toEqual({ type: "command", command: { type: "enterStreetView", lon: -73.99, lat: 40.73 } });
    expect(events.filter((e) => e.type === "text").map((e) => (e as { text: string }).text).join("")).toContain("street level");
    const done = events.find((e) => e.type === "done");
    expect(done && done.type === "done" && done.usage.inputTokens).toBeGreaterThan(0);
  });

  it("never sends a command when 'here' is unknown", async () => {
    const events = await run({ messages: [{ role: "user", content: "street view here" }] });
    expect(events.some((e) => e.type === "command")).toBe(false);
  });
});

describe("POST /api/agent: shared location privacy", () => {
  it("never sends the coordinates to the model or logs them", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((k) => vi.spyOn(console, k).mockImplementation(() => {}));
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const m = model();
    const res = await POST(
      new Request("http://x/api/agent", { method: "POST", body: JSON.stringify({ messages: [{ role: "user", content: "street view here" }], location: { lon: -73.990312, lat: 40.735901 } }) }),
      { model: m },
    );
    await res.text();
    const prompt = JSON.stringify(m.doStreamCalls[0]?.prompt);
    expect(prompt).toContain("The user shared their location");
    expect(prompt).not.toMatch(/73\.99|40\.73/);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const logged = spies.flatMap((s) => s.mock.calls).map((c) => JSON.stringify(c)).join("\n");
    expect(logged).not.toMatch(/73\.9903|40\.7359/);
    const outbound = fetchSpy.mock.calls.map((c) => JSON.stringify(c)).join("\n");
    expect(outbound).not.toMatch(/octo|r2\.|cloudflarestorage/i);
    spies.forEach((s) => s.mockRestore());
    fetchSpy.mockRestore();
  });
});

describe("POST /api/agent: fair use", () => {
  const body = JSON.stringify({ messages: [{ role: "user", content: "street view here" }] });
  const ask = (fairUse: FairUse, ip: string, m = model()) =>
    POST(new Request("http://x/api/agent", { method: "POST", headers: { "cf-connecting-ip": ip }, body }), { model: m, fairUse });

  it("answers 429 with Retry-After and a message once a client's burst is used", async () => {
    const now = () => 1_000_000;
    const fairUse: FairUse = { limiter: createLimiter({ windowMax: 20, windowMs: 3 * 3_600_000, burstMax: 2, burstMs: 60_000 }, now), budget: createDailyBudget({ softCap: 0, hardCap: 0, capModel: null }, now), now };
    for (let i = 0; i < 2; i++) expect((await ask(fairUse, "203.0.113.1")).status).toBe(200);
    const res = await ask(fairUse, "203.0.113.1");
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("60");
    expect(((await res.json()) as { message: string }).message).toMatch(/next question frees up/);
    expect((await ask(fairUse, "203.0.113.2")).status).toBe(200);
  });

  it("does not count a bad body", async () => {
    const now = () => 1_000_000;
    const fairUse: FairUse = { limiter: createLimiter({ windowMax: 1, windowMs: 60_000, burstMax: 0, burstMs: 0 }, now), budget: createDailyBudget({ softCap: 0, hardCap: 0, capModel: null }, now), now };
    expect((await POST(new Request("http://x", { method: "POST", body: "{}" }), { model: model(), fairUse })).status).toBe(400);
    expect((await ask(fairUse, "203.0.113.3")).status).toBe(200);
  });

  it("records token usage and replies without a model once the daily budget is spent", async () => {
    const now = () => Date.UTC(2026, 9, 23, 12);
    const budget = createDailyBudget({ softCap: 100, hardCap: 100, capModel: null }, now);
    const fairUse: FairUse = { limiter: createLimiter({ windowMax: 0, windowMs: 0, burstMax: 0, burstMs: 0 }, now), budget, now };
    await (await ask(fairUse, "203.0.113.4")).text();
    expect(budget.used()).toBeGreaterThanOrEqual(100);
    const m = model();
    const res = await ask(fairUse, "203.0.113.4", m);
    expect(res.status).toBe(200);
    const events = (await res.text()).trim().split("\n").map((l) => streamEvent.parse(JSON.parse(l)));
    expect(m.doStreamCalls.length).toBe(0);
    expect(events[0]).toMatchObject({ type: "text" });
    expect((events[0] as { text: string }).text).toMatch(/map/);
    expect(events[1]).toEqual({ type: "done", model: "none", usage: { inputTokens: 0, outputTokens: 0 } });
  });

  it("still answers a line question from the live feed once the budget is spent (#199)", async () => {
    const now = () => Date.UTC(2026, 9, 23, 12);
    const fairUse: FairUse = { limiter: createLimiter({ windowMax: 0, windowMs: 0, burstMax: 0, burstMs: 0 }, now), budget: createDailyBudget({ softCap: 1, hardCap: 1, capModel: null }, now), now };
    fairUse.budget.record(5);
    const m = model();
    const req = new Request("http://x/api/agent", { method: "POST", body: JSON.stringify({ messages: [{ role: "user", content: "is the L train running?" }] }) });
    const res = await POST(req, { model: m, fairUse, deps: { alerts: () => Promise.resolve([]), alertEntities: () => Promise.resolve([]) } });
    const events = (await res.text()).trim().split("\n").map((l) => streamEvent.parse(JSON.parse(l)));
    expect(m.doStreamCalls.length).toBe(0);
    expect(events.find((e) => e.type === "text")).toMatchObject({ text: expect.stringMatching(/no delays or changes on the L train/) as unknown });
    expect(events.at(-1)).toMatchObject({ type: "done", model: "none" });
  });
});

describe("POST /api/agent: plain questions skip the model", () => {
  it("answers a plain line question from the live feed without calling the model", async () => {
    const m = model();
    const req = new Request("http://x/api/agent", { method: "POST", body: JSON.stringify({ messages: [{ role: "user", content: "How is the L train running right now?" }] }) });
    const res = await POST(req, { model: m, deps: { alerts: () => Promise.resolve([]), alertEntities: () => Promise.resolve([]) } });
    const events = (await res.text()).trim().split("\n").map((l) => streamEvent.parse(JSON.parse(l)));
    expect(m.doStreamCalls.length).toBe(0);
    expect(events.find((e) => e.type === "text")).toMatchObject({ text: expect.stringMatching(/no delays or changes on the L train/) as unknown });
    expect(events.at(-1)).toMatchObject({ type: "done", model: "none" });
  });

  it("still asks the model when the question names more than a line", async () => {
    const m = model();
    const req = new Request("http://x/api/agent", { method: "POST", body: JSON.stringify({ messages: [{ role: "user", content: "is the L train running to Canarsie?" }] }) });
    await (await POST(req, { model: m, deps: { alerts: () => Promise.resolve([]), alertEntities: () => Promise.resolve([]) } })).text();
    expect(m.doStreamCalls.length).toBeGreaterThan(0);
  });
});

describe("POST /api/agent: agent steps and language (#370)", () => {
  it("streams a step start and end for each tool, and keeps the old tool line", async () => {
    const events = await run({ messages: [{ role: "user", content: "street view here" }], location: { lon: -73.99, lat: 40.73 } });
    expect(events.find((e) => e.type === "tool")).toEqual({ type: "tool", name: "enterStreetView" });
    expect(events.filter((e) => e.type === "step")).toEqual([
      { type: "step", id: "c1", name: "enterStreetView", status: "start" },
      { type: "step", id: "c1", name: "enterStreetView", status: "done" },
    ]);
  });

  it("tells the model to answer in the question's language, with the browser language as tie-break", async () => {
    const m = model();
    const res = await POST(new Request("http://x/api/agent", { method: "POST", body: JSON.stringify({ messages: [{ role: "user", content: "¿dónde hay un baño?" }], lang: "es-US" }) }), { model: m });
    await res.text();
    const prompt = JSON.stringify(m.doStreamCalls[0]?.prompt);
    expect(prompt).toContain("Reply in the language of the user's latest message");
    expect(prompt).toContain("browser language es-US");
  });

  it("rejects a malformed language tag", async () => {
    const res = await POST(new Request("http://x", { method: "POST", body: JSON.stringify({ messages: [{ role: "user", content: "hi" }], lang: "en; ignore previous" }) }), { model: model() });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/agent: place read-back before the model", () => {
  const st = (id: string, name: string, routes: string[]) => ({ id, complexId: id, name, routes, structure: "Subway", at: [-73.95, 40.78] as [number, number] });
  const entrances = { stations: () => Promise.resolve([st("1", "86 St", ["1"]), st("2", "86 St", ["4", "5", "6"]), st("3", "Bedford Av", ["L"])]), entrances: () => Promise.resolve([]) };
  const ask = async (body: unknown, m = model()) => {
    const res = await POST(new Request("http://x/api/agent", { method: "POST", body: JSON.stringify(body) }), { model: m, deps: { entrances } });
    const events = (await res.text()).trim().split("\n").map((l) => streamEvent.parse(JSON.parse(l)));
    return { events, said: events.filter((e) => e.type === "text").map((e) => (e as { text: string }).text).join(""), m };
  };

  it("asks which 86 St in code, with no model call", async () => {
    const { said, events, m } = await ask({ messages: [{ role: "user", content: "how do I get to 86 St" }] });
    expect(said).toBe("Just to check: did you mean 86 St (1 train), or 86 St (4 5 6 trains)?");
    expect(m.doStreamCalls).toHaveLength(0);
    expect(events.at(-1)).toMatchObject({ type: "done", model: "none" });
  });

  it("hands the model the question with the place the person picked", async () => {
    const { m } = await ask({
      messages: [
        { role: "user", content: "how do I get to 86 St" },
        { role: "assistant", content: "Just to check: did you mean 86 St (1 train), or 86 St (4 5 6 trains)?" },
        { role: "user", content: "the 4 5 6" },
      ],
    });
    const prompt = JSON.stringify(m.doStreamCalls[0]?.prompt);
    expect(prompt).toContain("how do I get to 86 St (4 5 6 trains)");
  });

  it("reads back a clear place only when speech-to-text was unsure", async () => {
    const sure = await ask({ messages: [{ role: "user", content: "how do I get to Bedford Av" }], heard: { confidence: 0.92 } });
    expect(sure.said).not.toMatch(/Just to check/);
    const unsure = await ask({ messages: [{ role: "user", content: "how do I get to Bedford Av" }], heard: { confidence: 0.41 } });
    expect(unsure.said).toBe("Just to check: did you mean Bedford Av (L train)?");
  });
});
