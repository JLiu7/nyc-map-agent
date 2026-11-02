/**
 * Multi-turn trip conversations (#23). The first five come from the 2026-11-01 traces; the rest
 * cover the same moves in other words and languages. A rider is at Union Square unless the case
 * says otherwise. Add a case when a trace shows a new way to fail.
 */
import type { Case } from "./types";

export const CASES: Case[] = [
  { id: "trip-basic", about: "one trip", turns: [{ user: "How do I get to Times Square?", expect: { trip: true } }] },
  {
    id: "trip-then-yes", about: "a trip, then yes to the offer",
    turns: [
      { user: "Get me to the Brooklyn Museum", expect: { trip: true } },
      { user: "Yes, please", expect: { yes: true } },
    ],
  },
  {
    id: "restroom-then-trip", about: "a new destination after a restroom answer",
    turns: [
      { user: "Where's the nearest bathroom?", expect: { restroom: true } },
      { user: "ok now get to times square", expect: { trip: true } },
    ],
  },
  {
    id: "status-then-trip", about: "a trip after a line status answer",
    turns: [
      { user: "Is the A train running okay?", expect: {} },
      { user: "Let me go to Brooklyn Bridge", expect: { trip: true } },
    ],
  },
  { id: "hungry", about: "food, with no trip asked", turns: [{ user: "I'm hungry, any McDonald's near me?", expect: {} }] },
  { id: "walk-me-there", about: "walking directions", turns: [{ user: "Walk me to Washington Square Park", expect: { trip: true } }] },
  { id: "vague-brooklyn", about: "too vague to plan", turns: [{ user: "Brooklyn tomorrow", expect: { ask: true } }] },
  {
    id: "trip-then-change", about: "a second destination in the same chat",
    turns: [
      { user: "How do I get to Grand Central?", expect: { trip: true } },
      { user: "Actually, take me to Penn Station instead", expect: { trip: true } },
    ],
  },
  {
    id: "trip-then-thanks", about: "thanks after a trip",
    turns: [
      { user: "Directions to the Met", expect: { trip: true } },
      { user: "thanks!", expect: {} },
    ],
  },
  { id: "trip-es", about: "a trip in Spanish", turns: [{ user: "¿Cómo llego a Times Square?", expect: { trip: true } }] },
  { id: "trip-zh", about: "a trip in Chinese", turns: [{ user: "我怎么去法拉盛？", expect: { trip: true } }] },
  { id: "trip-from-elsewhere", about: "a trip from a named start", location: null, turns: [{ user: "How do I get from Penn Station to JFK?", expect: { trip: true } }] },
];
