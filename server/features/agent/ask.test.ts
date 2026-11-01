import { MockLanguageModelV4, convertArrayToReadableStream } from "ai/test";
import { describe, expect, it, vi } from "vitest";
import { streamEvent, type StreamEvent, type Trip } from "../../../src/features/agent/schema";
import { askFor, CloseHold, followUpFor, isArea, preferFrom, questionsAnswered, riderLanguage, say, type TripDetails } from "./ask";
import { createDailyBudget, createLimiter } from "./fair-use";
import { POST } from "./routes";

const clear: TripDetails = { from: "here", to: "Grand Central", timing: "now", access: "none", walking: "any", mode: "any" };
const plan = (d: Partial<TripDetails>, opts: { hasLocation?: boolean; answered?: number } = {}) => askFor({ ...clear, ...d }, { hasLocation: opts.hasLocation ?? true, answered: opts.answered ?? 0 });

describe("ask or plan, decided in code (#625)", () => {
  it("plans a complete request with no question", () => {
    expect(plan({})).toBeNull();
    expect(plan({ from: "Union Square", timing: "set", access: "step-free", walking: "less", mode: "ferry" })).toBeNull();
  });

  it("asks one question for the first missing or vague detail, most important first", () => {
    expect(plan({ to: "Brooklyn", timing: "vague", access: "unclear" })?.ask).toBe("destination");
    expect(plan({ to: "Brooklyn" })?.question).toBe("Where in Brooklyn are you going? A street, a station or a place is enough.");
    expect(plan({ from: "here" }, { hasLocation: false })?.ask).toBe("origin");
    expect(plan({ timing: "vague", access: "unclear" })?.ask).toBe("timing");
    expect(plan({ access: "unclear", walking: "unclear" })?.ask).toBe("access");
    expect(plan({ walking: "unclear" })?.ask).toBe("walking");
    expect(plan({ mode: "unclear" })?.ask).toBe("mode");
    expect(plan({ access: "unclear" })?.needsAnswer).toBe(true);
    expect(plan({ access: "unclear" })?.note).toMatch(/in their language/);
  });

  it("stops asking after two answers in a row, except where to start from", () => {
    expect(plan({ access: "unclear" }, { answered: 2 })).toBeNull();
    expect(plan({ to: "Queens" }, { answered: 2 })).toBeNull();
    expect(plan({ from: "here" }, { hasLocation: false, answered: 5 })?.ask).toBe("origin");
  });

  it("knows a borough or part of town from a place", () => {
    for (const p of ["Brooklyn", "the Bronx", "Queens, NY", "midtown", "Staten Island"]) expect(isArea(p)).toBe(true);
    for (const p of ["Brooklyn Museum", "Bronx Zoo", "Queens Center Mall", "Grand Central"]) expect(isArea(p)).toBe(false);
  });

  it("counts the questions the rider just answered, by question mark in any language", () => {
    const m = (...c: string[]) => c.map((content, i) => ({ role: i % 2 ? "assistant" : "user", content }));
    expect(questionsAnswered(m("to Brooklyn"))).toBe(0);
    expect(questionsAnswered(m("to Brooklyn", "Where in Brooklyn?", "Prospect Park"))).toBe(1);
    expect(questionsAnswered(m("去布鲁克林", "去布鲁克林哪里？", "展望公园", "几点出发？", "九点"))).toBe(2);
    expect(questionsAnswered(m("to Brooklyn", "Take the Q train.", "and back"))).toBe(0);
  });

  it("turns the details into the planner's preference", () => {
    expect(preferFrom({ ...clear, mode: "ferry" }, "fastest")).toBe("ferry");
    expect(preferFrom({ ...clear, walking: "less" }, "fastest")).toBe("less-walking");
    expect(preferFrom({ ...clear, walking: "less" }, "bus")).toBe("bus");
    expect(preferFrom(clear, "fastest")).toBe("fastest");
  });
});

const ride = { kind: "ride", route: "Q", mode: "subway", from: "A", to: "B", label: "Q", stops: [], coords: [[0, 0], [1, 1]], durationS: 600 } as unknown as Trip["legs"][number];
const trip = (rides: number, extra: Partial<Trip> = {}): Trip => ({
  id: `t${rides}`, mode: "transit", origin: { label: "a", at: [0, 0] }, destination: { label: "b", at: [1, 1] },
  departIso: "2026-11-02T09:00", arriveIso: "2026-11-02T09:30", legs: Array.from({ length: rides }, () => ride),
  routes: [], alerts: [], elevators: [], hazards: [], weather: null, exitAdvice: null, context: [], skips: [], impacts: [], stubbed: [], alternatives: [], ...extra,
}) as Trip;

