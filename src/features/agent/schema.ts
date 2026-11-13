import { z } from "zod";

/**
 * The agent's wire contract, shared by server/features/agent (producer) and the
 * client executor (consumer). zod only, so both sides import it safely.
 */
export const lngLat = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);
export type LngLatTuple = z.infer<typeof lngLat>;

export const callout = z.object({ at: lngLat, text: z.string() });

export const stationRef = z.object({ id: z.string(), name: z.string(), lon: z.number(), lat: z.number() });

/** A station entrance or exit from MTA "Subway Entrances and Exits" (data.ny.gov i9wp-a4ja). */
export const portal = z.object({
  lon: z.number(),
  lat: z.number(),
  /** Plain words: "NE exit near E 42 St & Lexington Av". */
  label: z.string(),
  type: z.string(),
  elevatorOnly: z.boolean().default(false),
  /** Active elevator/escalator outage text at this station, if any. */
  outage: z.string().nullable().default(null),
});

export const walkLeg = z.object({
  kind: z.enum(["walk", "transfer"]),
  label: z.string(),
  coords: z.array(lngLat).min(2),
  durationS: z.number().nonnegative(),
  distanceM: z.number().nonnegative(),
  turns: z.array(callout).default([]),
});

export const enterLeg = z.object({ kind: z.literal("enter"), station: stationRef, portal, label: z.string() });
export const exitLeg = z.object({ kind: z.literal("exit"), station: stationRef, portal, label: z.string() });

export const rideLeg = z.object({
  kind: z.literal("ride"),
  route: z.string(),
  label: z.string(),
  coords: z.array(lngLat).min(2),
  durationS: z.number().nonnegative(),
  stops: z.array(callout).default([]),
  /** Underground → x-ray buildings; elevated → normal 3D city (the viaduct). */
  underground: z.boolean(),
  /** "gtfs-shape" when the transit feature supplies one, else "straight-line" (stub). */
  geometrySource: z.enum(["gtfs-shape", "straight-line"]),
  /** Vehicle type; bus/rail/ferry legs come from the OTP planner. */
  mode: z.enum(["subway", "bus", "rail", "ferry", "tram"]).default("subway"),
  /** Boarding and alighting stop names, and stops ridden (alighting stop included). */
  fromStop: z.string().optional(),
  toStop: z.string().optional(),
  numStops: z.number().int().nonnegative().optional(),
  /** Route colour from GTFS, "#RRGGBB". */
  color: z.string().optional(),
  headsign: z.string().optional(),
});

export const driveLeg = walkLeg.extend({ kind: z.literal("drive") });

export const leg = z.discriminatedUnion("kind", [
  driveLeg,
  walkLeg.extend({ kind: z.literal("walk") }),
  walkLeg.extend({ kind: z.literal("transfer") }),
  enterLeg,
  rideLeg,
  exitLeg,
]);
export type Leg = z.infer<typeof leg>;

const optNum = z.number().nullable().optional();
/** Forecast at the departure hour. The optional fields feed the street-weather heads-up (older answers lack them). */
export const weatherChip = z.object({ time: z.string(), tempC: z.number(), precipPct: z.number(), summary: z.string(), code: optNum, feelsLikeC: optNum, precipMm: optNum, windKmh: optNum, gustKmh: optNum });

export const tripMode = z.enum(["walk", "transit", "drive"]);
export type TripMode = z.infer<typeof tripMode>;

/** Sourced driving context lines (traffic speeds, closures, tolls, cameras, crash hotspots, parking). */
export const contextNote = z.object({
  kind: z.enum(["slow", "closure", "advisory", "event", "toll", "camera", "crashes", "parking"]),
  text: z.string(),
  at: lngLat.optional(),
});

