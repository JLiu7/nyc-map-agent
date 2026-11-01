import { tool } from "ai";
import { findEvent, readPage } from "./webLookup";
import { z } from "zod";
import { command, LAYER_HELP_IDS, playbackSpeed, type AgentCommand, type LngLatTuple, type MapAction, type Trip } from "../../../src/features/agent/schema";
import { elevatorOutages, elevatorStatus, geocode, lineOutages, hazardsAt, nearestRestrooms, publicRestrooms, routeWalk, serviceAlerts, subwayAlertEntities, subwayVehicles, troubleStations, weatherAt, type Place, type RestroomRow, type WalkResult } from "./services";
import { exitActions, LAYER_HELP, layerAction, lineAction, placeActions, restroomActions, troubleActions, tripActions } from "./mapActions";
import { buildDriveTrip } from "./drive/trip";
import type { DriveRouter } from "./drive/router";
import { nyLocalToDate, portalFor, safe, straight, toNyLocal, tripBrief } from "./trip";
import { distM, openDataEntrances, type Station } from "./transit";
import { loadGuideLandmarks, type GuideLandmark } from "../../../src/lib/guide/landmarkGuide";
import { landmarkAtTurn, landmarksOnWay } from "./landmarksOnWay";
import { sameStation } from "../../../src/lib/transit/serviceChanges";
import { lineTroubles, otherLinesAt, stuckTrains, troubleSummary, type FeedAlert, type LiveVehicle } from "../../../src/lib/transit/trouble";
import { planTrip, type PlanDeps } from "./plan";
import { askFor, followUpFor, preferFrom, type Line } from "./ask";
import { withSources, type SourceLedger } from "./freshness";
import { parseWhen, sayWhen, scheduleFor } from "./when";
import { dayWindow, weekendWindow } from "../../../src/lib/transit/weekend";

export interface ToolContext {
  location: { lon: number; lat: number } | null;
  emit: (c: AgentCommand) => void;
  deps?: PlanDeps & {
    driveRouter?: DriveRouter;
    restrooms?: () => Promise<RestroomRow[]>;
    walk?: typeof routeWalk;
    alerts?: typeof serviceAlerts;
    /** MTA trouble inputs (#361), injectable for tests. */
    alertEntities?: () => Promise<FeedAlert[]>;
    vehicles?: (routes: string[]) => Promise<LiveVehicle[]>;
    outages?: typeof elevatorOutages;
    now?: () => number;
    /** The guide landmarks, injectable for tests. */
    landmarks?: () => Promise<readonly GuideLandmark[]>;
  };
  /** The followed vehicle key from street view ("subway:<trip id>"), to say whether that train is the stuck one. */
  followedTrain?: string | null;
  /** Driving sub-module flag (agentDrive). */
  drive?: boolean;
  /** The user's message is a short reply to the last answer ("yes", "ok, go"), not a new question. */
  replying?: boolean;
  /** Map action buttons built from tool results (#371). */
  actions?: (a: MapAction[]) => void;
  /** The request's source ledger: every data tool's feeds and their age (#375). */
  sources?: SourceLedger;
  /** The request's clock, so "tomorrow 9am" resolves against the asker's now. */
  now?: Date;
  /** Questions the rider just answered in a row (ask.ts), so a detail is not asked about forever. */
  answered?: number;
  /** The app's own sentence for this answer (ask.ts): the question before planning, or the follow-up after; the route says it, in the language the model named. */
  say?: (line: Line, language: string) => void;
}

/** A time in the user's words; the server resolves it in New York time (parseWhen). */
const when = z.string().trim().min(1).max(80).default("now");