describe("the follow-up a trip answer ends with", () => {
  it("offers the step-free way when an elevator on the route is out", () => {
    expect(followUpFor(trip(1, { elevators: ["Flatbush Av: elevator out"] }), { access: "none" })).toEqual({ kind: "step-free" });
  });
  it("offers fewer transfers when an alternative has them, as a route, never a time to leave", () => {
    const f = followUpFor(trip(3, { alternatives: [{ ...trip(1), arriveIso: "2026-11-02T09:36" }] }), { access: "none" });
    expect(f).toEqual({ kind: "fewer", none: true, laterMin: 6 });
    expect(say(f, "en")).toBe("Want the route with no transfer? It arrives about 6 min later.");
  });
  it("otherwise offers the return trip", () => {
    expect(followUpFor(trip(1), { access: "step-free" })).toEqual({ kind: "return" });
  });
});

describe("the model's own closing offer gives way to the app's", () => {
  const stream = (deltas: string[], drop: boolean) => { const h = new CloseHold(); return deltas.map((d) => h.push(d)).join("") + h.rest(drop); };
  it("drops a trailing Want to start? only when the app adds its follow-up", () => {
    expect(stream(["Take the 4.", " Want", " to st", "art?"], true)).toBe("Take the 4.");
    expect(stream(["Take the 4.", " Want", " to st", "art?"], false)).toBe("Take the 4. Want to start?");
  });
  it("lets through text that only began like it", () => {
    expect(stream(["Walk to West", " 4th Street. W", "ant the 6? No."], true)).toBe("Walk to West 4th Street. Want the 6? No.");
  });
});

/* ---------- Through the chat route, with a mocked model ---------- */
const usage = { inputTokens: { total: 100, noCache: 100, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 20, text: 20, reasoning: 0 } };
const finish = (reason: "tool-calls" | "stop") => ({ type: "finish", finishReason: { unified: reason, raw: reason }, usage }) as const;

/** Step 1 calls `toolName` with what the model read; step 2 writes `reply`. */
function model(input: Record<string, unknown>, reply: string, toolName = "transit_plan") {
  let step = 0;
  return new MockLanguageModelV4({
    doStream: () => {
      step += 1;
      const chunks = step === 1
        ? [{ type: "tool-call", toolCallId: "c1", toolName, input: JSON.stringify(input) }, finish("tool-calls")]
        : [{ type: "text-start", id: "t" }, { type: "text-delta", id: "t", delta: reply }, { type: "text-end", id: "t" }, finish("stop")];
      return Promise.resolve({ stream: convertArrayToReadableStream(chunks as never[]) });
    },
  });
}

async function chat(messages: Array<{ role: "user" | "assistant"; content: string }>, m: MockLanguageModelV4, planned: string[] = []) {
  const fairUse = { limiter: createLimiter({ windowMax: 100, windowMs: 60_000, burstMax: 100, burstMs: 60_000 }), budget: createDailyBudget({ softCap: 0, hardCap: 0, capModel: null }), now: Date.now };
  const deps = { otp: { plan: () => { planned.push("otp"); return Promise.resolve([]); } }, planner: { plan: () => Promise.resolve(null) }, changes: [], entrances: { stations: () => Promise.resolve([]) }, alerts: () => Promise.resolve([]), alertEntities: () => Promise.resolve([]), outages: () => Promise.resolve([]), vehicles: () => Promise.resolve([]), now: () => Date.parse("2026-11-01T14:00:00Z") };
  const res = await POST(new Request("http://x/api/agent", { method: "POST", body: JSON.stringify({ messages, location: { lon: -73.99, lat: 40.735 } }) }), { model: m, deps: deps as never, fairUse });
  const events = (await res.text()).trim().split("\n").map((l): StreamEvent => streamEvent.parse(JSON.parse(l)));
  const text = events.filter((e) => e.type === "text").map((e) => (e as { text: string }).text).join("");
  return { events, text, steps: m.doStreamCalls.length, second: m.doStreamCalls[1] };
}

