import { describe, expect, it } from "vitest";
import { placeChoices, planReadBack, readBackQuestion, readBackReply } from "./readback";
import type { Station } from "./transit";

const st = (id: string, name: string, routes: string[], complexId = id): Station => ({ id, complexId, name, routes, structure: "Subway", at: [-73.95, 40.75] });
const stations: Station[] = [
  st("1", "86 St", ["1"]),
  st("2", "86 St", ["4", "5", "6"]),
  st("3", "86 St", ["Q"]),
  st("4", "Bedford Av", ["L"]),
  st("5", "Bedford Park Blvd", ["B", "D"]),
  st("6", "Bedford Park Blvd-Lehman College", ["4"]),
  st("7", "Times Sq-42 St", ["1", "2", "3"], "611"),
  st("8", "Times Sq-42 St", ["N", "Q", "R", "W"], "611"),
  st("9", "Grand Central-42 St", ["4", "5", "6"]),
];
const user = (content: string) => ({ role: "user" as const, content });
const assistant = (content: string) => ({ role: "assistant" as const, content });

describe("placeChoices: which places a name could mean", () => {
  it("a unique exact name is one sure choice", () => {
    const c = placeChoices("Bedford Av", stations);
    expect(c.sure).toBe(true);
    expect(c.choices.map((x) => x.say)).toEqual(["Bedford Av (L train)"]);
  });

  it("a landmark name is sure even when a station name starts with it", () => {
    expect(placeChoices("Times Square", stations).sure).toBe(true);
    expect(placeChoices("Grand Central", stations).sure).toBe(true);
  });

  it("one station complex listed once per line group is still one place", () => {
    const c = placeChoices("Times Sq-42 St", stations);
    expect(c.sure).toBe(true);
    expect(c.choices).toHaveLength(1);
  });

  it("a name six stations share is not sure, and each choice names its trains", () => {
    const c = placeChoices("86 St", stations);
    expect(c.sure).toBe(false);
    expect(c.choices.map((x) => x.say)).toEqual(["86 St (1 train)", "86 St (4 5 6 trains)", "86 St (Q train)"]);
    expect(c.choices[0].text).toBe("86 St (1 train)");
  });

  it("a part of several names offers the close ones", () => {
    const c = placeChoices("Bedford", stations);
    expect(c.sure).toBe(false);
    expect(c.choices.map((x) => x.say)).toEqual(expect.arrayContaining(["Bedford Av (L train)", "Bedford Park Blvd (B D trains)"]));
  });

  it("a near spelling of a landmark offers that landmark", () => {
    const c = placeChoices("Grand Centrl", stations);
    expect(c.sure).toBe(false);
    expect(c.choices[0].say).toBe("Grand Central Terminal");
    expect(c.choices[0].text).toBe("grand central");
  });

  it("an address matches nothing, so the geocoder handles it", () => {
    expect(placeChoices("350 5th Ave", stations).choices).toEqual([]);
  });
});

describe("planReadBack: when to ask before answering", () => {
  it("asks before answering a trip to an ambiguous station", () => {
    const r = planReadBack([user("how do I get to 86 St")], stations);
    expect(r).toEqual({ kind: "ask", text: readBackQuestion(placeChoices("86 St", stations).choices) });
    expect(r && r.kind === "ask" && r.text).toMatch(/^Just to check: did you mean 86 St \(1 train\), 86 St \(4 5 6 trains\), or 86 St \(Q train\)\?$/);
  });

  it("stays out of the way for a clear place, so the turn costs no extra wait", () => {
    expect(planReadBack([user("how do I get to Bedford Av")], stations)).toBeNull();
    expect(planReadBack([user("where's the nearest restroom")], stations)).toBeNull();
    expect(planReadBack([user("how do I get to 350 5th Ave")], stations)).toBeNull();
  });

  it("reads back even a clear place when speech-to-text was unsure", () => {
    const r = planReadBack([user("how do I get to Bedford Av")], stations, { confidence: 0.4 });
    expect(r).toEqual({ kind: "ask", text: "Just to check: did you mean Bedford Av (L train)?" });
    expect(planReadBack([user("how do I get to Bedford Av")], stations, { confidence: 0.9 })).toBeNull();
  });

  it("checks the station of an exit ask too", () => {
    const r = planReadBack([user("which exit at 86 St for the museum")], stations);
    expect(r?.kind).toBe("ask");
  });
});