/** Tool argument schemas, exported for tests. "here" means the user's location. */
export const args = {
  geocode: z.object({ text: z.string().min(2).describe("NYC address, landmark or 'here'") }),
  route_walk: z.object({ from: z.string(), to: z.string() }),
  transit_plan: z.object({
    from: z.string().default("here"),
    to: z.string().min(2),
    depart: when.describe("When to leave (or arrive by, with arriveBy): the user's own words, e.g. \"tomorrow 9am\", \"now\", or a New York time 2026-10-22T09:00"),
    arriveBy: z.boolean().default(false).describe("true when the user must arrive by that time"),
    prefer: z.enum(["fastest", "subway", "bus", "ferry", "less-walking"]).default("fastest").describe("fastest (any mode), subway only, bus only, by ferry, or the least walking"),
    // What the rider said, in any language, read into fixed values; ask.ts decides in code whether to ask first (#625).
    timing: z.enum(["now", "set", "vague"]).default("now").describe("now: leave now or no time said; set: a clock time or \"in 20 minutes\"; vague: only a day or part of day (\"tomorrow\", \"tonight\", \"this afternoon\", \"later\")"),
    access: z.enum(["none", "step-free", "unclear"]).default("none").describe("step-free: they need elevators, no stairs (wheelchair, \"no stairs\"); unclear: any hint that stairs or distance may be hard (a stroller, luggage, a bad knee, an older relative, someone who walks slowly or tires easily, a wheelchair user with them) without saying they need step-free; none: nothing said"),
    walking: z.enum(["any", "less", "unclear"]).default("any").describe("less: as little walking as possible; unclear: a hint about walking (\"not too far\", \"my feet hurt\") without saying how much; any: nothing said"),
    mode: z.enum(["any", "subway", "bus", "ferry", "unclear"]).default("any").describe("the way they want to go; unclear: they want a particular way but did not say which; any: nothing said"),
    language: z.string().max(12).describe("the language of the user's latest message as a code: en, es, zh, ru, bn, ht (Haitian Creole), fr, ko, or another"),
  }),
  weather_forecast: z.object({ place: z.string().default("here"), time: when }),
  hazards: z.object({ place: z.string().default("here") }),
  find_event: z.object({ query: z.string().min(3).max(160).describe("The event's name and anything known: organiser, date, \"Luma\" or \"Eventbrite\" (e.g. \"3 Percent Club event New York October 24 2026\")") }),
  read_page: z.object({ url: z.string().url().describe("An event page from find_event results") }),
  nearest_restroom: z.object({ place: z.string().default("here") }),
  station_exit: z.object({
    station: z.string().min(2).default("here").describe("The subway station as the user names it (\"Herald Sq\", \"34 St-Herald Sq\"), or \"here\" for the one they are at"),
    to: z.string().min(2).describe("Where they are going once out: a landmark or address"),
  }),
  elevator_status: z.object({ station: z.string().min(2) }),
  line_status: z.object({
    lines: z.array(z.string().regex(/^[A-Za-z0-9]{1,3}$/)).min(1).max(6).describe("Subway lines as the MTA names them, e.g. [\"L\"] or [\"4\",\"5\",\"6\"]"),
    when: when.describe("The time the user asks about, in their words: \"now\", \"this weekend\", \"Saturday 2pm\", \"tomorrow morning\". Planned work is checked for that time."),
  }),
  flyTo: z.object({ place: z.string(), zoom: z.number().min(9).max(20).optional() }),
  tripRef: z.object({ tripId: z.string() }),
  enterStreetView: z.object({ place: z.string() }),
  playFlythrough: z.object({ tripId: z.string(), speed: playbackSpeed.default(10) }),
  drive_plan: z.object({
    from: z.string().default("here"),
    to: z.string().min(2),
    depart: when.describe("When to leave: the user's own words (\"tomorrow 9am\", \"now\") or a New York time 2026-10-22T09:00"),
  }),
  setTime: z.object({ iso: z.string().regex(/^\d{4}-\d\d-\d\dT\d\d:\d\d/) }),
  suggest_layer: z.object({ layer: z.enum(LAYER_HELP_IDS) }),
};

const nearestTo = (all: Station[], p: LngLatTuple): Station | undefined => [...all].sort((a, b) => distM(a.at, p) - distM(b.at, p))[0];

/** The station a rider names. Several share a name ("Times Sq", "86 St"), so the one nearest where they are going wins. */
export function pickStation(all: Station[], name: string, toward: LngLatTuple): Station | null {
  return nearestTo(all.filter((x) => sameStation(name, x.name)), toward) ?? null;
}

/** Within about 150 m of the user's point: close enough to be that point. */
const NEAR = 0.0015;

/**
 * A tool result as the model sees it: any point at the user's location becomes
 * "here", so their position never reaches the model as numbers (docs/PRIVACY.md,
 * #374). The map still gets the exact point through emit and offer.
 */
