/**
 * Rule checks for a line status reply (#629). Each one compares the reply with what the tool
 * returned, so no person or second model has to judge it. Pure functions: the cases that
 * matter most (the A train reply from #627) are tested offline in checks.test.ts.
 */
import type { LineTrouble } from "../../../src/lib/transit/trouble";
import type { Facts, Violation } from "./types";

const norm = (s: string) => s.toLowerCase().replace(/[.’']/g, "").replace(/\s+/g, " ").trim();
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const sentences = (s: string) => s.split(/(?<=[.!?。？！])\s+|\n+/).filter(Boolean);
const NEGATION = /\b(no|not|isn'?t|aren'?t|doesn'?t|don'?t|without|unaffected|fine|normal|normally|clear)\b/i;
const TROUBLE = /\b(delay\w*|skip\w*|suspend\w*|not running|no service|no trains?|disrupt\w*|problem\w*|stuck)\b/i;

/** Whole-word, case-insensitive mention of a station name. Names containing "St" or "Av" match as written. */
export function mentions(text: string, name: string): boolean {
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escape(norm(name)).replace(/\s/g, "\\s+")}(?![\\p{L}\\p{N}])`, "iu").test(norm(text));
}

/** Facts from the structured troubles, which are what the tool's summary text is written from. */
export function factsFrom(troubles: LineTrouble[]): Facts {
  const names = (stops: Array<{ name: string }>) => stops.map((s) => s.name);
  const skipped = troubles.flatMap((t) => names(t.skipped));
  const switchAt = troubles.flatMap((t) => [...t.switchDirection.map((d) => d.station.name), ...names(t.rejoin)]);
  const named = [...skipped, ...switchAt, ...troubles.flatMap((t) => [...names(t.problemAt), ...names(t.shuttle?.between ?? [])])];
  return {
    quiet: troubles.length === 0,
    skipped: [...new Set(skipped)],
    switchAt: [...new Set(switchAt)],
    named: [...new Set(named)],
    bothDirections: troubles.some((t) => /\bboth directions\b/i.test(t.headline)),
    shuttle: troubles.some((t) => t.shuttle !== null),
  };
}

interface CheckInput {
  reply: string;
  question: string;
  facts: Facts;
  /** Every station name in the city, to tell which stations a reply talks about. */
  stationNames: string[];
  /** The agent planned a trip in this answer (so a closing offer to start it makes sense). */
  planned: boolean;
  /** Ways the question names the place it is about: "Times Square", "Times Sq-42 St". */
  about?: string[];
}

export function checkReply({ reply, question, facts, stationNames, planned, about = [] }: CheckInput): Violation[] {
  const asked = [...new Set([...stationNames.filter((n) => mentions(question, n)), ...about])];
  const out: Violation[] = [];
  if (!reply.trim()) return [{ check: "empty-reply", detail: "no text came back" }];

  // 1. Told to change trains or board at a stop the line skips.
  for (const s of facts.skipped) {
    if (facts.switchAt.some((w) => norm(w) === norm(s))) continue;
    const verb = new RegExp(`\\b(switch|change|transfer|board|get on|catch)\\b[^.!?\\n]{0,60}?(?<![\\p{L}\\p{N}])${escape(norm(s)).replace(/\s/g, "\\s+")}(?![\\p{L}\\p{N}])`, "iu");
    if (verb.test(norm(reply))) out.push({ check: "switch-at-skipped-stop", detail: `sends the rider to change trains at ${s}, which the line skips` });
  }

  // 2. Names a station the tool never gave and the rider never named.
  const allowed = [...facts.named, ...asked].map(norm);
  const seen = new Set<string>();
  for (const n of [...stationNames].sort((a, b) => b.length - a.length)) {
    if (!mentions(reply, n)) continue;
    // A longer name already covered this stretch ("Times Sq-42 St" also contains "42 St").
    if ([...seen].some((w) => w.includes(norm(n)))) continue;
    seen.add(norm(n));
    if (!allowed.includes(norm(n))) out.push({ check: "invented-station", detail: `names ${n}, which neither the tool result nor the question mentions` });
  }

  // 3. "Both directions" when the alert names one.
  if (!facts.bothDirections && /\b(both|either) directions?\b|\bin both ways\b/i.test(reply)) {
    out.push({ check: "widened-direction", detail: "says both directions are affected; the alert does not" });
  }

  // 4. Trouble claimed at a station the rider asked about that no alert touches.
  for (const n of asked) {
    if (facts.named.some((w) => norm(w) === norm(n))) continue;
    for (const sent of sentences(reply)) {
      if (mentions(sent, n) && TROUBLE.test(sent) && !NEGATION.test(sent)) {
        out.push({ check: "trouble-at-unaffected-station", detail: `says there is trouble at ${n}, which no alert names` });
        break;
      }
    }
  }

  // 5. Trouble claimed with no alert, or denied with one.
  const claimsTrouble = sentences(reply).some((s) => TROUBLE.test(s) && !NEGATION.test(s));
  if (facts.quiet && claimsTrouble) out.push({ check: "claims-trouble-when-none", detail: "reports trouble; the feed has no active alert for these lines" });
  const denies = !TROUBLE.test(reply) || (/\b(no|without any) (delays?|disruptions?|service changes?|problems?|trouble)\b/i.test(reply) && !/\b(delayed|delays? (in|on|at|with)|skip\w*|suspend\w*|not running)\b/i.test(reply));
  if (!facts.quiet && denies) out.push({ check: "denies-trouble", detail: "says nothing is wrong although an alert is active" });

  // 6. A shuttle bus nobody announced, or advice to use the stops the line skips.
  if (!facts.shuttle && /\bshuttle\b/i.test(reply)) out.push({ check: "invented-shuttle", detail: "mentions a shuttle bus; the alerts announce none" });
  for (const sent of sentences(reply)) {
    const hits = facts.skipped.filter((s) => mentions(sent, s) && !facts.switchAt.some((w) => norm(w) === norm(s)));
    if (hits.length >= 2 && /\b(take|catch|board|switch|change|transfer|get back|get on)\b/i.test(sent) && !/\b(skip\w*|not (stop|serve)\w*|no inwood|doesn'?t stop|won'?t stop)\b/i.test(sent)) {
      out.push({ check: "advice-names-skipped-stops", detail: `advises something at ${hits.join(", ")}, which the line skips` });
      break;
    }
  }

  // 7. An offer to start a trip that was never planned.
  if (!planned && /want to start\??/i.test(reply)) out.push({ check: "offer-without-trip", detail: 'ends with "Want to start?" but no trip was planned' });

  return out;
}