describe("POST /api/agent asks before it plans (#625)", () => {
  it("a vague request gets one clarifying question, in the rider's language, and no plan", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    const planned: string[] = [];
    // "Quiero ir a Brooklyn mañana con mi abuela": the model reads the details and names the language; code picks and says the question.
    const m = model({ to: "Brooklyn", depart: "mañana", timing: "vague", access: "unclear", language: "es" }, "never written");
    const { events, text, steps } = await chat([{ role: "user", content: "Quiero ir a Brooklyn mañana con mi abuela" }], m, planned);
    expect(planned).toEqual([]);
    expect(text).toBe("¿A qué parte de Brooklyn vas? Basta con una calle, una estación o un lugar.");
    expect(text.match(/\?/g)).toHaveLength(1);
    // The model's turn ends with the tool: it gets no step to plan on a guess or add a second question.
    expect(steps).toBe(1);
    expect(events.some((e) => e.type === "actions")).toBe(false);
    vi.restoreAllMocks();
  });

  it("in a language without phrases, the model words the one question in a step with no tools", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    const m = model({ to: "Queens", language: "it" }, "In che parte del Queens vai?");
    const { text, second } = await chat([{ role: "user", content: "Devo andare nel Queens" }], m);
    expect(second?.toolChoice).toEqual({ type: "none" });
    const asked = JSON.stringify(second?.prompt);
    expect(asked).toContain("Where in Queens are you going?");
    expect(asked).not.toContain("NYC Map's assistant");
    expect(text).toBe("In che parte del Queens vai?");
    vi.restoreAllMocks();
  });

  it("a complete request is planned with no question, and the answer ends with a follow-up offer", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    const planned: string[] = [];
    const m = model({ from: "here", to: "Grand Central", depart: "now", timing: "now", language: "en" }, "Walk to Grand Central, about 20 min. Want to start?");
    const { text, second } = await chat([{ role: "user", content: "Get me to Grand Central now" }], m, planned);
    expect(planned).toEqual(["otp"]);
    expect(JSON.stringify(second?.prompt.filter((p) => p.role === "tool"))).not.toContain("needsAnswer");
    // The offer is the app's, said after the answer in place of the model's own "Want to start?".
    expect(text).toBe("Walk to Grand Central, about 20 min. Want the return trip?");
    vi.restoreAllMocks();
  });

  it("drops the model's own Want to start? when no trip was planned (#629)", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    // A line status answer plans nothing, so the offer to start a trip has nothing to start.
    const m = model({ lines: ["A"] }, "The A is running with delays downtown. Want to start?", "line_status");
    const { text } = await chat([{ role: "user", content: "Is the A train running near Times Square right now?" }], m);
    expect(text).toBe("The A is running with delays downtown.");
    vi.restoreAllMocks();
  });

  it("says the follow-up in the language the model named, and by writing system for Chinese", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    const es = await chat([{ role: "user", content: "Llévame a Grand Central ahora" }], model({ to: "Grand Central", language: "es" }, "Camina hasta Grand Central, unos 20 min."));
    expect(es.text).toBe("Camina hasta Grand Central, unos 20 min. ¿Quieres el viaje de vuelta?");
    // The model says "en" for a Chinese message: the writing system wins.
    const zh = await chat([{ role: "user", content: "带我去中央车站" }], model({ to: "Grand Central", language: "en" }, "步行到中央车站，大约20分钟。"));
    expect(zh.text).toBe("步行到中央车站，大约20分钟。 要回程路线吗？");
    vi.restoreAllMocks();
  });

  it("plans once the rider has answered two questions, without asking again", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    const planned: string[] = [];
    // A detail the model still marks unclear gets the default, not a third question.
    const m = model({ to: "Grand Central", depart: "tomorrow 9am", timing: "set", access: "unclear", language: "en" }, "Take the 4 train.");
    const { text } = await chat([
      { role: "user", content: "I need to get to midtown tomorrow" }, { role: "assistant", content: "Where in midtown are you going?" },
      { role: "user", content: "Grand Central" }, { role: "assistant", content: "What time do you want to leave?" },
      { role: "user", content: "9am" },
    ], m, planned);
    expect(planned).toEqual(["otp"]);
    expect(text).toBe("Take the 4 train. Want the return trip?");
    vi.restoreAllMocks();
  });
});

describe("the rider's language", () => {
  it("trusts the writing system first, then the language the model named", () => {
    expect(riderLanguage("去皇后区", "en")).toBe("zh");
    expect(riderLanguage("브루클린 가는 길", "en")).toBe("ko");
    expect(riderLanguage("Мне нужно в парк", "en")).toBe("ru");
    expect(riderLanguage("আমি কুইন্সে যাব", undefined)).toBe("bn");
    expect(riderLanguage("Je dois aller au Bronx", "fr-FR")).toBe("fr");
    expect(riderLanguage("Mwen bezwen ale Brooklyn", "ht")).toBe("ht");
    expect(riderLanguage("Devo andare nel Queens", "it")).toBeNull();
    expect(riderLanguage("東京駅に行きたい", "ja")).toBeNull();
  });
  it("has every sentence in every language the app speaks", () => {
    const lines = [{ kind: "destination", place: "Queens" }, { kind: "origin", place: "" }, { kind: "timing", place: "" }, { kind: "access", place: "" }, { kind: "walking", place: "" }, { kind: "mode", place: "" }, { kind: "step-free" }, { kind: "fewer", none: true, laterMin: 4 }, { kind: "return" }] as const;
    for (const lang of ["en", "es", "zh", "ru", "bn", "ht", "fr", "ko"] as const) {
      for (const l of lines) {
        const text = say(l, lang);
        expect(text, `${lang} ${l.kind}`).toBeTruthy();
        // One question each: the destination's tip after it is a statement.
        expect(text!.match(/[?？]/g), `${lang} ${l.kind}`).toHaveLength(1);
      }
    }
  });
});
