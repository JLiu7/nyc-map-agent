/**
 * Answers that need no language model (#199): when the daily budget is spent
 * or the model fails before saying anything, the two questions people ask most
 * in a hurry still get a real answer from the app's own feeds. Each one runs
 * the same tool the model would call, so the buttons under the answer match.
 * Anything else gets null and the caller keeps its usual message.
 */
import { isArea } from "./ask";
import { hoursToday } from "./hours";
import type { makeTools } from "./tools";

type Tools = ReturnType<typeof makeTools>;
type Question = { text: string; hasLocation: boolean; now?: Date };

// Also the words the Restroom button asks with in the app's other languages (French, Haitian Creole,
// Russian, Chinese, Korean, Bengali); \b does not work next to those scripts, so they match on their own.
const RESTROOM = /\b(rest ?rooms?|bathrooms?|toilets?|toilettes?|washrooms?|loos?|wc|baños?|banos?|servicios|sanitarios?|aseos?|twal[eè]t)\b|туалет|厕所|洗手间|화장실|টয়লেট/i;
// "is the N running", "Q train delays", "the 7 line": the subway's own letters and numbers.
// Letters are matched in capitals only, so "take a train" is not the A.
const LINE = /\b(?:[Tt]he\s+)?([1-7]|[ABCDEFGJLMNQRWZ]|SIR)\s*(?:[Tt]rains?|[Ll]ines?|[Ss]ubway)\b|\b(?:[Ii]s|[Aa]re)\s+the\s+([1-7]|[ABCDEFGJLMNQRWZ])\b/;

export type NoModelIntent =
  | { kind: "restroom" }
  | { kind: "line"; route: string }
  | { kind: "exit"; station: string; to: string }
  | { kind: "trip"; from: string; to: string };

export function noModelIntent(text: string): NoModelIntent | null {
  if (RESTROOM.test(text)) return { kind: "restroom" };
  const m = LINE.exec(text);
  const route = m?.[1] ?? m?.[2];
  return route ? { kind: "line", route: route.toUpperCase() } : null;
}

// Words a plain "where's the nearest restroom" or "is the 7 running" question is made of. A question
// with any other word in it (a place, "on the way", "with a stroller") goes to the model.
const RESTROOM_WORD = /^(rest ?rooms?|bathrooms?|toilets?|washrooms?)$/;
const RESTROOM_FILLER = new Set(["where", "wheres", "where's", "is", "are", "the", "a", "an", "nearest", "closest", "public", "open", "now", "right", "that", "thats", "that's", "near", "me", "nearby", "around", "here", "i", "need", "find", "any", "to", "go", "can", "use", "please", "one"]);
const ROUTE = /^([1-7]|[ABCDEFGJLMNQRWZ]|SIR)$/;
const LINE_FILLER = new Set(["how", "hows", "how's", "is", "are", "the", "train", "trains", "line", "subway", "running", "doing", "right", "now", "today", "there", "any", "delays", "delay", "on", "status", "of", "service", "whats", "what's", "with"]);

const words = (text: string) => text.replace(/[\u2018\u2019]/g, "'").replace(/[?!.,¿¡]/g, " ").split(/\s+/).filter(Boolean);

// "Which exit for the Met", "which exit at Herald Sq for Macy's", "how do I get to the Met",
// "Plan a trip from Union Square to Grand Central". A place that carries a time, a way to travel or
// a second wish ("at 5pm", "by bus", "and lunch") goes to the model, which reads those.
const EXIT_ASK = /^(?:which|what) (?:exit|way out)(?: should i (?:take|use))?(?: (?:at|from) (?<station>.+?))? (?:for|to) (?<to>.+?)(?: (?:at|from) (?<station2>.+?))?$/i;
const TRIP_ASK = /^(?:how (?:do|can|should) (?:i|we) (?:get|go)|how to get|directions|plan a trip|take me|get me|route me|navigate)(?: from (?<from>.+?))? to (?<to>.+?)$/i;
const NOT_PLAIN = /\b(?:at|by|before|after|around|tomorrow|tonight|today|now|morning|afternoon|evening|noon|midnight|am|pm|monday|tuesday|wednesday|thursday|friday|saturday|sunday|weekend|bus|buses|subway|train|walk|walking|drive|driving|car|bike|ferry|taxi|only|fast|fastest|quickest|cheapest|less|least|without|avoid|and|or|with|via|then|stroller|wheelchair|elevator|accessible)\b|\d{1,2}(?::\d{2})?\s*(?:am|pm)\b|[,;?]/i;
const placeOk = (p: string | undefined): p is string => !!p && p.length >= 2 && p.length <= 48 && !NOT_PLAIN.test(p);
// "the Brooklyn Museum" finds a children's museum annex; the name alone finds the museum.
const bare = (p: string) => p.replace(/^the\s+/i, "");
const norm = (p: string) => p.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
/** The place found carries the asked name, so the lookup did not land on some other place. */
export const foundAsAsked = (asked: string, found: string | undefined) => !!found && norm(found.split(",")[0]).includes(norm(bare(asked.replace(/\s*\([^)]*\)/, ""))));