export const tripBase = z.object({
  id: z.string(),
  mode: tripMode.default("transit"),
  origin: z.object({ label: z.string(), at: lngLat }),
  destination: z.object({ label: z.string(), at: lngLat }),
  departIso: z.string(),
  arriveIso: z.string(),
  legs: z.array(leg).min(1),
  routes: z.array(z.string()),
  /** Planned work / service alerts active at departure on the ride routes. */
  alerts: z.array(z.string()).default([]),
  /** Elevator/escalator outages at the stations used. */
  elevators: z.array(z.string()).default([]),
  /** NWS alerts at the origin. */
  hazards: z.array(z.string()).default([]),
  weather: weatherChip.nullable().default(null),
  exitAdvice: z.string().nullable().default(null),
  context: z.array(contextNote).default([]),
  /** Stations the trip's subway lines skip right now (service alerts, #253), with where they are. */
  skips: z.array(z.object({ route: z.string(), name: z.string(), at: lngLat, toward: z.string().nullable().default(null) })).default([]),
  /**
   * How that day's service changes hit this trip itself (owner, 2026-10-27: the 7's weekend skips never
   * reached the Flushing plan): a skipped or closed boarding, transfer or get-off station, a suspended
   * stretch it rides, a platform moved where it boards. `blocks` = the trip can't be made as planned.
   */
  impacts: z.array(z.object({ route: z.string(), text: z.string(), blocks: z.boolean() })).default([]),
  stubbed: z.array(z.string()).default([]),
  /** "otp" when OpenTripPlanner planned it, "fallback" for the built-in subway router. */
  planner: z.enum(["otp", "fallback"]).optional(),
  /**
   * Set for a trip planned ahead ("tomorrow at 9am"): what is and is not known
   * for that time. Planned work and the forecast cover it; live delays do not.
   */
  scheduled: z.object({ future: z.boolean(), note: z.string() }).optional(),
});
/** A trip plus up to two alternative itineraries (themselves without alternatives). */
export const trip = tripBase.extend({ alternatives: z.array(tripBase).max(4).default([]) });
export type TripCore = z.infer<typeof tripBase>;
export type Trip = z.infer<typeof trip>;

/** Trip preview playback speeds (#289): 2x, 5x, 10x, 30x real time. */
export const PLAYBACK_SPEEDS = [2, 5, 10, 30] as const;
export type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number];
export const playbackSpeed = z.union([z.literal(2), z.literal(5), z.literal(10), z.literal(30)]);

/** Structured map commands the model returns and the client executes. Keep it small. */
export const command = z.discriminatedUnion("type", [
  z.object({ type: z.literal("flyTo"), lon: z.number().min(-180).max(180), lat: z.number().min(-90).max(90), zoom: z.number().min(9).max(20).optional() }),
  z.object({ type: z.literal("showRoute"), trip }),
  z.object({ type: z.literal("openPanel"), trip }),
  z.object({ type: z.literal("enterStreetView"), lon: z.number().min(-180).max(180), lat: z.number().min(-90).max(90) }),
  z.object({ type: z.literal("playFlythrough"), trip, speed: playbackSpeed.default(10) }),
  z.object({ type: z.literal("setTime"), iso: z.string() }),
]);
export type AgentCommand = z.infer<typeof command>;

/** A named spot an action draws: a stop, a skipped station, a crash hotspot. */
export const mapPoint = z.object({ at: lngLat, name: z.string() });
export type MapPoint = z.infer<typeof mapPoint>;

export const restroomSpot = z.object({
  name: z.string(),
  lon: z.number().min(-180).max(180),
  lat: z.number().min(-90).max(90),
  distanceM: z.number().nonnegative(),
  status: z.string().nullable().default(null),
  hours: z.string().nullable().default(null),
  accessibility: z.string().nullable().default(null),
  operator: z.string().nullable().default(null),
  /** Open at the time asked, from the listed hours; null when the hours can't be read. */
  openNow: z.boolean().nullable().default(null),
});
export type RestroomSpot = z.infer<typeof restroomSpot>;

/**
 * A button under an answer that shows it on the map (#371). The server builds
 * these from the tool results it already has, never from the model's words,
 * so a button only ever draws data a tool returned. `id` dedupes repeats.
 */
