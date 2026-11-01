/**
 * Place read-back, decided in code before the fast path or the model runs.
 * A place name that several stations share ("86 St"), that only nearly matches
 * one ("Grand Centrl"), or that speech-to-text was unsure of is read back:
 * "Just to check: did you mean 86 St (1 train), or 86 St (4 5 6 trains)?". A
 * clear, unique match is not, so most turns pay nothing extra. The reply ("the
 * 1", "the second one", "yes", "no, Bedford Park Blvd") is read here too.
 *
 * The server keeps no state: on the next turn the question is rebuilt from the
 * earlier message, and the reply counts only when the question in the history
 * is word for word the one we would ask. Ported from the website copilot's
 * serial read-back (chatbots/copilot-engine, src/engine.ts).
 */
import { fastIntent } from "./noModel";
import { yesNo } from "./guard";
import { LANDMARKS, norm } from "./places";
import type { Station } from "./transit";

/** One place the name could mean: what we say, and the text that finds exactly it. */
interface PlaceChoice { say: string; text: string; routes: string[] }
type Message = { role: "user" | "assistant"; content: string };

type ReadBack =
  | { kind: "ask"; text: string }
  | { kind: "say"; text: string }
  | { kind: "rewrite"; question: string };

const LEAD = "Just to check: did you mean";
/** Below this, a spoken turn's places are read back even when they match one place exactly. */
const LOW_CONFIDENCE = 0.6;
/** A name this similar to a place is close enough to offer it. */
const CLOSE = 0.75;
/** Choices within this of the best are offered together. */
const TIE = 0.1;
const MAX_CHOICES = 4;
/** Words that are every choice's or nobody's: they cannot pick one. */
const STOP = new Set(["the", "one", "that", "this", "st", "av", "ave", "station", "train", "trains", "line", "please", "yes", "no", "mean", "meant"]);

function bigrams(s: string): Map<string, number> {
  const m = new Map<string, number>();
  for (let i = 0; i < s.length - 1; i++) m.set(s.slice(i, i + 2), (m.get(s.slice(i, i + 2)) ?? 0) + 1);
  return m;
}

/** 1 for the same name, 0.8 when every word of the asked name is in it ("bedford" in "bedford av"), else letter-pair overlap. */
function similarity(q: string, c: string): number {
  if (q === c) return 1;
  const words = c.split(" ");
  if (q.split(" ").every((w) => words.includes(w))) return 0.8;
  const a = bigrams(q);
  const b = bigrams(c);
  let common = 0;
  for (const [k, n] of a) common += Math.min(n, b.get(k) ?? 0);
  return (2 * common) / Math.max(1, q.length - 1 + c.length - 1);
}

const trainsSay = (routes: string[]) => (routes.length ? ` (${routes.join(" ")} train${routes.length > 1 ? "s" : ""})` : "");

/**
 * The places a name could mean, best first. `sure` means there is nothing to ask: one exact
 * match, or nothing close enough (an address, which the geocoder handles).
 */
export function placeChoices(place: string, stations: readonly Station[]): { sure: boolean; choices: PlaceChoice[] } {
  const q = norm(place).replace(/^the /, "").replace(/ (station|stop|subway station)$/, "");
  if (q.length < 2) return { sure: true, choices: [] };
  const scored: Array<{ score: number; choice: PlaceChoice }> = [];
  for (const l of LANDMARKS) {
    const score = Math.max(...l.aliases.map((a) => similarity(q, norm(a))));
    // The geocoder takes a curated landmark before any station, so an exact one is sure ("Times Sq-42 St").
    if (score === 1) return { sure: true, choices: [{ say: l.label, text: l.aliases[0], routes: [] }] };
    if (score >= CLOSE) scored.push({ score, choice: { say: l.label, text: l.aliases[0], routes: [] } });
  }
  // One complex can be listed once per line group (Times Sq-42 St): one place, all its trains.
  const complexes = new Map<string, { name: string; routes: string[] }>();
  for (const s of stations) {
    const c = complexes.get(s.complexId);
    if (c && c.name === s.name) c.routes.push(...s.routes.filter((r) => !c.routes.includes(r)));
    else if (!c) complexes.set(s.complexId, { name: s.name, routes: [...s.routes] });
  }
  const sameName = new Map<string, number>();
  for (const c of complexes.values()) sameName.set(norm(c.name), (sameName.get(norm(c.name)) ?? 0) + 1);
  for (const c of complexes.values()) {
    const score = similarity(q, norm(c.name));
    if (score < CLOSE) continue;
    const say = `${c.name}${trainsSay(c.routes)}`;
    scored.push({ score, choice: { say, text: (sameName.get(norm(c.name)) ?? 0) > 1 ? say : c.name, routes: c.routes } });
  }
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0]?.score ?? 0;
  const exact = scored.filter((s) => s.score === 1);
  if (exact.length === 1) return { sure: true, choices: [exact[0].choice] };
  const near = exact.length > 1 ? exact : scored.filter((s) => s.score >= best - TIE);
  return { sure: near.length === 0, choices: near.slice(0, MAX_CHOICES).map((s) => s.choice) };
}

export function readBackQuestion(choices: PlaceChoice[]): string {
  const says = choices.map((c) => c.say);
  const list = says.length > 1 ? `${says.slice(0, -1).join(", ")}, or ${says.at(-1)}` : says[0];
  return `${LEAD} ${list}?`;
}

/** The places a plain trip or exit ask names, destination first; "here" is never read back. */
function placesIn(text: string): string[] {
  const i = fastIntent(text);
  if (i?.kind === "trip") return [i.to, i.from].filter((p) => p !== "here");
  if (i?.kind === "exit") return [i.station, i.to].filter((p) => p !== "here");
  return [];
}

