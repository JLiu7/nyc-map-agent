/**
 * Rule checks on one turn of a trip conversation (#23). Each looks at the tools the agent called,
 * the map commands it sent and its reply, against what the case says the turn asked for.
 * They judge tool use, not whether the itinerary is the best one.
 */
import type { Expect, Observed, Violation } from "./types";

export const PLANNERS = ["transit_plan", "route_walk", "drive_plan"];
const DRAWS = ["showRoute", "openPanel", "playFlythrough"];
/** One tool this many times in a turn is a loop (the 2026-11-01 hunger question ran suggest_layer 8 times). */
export const LOOP_AT = 4;
/** Names the rider should never see: tool and field names, trip ids, UUIDs. */
const INTERNAL = /\b(walkToNearest|tripId|transit_plan|route_walk|drive_plan|nearest_restroom|suggest_layer|showRoute|openPanel|playFlythrough|line_status)\b|\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/;

/**
 * The app's own readback of an ambiguous station name (server/features/agent/readback.ts). It is
 * the right move, not a missed plan, so the runner answers "Yes" as a rider would and scores what follows.
 */
export const isReadback = (reply: string) => reply.startsWith("Just to check: did you mean");

export function checkTurn(expect: Expect, o: Observed): Violation[] {
  const out: Violation[] = [];
  const planned = o.tools.some((t) => PLANNERS.includes(t));
  const drew = o.commands.some((c) => DRAWS.includes(c)) || o.tools.some((t) => DRAWS.includes(t));
  if (expect.trip && !planned) out.push({ check: "no-plan-without-tool", detail: o.tools.length ? `called ${o.tools.join(", ")}` : "called no tool" });
  if (expect.trip && planned && !drew) out.push({ check: "no-route-drawn", detail: "planned but drew nothing" });
  if (!expect.restroom && o.tools.includes("nearest_restroom")) out.push({ check: "wrong-topic-tool", detail: "nearest_restroom without a restroom question" });
  if (expect.yes && !drew && !planned) out.push({ check: "yes-did-nothing", detail: o.tools.length ? `called ${o.tools.join(", ")}` : "called no tool" });
  const counts = new Map<string, number>();
  for (const t of o.tools) counts.set(t, (counts.get(t) ?? 0) + 1);
  for (const [t, n] of counts) if (n >= LOOP_AT) out.push({ check: "tool-loop", detail: `${t} ${n} times` });
  if (!o.reply.trim()) out.push({ check: "empty-reply", detail: "no text" });
  const leak = INTERNAL.exec(o.reply);
  if (leak) out.push({ check: "internal-name-leak", detail: leak[0] });
  if (expect.ask && planned && !o.reply.includes("?")) out.push({ check: "guessed-when-vague", detail: "planned a guess without asking" });
  return out;
}
