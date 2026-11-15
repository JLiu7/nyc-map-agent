/**
 * Which ways in and out of a station are open, and whether a rider who can only use elevators can
 * get through it (#133). Pure, shared by the trip planner and its tests.
 *
 * Closures come from the MTA's own words. A station notice in the subway alerts feed names an
 * entrance by its street ("Madison Av entrance will be exit only"), its corner ("stairs at the NE
 * corner of 42 St & 8 Av are closed"), or its end of the station ("east end entrance is closed"),
 * and "Enter … at 5 Av only" closes every other way in. Elevators come from the MTA's equipment
 * list and outage feeds: an ADA elevator that is out, with no twin beside it, leaves its platform
 * with no step-free way.
 */

type Pt = readonly [number, number];
export type Corner = "NE" | "NW" | "SE" | "SW";
export type End = "east" | "west" | "north" | "south";

/** Where a notice points: streets as written, and a corner or an end when it gives one. */
export interface Where {
  streets: string[];
  corner?: Corner;
  end?: End;
}

/**
 * What a notice does to the entrances it names. `only-entry`/`only-exit`: the named ones are the
 * only way in (or out), so every other entrance loses that direction.
 */
export type Effect = "closed" | "no-entry" | "no-exit" | "only-entry" | "only-exit";

export interface EntranceNotice {
  alertId: string;
  /** GTFS stop ids the alert names. */
  stopIds: string[];
  effect: Effect;
  where: Where;
  /** The MTA's line, kept for the rider. */
  text: string;
}

const CORNER_WORDS: Record<string, Corner> = { ne: "NE", nw: "NW", se: "SE", sw: "SW", northeast: "NE", northwest: "NW", southeast: "SE", southwest: "SW" };
const THING = "(?:entrances?|exits?|stairs?|staircases?|stairways?|street stairs?|escalators?|passageways?|passages?|elevators?)";