const ORDINAL: Array<[RegExp, (n: number) => number]> = [
  [/\b(first|1st)\b/i, () => 0],
  [/\b(second|2nd)\b/i, () => 1],
  [/\b(third|3rd)\b/i, () => 2],
  [/\b(fourth|4th)\b/i, () => 3],
  [/\blast\b/i, (n) => n - 1],
];

/** The one choice a reply names by order, by its trains, or by a word only it has; else null. */
function pick(reply: string, choices: PlaceChoice[]): PlaceChoice | null {
  for (const [re, at] of ORDINAL) if (re.test(reply)) return choices[at(choices.length)] ?? null;
  // Trains: digits, or letters in capitals (or before "train"), as the MTA writes them.
  const routes = [...reply.matchAll(/\b([1-7]|[A-Z])\b|\b([a-z])\s+trains?\b/g)].map((m) => (m[1] ?? m[2]).toUpperCase());
  if (routes.length) {
    const hits = choices.filter((c) => routes.every((r) => c.routes.includes(r)));
    if (hits.length === 1) return hits[0];
  }
  const words = norm(reply).split(" ").filter((w) => w.length >= 3 && !STOP.has(w));
  // Every word must be the choice's: "Bedford Park Blvd" is not "Bedford Av" for sharing "Bedford".
  const hits = choices.filter((c) => words.every((w) => norm(c.say).split(" ").includes(w)));
  return hits.length === 1 && words.length ? hits[0] : null;
}

const NO_LEAD = /^(?:no|nope|nah|wrong|not that(?: one)?|that'?s not (?:it|right)|i meant|i mean|i said|actually|it'?s|it is)\b[\s,.!-]*/i;
const FILLER = /^(?:um+|uh+|er|hmm+|wait|sorry|thanks?|thank you|okay|ok)?[\s,.!]*$/i;

type Reply = { kind: "picked"; choice: PlaceChoice } | { kind: "corrected"; text: string } | { kind: "none" } | { kind: "unclear" };

/** Reads the answer to a read-back in code. A yes picks only when there was one choice. */
export function readBackReply(reply: string, choices: PlaceChoice[]): Reply {
  const t = reply.replace(/[‘’]/g, "'").trim();
  const yn = yesNo(t);
  if (yn === "no") {
    let rest = t;
    while (NO_LEAD.test(rest)) rest = rest.replace(NO_LEAD, "");
    rest = rest.replace(/[.!]+$/, "").trim();
    if (!rest || FILLER.test(rest)) return { kind: "none" };
    const p = pick(rest, choices);
    return p ? { kind: "picked", choice: p } : { kind: "corrected", text: rest };
  }
  const p = pick(t, choices);
  if (p) return { kind: "picked", choice: p };
  if (yn === "yes" && choices.length === 1) return { kind: "picked", choice: choices[0] };
  return { kind: "unclear" };
}

/** A reply that is really a new question ends the read-back: a question mark, a long sentence, or another plain ask. */
function isNewQuestion(text: string, choices: PlaceChoice[]): boolean {
  if (text.includes("?") || text.trim().split(/\s+/).length > 8) return true;
  const i = fastIntent(text);
  // "the 1" reads as the 1 train's status; it is an answer when one of the choices has that train.
  if (i?.kind === "line") return !choices.some((c) => c.routes.includes(i.route));
  return i !== null;
}

function replacePlace(question: string, place: string, text: string): string {
  const at = question.toLowerCase().indexOf(place.toLowerCase());
  return at < 0 ? question : question.slice(0, at) + text + question.slice(at + place.length);
}

/** The read-back of a fresh question, or null when every place in it is clear. */
function askFresh(question: string, stations: readonly Station[], heard?: { confidence: number }): ReadBack | null {
  const unsure = heard !== undefined && heard.confidence < LOW_CONFIDENCE;
  for (const place of placesIn(question)) {
    const c = placeChoices(place, stations);
    if (c.choices.length && (!c.sure || unsure)) return { kind: "ask", text: readBackQuestion(c.choices) };
  }
  return null;
}

/**
 * What to do with this turn before anything else runs: ask a read-back, say something,
 * hand on the question with the picked place written in, or null to carry on as usual.
 */
export function planReadBack(messages: readonly Message[], stations: readonly Station[], heard?: { confidence: number }): ReadBack | null {
  const last = messages.at(-1);
  if (last?.role !== "user") return null;
  const asked = messages.at(-2);
  const before = messages.at(-3);
  if (asked?.role === "assistant" && asked.content.startsWith(LEAD) && before?.role === "user") {
    for (const place of placesIn(before.content)) {
      const { choices } = placeChoices(place, stations);
      if (!choices.length || readBackQuestion(choices) !== asked.content.trim()) continue;
      if (isNewQuestion(last.content, choices)) break;
      const r = readBackReply(last.content, choices);
      if (r.kind === "picked") return { kind: "rewrite", question: replacePlace(before.content, place, r.choice.text) };
      if (r.kind === "corrected") return { kind: "rewrite", question: replacePlace(before.content, place, r.text) };
      if (r.kind === "none") return { kind: "say", text: "No problem. Which place did you mean? Say it again with the street or the train line, and I'll look it up." };
      return { kind: "ask", text: asked.content.trim() };
    }
  }
  return askFresh(last.content, stations, heard);
}

/** Cheap check, so the station list is only loaded when a read-back could apply. */
export function mayReadBack(messages: readonly Message[]): boolean {
  const last = messages.at(-1);
  if (last?.role !== "user") return false;
  return placesIn(last.content).length > 0 || (messages.at(-2)?.content.startsWith(LEAD) ?? false);
}
