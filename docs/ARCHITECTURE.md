# Architecture: a modular monolith

One repo, one Vite SPA, one Hono API, one Octo database. Features land in parallel, so each
feature is a **module** with a fixed shape, and modules talk only through the **shared core**.
No microservices, no Vercel; the API is host-agnostic (`pnpm start` / Dockerfile).

## Module map

```
src/
  core (shared, importable by every feature)
    lib/store/         MapStateContext, DataViewContext, PanelContext (usePanel, usePanelChip, usePanelSearch)
    lib/map/           style.ts, basemap.ts, walk.ts, city3d.ts, threeLayer (the ONE three.js custom layer)
    lib/api/           socrata.ts, geosearch.ts, shared fetch hooks (TanStack Query)
    lib/flags/         typed feature-flag registry (env + ?flags= URL override, tier basic|advanced)
    lib/datasets/      Socrata dataset registry
    components/ui/     shadcn primitives
  features/<name>/     one module per feature (see "Module convention")
server/
  app.ts               mounts core routes + each server/features/<name>/routes.ts
  features/<name>/     Hono routes for that feature
api/                   legacy Web-standard handlers (being moved under server/features/)
ingest/<name>/         SQL (dbmate migrations stay in db/migrations; feature SQL/marts here)
scripts/               build/ingest/publish CLIs, feed-health.ts
```

Rule: `src/features/A` may import `src/lib/**`, `src/components/ui/**` and itself, **never**
`src/features/B`. Core never imports features except through the registry `src/features/index.ts`.
Enforced by dependency-cruiser in CI (`.dependency-cruiser.cjs`).

## Module convention

`src/features/<name>/index.ts` default-exports a `FeatureModule`:

| field | meaning |
| --- | --- |
| `id` | stable id, also the flag name |
| `layers` | lazy `() => import("./layers")` that installs MapLibre layers |
| `panel` | panel registration (content pushed via `usePanel().showPanel`) |
| `chips` | chips registered with `usePanelChip` |
| `search` | providers registered with `usePanelSearch` |
| `flags` | `{ tier: "basic" \| "advanced", default }` |

Heavy code is reached only through dynamic `import()` so each feature is its own chunk
(size-limit budgets each one). See `docs/MODULES.md` for the migration guide.

## Rendering rules (approved)

- One MapLibre canvas. **deck.gl stays banned.**
- **three.js is approved for 3D models only, via one shared MapLibre custom layer** in the
  same canvas and depth buffer (`src/lib/map/threeLayer.ts`; today `streetSigns.ts` is its
  first user). No feature imports `three` directly; dependency-cruiser rule `three-only-in-3d-layer`.
- `mapillary-js` in `StreetViewSheet` is the one sanctioned photo viewer.

## Progressive disclosure (simple by default)

- The app is **simple by default**. A persisted `advancedMode` setting (localStorage, default
  off, one switch in the settings drawer) unlocks flags with `tier: "advanced"`.
- Basic tier: search, directions, live transit, places/POI, restrooms, street signs, street level,
  noise layer. Advanced tier: classic Crashes, Noise + crashes, registry data/analytics layers,
  averages, feed health. Advanced items join the existing dropdowns; layout does not change.
- Detail panels show the essentials first (name, headline number, next arrivals). Secondary
  info — service alerts, elevator outages, history/timelines, data caveats — sits in
  collapsible drawers (shadcn `Collapsible`/`Accordion`) inside the one panel. No tooltips.

## Features, data sources and feeds

