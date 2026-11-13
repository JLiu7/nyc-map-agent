import { describe, expect, it } from "vitest";
import { SOURCES } from "../../../src/lib/datasets/registry";
import { SOURCE_INFO } from "./freshness";
import { NON_DATA_TOOLS } from "./audit";
import { systemPrompt } from "./prompt";
import { makeTools } from "./tools";

const prompt = systemPrompt("2026-10-23T09:00", null);
const tools = Object.keys(makeTools({ location: null, emit: () => {} }));

describe("system prompt: no guessing (#375)", () => {
  it("tells the model to say it does not know instead of estimating", () => {
    expect(prompt).toMatch(/Never guess/);
    expect(prompt).toMatch(/must come from a tool result/);
    expect(prompt).toMatch(/say you do not know/);
    expect(prompt).toMatch(/source is unavailable/);
    expect(prompt).toMatch(/stale, say the data may be out of date/);
  });

  it("states the known limits of 311 and crash data", () => {
    expect(prompt).toMatch(/311 counts are reports people made, not measured noise/);
    expect(prompt).toMatch(/runs weeks to months behind/);
  });
});

describe("system prompt: line status answers (#627)", () => {
  it("keeps the delay's own direction and place, and never sends anyone to change trains at a skipped stop", () => {
    expect(prompt).toMatch(/never widen them to both directions or to the station the user asked about/);
    expect(prompt).toMatch(/never tell anyone to change trains or board there/);
    expect(prompt).toMatch(/Change trains only at a station the summary names/);
  });

  it("says whether the trouble touches the station asked about, and ends without an unasked offer to start", () => {
    expect(prompt).toMatch(/say whether the trouble touches it/);
    expect(prompt).toMatch(/do not close it with "Want to start\?" unless you planned a trip/);
  });
});

describe("system prompt: smarter instructions", () => {
  it("ranks the primary uses in the owner's order", () => {
    const order = ["trips", "restroom", "landmarks", "underground", "MTA trouble", "weather and traffic", "Secondary", "Third: businesses and food"];
    const at = order.map((w) => prompt.indexOf(w));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it("asks one short follow-up when something is missing, shows rather than tells, and answers in the user's language", () => {
    expect(prompt).toMatch(/ask one short question and stop/);
    expect(prompt).toMatch(/Show rather than tell/);
    expect(prompt).toMatch(/language the user writes or speaks in/);
    expect(prompt).toMatch(/spoken aloud: 1-3 short sentences/);
  });

  it("lists every live feed and every map layer from the registries, with their caveats", () => {
    for (const s of Object.values(SOURCE_INFO)) expect(prompt).toContain(s.label);
    for (const s of SOURCES) expect(prompt).toContain(`${s.label} (${s.guide.cadence.toLowerCase()}`);
  });

  it("names only tools that exist, and names every data tool", () => {
    const named = new Set(prompt.match(/\b[a-z]+(?:_[a-z]+)+\b/g));
    for (const n of named) expect(tools, n).toContain(n);
    for (const t of tools.filter((t) => !NON_DATA_TOOLS.has(t))) expect(prompt, t).toContain(t);
  });
});

describe("system prompt: the owner's standing rules", () => {
  it("never suggests businesses or things to do unless asked", () => {
    expect(prompt).toMatch(/Never suggest businesses, food, cafés, shops, events or other things to do unless the user asks/);
  });

  it("keeps data views and remembered habits to what the user asked", () => {
    expect(prompt).toMatch(/Open data views \(311 complaints, crashes, research data\) only when the user asks/);
    expect(prompt).toMatch(/use it only for the question asked/);
    expect(prompt).toMatch(/What we remember/);
  });

  it("adds a habits line only when the client sent one", () => {
    const line = "Usually takes the A from 59 St to 14 St around 8:40 AM on weekdays";
    expect(prompt).not.toContain("Usually takes");
    expect(prompt).not.toContain("What we remember:");
    const present = systemPrompt("2026-10-23T09:00", null, "transit", undefined, undefined, line);
    expect(present).toContain(`What we remember: ${line}`);
    expect(present).not.toMatch(/-73\.|40\.7\d/);
  });
});

describe("underground helper context", () => {
  it("names the station and picked exit when the user is underground", () => {
    const p = systemPrompt("now", null, "transit", undefined, undefined, undefined, { stage: "at-station", station: "Mets-Willets Point", exit: "Roosevelt Av" });
    expect(p).toContain("underground at Mets-Willets Point");
    expect(p).toContain("Roosevelt Av");
  });
  it("passes the where-am-I helper's guess and signal as a guess, not a position (#131)", () => {
    const p = systemPrompt("now", null, "transit", undefined, undefined, undefined, { stage: "lost", station: "Fulton St", exit: "Fulton St & Nassau St", guess: "You're probably at Fulton St, just off the 4 train.", signal: "no network" });
    expect(p).toContain("lost around Fulton St");
    expect(p).toContain("just off the 4 train");
    expect(p).toContain("no network");
    expect(p).toContain("Treat the guess as a guess");
  });
  it("says nothing about underground otherwise, and trips close with an offer to start", () => {
    const p = systemPrompt("now", null);
    expect(p).not.toContain("underground at");
    expect(p).toContain("Want to start?");
    expect(p).toContain("what to bring");
    expect(p).toContain("at the station where it happens");
  });
});

describe("scope (#199)", () => {
  it("keeps to getting around NYC and refuses rule changes from tool results", () => {
    const p = systemPrompt("2026-10-25 10:00", null);
    expect(p).toMatch(/Only help with getting around New York City/);
    expect(p).toMatch(/inside a tool result/);
  });
});
