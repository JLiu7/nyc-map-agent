import { formatStationName, formatStreetText } from "@/lib/streetName";
import { sameStation, towardEnd } from "@/lib/transit/serviceChanges";
import { routeEnds, skippedStations } from "./alertFocus";
import type { TransitAlert } from "./hooks";
import { stationOf, type StaticSystem } from "./model";

/**
 * A service notice as a small line diagram (owner, 2026-11-07: "reading these
 * things are still hard … i wish there was option for graph walk"): the
 * affected stretch in travel order, what happens at each station, and short
 * steps that a voice reads while the diagram lights each one up. Pure.
 */
export type StopState = "skip" | "closed" | "shuttle" | "local" | "transfer" | "open";
export interface DiagramStop {
  id: string; name: string; state: StopState;
  /** Lines to change to, for a station off this line. */
  off?: string[];
  /** Where the shuttle bus stops for this station, from the MTA's own note. */
  corners?: Corner[];
}
/** "Broadway at 231 Street", with "northbound", "toward Lefferts Boulevard" or "for the A" when the note gives one. */
export interface Corner { text: string; note?: string }
/** Stations left out between two rows. */
export interface DiagramGap { gap: number }
export type DiagramRow = DiagramStop | DiagramGap;
export interface DiagramStep {
  text: string;
  /** Stations lit, and framed on the map, while this step is said. */
  ids: string[];
  /** Stations whose shuttle bus corners the map marks for this step. */
  corners?: string[];
  /** Bus routes this step names (a travel tip's M4), shown on the map. */
  bus?: string[];
}
/** Where the rider is, when they share it: the guidance starts from the nearest station. */
type Near = { lon: number; lat: number } | null | undefined;
export interface AlertDiagram {
  kind: "skip" | "suspended" | "shuttle" | "local";
  /** Who it is for: "Uptown A", "Both ways", "No 1 trains". */
  heading: string;
  /** Top to bottom in the direction of travel; north at the top when it is both ways. */
  rows: DiagramRow[];
  steps: DiagramStep[];
}

export const isGap = (r: DiagramRow): r is DiagramGap => "gap" in r;

/** MTA icons and bullets as words: "[4][5] or [6]" -> "4, 5 or 6"; "[shuttle bus icon]" -> "shuttle". */
export function cleanAlertText(s: string): string {
  return s
    .replace(/\[shuttle bus icon\]/gi, "shuttle")
    .replace(/\[[a-z][\w ]*icon\]/gi, "")
    .replace(/\](?=\[)/g, "], ")
    .replace(/\[([A-Z0-9]+)\]/g, "$1")
    .replace(/[ \t]+/g, " ")
    .replace(/ +([.,])/g, "$1");
}

/** The first sentence or two of a notice, for one with nothing to draw. */
export function shortNotice(text: string, max = 160): string {
  const plain = cleanAlertText(text).replace(/\s*\n+\s*/g, " ").trim();
  const sentences = plain.match(/[^.!?]+[.!?]*/g) ?? [plain];
  let out = "";
  for (const s of sentences) {
    if (out && out.length + s.length > max) break;
    out += s;
  }
  out = out.trim();
  return out.length > max + 40 ? `${out.slice(0, max).replace(/\s+\S*$/, "")}…` : out;
}

type Feature = StaticSystem["stations"]["features"][number];
const nameOf = (sys: StaticSystem, id: string) => String(sys.stations.features.find((f) => f.properties.id === id)?.properties.name ?? id);
const said = (n: string) => formatStationName(n);
const exact = (a: string, b: string) => a.toLowerCase().replace(/[^a-z0-9]/g, "") === b.toLowerCase().replace(/[^a-z0-9]/g, "");
/** Drop trailing clauses an alert hangs on a station name ("… during this time", "… [accessibility icon]"). */
const trimName = (s: string) => s.replace(/\s+(?:during|from|until|through|on|for|stopping|every|instead)\b.*$/i, "").replace(/[.,;:]+$/, "").trim();
const bulletList = (s: string) => [...s.matchAll(/\b([A-Z0-9])\b/g)].map((m) => m[1]);