| feature | status | data / upstream | our endpoint | caching | env (names only) | license / attribution |
| --- | --- | --- | --- | --- | --- | --- |
| Basemap | live | OpenFreeMap Liberty vector style (OSM) | direct | browser/CDN | `VITE_BASEMAP_STYLE` | © OpenMapTiles © OSM contributors (ODbL) |
| Fulton St station model | live | Rooms and stairs traced from Project Subway NYC's 3D model (projectsubwaynyc.com) | bundled station data | n/a | none | Used with the author's permission; credit Project Subway NYC and projectsubwaynyc.com wherever it shows (map credits) |
| Fallback raster | live | tile.openstreetmap.org | direct | OSM tile policy | `VITE_TILE_URL` | © OSM contributors (ODbL) |
| Neighborhoods / blocks / areas | live | NYC Open Data NTA `9nt8-h7nd`, CDs → Octo `core.area_shapes` | `/api/areas`, `/api/area/:block` | s-maxage 7d, browser 1d | `VITE_DATA_BACKEND` | NYC Open Data Terms of Use |
| Noise (311) | live | Socrata `erm2-nwe9` → Octo raw/core/marts | `/api/aggregate`, `/api/blocks` | nightly ingest; s-maxage 1h | `SOCRATA_APP_TOKEN`, `SOCRATA_KEY_ID`, `SOCRATA_KEY_SECRET`, `VITE_SOCRATA_APP_TOKEN` | NYC Open Data |
| Crashes | live | Socrata `h9gi-nx95` | same | same | same | NYC Open Data |
| Data registry layers | live | `src/lib/datasets/registry.ts` sources | `/api/sources`, `/api/blocks` | s-maxage 15m default | `OCTO_*` | NYC Open Data |
| Street stats | live | `marts.street_stats` | `/api/street` | s-maxage 15m | `OCTO_*` | NYC Open Data |
| Restrooms | live | Socrata `i7jb-7jku` → `core.restrooms`, merged with OpenStreetMap `amenity=toilets` via Overpass → `core.osm_toilets` (nightly replace; access private/no/customers dropped; within ~40 m of a city restroom = same place, city fields win) | `/api/restrooms` | s-maxage 1h | `OCTO_*` | NYC Open Data; © OpenStreetMap contributors, ODbL 1.0 |
| Shops & cafés with toilets | live | OpenStreetMap via Overpass (`toilets=yes` on restaurant/cafe/fast_food/bar/pub and `shop=*`) → `core.place_toilets` (nightly replace) | `/api/place-toilets` | s-maxage 1h | — | © OpenStreetMap contributors, ODbL 1.0 |
| Events | live | Socrata `tvpp-9vvx` (permitted events) + `w3wp-dpdi` (NYC Parks events), placed on CSCL `inkn-q76z` / GeoSearch → `core.street_events` (nightly upsert) | `/api/events` | s-maxage 15m | `OCTO_*`, `SOCRATA_*` | NYC Open Data Terms of Use |
| Directions | live | OSRM (routing.openstreetmap.de, FOSSGIS) | direct | TanStack staleTime ∞ | `VITE_OSRM_URL` | © OSM contributors; FOSSGIS usage policy |
| Address search | live | NYC Planning GeoSearch (Pelias) | direct | staleTime 5m | — | NYC DCP, open data |
| Street level photos | live | Mapillary Graph API | direct | — | `VITE_MAPILLARY_TOKEN` (client token) | Mapillary, CC BY-SA 4.0 |
| Textured 3D city | live | Octo files / R2 PMTiles | `/api/city-tiles` (Range) | immutable parts | `VITE_CITY_TILES_URL`, `OCTO_*` | building data NYC Open Data; textures in repo |
| Street signs | live | DCP LION → `signs` layer in city PMTiles; Grab3D GLB | `/api/city-tiles` | as tiles | `LION_URL` | LION: NYC DCP; model CC0 (public/models/LICENSE.md) |
| Chat / voice | live | InferHub DeepSeek (server only); Web Speech API | server handler | none | `INFERHUB_API_KEY`, `INFERHUB_MODEL`, `INFERHUB_MODEL_FALLBACKS`, `VITE_AGENT_MODE` | — |
| Live transit (#56) | in flight | MTA GTFS-rt (subway, LIRR, MNR), MTA Bus Time SIRI, MTA service alerts, MTA elevator/escalator status | via proxy `/api/transit/*` | 15–30 s edge cache; static GTFS nightly | `MTA_BUS_TIME_KEY` (GTFS-rt is keyless) | MTA Data Feed terms; attribute "Data: MTA" |
| POI / schools / sights / storefronts / historic (#55, #67) | in flight | OSM (Overpass/extract), NYC Open Data (DOE schools, LPC landmarks), Wikidata, Wikipedia | `/api/places/*` | nightly ingest into Octo | — | OSM ODbL; Wikidata CC0; Wikipedia CC BY-SA 4.0 (attribute + link) |
| Real blocks (#50, #59) | in flight | DCP tax blocks / MapPLUTO | Octo | nightly | `OCTO_*` | NYC DCP |
| Camera height (#47), mobile panel (#66) | in flight | — | — | — | — | — |

Octo itself: `OCTO_BASE_URL`, `OCTO_API_KEY`, `OCTO_WORKSPACE_ID` (server and GitHub Actions only).
Dev/ops: `VITE_API_BASE`, `PORT`, `OCTO_ENV_FILE`, `INGEST_MONTHS`, `LIVE_SOCRATA`, `CITY`,
`CITY_TILES_FILE`, `PART_MB`, `AREA_SIMPLIFY`, `SOCRATA_BASE`, `SABLIER_URL` (VPS only: wakes the
sleeping trip planner and walking routes, see "Sleeping when idle" in `deploy/README.md`).

Every upstream a browser does not hit directly should go through our Hono proxy so it can be
cached and health-checked (`pnpm feeds:health`, scheduled workflow `feed-health.yml`).

## CI guardrails

- `pnpm lint:boundaries` (dependency-cruiser): no feature→feature imports; `three` only in the 3D layer.
- `pnpm size` (size-limit): per-chunk budgets; fails on regression.
- `pnpm feeds:health`: pings each upstream via our proxy.

## Target: agent-first (2026-10-23, not built)

The product is now an accessible chat and voice agent over the map (`PROJECT.md`). The module shape above stays; these are the changes the target asks for. Each line says whether it exists.

| area | target | state |
| --- | --- | --- |
| Entry | Map with a chat prompt at the bottom and a Siri-style voice mode. Dashboards behind advanced mode (the basic/advanced tier split already exists). | not built; today a top search bar with an "Ask" button |
| Answers | Every agent answer returns **map actions** the UI renders as buttons (show skipped stops, substitute route, nearest restroom, exits). | not built; the agent today moves or highlights the map |
| Context | The agent or app sets a context (on a train, underground, walking, driving) and the map shows only what matters, landmarks always. | manual switches only (Transit Focus, Lines) |
| Top view | Flat 2D only; no three.js layer, no 3D buildings. | Top still tries to render 3D |
| Trains | A colored box with the route tag, plus a side panel (next stops, times, MTA notices). No 3D train model. | model in the three.js layer |
| Live data | Server polls MTA feeds about every minute (it caches 15 s now). Clients read one batched endpoint every 30 to 60 s. | each browser polls every 15 s and calls one endpoint per subway line |
| 3D performance | Keep MapLibre plus the one three.js layer. Draw 3D near the camera only, simple shapes far away, instancing, baked shadows. No game engine. | partly (PMTiles city tiles, size budgets) |
| Trip simulator | Scheduled time, expected conditions, restart when the user picks an alternative route. | speeds exist; the rest does not |
| Languages | Chat and voice in many languages. | not checked |

### Agent reliability (target, partly built)

| area | target | state |
| --- | --- | --- |
| Model availability | Primary `cb/deepseek-v4.1-flash` via InferHub, with a fallback chain so an LLM is always available when one or two are down. | chain via `INFERHUB_MODEL_FALLBACKS` and busy-retry (#343) exist in `server/features/agent/model-fallback.ts`; a provider-independent fallback is not confirmed |
| Abuse protection | Per-client rate limits and caps on `/api/agent`. | not found on main |
| Waiting | A clear loading animation, and a spoken status ("checking the trains") for slow model or voice replies. | text skeleton only |
| Instructions | A system prompt that knows the available datasets and their limits, asks follow-up questions, and picks the right map action. | tool guidance in `context/CHAT_TOOLS.md` only |
