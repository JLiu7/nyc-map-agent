/**
 * The app's HTTP API as one portable Hono app. Handlers in api/ are plain
 * Web-standard `GET(Request): Promise<Response>` functions, so this runs
 * unchanged on Node (server/node.ts, Docker), Cloudflare Workers, Bun or Deno,
 * and inside the Vite dev server (vite.config.ts). No host-specific code.
 */
import { OpenAPIHono } from "@hono/zod-openapi";
import type { Context } from "hono";
import { compress } from "hono/compress";
import { apiRateLimit } from "./lib/apiRateLimit";
import { AGENT_ROUTE, STT_ROUTE, TRANSLATE_ROUTE, TTS_ROUTE, API_INFO, ROUTES, legacyAlias, toV1, toV1Route } from "./openapi";
import * as aggregate from "../api/aggregate";
import * as area from "../api/area/[block]";
import * as areas from "../api/areas";
import * as blockTiles from "../api/block-tiles";
import * as blocks from "../api/blocks";
import * as cityTiles from "../api/city-tiles";
import * as restrooms from "../api/restrooms";
import * as sources from "../api/sources";
import * as street from "../api/street";
import * as vehicleModels from "../api/vehicle-models/[mode]";
import * as weather from "./features/weather/routes";
import * as hazards from "./features/hazards/routes";
import * as ferry from "./features/ferry/routes";
import * as traffic from "./features/traffic/routes";
import * as parking from "./features/parking/routes";
import * as agent from "./features/agent/routes";
import { transcribe } from "./features/agent/stt";
import { speak, startVoiceKeeper } from "./features/agent/tts";
import { translate } from "./features/agent/translate";
import * as transit from "./features/transit/routes";
import * as transitSegments from "./features/transit/segments";
import * as transitLive from "./features/transit/live";
import * as transitBusSegments from "./features/transit/busSegments";
import * as events from "./features/events/routes";
import * as placeToilets from "./features/place-toilets/routes";
import * as storefronts from "./features/storefronts/routes";

type Handler = { GET: (request: Request) => Promise<Response> };

const routes: Array<[string, Handler]> = [
  ["/api/aggregate", aggregate],
  ["/api/area/:block", area],
  ["/api/areas", areas],
  ["/api/block-tiles", blockTiles],
  ["/api/blocks", blocks],
  ["/api/city-tiles", cityTiles],
  ["/api/restrooms", restrooms],
  ["/api/sources", sources],
  ["/api/street", street],
  ["/api/vehicle-models/:mode", vehicleModels],
  ["/api/weather/hour", { GET: weather.GET_HOUR }],
  ["/api/weather", weather],
  ["/api/hazards", hazards],
  ["/api/ferry", ferry],
  ["/api/traffic/along", { GET: traffic.GET_ALONG }],
  ["/api/traffic", traffic],
  ["/api/parking/near", { GET: parking.GET_NEAR }],
  ["/api/parking/rules", { GET: parking.GET_RULES }],
  ["/api/parking", parking],
  ["/api/transit-segments/all", { GET: transitSegments.GET_ALL }],
  ["/api/transit-segments", transitSegments],
  ["/api/transit-live", transitLive],
  ["/api/transit-bus-segments", transitBusSegments],
  ["/api/agent/health", agent.health],
  ["/api/agent/warm", agent.warm],
  ["/api/transit", transit],
  ["/api/transit/:system", transit],
  ["/api/events", events],
  ["/api/place-toilets", placeToilets],
  ["/api/storefronts/logo", { GET: storefronts.GET_LOGO }],
  ["/api/storefronts/brands", storefronts],
];

export const app = new OpenAPIHono({
  // Same 400 shape as api/_lib/http.ts parseQuery.
  defaultHook: (result, c) => {
    if (!result.success) {
      return c.json(
        { error: "invalid_query", issues: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) },
        400,
        { "cache-control": "no-store" },
      );
    }
  },
});
// Refresh spam and scripts get a 429 before any handler runs (#369).
app.use("/api/*", apiRateLimit());
// Rollups and boundaries are 0.2-2 MB of JSON; gzip cuts them ~5x.
app.use("/api/*", async (c, next) => {
  // Tile ranges are already-compressed binary; gzip would break Content-Range.
  const p = c.req.path.replace(/^\/api\/v1\//, "/api/");
  if (p === "/api/city-tiles" || p === "/api/block-tiles" || p.startsWith("/api/vehicle-models/") || p === "/api/agent" || p === "/api/tts") return next(); // streams
  return compress()(c, next);
});
// Canonical paths are /api/v1/*; /api/* stays as an alias (marked deprecated in the spec).
for (const [path, handler] of routes) {
  const spec = (ROUTES as Record<string, (typeof ROUTES)[keyof typeof ROUTES]>)[path];
  for (const [p, s] of [[toV1(path), spec && toV1Route(spec)], [path, spec && legacyAlias(spec)]] as const) {
    if (s) {
      // Handlers build their own Response; the route only adds validation + docs.
      app.openapi(s, ((c: Context) => handler.GET(c.req.raw)) as never);
    } else {
      app.get(p, (c) => handler.GET(c.req.raw));
    }
  }
}

/** Every mounted path; scripts/openapi.ts fails if one has no spec in server/openapi.ts. */
export const MOUNTED_PATHS = routes.map(([path]) => path);

// Smart-mode agent (POST, NDJSON stream; body validated by zod in the handler). Skips gzip above.
// The handler validates the body itself (zod) so it can stream; the route adds docs.
// The route's body validator has already read c.req.raw, so the handler gets a
// fresh Request rebuilt from Hono's cached JSON (reading c.req.raw again 400s).
const agentHandler = async (c: Context) => {
  const body: unknown = await c.req.json().catch(() => null);
  return agent.POST(new Request(c.req.url, { method: "POST", headers: c.req.raw.headers, body: JSON.stringify(body), signal: c.req.raw.signal }));
};
app.openapi(toV1Route(AGENT_ROUTE), agentHandler as never);
app.openapi(legacyAlias(AGENT_ROUTE), agentHandler as never);

// Speech-to-text fallback (multipart; the handler reads the form itself).
const sttHandler = async (c: Context) => transcribe(await c.req.formData(), c.req.raw.headers);
app.openapi(toV1Route(STT_ROUTE), sttHandler as never);
app.openapi(legacyAlias(STT_ROUTE), sttHandler as never);
const ttsHandler = (c: Context) => speak(c.req.raw);
app.openapi(toV1Route(TTS_ROUTE), ttsHandler as never);
app.openapi(legacyAlias(TTS_ROUTE), ttsHandler as never);
// A notice's steps in the rider's language (#55). As for the agent, the validator has read the body already.
const translateHandler = async (c: Context) => {
  const body: unknown = await c.req.json().catch(() => null);
  return translate(new Request(c.req.url, { method: "POST", headers: c.req.raw.headers, body: JSON.stringify(body), signal: c.req.raw.signal }));
};
app.openapi(toV1Route(TRANSLATE_ROUTE), translateHandler as never);
app.openapi(legacyAlias(TRANSLATE_ROUTE), translateHandler as never);
// Keep the speech server on our stack so the first spoken answer is not the one that waits for a model swap.
startVoiceKeeper();

const docConfig = { openapi: "3.1.0", info: API_INFO };
app.doc31("/api/v1/openapi.json", docConfig);
app.doc31("/api/openapi.json", docConfig);
app.all("/api/*", (c) => c.json({ error: "not_found" }, 404));

export default app;
export type AppType = typeof app;
