# AI_RULES.md

Project guidance for the NYC Map Agent. Read this before writing code. Product scope lives in `context/` (`BRIEF.md`, `FEATURES.md`, `DATA_APIS.md`, `AI_VOICE.md`, `CHAT_TOOLS.md`).

## Tech stack

- **React 18 + TypeScript** single-page app, built with Vite. Strict types, no `any` in app code.
- **React Router** for routing. All routes live in `src/App.tsx`; pages live in `src/pages/`.
- **Tailwind CSS** for all styling. No CSS-in-JS, no styled-components, no hand-written `.css` files beyond `src/index.css`.
- **shadcn/ui** (Radix primitives) for every standard control: buttons, dialogs, sheets, tabs, tooltips, selects, sliders, toasts.
- **MapLibre draws the data layers itself.** Neighborhoods and ~300 m block squares are `fill-extrusion` layers on GeoJSON sources defined in `src/lib/map/style.ts`; only `height` arrives as a feature property, the hue is a single constant, and updates are `source.setData()` / `setPaintProperty()` calls. The legibility comes from line layers on the same sources — `block-outline`, `neighborhood-outline` — plus a heavier `borough-outline` on its own source. There is **no second renderer** — no deck.gl, no `<DeckGL>` wrapper, no overlay control. One canvas, one render pass, correct depth sorting against the basemap.
- **Street level is a camera, not an engine.** `MapStateContext.walking` + `startWalk()` ease to `WALK_PITCH` (75°) at `WALK_ZOOM` (18.5, scroll-zoom clamped to 16.5–19 so the vector tiles stay sharp; 85° at z21 was a blur), then a `requestAnimationFrame` loop drives the camera through `stepPose()` in `src/lib/map/walk.ts`, which moves the centre in **ground metres** along the current bearing — so walking speed is the same at any zoom. W/S move, A/D look, Shift runs, Esc or the dock's **Street** button leaves, and `WalkControls` supplies a d-pad for touch. Moving pins **both pitch and zoom**, and the map's built-in `keyboard` panning and its zoom handlers are off while walking, so a keypress cannot move the camera twice and a scroll cannot lift it back over the rooftops. Leaving restores pitch 0 and drops zoom to at most `WALK_EXIT_ZOOM` (15.5) — a flat map at 21 shows 50 m of ground. `describeAt`, the block grid and the picked block are read through refs inside the walk effects: their identity changes when the data does, and re-running an effect would fly the camera back to where the walk began or drop the held keys. No game engine, no pointer-lock library, no second renderer.
- **Street level is also a photo, and that is the one sanctioned second renderer.** `StreetViewSheet` mounts a `mapillary-js` `Viewer` for the picked block. A panorama is a photograph, so the `fill-extrusion` columns cannot be composited onto it — instead the sheet lives in its own panel and repeats the block's own numbers over the image, so a photo of the next street is never read as this square's evidence. The nearest photo comes from the Mapillary Graph API in `src/lib/api/mapillary.ts` (MapillaryJS v4 removed `moveCloseTo`, so the bbox search is ours). `VITE_MAPILLARY_TOKEN` is a *client* token that ships in the bundle by design — it is not a server secret like `INFERHUB_API_KEY`.
- **Eye level is pitch *and* zoom.** MapLibre has no altitude control: camera height is roughly `1.5 × viewport height × metres-per-pixel × cos(pitch)`, so 78° at zoom 17 is still ~110 m up. 85° at 21 is ~7 m. And because a block column is 60–1800 m tall, walking inside one would fill the screen with that block's colour — so while walking the block prisms flatten to a painted pavement (`fill-extrusion-height` 0.5, opacity 0.3) and the picked block's rim drops to a 1.5 m curb. Fog is measured from the camera, so `applyAtmosphere(map, street)` switches to a far-distant range at street level; the city-scale `[1.2, 9]` would be an opaque wall a few metres ahead.
- **A picked block gets a raised white rim.** `blockSelectionToGeoJson()` builds a thin band *around* the block square, lifted above its column: a filled shell would be coplanar with the block's own faces and flicker, and a flat outline would vanish under the column as soon as the map tilts. The rim is hidden outside the Blocks scale.
- The camera is **north-up and flat on load** (`pitch: 0`), and the user can tilt to 62° with the "3D" button or by right-dragging. `maxPitch` is 85 — never a globe. Tilting from the citywide view also drops the zoom to at least 13.4, because that is where the extruded buildings start; without them a tilt is just a floating plate. Tilt state lives in `MapStateContext.tilted`, so the button and the camera cannot disagree. The tilt button is hidden while walking: street level is already at the pitch ceiling, so it could only undo the walk.
- **The basemap is a keyless vector style with real 3D buildings** (`BASEMAP_STYLE_URL` in `src/lib/map/basemap.ts`, OpenFreeMap Liberty by default, overridable with `VITE_BASEMAP_STYLE`). `installDataLayers()` injects the data sources/layers above it, adds an extruded-buildings layer if the style lacks one, and lifts the basemap's label layers back on top so street names survive the overlay. `buildFallbackStyle()` in `src/lib/map/style.ts` is a raster OSM style with the data layers baked in, applied once if the vector style fails — the map must never be blank.
- **MapLibre GL + react-map-gl** (`react-map-gl/maplibre`) provides the map canvas and camera control. Attribution for the vector basemap stays on the map.
- **TanStack Query** owns all server state: Socrata fetches, cell/neighborhood aggregates, caching, retries.
- **Recharts** (via the shadcn `chart` component) for the hour-of-day and breakdown charts.
- **lucide-react** for all icons. No icon fonts, no inline SVG one-offs.
- **InferHub DeepSeek** (`POST /v1/chat/completions`, tool calling) is the chat/voice brain, called only from a server-side handler.
- **Web Speech API** (`SpeechRecognition` / `speechSynthesis`) powers push-to-talk and spoken answers.