export function hideHere(value: unknown, me: { lon: number; lat: number }): unknown {
  const near = (lon: unknown, lat: unknown) => typeof lon === "number" && typeof lat === "number" && Math.abs(lon - me.lon) < NEAR && Math.abs(lat - me.lat) < NEAR;
  if (Array.isArray(value)) return value.length === 2 && near(value[0], value[1]) ? "here" : value.map((v) => hideHere(v, me));
  if (!value || typeof value !== "object") return value;
  const o = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) out[k] = hideHere(v, me);
  if (near(o.lon, o.lat)) { delete out.lon; delete out.lat; out.at = "here"; }
  return out;
}

export function makeTools(ctx: ToolContext) {
  const tools = allTools(ctx);
  const me = ctx.location;
  if (!me) return tools;
  for (const t of Object.values(tools) as Array<{ execute?: (...a: never[]) => unknown }>) {
    const run = t.execute;
    if (run) t.execute = async (...a: never[]) => hideHere(await run(...a), me);
  }
  return tools;
}

/** A short reply to the last answer ("yes", "sí, vamos", "ok go") rather than a new question: four words or fewer, no question mark. */
export function isShortReply(messages: readonly { role: string; content: string }[]): boolean {
  const last = messages.at(-1);
  if (last?.role !== "user" || !messages.slice(0, -1).some((m) => m.role === "assistant")) return false;
  const text = last.content.trim();
  return !!text && !/[?？]/.test(text) && text.split(/\s+/).length <= 4;
}

/**
 * Planned trips by id, kept for a while across requests: "Want to start?" is answered in the next request,
 * and its showRoute and openPanel need the trip the last answer planned. Ids are random UUIDs.
 */
const TRIP_TTL_MS = 30 * 60_000;
const TRIP_CAP = 2000;
const recentTrips = new Map<string, { trip: Trip; at: number }>();
const trips = {
  get(id: string): Trip | undefined {
    const hit = recentTrips.get(id);
    if (!hit) return undefined;
    if (Date.now() - hit.at > TRIP_TTL_MS) { recentTrips.delete(id); return undefined; }
    return hit.trip;
  },
  set(id: string, trip: Trip): void {
    recentTrips.delete(id);
    recentTrips.set(id, { trip, at: Date.now() });
    // Map keeps insertion order, so the first keys are the oldest.
    for (const k of recentTrips.keys()) { if (recentTrips.size <= TRIP_CAP) break; recentTrips.delete(k); }
  },
};