describe("readBackReply and the turn after a read-back", () => {
  const choices = placeChoices("86 St", stations).choices;
  const history = (reply: string, confidence?: number) => {
    const asked = planReadBack([user("how do I get to 86 St")], stations, confidence === undefined ? undefined : { confidence });
    return [user("how do I get to 86 St"), assistant(asked && asked.kind === "ask" ? asked.text : ""), user(reply)];
  };

  it("picks by train, by order, or by a word only one choice has", () => {
    expect(readBackReply("the 1", choices)).toEqual({ kind: "picked", choice: choices[0] });
    expect(readBackReply("the Q train", choices)).toEqual({ kind: "picked", choice: choices[2] });
    expect(readBackReply("the second one", choices)).toEqual({ kind: "picked", choice: choices[1] });
    const bedford = placeChoices("Bedford", stations).choices;
    expect(readBackReply("Lehman", bedford)).toEqual({ kind: "picked", choice: bedford.find((c) => c.say.includes("Lehman")) });
  });

  it("a plain yes picks the only choice, and never one of several", () => {
    const one = placeChoices("Bedford Av", stations).choices;
    expect(readBackReply("yes", one)).toEqual({ kind: "picked", choice: one[0] });
    expect(readBackReply("yes", choices)).toEqual({ kind: "unclear" });
    expect(readBackReply("yes but", one)).toEqual({ kind: "unclear" });
  });

  it("a no with another place is a spoken correction; a bare no asks again", () => {
    expect(readBackReply("no, Bedford Park Blvd", placeChoices("Bedford Av", stations).choices)).toEqual({ kind: "corrected", text: "Bedford Park Blvd" });
    expect(readBackReply("no", choices)).toEqual({ kind: "none" });
  });

  it("rewrites the question with the exact place once picked", () => {
    expect(planReadBack(history("the 4 5 6"), stations)).toEqual({ kind: "rewrite", question: "how do I get to 86 St (4 5 6 trains)" });
  });

  it("rewrites with a spoken correction", () => {
    const h = [user("how do I get to Bedford Av"), assistant("Just to check: did you mean Bedford Av (L train)?"), user("no, Bedford Park Blvd")];
    expect(planReadBack(h, stations, undefined)).toEqual({ kind: "rewrite", question: "how do I get to Bedford Park Blvd" });
  });

  it("asks for the place again after a bare no", () => {
    const r = planReadBack(history("no"), stations);
    expect(r?.kind).toBe("say");
  });

  it("repeats the same question when the reply is unclear, so the next reply is still read", () => {
    const h = history("hmm");
    expect(planReadBack(h, stations)).toEqual({ kind: "ask", text: h[1].content });
  });

  it("a new question drops the read-back", () => {
    expect(planReadBack(history("actually where is the nearest restroom?"), stations)).toBeNull();
    expect(planReadBack(history("is the 7 running"), stations)).toBeNull();
  });

  it("only treats a reply as an answer when the read-back in the history is word for word ours", () => {
    const h = [user("how do I get to 86 St"), assistant("Just to check: did you mean something else?"), user("the 1")];
    expect(planReadBack(h, stations)).toBeNull();
  });

  it("a low-confidence read-back of one place is found again on the next turn without the confidence", () => {
    const h = [user("how do I get to Bedford Av"), assistant("Just to check: did you mean Bedford Av (L train)?"), user("yes")];
    expect(planReadBack(h, stations)).toEqual({ kind: "rewrite", question: "how do I get to Bedford Av" });
  });
});