## Library rules — use this for that

| Need | Use | Never use |
| --- | --- | --- |
| Any UI control | shadcn/ui from `src/components/ui/` | Raw unstyled `<div>` buttons, MUI, Chakra, Ant |
| Layout, spacing, color, responsive | Tailwind utility classes | inline `style` (except map/hover-position props), CSS modules |
| Icons | `lucide-react` | Font Awesome, emoji as icons |
| Neighborhood / block volumes | MapLibre `fill-extrusion` layers declared in `src/lib/map/style.ts`, one GeoJSON feature per polygon part | Three.js from scratch, CSS 3D transforms, deck.gl, a second canvas |
| Area fill | one translucent slate "glass" hue (`GLASS` in `src/lib/map/style.ts`), no per-feature colour | categorical colour ramps, red/yellow/blue buckets, continuous gradients |
| Column height | `heightFor()` in `src/lib/layers.ts`, a sqrt scale — the map's **only** encoding | a second metric, a hand-rolled scale in a component |
| Boundaries | MapLibre `line` layers: `block-outline`, `neighborhood-outline`, `borough-outline`; borough lines derived in `src/lib/geo/boroughs.ts` | a separate borough dataset, turf polygon unions |
| Basemap, camera, fly-to | MapLibre + react-map-gl; camera moves go through `MapStateContext.cameraTarget` / `navCommand` → `map.flyTo`/`jumpTo`/`zoomIn` | Google Maps, a hand-rolled canvas renderer |
| Tilt | `MapStateContext.tilted` → `map.easeTo({ pitch, zoom })`, 0° or 62°, `maxPitch` 85 | pitch set from a component, globe projection |
| First-person walking | `stepPose()` in `src/lib/map/walk.ts` + `MapStateContext.walking` + `WalkControls` | a game engine, pointer-lock, a second renderer |
| Basemap | `BASEMAP_STYLE_URL` (keyless vector style with 3D buildings) + `installDataLayers()` | a hand-built basemap from scratch, a second style file per feature |
| Street-level photos | `mapillary-js` `Viewer` in `StreetViewSheet`, nearest-image lookup in `src/lib/api/mapillary.ts` | Google Street View, a hand-rolled panorama renderer |
| Persistent on-screen UI | the right-hand control rail (`MapHud`), the one map panel (`MapPanel`: left panel on desktop, vaul bottom sheet on mobile) with search + chips, plus the `ControlDrawer` sheet | a floating card per feature, toolbars that cover the map |
| Off-main-thread work (paging, spatial join, rollups) | a module Web Worker in `src/lib/geo/` | blocking the main thread, a second dev server |
| Fetching Socrata / any HTTP | `fetch` inside TanStack Query hooks in `src/lib/api/` | `axios`, raw `useEffect` + `fetch`, SWR |
| Charts and histograms | Recharts via shadcn `chart` | Chart.js, D3, Highcharts |
| Dates and time windows | `date-fns` | `moment`, manual `Date` math for ranges |
| Number/percent/locale formatting | `Intl.NumberFormat` | custom formatters, `numeral` |
| Runtime validation at boundaries (API rows, tool args) | `zod` | hand-written `if` chains over `unknown` |
| URL query state (layer, filters) | `useSearchParams` from React Router | a separate state library for URL state |
| Client UI state | `useState` / `useReducer` + one React context | Redux, Zustand, MobX, Jotai |
| Notifications | shadcn `sonner` / `toast` | `alert()` |
| Loading placeholders | shadcn `skeleton` | spinners built from scratch |
| Unique ids | `crypto.randomUUID()` | `Math.random()` id strings |
| Tests for geo math and rollups | `vitest` (`npm test`) | Jest, a browser-only manual checklist |