/** The place words before or after a "closed" verb: corner, end and streets. Null when nothing points anywhere. */
export function whereIn(phrase: string, stationName = ""): Where | null {
  let s = ` ${phrase.replace(/\[[A-Z0-9]+\]/g, " ")} `;
  if (stationName) s = s.split(stationName).join(" ");
  const corner = s.match(/\b(NE|NW|SE|SW|northeast|northwest|southeast|southwest)\s+corner\b/i);
  const end = s.match(/\b(east|west|north|south)(?:ern)?[\s-]+end\b/i);
  s = s
    .replace(/\b(NE|NW|SE|SW|northeast|northwest|southeast|southwest)\s+corner\s*(?:of\s*)?/gi, " ")
    .replace(/\b(east|west|north|south)(?:ern)?[\s-]+end\b/gi, " ")
    .replace(new RegExp(`\\b${THING}\\b`, "gi"), " ");
  // The part that names streets: after the last " - " (New Dorp Station - St George-bound - …) and the last " at ".
  s = s.split(/\s[-–]\s/).pop() ?? s;
  s = s.split(/\bat\b/i).pop() ?? s;
  const streets = s
    .replace(/\b(station|the|on|of|for|from|to|near|all|both|street level|level|[\w.']+-bound)\b/gi, " ")
    .split(/\s*(?:&|\/|,|\band\b)\s*/i)
    .map((x) => x.replace(/\s+/g, " ").trim())
    .filter((x) => /[a-z0-9]/i.test(x) && x.length <= 40 && streetKey(x) !== "");
  const where: Where = { streets };
  if (corner) where.corner = CORNER_WORDS[corner[1].toLowerCase()];
  if (end) where.end = end[1].toLowerCase() as End;
  return streets.length || where.corner || where.end ? where : null;
}

/** Station notices that close or narrow an entrance, read from one alert's English header (and description). */
export function entranceNotices(a: { id: string; text: string; stopIds: string[]; stationName?: string }): EntranceNotice[] {
  const out: EntranceNotice[] = [];
  const add = (effect: Effect, phrase: string, line: string) => {
    const where = whereIn(phrase, a.stationName);
    if (where) out.push({ alertId: a.id, stopIds: a.stopIds, effect, where, text: line.replace(/\[([A-Z0-9]+)\]/g, "$1").replace(/\s+/g, " ").trim() });
  };
  for (const raw of a.text.split(/\n|(?<=\.)\s+/)) {
    const line = raw.trim();
    if (!line) continue;
    let m: RegExpMatchArray | null;
    if ((m = line.match(/\benter\b(.*?)\bonly\b/i)) && /\bat\b/i.test(m[1])) add("only-entry", m[1], line);
    else if ((m = line.match(/^\s*(?:please\s+)?exit\b(.*?)\bonly\b/i)) && /\bat\b/i.test(m[1])) add("only-exit", m[1], line);
    else if ((m = line.match(new RegExp(`(.*\\b${THING}\\b.*?)\\b(?:is|are|will be|remains?)\\s+(?:now\\s+)?exit[\\s-]only`, "i")))) add("no-entry", m[1], line);
    else if ((m = line.match(new RegExp(`(.*\\b${THING}\\b.*?)\\b(?:is|are|will be|remains?)\\s+(?:now\\s+)?(?:entry|entrance)[\\s-]only`, "i")))) add("no-exit", m[1], line);
    else if ((m = line.match(new RegExp(`(.*\\b${THING}\\b.*?)\\b(?:is|are|will be|remains?)\\s+(?:temporarily\\s+|now\\s+)?(?:closed|unavailable|not available|out of service)`, "i")))) add("closed", m[1], line);
  }
  return out;
}

const KIND: Array<[RegExp, string]> = [
  [/^(st|street)$/, "st"], [/^(av|ave|avenue)$/, "av"], [/^(pl|place)$/, "pl"], [/^(blvd|boulevard)$/, "blvd"],
  [/^(rd|road)$/, "rd"], [/^(pkwy|parkway)$/, "pkwy"], [/^(dr|drive)$/, "dr"], [/^(sq|square)$/, "sq"], [/^(ln|lane)$/, "ln"],
];
/**
 * One spelling per street: "W 53rd Street", "53 St" and "E  53 ST" → "53 st"; "Madison Av" and
 * "MADISON AVE" → "madison av"; "Fifth Avenue" → "5 av". Empty when nothing is left.
 */
export function streetKey(name: string): string {
  const NUM: Record<string, string> = { first: "1", second: "2", third: "3", fourth: "4", fifth: "5", sixth: "6", seventh: "7", eighth: "8", ninth: "9", tenth: "10", eleventh: "11", twelfth: "12" };
  const words = name.toLowerCase().replace(/(\d+)(st|nd|rd|th)\b/g, "$1").split(/[^a-z0-9]+/).filter(Boolean).map((w) => NUM[w] ?? w);
  while (words.length > 1 && /^(e|w|n|s|east|west|north|south)$/.test(words[0])) words.shift();
  let kind = "";
  const last = words[words.length - 1];
  for (const [re, k] of KIND) if (last && re.test(last) && words.length > 1) { kind = k; words.pop(); break; }
  const core = words.join(" ");
  return core ? (kind ? `${core} ${kind}` : core) : "";
}
/** Same street? "5 Av" and "5th Avenue" yes; "5 Av" and "5 St" no; "Broadway" and "Broadway" yes. */
export function sameStreet(a: string, b: string): boolean {
  const [x, y] = [streetKey(a), streetKey(b)];
  if (!x || !y) return false;
  if (x === y) return true;
  const core = (k: string) => k.replace(/ (st|av|pl|blvd|rd|pkwy|dr|sq|ln)$/, "");
  // One side without a kind ("Madison") matches by name alone.
  return (core(x) === x || core(y) === y) && core(x) === core(y);
}

export interface StreetLine {
  name: string;
  line: Pt[];
}
export interface Door {
  at: Pt;
  type: string;
  entry: boolean;
  exit: boolean;
}

/** Metres east and north of `o`. */
function local(o: Pt, p: Pt): [number, number] {
  const kx = 111_320 * Math.cos((o[1] * Math.PI) / 180);
  return [(p[0] - o[0]) * kx, (p[1] - o[1]) * 111_320];
}
function toLine(o: Pt, p: Pt, a: Pt, b: Pt): { d: number; at: [number, number] } {
  const [px, py] = local(o, p), [ax, ay] = local(o, a), [bx, by] = local(o, b);
  const [dx, dy] = [bx - ax, by - ay];
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  const at: [number, number] = [ax + t * dx, ay + t * dy];
  return { d: Math.hypot(px - at[0], py - at[1]), at };
}
/** Distance from a point to the nearest piece of a named street, in metres, and that nearest point (local to `p`). */
function toStreet(p: Pt, name: string, streets: StreetLine[]): { d: number; at: [number, number] } | null {
  let best: { d: number; at: [number, number] } | null = null;
  for (const s of streets) {
    if (!sameStreet(name, s.name)) continue;
    for (let i = 1; i < s.line.length; i++) {
      const h = toLine(p, p, s.line[i - 1], s.line[i]);
      if (!best || h.d < best.d) best = h;
    }
  }
  return best;
}

/** An entrance this close to a street's centreline is on that street. Avenues are about 30 m wide kerb to kerb. */
const ON_STREET_M = 35;
/** An end of a station: entrances this far from the middle along the station's length. */
const END_SPREAD_M = 40;

/**
 * Indices of the entrances a place points at, or null when it cannot be placed (no named street
 * near, too few entrances to tell an end, and so on). Corners are read from where the named
 * streets cross, or from the middle of the station's entrances when no street is named.
 */
export function matchWhere(where: Where, doors: Door[], streets: StreetLine[]): number[] | null {
  if (!doors.length) return null;
  let idx = doors.map((_, i) => i);
  let cross: [number, number] | null = null; // where the named streets meet, relative to doors[0]
  if (where.streets.length) {
    const near = idx.filter((i) => where.streets.every((s) => (toStreet(doors[i].at, s, streets)?.d ?? Infinity) <= ON_STREET_M));
    if (!near.length) return null;
    idx = near;
    if (where.streets.length >= 2) {
      // The crossing: the point on the first street nearest the second, near these doors.
      const o = doors[idx[0]].at;
      const a = toStreet(o, where.streets[0], streets), b = toStreet(o, where.streets[1], streets);
      if (a && b) cross = [(a.at[0] + b.at[0]) / 2, (a.at[1] + b.at[1]) / 2];
    }
  }
  if (where.corner) {
    const o = doors[idx[0]].at;
    const pts = idx.map((i) => local(o, doors[i].at));
    const mid: [number, number] = cross ?? [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
    const [ex, ny] = [where.corner.includes("E") ? 1 : -1, where.corner.includes("N") ? 1 : -1];
    const hit = idx.filter((_, k) => (pts[k][0] - mid[0]) * ex > 0 && (pts[k][1] - mid[1]) * ny > 0);
    if (!hit.length) {
      if (cross || idx.length < 2) return null;
      // No door squarely in that corner: the one furthest that way.
      const score = pts.map((p) => (p[0] - mid[0]) * ex + (p[1] - mid[1]) * ny);
      return [idx[score.indexOf(Math.max(...score))]];
    }
    idx = hit;
  }
  if (where.end) {
    const o = doors[idx[0]].at;
    const axis = where.end === "east" || where.end === "west" ? 0 : 1;
    const sign = where.end === "east" || where.end === "north" ? 1 : -1;
    const along = idx.map((i) => local(o, doors[i].at)[axis] * sign);
    const [lo, hi] = [Math.min(...along), Math.max(...along)];
    if (hi - lo < END_SPREAD_M) return null;
    idx = idx.filter((_, k) => along[k] > (lo + hi) / 2);
  }
  return idx.length ? idx : null;
}

export interface Opened<D extends Door> {
  doors: D[];
  /** Notices that changed which doors are open, for the rider. */
  applied: string[];
  /** Notices about this station that could not be placed on a door, kept so the rider still reads them. */
  unplaced: string[];
}

/** The station's doors with each notice's closures applied. */
export function applyNotices<D extends Door>(doors: D[], notices: EntranceNotice[], streets: StreetLine[]): Opened<D> {
  const out = doors.map((d) => ({ ...d }));
  const applied: string[] = [];
  const unplaced: string[] = [];
  for (const n of notices) {
    const hit = matchWhere(n.where, out, streets);
    if (!hit) {
      if (!unplaced.includes(n.text)) unplaced.push(n.text);
      continue;
    }
    const named = new Set(hit);
    out.forEach((d, i) => {
      if (n.effect === "closed" && named.has(i)) { d.entry = false; d.exit = false; }
      if (n.effect === "no-entry" && named.has(i)) d.entry = false;
      if (n.effect === "no-exit" && named.has(i)) d.exit = false;
      if (n.effect === "only-entry" && !named.has(i)) d.entry = false;
      if (n.effect === "only-exit" && !named.has(i)) d.exit = false;
    });
    if (!applied.includes(n.text)) applied.push(n.text);
  }
  return { doors: out, applied, unplaced };
}

/* ---------- elevators ---------- */

/** One elevator or escalator from the MTA equipment list (nyct_ene_equipments.json). */
export interface Unit {
  id: string;
  type: "EL" | "ES";
  station: string;
  /** GTFS stop ids of the platforms it serves. */
  stops: string[];
  serving: string;
  ada: boolean;
  /** Another elevator does the same job. */
  redundant: boolean;
  /** The MTA's suggested way round when it is out. */
  alternative?: string;
}
/** An outage, with its start and expected end as epoch seconds (end null when unknown). */
export interface OutageSpan {
  unit: string;
  station: string;
  type: "EL" | "ES";
  serving: string;
  ada: boolean;
  start: number;
  end: number | null;
  reason: string;
  /** "12/17/2026 06:00:00 AM" as the feed writes it, for the rider. */
  back: string;
}

export const inForce = (o: OutageSpan, at: number) => o.start <= at && (o.end === null || at <= o.end);

export interface StepFree {
  ok: boolean;
  /** One sentence for the rider when it is not (or only partly) step-free. */
  why?: string;
  /** The MTA's way round, when it gives one. */
  alternative?: string;
  /** Street elevators out at this station: their units, to keep their entrances out of the choice. */
  streetOut: Unit[];
}

/** First two sentences of the MTA's alternative, so the trip stays short. */
const brief = (s: string | undefined) => (s ? s.replace(/\s+/g, " ").trim().split(/(?<=\.)\s+/).slice(0, 2).join(" ").slice(0, 320) : undefined);
/** An elevator from the street: its serving text names a corner or the street. */
export const fromStreet = (u: { serving: string }) => /\bcorner\b|\bstreet\b|\bst\b|\bav\b|\bave\b|\bavenue\b/i.test(u.serving) && !/^\s*mezzanine to (?:the )?\w*[\s-]*platform/i.test(u.serving);

/**
 * Can a rider who uses only elevators get between the street and this platform at `at`?
 * `ada`: the station list's flag ("0" no, "1" yes, "2" part of the station). With no ADA
 * elevator listed for a station flagged accessible, the station is taken at its word (some are
 * level with the street).
 */
export function stepFreeAt(st: { name: string; stopIds: string[]; ada?: string; adaNotes?: string }, units: Unit[], outages: OutageSpan[], at: number): StepFree {
  const stops = new Set(st.stopIds);
  const lifts = units.filter((u) => u.type === "EL" && u.ada && u.stops.some((s) => stops.has(s)));
  const out = lifts.filter((u) => outages.some((o) => o.unit === u.id && inForce(o, at)));
  const streetOut = out.filter(fromStreet);
  if (st.ada === "0") return { ok: false, why: `${st.name} has no elevator.`, streetOut };
  const stuck = out.filter((u) => !u.redundant);
  if (stuck.length) {
    const u = stuck[0];
    const o = outages.find((x) => x.unit === u.id && inForce(x, at));
    return { ok: false, why: `The elevator at ${st.name} (${u.serving.replace(/\.$/, "")}) is out${o?.back ? `, expected back ${o.back}` : ""}.`, alternative: brief(u.alternative), streetOut };
  }
  if (st.ada === "2") return { ok: true, why: `${st.name} is only partly step-free${st.adaNotes && st.adaNotes !== "NaN" ? `: ${st.adaNotes}` : ""}.`, streetOut };
  return { ok: true, streetOut };
}
