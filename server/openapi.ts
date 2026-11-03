/**
 * OpenAPI route table for the API. Each route reuses the handler's own zod
 * Query schema, so the spec (openapi.json, `pnpm openapi`) cannot drift from
 * validation. CI fails if openapi.json is stale and runs oasdiff against main.
 */
import { createRoute, z } from "@hono/zod-openapi";
import pkg from "../package.json";
import { Query as AggregateQuery } from "../api/aggregate";
import { Query as AreasQuery } from "../api/areas";
import { Query as BlocksQuery } from "../api/blocks";
import { Query as StreetQuery } from "../api/street";
import { Query as HazardsQuery } from "./features/hazards/routes";
import { NearQuery as ParkingNearQuery } from "./features/parking/routes";
import { BrandsBox as StorefrontBrandsQuery, LogoQuery as StorefrontLogoQuery } from "./features/storefronts/routes";
import { AlongQuery as TrafficAlongQuery } from "./features/traffic/routes";
import { HourQuery as WeatherHourQuery, Query as WeatherQuery } from "./features/weather/routes";
import { AllQuery as AllSegmentsQuery, AllResponse as AllSegmentsResponse, Query as SegmentsQuery, Response_ as SegmentsResponse } from "./features/transit/segments";
import { Query as LiveQuery } from "./features/transit/live";
import { Query as BusSegmentsQuery, Response_ as BusSegmentsResponse } from "./features/transit/busSegments";
import { EventsResponse, Query as EventsQuery } from "./features/events/schema";
import { PlaceToiletsResponse } from "./features/place-toilets/schema";
import { RestroomsResponse } from "./features/restrooms/schema";

const Json = z.record(z.string(), z.unknown()).openapi("Json");
const ApiError = z.object({ error: z.string(), issues: z.array(z.string()).optional() }).openapi("ApiError");

const errors = {
  400: { description: "Invalid query", content: { "application/json": { schema: ApiError } } },
  502: { description: "Upstream (Octo / R2) error", content: { "application/json": { schema: ApiError } } },
};

const jsonRoute = (path: string, summary: string, query?: z.ZodObject, params?: z.ZodObject) =>
  createRoute({
    method: "get",
    path,
    summary,
    request: { ...(query ? { query } : {}), ...(params ? { params } : {}) },
    responses: { 200: { description: "OK", content: { "application/json": { schema: Json } } }, ...errors },
  });

const binary = z.string().openapi({ format: "binary" });

/** octet-stream stays listed beside the real type so older clients keep matching. */
const binaryRoute = (path: string, summary: string, contentType: string) => {
  const content = { "application/octet-stream": { schema: binary }, [contentType]: { schema: binary } };
  return createRoute({
    method: "get",
    path,
    summary,
    responses: {
      200: { description: "Whole file", content },
      206: { description: "Byte range (Range header)", content },
      ...errors,
    },
  });
};

/**
 * POST /api/stt: speech-to-text for browsers without a working recognizer.
 * multipart/form-data with `audio` (one short recording, at most 2 MB) and an
 * optional `lang` (BCP 47). The body is read by the handler, not validated here.
 */
export const STT_ROUTE = createRoute({
  method: "post",
  path: "/api/stt",
  summary: "Transcribe one short voice turn (Whisper); the audio is not stored",
  responses: {
    200: { description: "The words heard", content: { "application/json": { schema: z.object({ text: z.string() }).openapi("SttResult") } } },
    400: { description: "No recording", content: { "application/json": { schema: ApiError } } },
    413: { description: "Recording too long", content: { "application/json": { schema: ApiError } } },
    429: { description: "Too many requests", content: { "application/json": { schema: ApiError } } },
    502: { description: "Transcription failed", content: { "application/json": { schema: ApiError } } },
    503: { description: "Speech-to-text is not set up on this server", content: { "application/json": { schema: ApiError } } },
  },
});

export const TTS_ROUTE = createRoute({
  method: "post",
  path: "/api/tts",
  summary: "Read a short answer aloud with Kokoro (16-bit mono PCM); the text is not stored",
  responses: {
    200: { description: "Streamed speech; the sample rate is in X-Sample-Rate", content: { "audio/L16": { schema: z.string().openapi({ format: "binary" }) } } },
    400: { description: "No text, or too long", content: { "application/json": { schema: ApiError } } },
    415: { description: "No Kokoro voice for this language; the browser speaks it", content: { "application/json": { schema: ApiError } } },
    429: { description: "Too many requests", content: { "application/json": { schema: ApiError } } },
    502: { description: "The voice server failed", content: { "application/json": { schema: ApiError } } },
    503: { description: "No voice server is set up", content: { "application/json": { schema: ApiError } } },
  },
});