If a task seems to need a library not on this list, prefer the closest listed option. Adding a dependency requires a clear reason and a note in this file.

Dependency notes:
- `ai` 7.0.143 and `@ai-sdk/openai-compatible` 3.0.71 (Apache-2.0, Vercel AI SDK) are used **only as libraries** in `server/features/agent/routes.ts` for tool calling and streaming against InferHub; no Vercel hosting. `zod` moved to 3.25.76 (their peer range).
- `@radix-ui/react-accordion` 1.2.1, `@radix-ui/react-collapsible` 1.1.1, `@radix-ui/react-dropdown-menu` 2.1.2, `@radix-ui/react-switch` 1.1.1, `@radix-ui/react-checkbox` 1.1.2 (all MIT) are the Radix primitives behind the stock shadcn `accordion`, `collapsible`, `dropdown-menu`, `switch` and `checkbox` components. They are used by the data-sources drawer, the view-mode dropdown and the collapsible details sections.
- `maplibre-gl` 6.15.0 (BSD-3-Clause) and `react-map-gl` 8.1.3 (MIT): MapLibre 6 (from 5.24, for GHSA-jrc7-96c5-q579) is ESM-only and ships its tile worker as a separate file, so `src/lib/map/maplibreWorker.ts` emits it as an asset and calls `setWorkerUrl` before any map is made; the camera transform moved to `map._camera.transform`, read only through `cameraTransform()`. MapLibre places the camera itself (`calculateCameraOptionsFromTo` with altitudes, pitch above 85), so street level is a real eye 1.7 m above the pavement (`eyeCamera()` in `MapView`, constants in `walk.ts`). The overhead map keeps `maxPitch` 85; only walking raises it to 120 and `maxZoom` to 24. Drag looks around while walking (map drag-pan and scroll-zoom are off), and basemap labels are hidden at eye level. This supersedes the pitch/zoom notes above.
- Textured 3D city tiles are citywide: `pnpm build:city-tiles` writes `public/tiles/nyc-city.pmtiles` (~82 MB, gitignored), `pnpm publish:city-tiles` uploads it through Octo files to R2 (two parts, Octo's upload request limit) and records them in `core.published_assets`; the app reads it from `/api/city-tiles`, which answers PMTiles Range requests same-origin and stitches ranges across parts (Octo's public bucket sends no CORS headers). `VITE_CITY_TILES_URL` overrides the URL. Street level turns the textured city on by default (`city3d=0` in the Layers dropdown turns it off). Basemap extrusions only step aside where textured buildings are loaded around the camera.
- `three` 0.186.1 (MIT; mapillary-js keeps its own 0.134 inside the street-photo chunk) draws corner street-name signs at street level, and only that: `src/lib/map/streetSigns.ts` is a MapLibre **custom layer** in the same canvas and depth buffer (not a second canvas or deck.gl), lazy-loaded with the city layers. It places the CC0 Grab3D "Street Name Sign" GLB (`public/models/`, see its LICENSE.md) at the <= 60 nearest intersections within 300 m from zoom 17, with canvas-text decals naming the streets. Intersections come from the `signs` layer that `pnpm build:sign-tiles` bakes into the city PMTiles from DCP LION with DuckDB spatial (`scripts/street-signs.sql`); run it after `build:city-tiles` and before `publish:city-tiles`.
- Real blocks (Octo backend): `pnpm build:block-tiles` dissolves MapPLUTO lots by borough + block into DOF tax blocks with DuckDB spatial, simplifies them with mapshaper and tiles them with tippecanoe (`public/tiles/nyc-blocks.pmtiles` + `nyc-blocks.geojson`, gitignored); `pnpm publish:block-tiles` uploads both through Octo files to R2 (`core.published_assets`). The map reads the tiles from `/api/block-tiles` (same Range proxy as `/api/city-tiles`) and `src/lib/map/blockTiles.ts` swaps the blocks source to them, with column heights as feature-state keyed by `boro * 100000 + block`. `scripts/build-aggregates.ts` spatially joins the window's points to the blocks in DuckDB (`scripts/block-join.ts`; street-bed points within ~40 m are split between the nearest eligible facing blocks; open space — MapPLUTO LandUse 09, Q* parks, Z8 cemeteries — and blocks over 12 ha or 1.8 km perimeter only count points strictly inside them). Blocks are shaded per hectare (flag `blockDensity`, default on); `/api/aggregate` keeps the serialized rollup in memory and revalidates it by `generated_at` and writes the cells to `marts.aggregates` and `marts.block_stats`. The Socrata fallback keeps the ~300 m grid.
- `@duckdb/node-api` 1.5.6 (MIT, dev only) with the DuckDB `spatial` extension: the block dissolve and the ingest's point-in-block join. No hand-rolled spatial join in scripts.
- `mapshaper` 0.7.89 (MPL-2.0, dev only) simplifies NTA / community-district boundaries in `scripts/load-areas.ts` before they are stored in Octo `core.area_shapes`.
- Octo backend (`VITE_DATA_BACKEND=octo`) makes no browser call to NYC Open Data: boundaries come from `/api/areas`, the noise / crash rollups from `/api/aggregate` (precomputed nightly into `marts.aggregates` by `scripts/build-aggregates.ts`, which runs the same `src/lib/geo/aggregateCore.ts` the Socrata worker uses). Socrata stays the explicit fallback backend.
- `hono` 4.13.13 and `@hono/node-server` 2.1.5 (both MIT) run the API: `server/app.ts` mounts the Web-standard handlers in `api/` and is host-agnostic (Node via `pnpm start` / the Dockerfile, Cloudflare Workers, Bun, Deno); `vite dev` serves the same app in-process. No host-specific (e.g. Vercel) config.
- `tesseract.js` 7.0.0 (Apache-2.0) reads the words in a camera frame for the sign camera prototype (`src/features/signcam/reader.ts`, flag `signCamera`, off by default). It is imported only when the camera starts, in its own `signReader` chunk, and it fetches its worker, engine and English data from jsDelivr at run time, so it does not work without signal yet (#88). Its install script only prints a funding note and is switched off in `pnpm-workspace.yaml`.
- `vaul` 1.1.2 (MIT, the drawer behind shadcn `Drawer`) is the mobile bottom sheet of `MapPanel`, with peek / half / full snap points. The draggable floating panels (`react-draggable`) were removed with it.
- Walking directions are one `fetch` to OSRM (`src/lib/api/routing.ts`). Typed A/B addresses use `downshift` 9.4.0 (MIT) `useCombobox` over NYC Planning GeoSearch (`src/lib/api/geosearch.ts`, keyless Pelias autocomplete); map-click picking stays.
- **three.js is approved for real 3D models, drawn in ONE shared MapLibre custom layer in the same canvas and depth buffer as the map** (`three` 0.186.1, MIT; colour management off and lights scaled by π so the scenes tuned on 0.134 look the same). Today that layer is `src/lib/map/vehicles3d.ts` (live transit vehicles, instanced, lazily imported on first tilt). Never a second canvas or overlay; **deck.gl stays banned**. This supersedes the "no second renderer" wording above for 3D models only.
- Live MTA transit (`api/transit.ts`, `src/components/TransitLayer.tsx`, `src/lib/transit/`): GTFS-rt decoded server-side with `gtfs-realtime-bindings` 1.1.1 (Apache-2.0, MTA's official bindings) and cached ~15 s; static GTFS baked by `pnpm build:transit` into `public/transit/*.json` (route shapes in official colours, stations, subway entrances, OSM tunnel/bridge grade per segment). Tracks come from the GTFS shapes: subway elevated runs are a route-coloured viaduct deck at `VIADUCT_TOP` (8 m) on piers with trains riding it, underground runs are a faint dashed ground line with translucent ghost trains, LIRR / Metro-North run at grade. Bus Time needs server-only `MTA_BUSTIME_KEY`; without it the Buses toggle is hidden. Cards go in the shared panel (`usePanel`), never a floating card.
- Dataset registry: every Socrata map source is one entry in `src/lib/datasets/registry.ts`. Add a source there; do not write a per-dataset module.

- **Architecture**: the app is a modular monolith; read `docs/ARCHITECTURE.md` first. Features live in `src/features/<name>/` and never import each other.
- **three.js (approved)**: only for 3D models, only through the one shared MapLibre custom layer (`src/lib/map/three/`, entry `threeLayer.ts`, plus `streetSigns.ts`), same canvas. deck.gl stays banned. Enforced by dependency-cruiser.

## Data and correctness rules

- **Every number shown in chat or on the map comes from a query.** The model never computes or recalls a figure; it calls `query_data` and reports the returned rows. If a query fails, say so — do not estimate.
- Socrata access goes through typed hooks in `src/lib/api/` (`socrata.ts` + `noise.ts` / `crashes.ts`). Build SoQL with `URLSearchParams`, never string concatenation into a URL.
- Read `X-App-Token` from `import.meta.env.VITE_SOCRATA_APP_TOKEN` when present; the app must work without it.
- Place points by `latitude`/`longitude`, not the `borough` field (street noise rows are often `Unspecified`).
- Surface data caveats in the UI: 311 is reported complaints, not measured noise; crash data lags a few months.
- Aggregate once, then render: cell and NTA rollups are computed in the query layer and cached, not recomputed per render or per column.

## Spatial join and aggregation

- Neither `erm2-nwe9` nor `h9gi-nx95` carries an NTA code. Neighborhood assignment is a **point-in-polygon join** against `9nt8-h7nd`, done in the browser.
- `src/lib/geo/ntaIndex.ts` buckets the city into 0.01° (~1.1 km) cells mapping to candidate NTAs, so each point ray-casts 1–2 polygons instead of 262. `pointInPolygon.ts` handles Polygon + MultiPolygon + holes. No turf, no extra geo dependency.
- `src/lib/geo/aggregate.worker.ts` is a **module Web Worker**: count → page Socrata CSV at 50k rows → zod-validate each row → assign → roll up → `postMessage({ type: "done" })`. It streams `progress` messages so the UI can show a determinate bar.
- Rollups produced per NTA: count, night count (10pm–4am), weekend-night count (Fri/Sat 10pm–4am), 24-slot hour histogram, month histogram, `helicopterMonths`, top types/descriptors/factors, top addresses, top streets, injuries, deaths, cyclists, severity. Plus borough totals and top intersections.
- **House numbers are the finest grain the data has.** 311's `incident_address` ("123 BROADWAY") is the only per-house-number field in either dataset; NYPD crashes record the street and cross street only. They are aggregated into two separate lists — `topAddresses` (311, per NTA and per block) and `topStreets` (crashes) — and never mixed, so the UI can label which one it is showing. Addresses are normalised (upper-case, whitespace collapsed, capped at 48 chars) and capped at 8 per NTA / 3 per block to keep the cached aggregate small.
- The same pass also fills a **fixed ~300 m block grid** (`src/lib/geo/blocks.ts`, `BLOCK_GRID_DEG = 0.003`, key `row:col`) so noise and crashes stack on the same square. Each `BlockCell` carries count, night count, injuries, deaths and cyclists — no per-block type breakdown, because that would multiply the cache for little gain.
- **Cache the aggregate, never the rows.** `src/lib/cache/aggregateCache.ts` stores the ~262 NTA rows plus the block cells per `dataset:window` in `localStorage`; a repeat visit is instant. Raw rows are discarded after aggregation. Bump `VERSION` whenever the result shape changes (currently `3`, for the address rollups).
- `src/lib/layers.ts` is the only place that turns aggregates into geometry: `buildMapModel` computes each area's value, its column height, the peak and `areasWithData` together, so the map and the map key can never disagree. Height is the only encoding — there is no colour ramp to re-encode the same number.
- **Borough outlines are derived, not fetched.** `src/lib/geo/boroughs.ts` unions each borough's neighborhood rings by counting edges: an edge two neighborhoods of the same borough share is interior and dropped, an edge seen once is the county line. No second dataset, no turf.
- Rows outside every polygon go to `unassignedCount` and rows that fail zod to `malformedCount`. Both are surfaced in the caveats sheet — never silently dropped.

## Agent seam

- `src/lib/agent/client.ts` defines `AgentClient.send(messages, context)` and `AgentReply = { text, toolCalls, spoken? }`. `createAgentClient()` picks `MockAgentClient` or `HttpAgentClient` from `VITE_AGENT_MODE`.
- `src/lib/agent/execute.ts` runs validated tool calls against `MapStateContext`. **Sources ("show query") are produced by execution, never by the agent**, so a model cannot fabricate a citation.
- `src/lib/agent/query.ts` is the single deterministic rollup over the local aggregates. The mock agent and the tool executor both use it, so an answer's number and its source always agree.
- `MockAgentClient` has six scripted answers plus a parser (`genericAnswer`) that turns an ordinary question into a structured query. Extend the parser rather than adding another regex handler; if a question has no dataset/metric/grouping signal, it must fall back to the example list instead of guessing.
- `src/lib/agent/httpAgent.ts` documents the `POST /api/chat` contract and zod-validates the reply. That file is the only thing a real model layer has to satisfy.
- Every answer must emit at least one of `fly_to` / `set_layer` / `highlight`. If a query fails, say so — never estimate.

## AI, chat, and voice rules

- `INFERHUB_API_KEY` lives in a gitignored `.env`, has no `VITE_` prefix, and is never logged or sent to the browser. Chat goes through a server-side handler that proxies InferHub.
- The tool schema in `src/lib/agent/tools.ts` mirrors `context/CHAT_TOOLS.md` exactly: `query_data`, `fly_to`, `set_layer`, `highlight`.
- Model default: `deepseek/deepseek-v4-flash`; escalate to `deepseek/deepseek-v4-pro` only for multi-step questions.
- Validate every tool-call argument with zod before acting on it, and every tool result before rendering it.
- Answers are short, lead with the number, and name place + time window, plus a "show query" source link. Each answer must trigger `fly_to`, `set_layer`, or `highlight`.
- Voice reuses the same chat flow: transcript is appended to the same message history, spoken reply is a short summary of the text answer, and a blocked microphone degrades to typing with an explanatory message.

## Code organization

- `src/pages/` route screens; `src/components/` feature components; `src/components/ui/` shadcn primitives (do not edit these — compose new components instead).
- `src/lib/api/` data access, `src/lib/agent/` model client + tools, `src/lib/geo/` cell + NTA aggregation, `src/lib/map/` basemap + data layers + GeoJSON + walking, `src/lib/format.ts` display helpers.
- Keep files small and single-purpose; extract a component or hook when a file passes ~200 lines.
- Props and shared data shapes get explicit exported types; no `React.FC`, no default-exported anonymous components.
- Update `src/pages/Index.tsx` so new work is actually reachable — an unreferenced component is an unfinished feature.

## UI and accessibility

- Mobile-first Tailwind; the map is full-bleed and panels are shadcn `sheet`/`card` overlays that stay usable at 375px wide.
- **The map is the interface.** Always on screen: the search bar + chips and the right-hand control rail (`MapHud`, Mini Tokyo 3D style): grouped icon-only pills — [zoom +/−, compass] [fullscreen, hidden where unsupported e.g. iOS] [3D city, Street, Follow (only once transit registers it), Eco] [Layers dropdown, Directions, Filters, Ask] [Info]. On mobile it is compact (no zoom buttons — pinch) and stays above the sheet peek. Loading is a thin line under the search bar; the hover card is mouse-only (fine pointer, ≥1024 px). Everything else is a sheet: `ControlDrawer` (window, scale, neighborhood jump, zoom/reset, map key, caveats), `ChatPanel`, `StreetViewSheet`, `CaveatsSheet`. A new control goes in the drawer, not in a new floating card; only the transient status chip (`MapStatusChip`) while data loads, `WalkControls` (its strip, top-left, plus the d-pad) while walking, and the one map panel (`MapPanel`) may appear over the map.
- **One panel, Google Maps style.** `MapPanel` shows exactly one thing: pushed content, else the selected neighborhood / block (`PlaceDetails`), else a short home view. On mobile it is a vaul bottom sheet whose peek snap shows only the summary (name, headline number); pull up or tap the summary for the details (Noise / Crashes / Timeline tabs). On desktop it is a fixed, collapsible left panel. A new selection replaces the content with a back arrow; nothing stacks. The search bar on top searches neighborhoods, GeoSearch addresses and registered providers; the chips under it (Noise, Crashes, Transit, Restrooms, Schools) drive the layers state. Features add content with `usePanel().showPanel({ id, title, subtitle, summary, details })`, chips with `usePanelChip`, and search sources with `usePanelSearch` (all in `src/lib/store/PanelContext.tsx`) — never their own floating card. The hover card stays.
- Every control is keyboard reachable with a visible focus ring; every icon-only button has an `aria-label`.
- The map has a text equivalent: the details panel and chat carry the same numbers, so nothing is map-only.
- Respect `prefers-reduced-motion` for camera flights — jump instead of animate, including the ease into walk mode.
- Walk mode has a keyboard path (W/S/A/D or arrows, Shift, Esc) and a labelled touch d-pad; the dock button carries `aria-pressed`, so the mode is never mouse-only.
- Dark theme via Tailwind `dark:` classes and CSS variables from `src/index.css`; no hard-coded hex colors in components.

## Issue lifecycle (all agents)

- Every piece of work has a GitHub issue. A PR that finishes an issue says `Closes #N` in its body.
- An issue is closed only when its work is complete and merge-ready (checks green, PR open with `Closes #N`). Partial work uses `Refs #N` and leaves the issue open.
- Backlog issues stay open until someone builds them. Do not close them as "planned".

## UI/UX rules (all agents)

- No clutter. Keep the current clean look: map first, controls tucked away.
- **No tooltips.** Explanations, legends and guides live inside drawers (`Drawer`/`Sheet`) or dropdowns (`DropdownMenu`/`Select`). When you touch a component that uses a tooltip, move that content into its drawer or dropdown.
- Use the existing stack only (shadcn/Radix, Tailwind, lucide). No hand-built components unless no shadcn primitive fits.
- Prefer glue code over mature, pinned OSS dependencies to custom code. Justify every new dependency (license, maturity, version) in the PR.

## Textured 3D city (opt-in)

- The "Textured 3D city" item in the map view dropdown adds `fill-extrusion` layers from `public/tiles/nyc-city-pilot.pmtiles` (built by `scripts/build-city-tiles.ts`). Facade patterns (`public/textures/`) and props draw only from zoom 16, and the basemap's own buildings stop at zoom 16 while it is on. This is still MapLibre, not a second renderer. Patterns are the one exception to the single-glass-hue rule, and they apply to buildings, never to data areas.