const actionBase = { id: z.string().max(200), label: z.string().max(80) };
/** Layers the agent may offer as a button: the plain on/off ones in the Layers menu. */
export const LAYER_HELP_IDS = ["citibike", "health", "parksPlaces", "busStops", "xray", "streetArt", "businesses"] as const;
export type LayerHelpId = (typeof LAYER_HELP_IDS)[number];
export const mapAction = z.discriminatedUnion("kind", [
  z.object({ ...actionBase, kind: z.literal("flyTo"), lon: z.number().min(-180).max(180), lat: z.number().min(-90).max(90), zoom: z.number().min(9).max(20).optional() }),
  z.object({ ...actionBase, kind: z.literal("showRestroom"), restroom: restroomSpot }),
  z.object({ ...actionBase, kind: z.literal("showRoute"), trip }),
  /** A line's stops, or (`skipped`) the stations it is skipping. */
  z.object({ ...actionBase, kind: z.literal("showStops"), route: z.string(), color: z.string().optional(), skipped: z.boolean().default(false), stops: z.array(mapPoint).min(1).max(200) }),
  z.object({ ...actionBase, kind: z.literal("showCrashes"), points: z.array(mapPoint).min(1).max(200) }),
  /**
   * MTA trouble on a line (#361): where the problem is, the shuttle bus segment
   * and its boarding spots, stations where the MTA says to switch direction,
   * or a train that has not moved.
   */
  z.object({ ...actionBase, kind: z.literal("showTrouble"), route: z.string(), style: z.enum(["problem", "shuttle", "switch", "stuck"]), points: z.array(mapPoint).min(1).max(200) }),
  /**
   * Which exit to take for a place: the station exit nearest it, said as its
   * corner ("NE corner, West 34 Street"), and the walk from that exit. The
   * answer draws it at once, so the reply can stay one or two lines.
   */
  z.object({
    ...actionBase,
    kind: z.literal("showExit"),
    station: z.string().max(80),
    exit: z.object({ at: lngLat, label: z.string().max(80), elevatorOnly: z.boolean().default(false) }),
    destination: z.object({ at: lngLat, label: z.string().max(80) }),
    path: z.array(lngLat).min(2).max(2000),
    walkMin: z.number().nonnegative(),
  }),
  /** A trip planned ahead: the person taps it to put a reminder in their phone's calendar. */
  z.object({ ...actionBase, kind: z.literal("remindTrip"), trip }),
  /** A map layer that answers the question (#313). The person taps it; the agent never switches layers itself. */
  z.object({ ...actionBase, kind: z.literal("showLayer"), layer: z.enum(LAYER_HELP_IDS) }),
  /** A subway line's live trains and notices, where Follow a train is: on a phone the chat is the way there. */
  z.object({ ...actionBase, kind: z.literal("showLine"), route: z.string().min(1).max(4),
    /** Asked about another time ("this weekend"): the line panel opens on the planned work then. */
    day: z.object({ from: z.number(), to: z.number(), label: z.string().max(40) }).optional() }),
]);
export type MapAction = z.infer<typeof mapAction>;
/** Most buttons one answer carries. */
export const MAX_ACTIONS = 6;

/**
 * Where an answer's data came from and how old it is (#375). Built by the
 * server from the feeds its tools read, never by the model.
 */
export const dataSource = z.object({
  id: z.string().max(40),
  label: z.string().max(80),
  /** ISO time the data describes (feed timestamp or dataset update); null when the source gives none. */
  asOf: z.string().nullable(),
  url: z.string().url().optional(),
  /** Older than this source's threshold (live transit 2 min, daily datasets 3 days). */
  stale: z.boolean().default(false),
  /** A limit worth showing, e.g. "Crash data runs weeks to months behind." */
  note: z.string().max(120).optional(),
});
export type DataSource = z.infer<typeof dataSource>;

/**
 * One NDJSON line streamed by POST /api/agent. Clients drop lines they cannot
 * parse, so an older client simply ignores the newer "actions" and "sources" lines.
 */