/** The station a name means: on the line first, then one serving `lines`, an exact name before a close one. */
function findStation(sys: StaticSystem, name: string, onLine: Record<string, number>, lines: string[] = []): Feature | undefined {
  const hits = sys.stations.features.filter((f) => sameStation(name, String(f.properties.name)));
  const score = (f: Feature) => (f.properties.id in onLine ? 4 : 0) + (lines.some((l) => String(f.properties.routes ?? "").split(/[\s,]+/).includes(l)) ? 2 : 0) + (exact(name, String(f.properties.name)) ? 1 : 0);
  return hits.sort((a, b) => score(b) - score(a))[0];
}

/** Every station of the line that holds the most of `ids`, in track order (a local stop is on the A, not the D). */
function trackOrder(sys: StaticSystem, route: string, ids: string[]): { line: string; seq: string[] } {
  const count = (r: string) => ids.filter((id) => id in (sys.stopM[r] ?? {})).length;
  let line = route;
  for (const r of Object.keys(sys.stopM)) if (count(r) > count(line)) line = r;
  const sm = sys.stopM[line] ?? {};
  return { line, seq: Object.keys(sm).sort((a, b) => sm[a] - sm[b]) };
}

/** Index 0 or 1 of the end a direction label points to; "Uptown" and "Downtown" by latitude. */
function towardIndex(sys: StaticSystem, line: string, label: string | null): 0 | 1 | null {
  const ends = routeEnds(sys, line);
  if (!label || ends.length !== 2) return null;
  const named = towardEnd(label, ends);
  if (named !== null) return named;
  const north = ends[0].at[1] > ends[1].at[1] ? 0 : 1;
  if (/^uptown$/i.test(label)) return north;
  if (/^downtown$/i.test(label)) return north === 0 ? 1 : 0;
  return null;
}

/** "72 St, 86 St and 96 St"; a long run as "7 stops, 72 St to 116 St". */
function stationWords(names: string[]): string {
  const n = names.map(said);
  if (n.length <= 3) return n.length > 1 ? `${n.slice(0, -1).join(", ")} and ${n.at(-1)}` : n[0] ?? "";
  return `${n.length} stops, ${n[0]} to ${n.at(-1)}`;
}
const orWords = (parts: string[]) => (parts.length > 1 ? `${parts.slice(0, -1).join(", ")} or ${parts.at(-1)}` : parts[0] ?? "");

type Transfer = { text: string; at: Array<{ name: string; lines: string[] }>; bus?: true };
const withArticle = (s: string) => `${/^[aeiou]/i.test(s) ? "an" : "a"} ${s}`;

/**
 * Where to change, from the alert's own advice:
 *  - "For service to these stations, take the A to 125 St and transfer to a downtown A or D."
 *  - "Transfer between 1 and shuttle buses at Dyckman St or between A and shuttle buses at Inwood-207 St."
 */
function transfers(text: string, multi: boolean): Transfer[] {
  const out: Transfer[] = [];
  const bus: Transfer["at"] = [];
  const these = multi ? "these stops" : "this stop";
  for (const line of cleanAlertText(text).split(/\n/).map((l) => l.trim())) {
    const svc = /^For service (to|from) (?:these|this) stations?,? take (?:the |an? )?(.+?) to (.+?) and transfer to (?:an? |the )?(.+?)\.?$/i.exec(line);
    if (svc) {
      const [, way, ride, at, to] = svc;
      // "59 St or Grand Central-42 St", "Queens Plaza or the F to 21 St-Queensbridge"
      const names = at.split(/\s+or\s+(?:the [A-Z0-9] to )?|,\s*/).map(trimName).filter(Boolean);
      const where = orWords(names.map(said));
      const text = way.toLowerCase() === "to"
        ? `Going to ${these}: ride to ${where} and change to ${withArticle(to)}.`
        : `Starting at ${these}: take the ${ride} to ${where} and change to ${withArticle(to)}.`;
      out.push({ text, at: names.map((name) => ({ name, lines: [] })) });
    } else if (/^Transfer between/i.test(line)) {
      for (const p of line.matchAll(/between ([A-Z0-9][A-Z0-9, ]*?(?: or [A-Z0-9])?) and shuttle(?: bus(?:es)?)? at ([^.]+?)(?= or between|\.|$)/gi)) bus.push({ name: trimName(p[2]), lines: bulletList(p[1]) });
    }
  }
  // The shuttle changes read as one sentence: "Change at Dyckman St for the 1, or at Inwood-207 St for the A."
  if (bus.length) out.push({ text: `Change at ${bus.map((t) => `${said(t.name)}${t.lines.length ? ` for the ${orWords(t.lines)}` : ""}`).join(", or at ")}.`, at: bus, bus: true });
  return out;
}