function allTools(ctx: ToolContext) {
  const resolve = async (text: string): Promise<Place> => {
    if (/^(here|my location|current location|me)$/i.test(text.trim())) {
      if (!ctx.location) throw new Error("Location permission not granted; ask the user where they are starting.");
      return { label: "your location", at: [ctx.location.lon, ctx.location.lat] };
    }
    // A place picked on the map arrives as "Rockefeller Center (40.75874, -73.97870)": go to that exact spot.
    const pin = /^(.*?)\s*\((-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)\)$/.exec(text.trim());
    if (pin) return { label: pin[1] || "the spot on the map", at: [Number(pin[3]), Number(pin[2])] };
    const p = await geocode(text);
    if (!p) throw new Error(`Could not find "${text}" in NYC.`);
    return p;
  };
  const tripOf = (id: string) => {
    const t = trips.get(id);
    if (!t) throw new Error("Unknown tripId: plan the trip again (transit_plan, route_walk or station_exit).");
    return t;
  };
  const emit = (c: AgentCommand) => { ctx.emit(command.parse(c)); return { ok: true }; };
  const at = (p: Place): LngLatTuple => p.at;
  const offer = (a: MapAction[]) => ctx.actions?.(a);
  // A which-exit answer stays a small card over the map: the walk is drawn and opened only after "Want to start?" gets a yes,
  // which is the next request, so in this one the trip tools hold off even if the model calls them.
  let exitShown = false;
  const waitForYes = { ok: false, note: "Not yet: the map already shows the exit and the walk. Ask \"Want to start?\" and call this after the user says yes." };
  /** A data tool: its result says which feeds it read and how old each is, so the model can say so (#375). */
  const sourced = <A, R extends object>(fn: (input: A) => Promise<R>) => async (input: A) => {
    const { value, sources } = await withSources(ctx.sources, () => fn(input));
    if (!sources.length) return value;
    return { ...value, sources: sources.map((s) => ({ source: s.label, asOf: s.asOf ? toNyLocal(new Date(s.asOf)) : "unknown", ...(s.stale ? { stale: true } : {}), ...(s.note ? { note: s.note } : {}) })) };
  };
  const now = () => ctx.now ?? new Date();
  const localTime = (words: string): string => {
    const t = parseWhen(words, now());
    if (!t) throw new Error(`Could not read the time "${words}"; pass it as a New York time like 2026-10-22T09:00.`);
    return t;
  };
  /** Mark a trip planned ahead, so the answer and the card say what is known for that time. */
  const schedule = (t: Trip): Trip => {
    const n = now();
    return { ...t, scheduled: scheduleFor(t.departIso, n), alternatives: t.alternatives.map((a) => ({ ...a, scheduled: scheduleFor(a.departIso, n) })) };
  };

  /** A walk as a trip, so "Want to start?" can draw it and open its card like any other route. */
  const walkTrip = (from: Place, to: { label: string; at: LngLatTuple }, w: WalkResult): Trip => {
    const start = now();
    const t: Trip = {
      id: crypto.randomUUID(), mode: "walk",
      origin: { label: from.label, at: at(from) }, destination: { label: to.label, at: to.at },
      departIso: toNyLocal(start), arriveIso: toNyLocal(new Date(start.getTime() + w.durationS * 1000)),
      legs: [{ kind: "walk", label: `Walk to ${to.label}`, coords: w.coords, durationS: w.durationS, distanceM: w.distanceM, turns: w.turns }],
      routes: [], alerts: [], elevators: [], hazards: [], weather: null, exitAdvice: null, context: [], skips: [], impacts: [], stubbed: [], alternatives: [],
    };
    trips.set(t.id, t);
    return t;
  };
  // A turn onto an unnamed footpath ("Turn right onto the path") tells a walker nothing, so the model never gets one.
  // Turns name the landmark beside them, and `passes` lists what you walk by on which hand,
  // so the answer can say "on your left, next to the library" (#418 scene 4).
  const walkBrief = async (t: Trip) => {
    const l = t.legs[0];
    if (l.kind !== "walk") return null;
    const marks = await (ctx.deps?.landmarks ?? loadGuideLandmarks)().catch(() => [] as readonly GuideLandmark[]);
    const turns = l.turns.filter((x) => !/onto the path$/i.test(x.text)).slice(0, 8).map((x) => {
      const near = landmarkAtTurn(x.at, marks);
      return near ? `${x.text} (by ${near})` : x.text;
    });
    return { tripId: t.id, minutes: Math.max(1, Math.round(l.durationS / 60)), meters: Math.round(l.distanceM), turns, passes: landmarksOnWay(l.coords, marks) };
  };

  return {
    geocode: tool({ description: "Find an NYC address or landmark.", inputSchema: args.geocode, execute: async ({ text }) => { const p = await resolve(text); offer(placeActions(p)); return p; } }),
    route_walk: tool({
      description: "Walking route (OSRM) between two places: minutes, meters, the turns, and a tripId for showRoute and openPanel.",
      inputSchema: args.route_walk,
      execute: async ({ from, to }) => {
        const [o, dest] = await Promise.all([resolve(from), resolve(to)]);
        const t = walkTrip(o, { label: dest.label, at: at(dest) }, await (ctx.deps?.walk ?? routeWalk)(at(o), at(dest)));
        offer(tripActions(t));
        offer(placeActions(dest));
        return await walkBrief(t);
      },
    }),
    transit_plan: tool({
      description: "Door-to-door public transit search across subway, bus (incl. SBS), LIRR, Metro-North, ferry and SIR: the best itinerary plus up to 2 alternatives (each with depart/arrive, legs, stops), weather, planned work, elevator outages, recommended exit. Returns a tripId for map tools.",
      inputSchema: args.transit_plan,
      execute: sourced(async ({ from, to, depart, arriveBy, prefer, language, ...said }: z.infer<typeof args.transit_plan>) => {
        const details = { from, to, ...said };
        // Missing or vague: one question back, and the route lets the next step only write it (#625).
        const ask = askFor(details, { hasLocation: !!ctx.location, answered: ctx.answered ?? 0 });
        if (ask) { ctx.say?.({ kind: ask.ask, place: ask.place }, language); return ask; }
        const [o, d] = await Promise.all([resolve(from), resolve(to)]);
        const way = preferFrom(details, prefer);
        const t = schedule(await planTrip(o, d, localTime(depart), arriveBy, ctx.deps, way));
        trips.set(t.id, t);
        for (const a of t.alternatives) trips.set(a.id, { ...a, alternatives: [] });
        offer(tripActions(t));
        // The closing offer is the app's, said after the answer (routes.ts), so the model never words it.
        ctx.say?.(followUpFor(t, said), language);
        return {
          ...tripBrief(t),
          ...(way === "ferry" && !t.legs.some((l) => l.kind === "ride" && l.mode === "ferry") ? { noFerry: "No ferry goes there at that time; this is the fastest way. Say so first." } : {}),
          ...(said.access === "step-free" ? { stepFree: "The planner cannot pick step-free stations yet: call elevator_status for the stations this trip uses and say which have no working elevator." } : {}),
        };
      }),
    }),
    ...(ctx.drive === false ? {} : {
      drive_plan: tool({
        description: "Driving trip (car route) at a time: ETA, turn/lane hints, slow segments (DOT live speeds), closures, events, tolls, crash hotspots, weather. Returns a tripId for map tools.",
        inputSchema: args.drive_plan,
        execute: sourced(async ({ from, to, depart }: z.infer<typeof args.drive_plan>) => {
          const [o, d] = await Promise.all([resolve(from), resolve(to)]);
          const t = schedule(await buildDriveTrip(o, d, localTime(depart), ctx.deps?.driveRouter));
          trips.set(t.id, t);
          offer(tripActions(t));
          return tripBrief(t);
        }),
      }),
    }),
    nearest_restroom: tool({
      description: "Closest public restrooms (NYC Open Data) to a place, skipping ones closed right now by their listed hours: name, distance in meters, status, hours, accessibility, and walkToNearest (minutes, turns, tripId) for the first one.",
      inputSchema: args.nearest_restroom,
      execute: sourced(async ({ place }: z.infer<typeof args.nearest_restroom>) => {
        const from = await resolve(place);
        const spots = nearestRestrooms(await (ctx.deps?.restrooms ?? publicRestrooms)(), at(from), 3, now());
        offer(restroomActions(spots));
        // The way to the nearest one, so the answer gives directions rather than just a name.
        const first = spots[0];
        const w = first ? await safe((ctx.deps?.walk ?? routeWalk)(at(from), [first.lon, first.lat]), null) : null;
        const walk = first && w ? await walkBrief(walkTrip(from, { label: first.name, at: [first.lon, first.lat] }, w)) : null;
        // Coordinates stay out of the model's view; the button carries them.
        return { restrooms: spots.map((r) => ({ name: r.name, distanceM: r.distanceM, status: r.status, hours: r.hours, openNow: r.openNow, accessibility: r.accessibility, operator: r.operator })), walkToNearest: walk };
      }),
    }),
    station_exit: tool({
      description: "Which exit to take at a subway station for a place: the exit by its corner and street, elevator notes, and the walk from that exit (minutes, turns, tripId for showRoute and openPanel). Use for \"which way out\" and \"which exit for X\".",
      inputSchema: args.station_exit,
      execute: sourced(async ({ station, to }: z.infer<typeof args.station_exit>) => {
        const src = ctx.deps?.entrances ?? openDataEntrances;
        const [all, dest] = await Promise.all([src.stations(), resolve(to)]);
        const here = /^(here|my station|this station)$/i.test(station.trim());
        const st = (here ? null : pickStation(all, station, at(dest))) ?? nearestTo(all, at(await resolve(here ? "here" : station)));
        if (!st) throw new Error(`Could not find the station "${station}".`);
        const outages = await safe(elevatorStatus(st.name), [] as string[]);
        const exit = await portalFor(st, await safe(src.entrances(st.complexId), []), at(dest), "exit", outages);
        const from: Place = { label: `${st.name}, ${exit.label}`, at: [exit.lon, exit.lat] };
        const w = await safe((ctx.deps?.walk ?? routeWalk)(at(from), at(dest)), null);
        const t = w ? walkTrip(from, { label: dest.label, at: at(dest) }, w) : null;
        offer(exitActions({ station: st.name, exit: { at: at(from), label: exit.label, elevatorOnly: exit.elevatorOnly }, destination: { label: dest.label, at: at(dest) }, walk: w ?? straight(at(from), at(dest)) }));
        if (t) offer(tripActions(t));
        // On the yes the model looks the exit up again (only text reaches it), and then the walk should open.
        exitShown = !ctx.replying;
        return { station: st.name, to: dest.label, exit: exit.label, elevatorOnly: exit.elevatorOnly, outage: exit.outage, elevatorOutages: outages.slice(0, 3), walkFromExit: t ? await walkBrief(t) : null };
      }),
    }),
    line_status: tool({
      description: "Live MTA subway trouble right now for the given lines: what is wrong and at which station, skipped stations, shuttle buses (where they run, where to board, where to get the train back), stations where the MTA says to switch direction, other lines at skipped stations, and trains not moving on a delayed line. Subway only: no buses, LIRR or Metro-North.",
      inputSchema: args.line_status,
      execute: sourced(async ({ lines, when: asked }: z.infer<typeof args.line_status>) => {
        const routes = [...new Set(lines.map((l) => l.toUpperCase()))];
        const liveS = Math.floor((ctx.deps?.now?.() ?? Date.now()) / 1000);
        // "This weekend" on a Tuesday: the work that runs then, not what is running now (owner, 2026-10-27).
        const atLocal = parseWhen(asked ?? "now", new Date(liveS * 1000)) ?? toNyLocal(new Date(liveS * 1000));
        const nowS = Math.max(liveS, Math.floor(nyLocalToDate(atLocal).getTime() / 1000));
        const ahead = nowS - liveS > 3600;
        // The span the question covers: a weekend is Friday night to Monday morning, a day is the whole day.
        const span = /\bweek-?end\b/i.test(asked ?? "") ? weekendWindow(nowS * 1000) : ahead ? dayWindow(nowS * 1000) : null;
        // Work that runs only Sunday, or only overnight, is still that weekend's: look across it.
        const times = span ? [...new Set([nowS, ...[2, 13, 25, 37, 49, 53].map((h) => span.from + h * 3600).filter((t) => t < span.to)])] : [nowS];
        const [alertSets, feed, outageRows] = await Promise.all([
          Promise.all(times.map((t) => (ctx.deps?.alerts ?? serviceAlerts)(routes, t))),
          safe((ctx.deps?.alertEntities ?? subwayAlertEntities)(), [] as FeedAlert[]),
          // The line card lists these too; without them the answer said "no alerts" over a card with three.
          ahead ? Promise.resolve([]) : safe((ctx.deps?.outages ?? elevatorOutages)(), []),
        ]);
        const outages = lineOutages(outageRows, routes);
        const alerts = [...new Set(alertSets.flat())].slice(0, 6);
        // Stations only matter when an alert names one of these lines.
        const touched = feed.some((a) => a.alert.informed_entity?.some((e) => e.route_id && routes.includes(e.route_id)));
        const stations = touched ? troubleStations(await safe((ctx.deps?.entrances ?? openDataEntrances).stations(), [] as Station[])) : [];
        const troubles = times.flatMap((t) => lineTroubles(feed, stations, routes, t))
          .filter((t, i, all) => all.findIndex((o) => o.route === t.route && troubleSummary(o) === troubleSummary(t)) === i);
        // Stuck trains are a now thing: none for a time ahead.
        const delayed = ahead ? [] : [...new Set(troubles.filter((t) => t.kind === "delay").map((t) => t.route))];
        const vehicles = delayed.length ? await safe((ctx.deps?.vehicles ?? subwayVehicles)(delayed), [] as LiveVehicle[]) : [];
        const stuck = stuckTrains(vehicles, troubles, stations, nowS);
        // The line opens on its trouble notice, so it leads; a train stuck right now is more pressing still.
        const lineButtons = routes.slice(0, 2).map((r) => lineAction(r, troubles.some((t) => t.route === r), span ?? undefined));
        if (stuck.length) { offer(troubleActions(troubles, stuck)); offer(lineButtons); } else { offer(lineButtons); offer(troubleActions(troubles, stuck)); }
        const followed = ctx.followedTrain?.replace(/^subway:/, "") ?? null;
        const followedSeen = followed ? vehicles.find((v) => v.tripId === followed) : undefined;
        return {
          lines: routes,
          ...(span ? { checkedFor: span.label === "This weekend" ? `the weekend of ${dayWindow(span.from * 1000 + 86_400_000).label} (Friday 9 pm to Monday 5 am)` : sayWhen(atLocal) } : {}),
          alerts,
          trouble: troubles.slice(0, 8).map((t) => ({
            line: t.route,
            kind: t.kind,
            summary: troubleSummary(t),
            ...(t.skipped.length ? { otherLinesThatStillStopAtSkippedStations: Object.fromEntries(t.skipped.slice(0, 4).map((s) => [s.name, otherLinesAt(s, troubles, stations).filter((r) => r !== t.route)])) } : {}),
          })),
          ...(stuck.length ? { trainsNotMoving: stuck.slice(0, 5).map((s) => ({ line: s.route, toward: s.toward, station: s.station.name, stoppedAtStation: s.stopped, minutesWithoutMoving: s.stoppedMin, ...(s.tripId === followed ? { isTheTrainTheUserFollows: true } : {}) })) } : {}),
          ...(followedSeen && !stuck.some((s) => s.tripId === followed) ? { followedTrain: "moving normally per the live feed" } : {}),
          ...(outages.length ? { elevatorEscalatorOutages: { stations: outages.length, list: outages.slice(0, 4) } } : {}),
          ...(alerts.length || troubles.length ? {} : { note: outages.length ? "No delays or service changes; only the elevator and escalator outages above." : "The MTA feed has no active alerts for these lines." }),
        };
      }),
    }),
    weather_forecast: tool({ description: "Hourly forecast (Open-Meteo) at a place and local time, up to 7 days ahead.", inputSchema: args.weather_forecast, execute: sourced(async ({ place, time }: z.infer<typeof args.weather_forecast>) => weatherAt(at(await resolve(place)), localTime(time))) }),
    hazards: tool({ description: "Active National Weather Service alerts at a place.", inputSchema: args.hazards, execute: sourced(async ({ place }: z.infer<typeof args.hazards>) => ({ alerts: await hazardsAt(at(await resolve(place))) })) }),
    find_event: tool({ description: "Search the web for a named event in New York (Luma, Eventbrite, Meetup, Partiful, the organiser's site). Only when the user asks about a specific event or what is on at a place they name. Tries a wider search on its own when the first finds nothing.", inputSchema: args.find_event, execute: sourced(async ({ query }: z.infer<typeof args.find_event>) => findEvent(query)) }),
    read_page: tool({ description: "Read one event page from find_event to get its venue address, date and time.", inputSchema: args.read_page, execute: sourced(async ({ url }: z.infer<typeof args.read_page>) => readPage(url)) }),
    elevator_status: tool({ description: "Current MTA elevator/escalator outages at a station.", inputSchema: args.elevator_status, execute: sourced(async ({ station }: z.infer<typeof args.elevator_status>) => ({ outages: await elevatorStatus(station) })) }),
    flyTo: tool({ description: "Map: fly the camera to a place.", inputSchema: args.flyTo, execute: async ({ place, zoom }) => { const p = await resolve(place); offer(placeActions(p)); return emit({ type: "flyTo", lon: p.at[0], lat: p.at[1], zoom }); } }),
    showRoute: tool({ description: "Map: draw a planned trip.", inputSchema: args.tripRef, execute: ({ tripId }) => (exitShown ? waitForYes : emit({ type: "showRoute", trip: tripOf(tripId) })) }),
    openPanel: tool({ description: "Map: open the trip summary panel (weather chip, lines, alerts, elevators, exit, ETA).", inputSchema: args.tripRef, execute: ({ tripId }) => (exitShown ? waitForYes : emit({ type: "openPanel", trip: tripOf(tripId) })) }),
    enterStreetView: tool({ description: "Map: drop to street level at a place.", inputSchema: args.enterStreetView, execute: async ({ place }) => { const p = await resolve(place); return emit({ type: "enterStreetView", lon: p.at[0], lat: p.at[1] }); } }),
    playFlythrough: tool({ description: "Map: load the fast-forward preview of a planned trip behind a Play button. Only when the user asks to preview or play it; it never starts on its own.", inputSchema: args.playFlythrough, execute: ({ tripId, speed }) => emit({ type: "playFlythrough", trip: tripOf(tripId), speed }) }),
    suggest_layer: tool({
      description: `Map: offer a button that turns on the map layer answering the question (#313). The person taps it; you never switch layers yourself. Layers: ${Object.entries(LAYER_HELP).map(([id, what]) => `${id} (${what})`).join(", ")}.`,
      inputSchema: args.suggest_layer,
      execute: ({ layer }) => { offer([layerAction(layer)]); return { button: layerAction(layer).label }; },
    }),
    setTime: tool({ description: "Map: set the time the map shows (for forecasts/planned work).", inputSchema: args.setTime, execute: ({ iso }) => emit({ type: "setTime", iso }) }),
  };
}
