/*
 * Offline help below the street (issue #373, widened in #132). Hand-written, no
 * build step, registered for every visit by production builds
 * (src/lib/offline/worker.ts): the signal drops in stations, and a station seen
 * once should work there without the server.
 *
 * What it keeps: the app shell (the page and its built JS/CSS) and the static
 * transit files (stations and entrances, the MTA elevator/escalator list, the
 * x-ray station data and the Fulton St station model the trip preview walks),
 * and the trip steps' words and voice: the answers to the two POSTs the page
 * marks with `x-keep` (/api/agent/translate and /api/tts), kept by what was
 * asked and given back from here when the same thing is asked again. What it
 * never keeps: the rest of
 * /api/* (the assistant, live arrivals, alerts) and anything on another
 * origin (basemap tiles, live feeds). Live data is never served from here as
 * if it were fresh; the page labels anything it saved itself with its age.
 */
const VERSION = "uw-2";
const CACHE = `nyc-map-offline-${VERSION}`;
/** Filled by the page (src/features/underground/offline.ts), small: one station area at a time. */
const TILE_CACHE = "nyc-map-tiles-v1";
/** Fetched at install so the first offline open works. */
const PRECACHE = ["/", "/favicon.svg", "/transit/subway.json", "/transit/equipment.json"];
/** A slow station signal should not hold the page hostage: fall back to the saved copy. */
const NAV_TIMEOUT_MS = 3500;
/** The same for station data, when a saved copy exists; with none, it waits for the network. */
const DATA_TIMEOUT_MS = 4000;
/** Trip steps' translations and voice (#132); a new version drops the old. */
const KEPT_CACHE = "nyc-map-kept-v1";
/** Answers kept, oldest out first; a spoken line is about 150 KB, so a few trips' walks. */
const KEPT_MAX = 120;
/** The POSTs a page may mark `x-keep`. */
const KEPT_PATHS = ["/api/tts", "/api/agent/translate"];
/** Built files older than this are dropped when a new worker starts; one a page still asks for is fetched again. */
const ASSET_MAX_AGE_MS = 30 * 24 * 3600 * 1000;

/**
 * How one request is answered. "bypass" leaves it to the browser (never cached).
 * @param {URL} url
 * @param {{ mode?: string, method?: string, origin: string, keep?: boolean }} req
 */
function strategyFor(url, req) {
  if (req.keep && req.method === "POST" && url.origin === req.origin && KEPT_PATHS.includes(url.pathname)) return "kept";
  if ((req.method ?? "GET") !== "GET") return "bypass";
  // Other hosts (basemap tiles, fonts): always the network; only when that fails, a copy
  // the underground helper saved for a station area. This worker never saves them itself.
  if (url.origin !== req.origin) return "network-then-tiles";
  if (url.pathname.startsWith("/api/") || url.pathname === "/api") return "bypass";
  if (url.pathname === "/sw.js") return "bypass";
  if (req.mode === "navigate") return "network-first-shell";
  // Vite's hashed build output never changes under the same name.
  if (url.pathname.startsWith("/assets/")) return "cache-first";
  // Rebuilt daily (or with the station model): fresh when online, the saved copy when not.
  if (/^\/transit\/[a-z0-9-]+\.json$/.test(url.pathname)) return "network-first";
  if (url.pathname === "/favicon.svg") return "cache-first";
  return "bypass";
}

/**
 * Whether a saved built file is old enough to drop: its Date header is more than
 * `maxAge` before `now`. No date: kept. Pure, for the tests.
 * @param {string | null} date
 */
function staleAsset(date, now, maxAge = ASSET_MAX_AGE_MS) {
  const t = date ? Date.parse(date) : NaN;
  return Number.isFinite(t) && now - t > maxAge;
}

/**
 * Where a kept answer is saved: the path and the request body (the text and the language) in the URL.
 * @param {string} body
 */
function keptKey(path, body, origin) {
  return `${origin}/__kept/v1${path}?${encodeURIComponent(body)}`;
}

self.UW = { VERSION, CACHE, TILE_CACHE, KEPT_CACHE, PRECACHE, strategyFor, staleAsset, keptKey };

async function put(req, res) {
  if (!res || !res.ok || res.type === "opaque") return res;
  const cache = await caches.open(CACHE);
  await cache.put(req, res.clone());
  return res;
}

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms));
}

async function networkFirst(request, cacheKey, ms) {
  const net = fetch(request).then((res) => put(cacheKey, res));
  net.catch(() => undefined); // a late failure after the timeout is not an error
  try {
    return await (ms ? Promise.race([net, timeout(ms)]) : net);
  } catch (err) {
    const hit = await caches.match(cacheKey);
    if (hit) return hit;
    // Slow but not failed, and nothing saved: keep waiting for the network.
    if (err instanceof Error && err.message === "timeout") return net;
    throw err;
  }
}

/** Drop built files from old deploys so the cache does not grow with every release. */
async function pruneAssets() {
  const cache = await caches.open(CACHE);
  const now = Date.now();
  for (const req of await cache.keys()) {
    if (!new URL(req.url).pathname.startsWith("/assets/")) continue;
    const res = await cache.match(req);
    if (res && staleAsset(res.headers.get("date"), now)) await cache.delete(req);
  }
}

/** A kept answer: the saved one when there is one, else the server's, saved once it has all arrived. */
async function kept(event) {
  const key = keptKey(new URL(event.request.url).pathname, await event.request.clone().text(), self.location.origin);
  const cache = await caches.open(KEPT_CACHE);
  const hit = await cache.match(key);
  if (hit) return hit;
  const res = await fetch(event.request);
  if (res.status === 200) {
    event.waitUntil(
      cache
        .put(key, res.clone())
        .then(() => cache.keys())
        .then((keys) => Promise.all(keys.slice(0, Math.max(0, keys.length - KEPT_MAX)).map((k) => cache.delete(k))))
        .catch(() => undefined), // cut short or full: not kept
    );
  }
  return res;
}

async function cacheFirst(request) {
  const hit = await caches.match(request);
  if (hit) return hit;
  return put(request, await fetch(request));
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => Promise.all(PRECACHE.map((u) => c.add(u).catch(() => undefined))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("nyc-map-offline-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => pruneAssets().catch(() => undefined))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  const how = strategyFor(url, { mode: req.mode, method: req.method, origin: self.location.origin, keep: req.headers.get("x-keep") === "1" });
  if (how === "bypass") return;
  if (how === "kept") return event.respondWith(kept(event));
  if (how === "network-then-tiles") {
    event.respondWith(
      fetch(req).catch(async (err) => {
        const hit = await caches.open(TILE_CACHE).then((c) => c.match(req.url));
        if (hit) return hit;
        throw err;
      }),
    );
    return;
  }
  if (how === "network-first-shell") event.respondWith(networkFirst(req, "/", NAV_TIMEOUT_MS));
  else if (how === "network-first") event.respondWith(networkFirst(req, req, DATA_TIMEOUT_MS));
  else event.respondWith(cacheFirst(req));
});

/** The page sends the JS/CSS it already loaded before this worker took control. */
self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "warm" || !Array.isArray(data.urls)) return;
  const origin = self.location.origin;
  const keep = data.urls.filter((u) => {
    try {
      const url = new URL(u, origin);
      return strategyFor(url, { mode: "no-cors", method: "GET", origin }) === "cache-first";
    } catch {
      return false;
    }
  });
  event.waitUntil(caches.open(CACHE).then((c) => Promise.all(keep.map((u) => c.add(u).catch(() => undefined)))));
});