/** POST /api/agent: the smart-mode trip agent. Body mirrors src/features/agent/schema.ts `requestBody`. */
export const AGENT_ROUTE = createRoute({
  method: "post",
  path: "/api/agent",
  summary: "Smart-mode trip agent (NDJSON stream of text, tool and map-command events)",
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: z
            .object({
              messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })).min(1).max(30),
              location: z.object({ lon: z.number(), lat: z.number() }).nullable().optional(),
              mode: z.enum(["walk", "transit", "drive"]).optional(),
              now: z.string().optional(),
              context: z
                .object({
                  source: z.literal("street-view"),
                  lon: z.number(),
                  lat: z.number(),
                  heading: z.number().nullable().optional(),
                  nearestStation: z.string().nullable().optional(),
                  nearestEntrance: z.string().nullable().optional(),
                  followedTrain: z.string().nullable().optional(),
                })
                .optional(),
              lang: z.string().max(35).optional(),
              memory: z.string().max(240).optional(),
            })
            .openapi("AgentRequest"),
        },
      },
    },
  },
  responses: {
    200: { description: "One JSON StreamEvent per line", content: { "application/x-ndjson": { schema: z.string() } } },
    400: { description: "Invalid body", content: { "application/json": { schema: ApiError } } },
    429: {
      description: "Fair-use limit for this client; Retry-After says when the next question frees up",
      headers: { "Retry-After": { description: "Seconds until the next question is allowed", schema: { type: "integer" } } },
      content: {
        "application/json": {
          schema: z
            .object({ error: z.literal("rate_limited"), message: z.string(), retryAfterSeconds: z.number().int(), retryAt: z.string() })
            .openapi("AgentRateLimited"),
        },
      },
    },
  },
});