export const streamEvent = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string() }),
  z.object({ type: z.literal("tool"), name: z.string() }),
  /**
   * A tool the agent started or finished (#370), for the "Agents working" list.
   * `id` pairs a start with its end. Older clients drop this line.
   */
  z.object({ type: z.literal("step"), id: z.string().max(100), name: z.string().max(100), status: z.enum(["start", "done", "error"]) }),
  z.object({ type: z.literal("command"), command }),
  z.object({ type: z.literal("actions"), actions: z.array(mapAction).max(MAX_ACTIONS) }),
  z.object({
    type: z.literal("sources"),
    sources: z.array(dataSource).max(12),
    /** Figures the reply stated although no data tool returned anything (the server's "no guessing" check). */
    unverified: z.array(z.string().max(20)).max(10).default([]),
  }),
  z.object({
    type: z.literal("done"),
    model: z.string(),
    usage: z.object({ inputTokens: z.number(), outputTokens: z.number() }),
  }),
  z.object({ type: z.literal("error"), message: z.string() }),
]);
export type StreamEvent = z.infer<typeof streamEvent>;

/** Where the question was asked from (street view). Used for this request only; never stored. */
export const askContext = z.object({
  source: z.literal("street-view"),
  lon: z.number().min(-180).max(180),
  lat: z.number().min(-90).max(90),
  heading: z.number().min(0).max(360).nullable().default(null),
  nearestStation: z.string().max(200).nullable().default(null),
  nearestEntrance: z.string().max(200).nullable().default(null),
  followedTrain: z.string().max(100).nullable().default(null),
});
export type AskContext = z.infer<typeof askContext>;

/** A BCP 47 language tag as browsers report it ("en-US", "zh-Hans-CN"). */
export const langTag = z.string().max(35).regex(/^[A-Za-z]{2,3}(-[A-Za-z0-9]{1,8}){0,3}$/);

/** Most chat messages one question may carry; the app sends only the latest ones. */
export const MAX_MESSAGES = 30;

export const requestBody = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) }))
    .min(1)
    .max(MAX_MESSAGES),
  /** Browser geolocation, only when the user granted it. */
  location: z.object({ lon: z.number(), lat: z.number() }).nullable().default(null),
  /** The mode chip (Walk / Transit / Drive); the model treats it as a preference. */
  mode: tripMode.default("transit"),
  /** Client clock, so "tomorrow 9am" resolves in the user's zone. */
  now: z.string().optional(),
  context: askContext.optional(),
  /** The browser's language (BCP 47, e.g. "es-US"); the reply follows the question's language, this is the tie-break. */
  lang: langTag.optional(),
  /**
   * One line about usual rides or Home and Work, sent only while that memory
   * is on. Never a history, and never coordinates.
   */
  memory: z.string().max(240).optional(),
  /** How sure speech-to-text was (0-1) about the last message, when it was spoken. Low confidence makes the agent read a place back. */
  heard: z.object({ confidence: z.number().min(0).max(1) }).optional(),
  /** Which model profile answers (#35): "smart" (hosted models, health-ordered) or "dev" (the small model). The server's default when absent. */
  profile: z.enum(["smart", "dev"]).optional(),
  /** Where the person is in the underground helper (riding, or at a station finding an exit). Never stored. */
  underground: z.object({
    stage: z.enum(["riding", "at-station", "lost"]),
    station: z.string().max(200),
    exit: z.string().max(200).nullable(),
    /** "lost": the where-am-I helper's best guess, said to the person, from what the app last knew (not a live position). */
    guess: z.string().max(600).optional(),
    /** "lost": how the network and the position fix look ("no network, last fix 6 min ago"). */
    signal: z.string().max(200).optional(),
    /** "lost": where in the station the helper's questions put them, and the way out it gave ("in a passage inside the turnstiles; then: Take the stairs up."). */
    place: z.string().max(800).optional(),
  }).optional(),
});
export type AgentRequest = z.infer<typeof requestBody>;
