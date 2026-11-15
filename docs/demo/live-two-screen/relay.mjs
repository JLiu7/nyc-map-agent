// Receives Sensor Logger's HTTP Push (the phone app posts its readings while it records)
// and hands the newest barometer, step and compass readings to the /live page.
//   POST /push      from the phone app: { messageId, sessionId, deviceId, payload: [{ name, time, values }] }
//   GET  /stream    server-sent events, one line per batch that changed something
//   GET  /latest    the newest readings as JSON
// Usage: node sensor-relay.mjs [port]   (default 5190)
import { createServer } from "node:http";
import { readFileSync } from "node:fs";

const port = Number(process.argv[2] ?? 5190);
const latest = { at: 0, messages: 0, session: null, relAlt: null, pressure: null, steps: null, bearing: null, seen: {} };
const listeners = new Set();
const watchers = new Set();
let shared = null;

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
/** A reading's fields sit under `values` on current app versions and beside `name` on old ones. */
const field = (row, ...names) => {
  for (const n of names) {
    const v = num(row?.values?.[n] ?? row?.[n]);
    if (v !== null) return v;
  }
  return null;
};

function take(body) {
  const rows = Array.isArray(body?.payload) ? body.payload : [];
  let changed = false;
  for (const row of rows) {
    const name = String(row?.name ?? "").toLowerCase();
    if (!name) continue;
    latest.seen[name] = (latest.seen[name] ?? 0) + 1;
    if (name.includes("barometer")) {
      const alt = field(row, "relativeAltitude", "relative_altitude");
      const p = field(row, "pressure");
      if (alt !== null) { latest.relAlt = alt; changed = true; }
      if (p !== null) { latest.pressure = p; changed = true; }
    } else if (name.includes("pedometer")) {
      const s = field(row, "steps");
      if (s !== null) { latest.steps = s; changed = true; }
    } else if (name === "compass" || name.includes("heading")) {
      const b = field(row, "magneticBearing", "trueHeading", "magneticHeading", "heading");
      if (b !== null) { latest.bearing = b; changed = true; }
    }
  }
  latest.messages += 1;
  latest.session = body?.sessionId ?? latest.session;
  if (changed) {
    latest.at = Date.now();
    const line = `data: ${JSON.stringify({ at: latest.at, relAlt: latest.relAlt, pressure: latest.pressure, steps: latest.steps, bearing: latest.bearing })}\n\n`;
    for (const res of listeners) res.write(line);
  }
}

const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type", "access-control-allow-methods": "GET,POST,OPTIONS" };

createServer((req, res) => {
  const path = (req.url ?? "/").split("?")[0].replace(/\/+$/, "") || "/";
  if (req.method === "OPTIONS") { res.writeHead(204, cors).end(); return; }
  if (req.method === "POST" && /\/(push|data)$/.test(path)) {
    let raw = "";
    req.on("data", (c) => { raw += c; if (raw.length > 5_000_000) req.destroy(); });
    req.on("end", () => {
      try { take(JSON.parse(raw)); } catch { /* not JSON: ignore the batch */ }
      res.writeHead(200, { ...cors, "content-type": "application/json" }).end('{"ok":true}');
    });
    return;
  }
  // The phone's /live page posts where it thinks it is; a second screen watches it.
  if (req.method === "POST" && path.endsWith("/state")) {
    let raw = "";
    req.on("data", (c) => { raw += c; if (raw.length > 200_000) req.destroy(); });
    req.on("end", () => {
      try { shared = JSON.parse(raw); shared.at = Date.now(); } catch { /* not JSON: ignore */ }
      const line = `data: ${JSON.stringify(shared)}\n\n`;
      for (const r of watchers) r.write(line);
      res.writeHead(200, { ...cors, "content-type": "application/json" }).end('{"ok":true}');
    });
    return;
  }
  if (req.method === "GET" && path.endsWith("/watch")) {
    res.writeHead(200, { ...cors, "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
    if (shared) res.write(`data: ${JSON.stringify(shared)}\n\n`);
    watchers.add(res);
    const beat = setInterval(() => res.write(": keep\n\n"), 15000);
    req.on("close", () => { clearInterval(beat); watchers.delete(res); });
    return;
  }
  if (req.method === "GET" && path.endsWith("/stream")) {
    res.writeHead(200, { ...cors, "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
    res.write(`data: ${JSON.stringify({ at: latest.at, relAlt: latest.relAlt, pressure: latest.pressure, steps: latest.steps, bearing: latest.bearing })}\n\n`);
    listeners.add(res);
    const beat = setInterval(() => res.write(": keep\n\n"), 15000);
    req.on("close", () => { clearInterval(beat); listeners.delete(res); });
    return;
  }
  if (req.method === "GET" && path.endsWith("/latest")) {
    res.writeHead(200, { ...cors, "content-type": "application/json" }).end(JSON.stringify({ ...latest, listeners: listeners.size }));
    return;
  }
  // The two demo pages: /phone on the iPhone, /screen on the computer.
  const page = req.method === "GET" && (path.endsWith("/phone") ? "phone.html" : path.endsWith("/screen") ? "screen.html" : null);
  if (page) {
    try {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }).end(readFileSync(new URL(page, import.meta.url)));
    } catch {
      res.writeHead(500).end("page missing");
    }
    return;
  }
  res.writeHead(404, cors).end("not here");
}).listen(port, "0.0.0.0", () => console.log(`sensor relay on :${port}  (POST /push, GET /stream, GET /latest)`));
