/**
 * A question that asks to see the walk inside the stations on the one trip we have filmed, the
 * step-free trip from Cortlandt St (by Fulton St) to 14 St-Union Sq: "show me the inside walk between
 * fulton to union square". The model has no tool for it, so it used to answer that it could not map
 * an inside walk. The app answers by opening the film of the trip with the map beside it.
 */
const INSIDE = /\b(inside|indoors?|in[- ]station|underground|step[- ]?free|accessible|wheelchair|elevators?)\b/i;
const WALK = /\b(walk|walking|route|path|way|trip|guide|replay|film|video)\b/i;
const PLACE = /\b(fulton|cortlandt|union\s*sq(uare)?|14(th)?\s*st)/i;

export function asksForStationWalk(question: string): boolean {
  return INSIDE.test(question) && WALK.test(question) && PLACE.test(question);
}

/** Where the film of the trip and its map live. */
export const STATION_WALK_URL = "/?flags=+stationReplay";