/** The plain exit or trip ask, or null. English only, like the rest of the fast path. */
function placeIntent(text: string): NoModelIntent | null {
  const t = text.replace(/[\u2018\u2019]/g, "'").trim().replace(/[?.!]+$/, "").replace(/\s+/g, " ");
  const e = EXIT_ASK.exec(t);
  if (e?.groups) {
    const station = e.groups.station ?? e.groups.station2;
    if (placeOk(e.groups.to) && (station === undefined || placeOk(station))) return { kind: "exit", station: station ? bare(station) : "here", to: bare(e.groups.to) };
    return null;
  }
  const r = TRIP_ASK.exec(t);
  if (r?.groups && placeOk(r.groups.to) && (r.groups.from === undefined || placeOk(r.groups.from))) {
    return { kind: "trip", from: r.groups.from ? bare(r.groups.from) : "here", to: bare(r.groups.to) };
  }
  return null;
}

/**
 * A question the app answers on its own, before the model: plain English asks for the nearest
 * restroom or one subway line's status, like the home buttons send. Exact and narrow on purpose:
 * anything more goes to the model, which also answers in the asker's language.
 */
export function fastIntent(text: string): NoModelIntent | null {
  const w = words(text);
  if (!w.length || w.length > 14) return null;
  const lower = w.map((x) => x.toLowerCase());
  if (lower.some((x) => RESTROOM_WORD.test(x)) && lower.every((x) => RESTROOM_WORD.test(x) || RESTROOM_FILLER.has(x))) return { kind: "restroom" };
  // Letters count in capitals only, so "is there a delay" has no A train in it.
  const routes = w.filter((x) => ROUTE.test(x));
  if (routes.length === 1 && w.every((x, i) => ROUTE.test(x) || LINE_FILLER.has(lower[i]))) return { kind: "line", route: routes[0] };
  return placeIntent(text);
}

const call = { toolCallId: "no-model", messages: [] };
/**
 * Runs a tool the way the model would, outside a model step. The input goes through the tool's own
 * schema first, so its defaults apply (transit_plan's depart is "now" only after that).
 */
const run = <R>(t: { execute?: unknown; inputSchema?: unknown }, input: unknown): Promise<R> => {
  const schema = t.inputSchema as { parse?: (v: unknown) => unknown } | undefined;
  return (t.execute as (input: unknown, options: typeof call) => Promise<R>)(schema?.parse ? schema.parse(input) : input, call);
};

/** A walk from an exit longer than this means the place was found somewhere else; the model asks. */
const FAR_WALK_MIN = 30;

type RestroomResult = { restrooms: Array<{ name: string; distanceM: number; openNow?: boolean | null; hours?: string | null }>; walkToNearest: { minutes: number } | null };
type ExitResult = { station: string; to?: string; exit: string; elevatorOnly: boolean; outage?: string | null; walkFromExit: { minutes: number } | null };
type TripResult = {
  summary: string; destination?: string; totalMin: number; arrive: string; tripId: string; blocked?: boolean;
  affectsThisTrip?: string[]; exitAdvice?: string | null; elevatorOutages?: string[];
};