/** "In Manhattan, downtown [D] runs local from 125 St to 59 St-Columbus Circle" for this route. */
function localRun(text: string, route: string): { toward: string | null; from: string; to: string } | null {
  for (const line of cleanAlertText(text).split(/\n/)) {
    const m = /(?:\b(uptown|downtown|[A-Z][\w.' ]*?)-?(?:bound)? )?\b([A-Z0-9])\b (?:local )?(?:trains? )?runs? local (?:from|between) (.+?) (?:to|and) ([^.\n]+)/i.exec(line);
    if (m && m[2] === route) {
      const toward = m[1] ? m[1].replace(/^(?:In [\w ]+, )?/i, "").trim() : null;
      return { toward: toward ? toward.charAt(0).toUpperCase() + toward.slice(1) : null, from: trimName(m[3]), to: trimName(m[4]) };
    }
  }
  return null;
}

/** "Free shuttle buses run between Van Cortlandt Park-242 St and Dyckman St." */
function shuttleRange(text: string): [string, string] | null {
  const m = /shuttle bus(?:es)? (?:run|runs|make stops|operate|operates|stop) between (.+?) and ([^,.\n]+)/i.exec(cleanAlertText(text));
  return m ? [trimName(m[1]), trimName(m[2])] : null;
}

const MAX_ROWS = 14;
/** The stretch from `lo` to `hi` as rows, long runs of normal stations folded into a gap. */
function rowsFor(seq: string[], lo: number, hi: number, state: Map<string, StopState>, sys: StaticSystem, reverse: boolean): DiagramRow[] {
  const ids = seq.slice(lo, hi + 1);
  if (reverse) ids.reverse();
  const out: DiagramRow[] = [];
  let run: string[] = [];
  const flush = (last: boolean) => {
    // Keep a run of normal stations short; the first and last stations of the stretch always show.
    if (run.length > 2 && ids.length > MAX_ROWS) {
      out.push({ gap: run.length - (last ? 1 : 0) });
      if (last) out.push({ id: run.at(-1)!, name: nameOf(sys, run.at(-1)!), state: "open" });
    } else for (const id of run) out.push({ id, name: nameOf(sys, id), state: "open" });
    run = [];
  };
  ids.forEach((id, i) => {
    const s = state.get(id) ?? "open";
    if (s === "open" && i > 0 && i < ids.length - 1) { run.push(id); return; }
    flush(false);
    out.push({ id, name: nameOf(sys, id), state: s });
  });
  flush(true);
  return out;
}

/** The order to draw: travel order for one direction, otherwise north at the top. */
function drawReversed(sys: StaticSystem, line: string, toward: string | null): boolean {
  const i = towardIndex(sys, line, toward);
  if (i !== null) return i === 0;
  const ends = routeEnds(sys, line);
  return ends.length === 2 && ends[0].at[1] < ends[1].at[1];
}

/** Stations named for changing that are off this line, as rows after the stretch. */
function offRows(sys: StaticSystem, list: Array<{ name: string; lines: string[] }>, onLine: Record<string, number>, seen: Set<string>): DiagramStop[] {
  const out: DiagramStop[] = [];
  for (const t of list) {
    const f = findStation(sys, t.name, onLine, t.lines);
    if (!f || seen.has(f.properties.id)) continue;
    seen.add(f.properties.id);
    out.push({ id: f.properties.id, name: String(f.properties.name), state: "transfer", off: t.lines.length ? t.lines : String(f.properties.routes ?? "").split(/[\s,]+/).filter(Boolean).slice(0, 4) });
  }
  return out;
}

const idsOf = (sys: StaticSystem, t: Transfer, onLine: Record<string, number>) =>
  t.at.map((x) => findStation(sys, x.name, onLine, x.lines)?.properties.id).filter((id): id is string => Boolean(id));

/** Ids on `seq` from one named end to the other, inclusive; null when either name is not on it. */
function between(sys: StaticSystem, seq: string[], onLine: Record<string, number>, a: string, b: string): [number, number] | null {
  const i = seq.indexOf(findStation(sys, a, onLine)?.properties.id ?? "");
  const j = seq.indexOf(findStation(sys, b, onLine)?.properties.id ?? "");
  return i < 0 || j < 0 ? null : [Math.min(i, j), Math.max(i, j)];
}

/** The diagram for one alert on one line, or null when nothing in it maps onto stations. */
export function alertDiagram(a: TransitAlert, sys: StaticSystem | undefined, route: string, near?: Near): AlertDiagram | null {
  if (!sys || !sys.stopM[route]) return null;
  const all = `${a.text}\n${a.description ?? ""}`;
  const d = suspension(a, sys, route, all, near) ?? skipStops(a, sys, route, all) ?? local(a, sys, route, all);
  if (d) d.steps.push(...laterSteps(a, sys, route));
  return d;
}

/** The steps every notice ends with, drawn or not: the travel tips, then when it applies. */
export function laterSteps(a: TransitAlert, sys: StaticSystem | undefined, route: string): DiagramStep[] {
  const out: DiagramStep[] = travelTips(`${a.text}\n${a.description ?? ""}`).map((t) => ({ text: t.text, ids: sys?.stopM[route] ? namedOnLine(sys, route, t.text) : [], bus: t.bus }));
  const when = periodWords(a.period ?? "");
  if (when) out.push({ text: `When: ${/^(?:beginning|starting|until|from)\b/i.test(when) ? when.charAt(0).toLowerCase() + when.slice(1) : when}.`, ids: [] });
  return out;
}

const DAYS: Record<string, string> = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday" };
const MONTHS: Record<string, string> = { Jan: "January", Feb: "February", Mar: "March", Apr: "April", Jun: "June", Jul: "July", Aug: "August", Sep: "September", Oct: "October", Nov: "November", Dec: "December" };
/** "Nov 13 - Dec 7, Fri 11:45 PM to Mon 5:00 AM (Weekends)" -> "November 13 to December 7, Friday 11:45 PM to Monday 5:00 AM". */
export function periodWords(period: string): string {
  return period.replace(/\s*\((?:weekends?|weekdays?|nights?)\)\s*$/i, "")
    .replace(/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b(?!day)/g, (_m, d: string) => DAYS[d])
    .replace(/\b(Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b\.?/g, (_m, m: string) => MONTHS[m])
    .replace(/\s+-\s+/g, " to ").replace(/\s+/g, " ").replace(/[.\s]+$/, "").trim();
}

const BUS_ROUTE = /\b(?:Bx|BX|B|M|Q|S|SIM|X|QM|BM|T)\d{1,3}[A-Z]?\+?(?![\w-])/g;
/**
 * "Travel tips: Transfer … at 137 St-City College, or take the M4/M104 to 116 St* for 1. Consider the M125 to the
 * 125 St A/C B/D Station. *(except when …). Note: …" -> one step a sentence, with the buses it names.
 */
export function travelTips(text: string): Array<{ text: string; bus: string[] }> {
  const clean = cleanAlertText(text);
  const at = clean.search(/\bTravel tips?:?/i);
  if (at < 0) return [];
  // The tips run to a blank line, a note, or the next heading.
  const body = clean.slice(at).replace(/^Travel tips?:?\s*/i, "").split(/\n\s*\n|\bNote:|What's happening\??|Travel Alternatives:/i)[0];
  return body.split(/(?<=\.)\s+|\n/).map((x) => x.trim())
    .filter((x) => x && !/^\*?\(/.test(x))
    .map((x) => x.replace(/\*/g, "").replace(/\b([A-Z]{1,3}\d{1,3}[A-Z]?|[A-Z0-9])\/(?=[A-Z0-9])/g, "$1 or ")
      .replace(/^Consider (?:taking )?the /i, "You can also take the ").replace(/^Consider /i, "You can also use ").replace(/\s+([,.])/g, "$1"))
    .map((x) => ({ text: /[.!?]$/.test(x) ? x : `${x}.`, bus: [...new Set(x.match(BUS_ROUTE) ?? [])] }));
}

/** Stations of this line a sentence names ("137 St-City College", "116 St"), on the line's own names. */
function namedOnLine(sys: StaticSystem, route: string, text: string): string[] {
  const out: string[] = [];
  for (const id of Object.keys(sys.stopM[route] ?? {})) {
    const name = nameOf(sys, id);
    const head = name.split("-")[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`(^|[^\\w-])${head}(?![\\w])`, "i").test(text)) out.push(id);
  }
  return out;
}

/**
 * The MTA's note for each station (`station_alternative`), as the corners its shuttle bus stops at:
 * "[shuttle bus icon] W 231 St at Broadway (S/B)" -> { text: "West 231 Street at Broadway", note: "southbound" }.
 */
export function shuttleCorners(a: TransitAlert, sys: StaticSystem): Map<string, Corner[]> {
  const out = new Map<string, Corner[]>();
  for (const alt of a.alternatives ?? []) {
    const id = stationOf(sys.system, alt.stop);
    const corners = alt.notes.split(/\n/).filter((l) => /\[shuttle bus icon\]/i.test(l)).map((l) => {
      const raw = l.replace(/\[[^\]]*icon\]/gi, "").trim();
      const m = /^(.*?)\s*\(([^)]+)\)\s*$/.exec(raw);
      const where = m ? m[1] : raw;
      const tag = m?.[2] ?? "";
      const note = /^N\/?B$/i.test(tag) ? "northbound" : /^S\/?B$/i.test(tag) ? "southbound" : /^E\/?B$/i.test(tag) ? "eastbound" : /^W\/?B$/i.test(tag) ? "westbound"
        : /^to /i.test(tag) ? `toward ${formatStationName(tag.slice(3))}` : /^[A-Z0-9]$/.test(tag) ? `for the ${tag}` : tag || undefined;
      return { text: formatStreetText(where), ...(note ? { note } : {}) };
    }).filter((c) => c.text);
    if (corners.length) out.set(id, [...(out.get(id) ?? []), ...corners]);
  }
  return out;
}

const cornerWords = (cs: Corner[]) => orWords(cs.map((c) => (c.note ? `${c.text} (${c.note})` : c.text)));
const coordOf = (sys: StaticSystem, id: string) => sys.stations.features.find((f) => f.properties.id === id)?.geometry.coordinates as [number, number] | undefined;
const metres = (p: [number, number], q: { lon: number; lat: number }) => Math.hypot((p[0] - q.lon) * 84_400, (p[1] - q.lat) * 111_320);

/**
 * A branch the line's track order does not hold (the A's Lefferts Blvd branch): the named ends and the
 * stations the alert lists, chained nearest-first from the end that is on the line.
 */
function branchOrder(sys: StaticSystem, onLine: Record<string, number>, ends: string[], informed: string[]): string[] | null {
  const byId = new Map(sys.stations.features.map((f) => [f.properties.id, f]));
  const [a, b] = ends.map((n) => findStation(sys, n, onLine));
  if (!a || !b) return null;
  const start = a.properties.id in onLine ? a : b;
  const rest = new Set([a.properties.id, b.properties.id, ...informed.filter((id) => byId.has(id))]);
  rest.delete(start.properties.id);
  const out = [start.properties.id];
  const at = (id: string) => byId.get(id)!.geometry.coordinates as [number, number];
  while (rest.size) {
    const [x, y] = at(out.at(-1)!);
    const next = [...rest].sort((p, q) => Math.hypot(at(p)[0] - x, at(p)[1] - y) - Math.hypot(at(q)[0] - x, at(q)[1] - y))[0];
    out.push(next);
    rest.delete(next);
  }
  return out;
}

function suspension(a: TransitAlert, sys: StaticSystem, route: string, all: string, near?: Near): AlertDiagram | null {
  const change = a.changes?.find((c) => c.kind === "suspended" && c.route === route);
  const bus = shuttleRange(all);
  const ends = change?.names ?? (/^(?:In [\w ]+, )?no /i.test(a.text.trim()) ? bus : null);
  if (!ends || ends.length !== 2) return null;
  const onLine = sys.stopM[route];
  const informedIds = a.stops.map((s) => stationOf(sys.system, s));
  let { seq } = trackOrder(sys, route, []);
  let span = between(sys, seq, onLine, ends[0], ends[1]);
  if (!span) {
    const branch = branchOrder(sys, onLine, ends, informedIds);
    if (!branch) return null;
    seq = branch;
    span = [0, seq.length - 1];
  }
  // By name: the alert may list the other line's platform at a shared station (Delancey St-Essex St on the F).
  const informed = new Set(informedIds.map((id) => nameOf(sys, id)));
  const busSpan = bus ? between(sys, seq, onLine, bus[0], bus[1]) : null;
  const shuttle = Boolean(bus) || (a.replacement?.length ?? 0) > 0;
  const onBus = (i: number) => shuttle && (!busSpan || (i >= busSpan[0] && i <= busSpan[1]));
  const changes = transfers(all, true);
  const changeIds = new Set(changes.flatMap((t) => t.at).map((t) => findStation(sys, t.name, onLine, t.lines)?.properties.id).filter((id): id is string => Boolean(id && seq.includes(id))));
  const state = new Map<string, StopState>();
  const closed: string[] = [];
  const bused: string[] = [];
  for (let i = span[0]; i <= span[1]; i++) {
    const id = seq[i];
    const end = i === span[0] || i === span[1];
    // An end the alert does not list still has trains: the 1 runs to Dyckman St.
    if (changeIds.has(id)) state.set(id, "transfer");
    else if (!end || informed.has(nameOf(sys, id)) || !informed.size) {
      state.set(id, onBus(i) ? "shuttle" : "closed");
      closed.push(id);
      if (onBus(i)) bused.push(id);
    }
  }
  const open = (i: number) => !state.get(seq[i]) || state.get(seq[i]) === "transfer";
  const lo = Math.max(0, span[0] - (open(span[0]) ? 1 : 0));
  const hi = Math.min(seq.length - 1, span[1] + (open(span[1]) ? 1 : 0));
  const seen = new Set(seq.slice(lo, hi + 1));
  const off = offRows(sys, changes.flatMap((t) => t.at), onLine, seen);
  const corners = shuttleCorners(a, sys);
  const withCorners = (r: DiagramRow): DiagramRow => (!isGap(r) && corners.has(r.id) ? { ...r, corners: corners.get(r.id) } : r);
  const rows = [...rowsFor(seq, lo, hi, state, sys, seq === trackOrder(sys, route, []).seq ? drawReversed(sys, route, null) : false), ...off].map(withCorners);
  const steps: DiagramStep[] = [{ text: `No ${route} trains between ${said(ends[0])} and ${said(ends[1])}.${shuttle ? " Free shuttle buses run instead." : ""}`, ids: closed }];
  const busTransfers = changes.find((t) => t.bus)?.at ?? [];
  if (shuttle) steps.push(...shuttleGuide(sys, route, a, { seq, span: busSpan ?? span, state, bused: bused.length ? bused : closed, corners, busTransfers, onLine, near }));
  for (const t of changes) if (!t.bus || !shuttle) steps.push({ text: t.text, ids: idsOf(sys, t, onLine) });
  return { kind: shuttle ? "shuttle" : "suspended", heading: `No ${route} trains`, rows, steps };
}

/**
 * The owner's "guide me on whats going on where to take shuttle bus etc" (2026-11-08): where to leave
 * the train, the corner the bus stops at, where to get back on. Starts from the end nearest the rider.
 */
function shuttleGuide(sys: StaticSystem, route: string, a: TransitAlert, g: {
  seq: string[]; span: [number, number]; state: Map<string, StopState>; bused: string[]; corners: Map<string, Corner[]>;
  busTransfers: Transfer["at"]; onLine: Record<string, number>; near: Near;
}): DiagramStep[] {
  const steps: DiagramStep[] = [];
  const name = (id: string) => said(nameOf(sys, id));
  // The trains at each end of the bus stretch: this line where it still runs, else the lines the notice names there.
  // "[J] runs between Jamaica Center-York College and Myrtle Av, the last stop": the line still reaches these.
  const runs = /\b([A-Z0-9])\b (?:trains? )?runs? between (.+?) and ([^,.\n]+)/i.exec(cleanAlertText(a.description ?? ""));
  const reached = new Set(runs && runs[1] === route ? [runs[2], runs[3]].map((n) => findStation(sys, trimName(n), g.onLine)?.properties.id) : []);
  const trainsAt = (id: string): string[] => {
    const s = g.state.get(id);
    if (!s || s === "transfer" || s === "open" || reached.has(id)) return [route];
    const named = g.busTransfers.find((t) => findStation(sys, t.name, g.onLine, t.lines)?.properties.id === id)?.lines ?? [];
    if (named.length) return named;
    // The station's own note lists the trains there during the change ("[F]" at Delancey St-Essex St).
    const noted = notes(id).flatMap((l) => (/shuttle bus icon/i.test(l) ? [] : [...l.matchAll(/\[([A-Z0-9])\]/g)].map((m) => m[1])));
    if (noted.length) return [...new Set(noted)];
    const here = String(sys.stations.features.find((f) => f.properties.id === id)?.properties.routes ?? "").split(/[\s,]+/).filter(Boolean);
    // Not the suspended line's express either (the 7X at Flushing-Main St).
    return here.filter((r) => !a.routes.some((x) => r === x || r === `${x}X`));
  };
  const notes = (id: string) => (a.alternatives ?? []).filter((x) => stationOf(sys.system, x.stop) === id).flatMap((x) => x.notes.split(/\n/));
  const goTicket = (id: string) => notes(id).some((l) => /GO ticket/i.test(l)) ? " Get a GO ticket on the way out, so you can get back in free." : "";
  const pos = (id: string) => coordOf(sys, id);
  const dist = (id: string) => { const p = pos(id); return g.near && p ? metres(p, g.near) : 0; };
  const ends = [...new Set([g.seq[g.span[0]], g.seq[g.span[1]]])].filter((id) => trainsAt(id).length).sort((x, y) => dist(x) - dist(y));
  const at = (id: string) => g.corners.get(id) ?? [];
  const cornerIds = (ids: string[]) => ids.filter((id) => at(id).length);
  // Near a closed station: its own bus corner first.
  const mine = g.near ? g.bused.filter((id) => pos(id)).sort((x, y) => dist(x) - dist(y))[0] : undefined;
  if (mine && dist(mine) < 1200 && !ends.includes(mine)) {
    steps.push(at(mine).length
      ? { text: `Nearest to you is ${name(mine)}. Its shuttle bus stops at ${cornerWords(at(mine))}.`, ids: [mine], corners: [mine] }
      : { text: `Nearest to you is ${name(mine)}. The notice does not say where its shuttle bus stops.`, ids: [mine] });
  }
  const start = ends[0];
  if (start) {
    const by = trainsAt(start);
    steps.push({ text: `Ride the ${orWords(by)} to ${name(start)} and go up to the street.${goTicket(start)}`, ids: [start], corners: cornerIds([start]) });
    steps.push(at(start).length
      ? { text: `The shuttle bus stops at ${cornerWords(at(start))}.`, ids: [start], corners: [start] }
      : { text: `The notice does not say where the shuttle bus stops at ${name(start)}.`, ids: [start] });
  }
  const along = g.bused.filter((id) => !ends.includes(id));
  if (along.length) {
    const listed = cornerIds(along);
    steps.push(listed.length
      ? { text: `It stops near ${stationWords(along.map((id) => nameOf(sys, id)))}. The corners are on the map.`, ids: along, corners: listed }
      : { text: `It stops near ${stationWords(along.map((id) => nameOf(sys, id)))}. The notice does not say at which corners.`, ids: along });
  }
  const back = ends[1];
  if (back) steps.push({ text: `Get off the bus at ${name(back)} and change to the ${orWords(trainsAt(back))}.`, ids: [back], corners: cornerIds([back]) });
  else if (start) steps.push({ text: `Coming back, take the shuttle bus to ${name(start)} and get back on the ${route} there.`, ids: [start], corners: cornerIds([start]) });
  // Stations off this line where the bus meets another train (Inwood-207 St for the A).
  for (const t of g.busTransfers) {
    const f = findStation(sys, t.name, g.onLine, t.lines);
    if (!f || f.properties.id in g.onLine || !t.lines.length) continue;
    const id = f.properties.id;
    steps.push({ text: `You can also change between the bus and the ${orWords(t.lines)} at ${name(id)}${at(id).length ? `, where it stops at ${cornerWords(at(id))}` : ""}.`, ids: [id], corners: cornerIds([id]) });
  }
  return steps;
}

/** The direction of a skip: "Uptown", "Flushing", or null for both. */
function skipDirection(all: string): string | null {
  const line = cleanAlertText(all).split(/\n/).find((l) => /\bskips?\b/i.test(l)) ?? "";
  if (/both directions/i.test(line)) return null;
  const m = /\b(uptown|downtown)\b|\b([A-Z][\w.']*(?: [A-Z][\w.']*){0,2})-bound\b/i.exec(line);
  if (!m) return null;
  const w = m[1] ?? m[2];
  return w.charAt(0).toUpperCase() + w.slice(1);
}

function skipStops(a: TransitAlert, sys: StaticSystem, route: string, all: string): AlertDiagram | null {
  // The words, not just the server's skip names: those also catch "No [M] between …" in a note.
  const skipsHere = a.changes?.some((c) => c.kind === "skip" && c.route === route) || /\bskips?\b/i.test(all);
  if (!skipsHere) return null;
  const onLine = sys.stopM[route];
  const skipped = skippedStations(a, sys, route);
  if (!skipped.length) return null;
  const { seq } = trackOrder(sys, route, []);
  const change = a.changes?.find((c) => c.kind === "skip" && c.route === route);
  const dir = change ? change.toward : skipDirection(all);
  const state = new Map<string, StopState>(skipped.map((id) => [id, "skip"]));
  const changes = transfers(all, skipped.length > 1);
  const changeIds = changes.map((t) => idsOf(sys, t, onLine));
  for (const id of changeIds.flat()) if (id in onLine && !state.has(id)) state.set(id, "transfer");
  const idx = [...state.keys()].map((id) => seq.indexOf(id)).filter((i) => i >= 0);
  const pad = changeIds.flat().some((id) => id in onLine) ? 0 : 1;
  const lo = Math.max(0, Math.min(...idx) - pad), hi = Math.min(seq.length - 1, Math.max(...idx) + pad);
  const names = seq.filter((id) => skipped.includes(id)).map((id) => nameOf(sys, id));
  if (drawReversed(sys, route, dir)) names.reverse();
  const who = dir ? `${/-bound$|^(?:Uptown|Downtown)$/.test(dir) || dir.split(" ").length > 1 ? dir : `${dir}-bound`} ${route} trains` : `${route} trains`;
  const steps: DiagramStep[] = [{ text: `${who} skip ${stationWords(names)}${dir ? "" : " in both directions"}.`, ids: skipped }];
  changes.forEach((t, i) => steps.push({ text: t.text, ids: changeIds[i] }));
  return { kind: "skip", heading: dir ? `${who.replace(/ trains$/, "")}` : `${route}, both ways`, rows: rowsFor(seq, lo, hi, state, sys, drawReversed(sys, route, dir)), steps };
}

function local(a: TransitAlert, sys: StaticSystem, route: string, all: string): AlertDiagram | null {
  const run = localRun(all, route);
  if (!run) return null;
  const informed = a.stops.map((s) => stationOf(sys.system, s));
  const { line, seq } = trackOrder(sys, route, informed);
  const onLine = sys.stopM[line];
  const span = between(sys, seq, onLine, run.from, run.to);
  if (!span) return null;
  const usual = sys.stopM[route];
  const state = new Map<string, StopState>();
  const added: string[] = [];
  for (let i = span[0]; i <= span[1]; i++) if (!(seq[i] in usual)) { state.set(seq[i], "local"); added.push(seq[i]); }
  const reverse = drawReversed(sys, line, run.toward);
  const names = added.map((id) => nameOf(sys, id));
  if (reverse) names.reverse();
  const who = `${run.toward ? `${run.toward} ` : ""}${route}`;
  const steps: DiagramStep[] = [{ text: `${who} trains run local from ${said(run.from)} to ${said(run.to)}.`, ids: [seq[span[0]], seq[span[1]]] }];
  if (added.length) steps.push({ text: `They also stop at ${stationWords(names)}.`, ids: added });
  return { kind: "local", heading: who, rows: rowsFor(seq, span[0], span[1], state, sys, reverse), steps };
}