/** Hono path (":block") -> route. Order matches server/app.ts. */
export const ROUTES = {
  "/api/aggregate": jsonRoute("/api/aggregate", "Precomputed noise / crash rollup", AggregateQuery),
  "/api/area/:block": jsonRoute(
    "/api/area/{block}",
    "Every source for one block",
    undefined,
    z.object({ block: z.string().openapi({ param: { name: "block", in: "path" }, example: "120:340" }) }),
  ),
  "/api/areas": jsonRoute("/api/areas", "Simplified boundary GeoJSON", AreasQuery),
  "/api/block-tiles": binaryRoute("/api/block-tiles", "Real NYC tax-block PMTiles", "application/vnd.pmtiles"),
  "/api/blocks": jsonRoute("/api/blocks", "One row per area for a source", BlocksQuery),
  "/api/city-tiles": binaryRoute("/api/city-tiles", "Citywide 3D-city PMTiles", "application/vnd.pmtiles"),
  "/api/vehicle-models/:mode": binaryRoute("/api/vehicle-models/{mode}", "Live-vehicle glTF model (subway, bus, rail)", "model/gltf-binary"),
  "/api/restrooms": createRoute({
    method: "get",
    path: "/api/restrooms",
    summary: "Public restrooms GeoJSON: NYC Open Data merged with OpenStreetMap public toilets (ODbL); places within ~40 m are one record, each with its source and asOf",
    responses: { 200: { description: "OK", content: { "application/json": { schema: RestroomsResponse } } }, ...errors },
  }),
  "/api/sources": jsonRoute("/api/sources", "Source registry metadata and freshness"),
  "/api/street": jsonRoute("/api/street", "Street noise / crash stats", StreetQuery),
  "/api/weather/hour": jsonRoute("/api/weather/hour", "One forecast hour (Open-Meteo) and active NWS alerts near a point, rounded to about 1 km", WeatherHourQuery),
  "/api/weather": jsonRoute("/api/weather", "Current weather near a point (Open-Meteo, NWS fallback)", WeatherQuery),
  "/api/hazards": jsonRoute("/api/hazards", "Active NWS alerts for NYC and flooded FloodNet sensors", HazardsQuery),
  "/api/ferry": jsonRoute("/api/ferry", "NYC Ferry and Staten Island Ferry routes, piers, and live or estimated vessels"),
  "/api/traffic/along": jsonRoute("/api/traffic/along", "NYC DOT traffic speeds along a line", TrafficAlongQuery),
  "/api/traffic": jsonRoute("/api/traffic", "NYC DOT real-time speed links and today's closures GeoJSON"),
  "/api/parking/near": jsonRoute("/api/parking/near", "Licensed garages and lots near a point", ParkingNearQuery),
  "/api/parking/rules": jsonRoute("/api/parking/rules", "Street parking sign and meter rules near a point", ParkingNearQuery),
  "/api/storefronts/brands": jsonRoute("/api/storefronts/brands", "OSM shops and amenities with brand:wikidata in a small bbox (ODbL)", StorefrontBrandsQuery),
  "/api/storefronts/logo": jsonRoute("/api/storefronts/logo", "A brand's freely licensed Wikidata P154 logo, re-hosted via Octo files (R2)", StorefrontLogoQuery),
  "/api/parking": jsonRoute("/api/parking", "Licensed garages and lots GeoJSON (DCWP + OSM)"),
  "/api/transit-segments/all": createRoute({
    method: "get",
    path: "/api/transit-segments/all",
    summary: "Historical subway segment travel and dwell times for many routes at once, keyed by route; cached for hours when dow and hour are given",
    request: { query: AllSegmentsQuery },
    responses: { 200: { description: "OK", content: { "application/json": { schema: AllSegmentsResponse } } }, ...errors },
  }),
  "/api/transit-segments": createRoute({
    method: "get",
    path: "/api/transit-segments",
    summary: "Historical subway segment travel and dwell times (median, p80) for a route at an hour of the week",
    request: { query: SegmentsQuery },
    responses: { 200: { description: "OK", content: { "application/json": { schema: SegmentsResponse } } }, ...errors },
  }),
  "/api/transit-bus-segments": createRoute({
    method: "get",
    path: "/api/transit-bus-segments",
    summary: "Learned bus stop-to-stop travel and stop dwell times (median seconds) for a route at an hour of the week",
    request: { query: BusSegmentsQuery },
    responses: { 200: { description: "OK", content: { "application/json": { schema: BusSegmentsResponse } } }, ...errors },
  }),
  "/api/transit-live": createRoute({
    method: "get",
    path: "/api/transit-live",
    summary: "Live subway / LIRR / Metro-North trips and (alerts=1) service alerts in one response; ETag + If-None-Match (304), Cache-Control public, s-maxage=30, stale-while-revalidate=30",
    request: { query: LiveQuery },
    responses: {
      200: { description: "OK ({ at, systems: { subway?, lirr?, mnr? }, alerts?, failed? })", content: { "application/json": { schema: Json } } },
      304: { description: "Not modified (If-None-Match matched the ETag)" },
      ...errors,
    },
  }),
  "/api/agent/health": jsonRoute("/api/agent/health", "The default model profile and each smart provider's last health probe (no keys)"),
  "/api/agent/warm": jsonRoute("/api/agent/warm", "Wakes the trip planner and walking routes if they sleep, at most once a minute; the page sends it once on load"),
  "/api/transit": jsonRoute("/api/transit", "Live transit capabilities ({ bus })"),
  "/api/transit/:system": jsonRoute(
    "/api/transit/{system}",
    "Live MTA GTFS-rt (subway / lirr / mnr trips, bus positions, alerts + elevator outages), cached ~15 s; bus?routes=Q1,Q2 filters the cached fleet to at most 20 routes; bus-lines is the borough page catalog; bus-trip?vehicle= (one bus's headsign + upcoming stops), bus-route?route= (route shape + stops) and bus-stops?lat=&lon= (stops within ~300 m with the routes serving each) and bus-arrivals?stop= (next buses at one stop)",
    z.object({ vehicle: z.string().max(40).optional(), route: z.string().max(8).optional(), routes: z.string().max(240).optional(), stop: z.string().max(20).optional(), lat: z.string().max(12).optional(), lon: z.string().max(12).optional() }),
    z.object({ system: z.enum(["subway", "lirr", "mnr", "bus", "bus-lines", "alerts", "bus-trip", "bus-route", "bus-stops", "bus-arrivals"]).openapi({ param: { name: "system", in: "path" }, example: "subway" }) }),
  ),
  "/api/events": createRoute({
    method: "get",
    path: "/api/events",
    summary: "NYC pop-up events, street fairs, markets, outdoor shows, Parks events and event closures (GeoJSON), refreshed nightly",
    request: { query: EventsQuery },
    responses: { 200: { description: "OK", content: { "application/json": { schema: EventsResponse } } }, ...errors },
  }),
  "/api/place-toilets": createRoute({
    method: "get",
    path: "/api/place-toilets",
    summary: "Restaurants, cafés, bars and shops with a toilet, labelled anyone / customers only (OpenStreetMap, ODbL; GeoJSON, refreshed nightly)",
    responses: { 200: { description: "OK", content: { "application/json": { schema: PlaceToiletsResponse } } }, ...errors },
  }),
} as const;

/**
 * OpenAPI info. `version` is the package version (release-please bumps it), so
 * the spec says which release it describes; CI (oasdiff) requires a major bump
 * for any breaking change.
 */
export const API_INFO = { title: "NYC Map Agent API", version: pkg.version };

/** "/api/x" -> "/api/v1/x" (the canonical, versioned path). */
export const toV1 = (path: string): string => path.replace(/^\/api\//, "/api/v1/");

type AnyRoute = ReturnType<typeof createRoute>;

/** The same route at its /api/v1 path. */
export function toV1Route<R extends AnyRoute>(route: R): R {
  return { ...route, path: toV1(route.path) };
}

/** The unversioned /api/* alias: identical behaviour, flagged deprecated in the spec. */
export function legacyAlias<R extends AnyRoute>(route: R): R {
  return { ...route, deprecated: true, summary: `${route.summary ?? ""} (alias of ${toV1(route.path)})`.trim() };
}