/** "6:40 pm" from a New York local time like "2026-10-28T18:40" (no zone: it is already New York's). */
export const clock = (local: string) => {
  const m = /T(\d{2}):(\d{2})/.exec(local);
  if (!m) return null;
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? "am" : "pm"}`;
};

type LineResult = { trouble: Array<{ summary: string }>; alerts: unknown[]; note?: string; elevatorEscalatorOutages?: { stations: number; list: string[] } };

/** The answer text, or null when the question is not one of these or the feed failed. */
export async function answerWithoutModel(q: Question, tools: Tools, intent: NoModelIntent | null = noModelIntent(q.text)): Promise<string | null> {
  if (!intent) return null;
  try {
    if (intent.kind === "restroom") {
      if (!q.hasLocation) return "To find the nearest public restroom, tap Use my location, or turn on Restrooms in the Layers menu to see them all on the map.";
      const r = await run<RestroomResult>(tools.nearest_restroom, { place: "here" });
      const first = r.restrooms[0];
      if (!first) return "I couldn't find an open public restroom nearby. Turn on Restrooms in the Layers menu to see them on the map.";
      const walk = r.walkToNearest ? `, about ${r.walkToNearest.minutes} min on foot` : `, about ${first.distanceM} m away`;
      // Today's hours only; the card under the answer has the whole week.
      const today = hoursToday(first.hours, q.now ?? new Date());
      const hours = today === "closed" ? " It is closed today." : today ? ` Open today ${today}.` : "";
      return `The nearest public restroom is ${first.name}${walk}.${hours} Tap the button below to see the way.`;
    }
    if (intent.kind === "exit") {
      if (intent.station === "here" && !q.hasLocation) return null;
      const r = await run<ExitResult>(tools.station_exit, { station: intent.station, to: intent.to });
      if (!r.walkFromExit || r.walkFromExit.minutes > FAR_WALK_MIN || !foundAsAsked(intent.to, r.to)) return null;
      const lift = r.elevatorOnly ? " It is elevator-only." : "";
      const out = r.outage ? ` Heads up: ${r.outage}.` : "";
      const walk = r.walkFromExit ? `, then about ${r.walkFromExit.minutes} min on foot` : "";
      return `Use the ${r.exit} at ${r.station}${walk}.${lift}${out} Want to start?`;
    }
    if (intent.kind === "trip") {
      // "How do I get to Brooklyn": the model asks where in Brooklyn (ask.ts).
      if ((intent.from === "here" && !q.hasLocation) || isArea(intent.to)) return null;
      const r = await run<TripResult>(tools.transit_plan, { from: intent.from, to: intent.to });
      // A trip the day's changes break needs the model to weigh the alternatives; a place found under
      // another name may be the wrong place, and the model can ask.
      const at = clock(r.arrive);
      if (r.blocked || !at || !foundAsAsked(intent.to, r.destination)) return null;
      await run(tools.showRoute, { tripId: r.tripId });
      await run(tools.openPanel, { tripId: r.tripId });
      const first = r.affectsThisTrip?.length ? `${r.affectsThisTrip[0]} ` : "";
      const rides = r.summary === "walk" ? "Walk there" : `Take the ${r.summary.replace(/ subway\b/g, " train").replace(/ → /g, ", then the ")}`;
      const exit = r.exitAdvice ? ` ${r.exitAdvice}` : "";
      const lift = r.elevatorOutages?.length ? ` Elevator out: ${r.elevatorOutages[0]}.` : "";
      return `${first}${rides}: about ${r.totalMin} min, arriving around ${at}.${exit}${lift} Press Play on the card to preview it.`;
    }
    const r = await run<LineResult>(tools.line_status, { lines: [intent.route] });
    // The line card lists these, so the answer must not read as "all clear" over them.
    const n = r.elevatorEscalatorOutages?.stations ?? 0;
    const access = n === 1 ? ` ${r.elevatorEscalatorOutages!.list[0]}.` : n > 1 ? ` ${n} stations have an elevator or escalator out; they're on the line card.` : "";
    if (!r.trouble.length) return `The MTA lists no delays or changes on the ${intent.route} train right now.${access}`;
    // The feed starts each notice with the line ("7: In Queens, …"); the question already named it.
    const lead = new RegExp(`^${intent.route}\\s*:\\s*`);
    // First sentence of each: the rest (how to reach a skipped stop) is on the map and in the line card.
    const first = (t: string) => t.replace(lead, "").trim().split(/(?<=[.!])\s+(?=[A-Z])/)[0];
    const notes = [...new Set(r.trouble.map((t) => first(t.summary)))].slice(0, 2);
    const more = r.trouble.length > notes.length ? " There's more on the map." : "";
    return `${notes.join(" ")}${more}${access} The buttons below show it on the map.`;
  } catch {
    return null;
  }
}
