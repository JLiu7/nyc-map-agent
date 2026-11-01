/**
 * Reads the two ferry GTFS feeds (NYC Ferry and the Staten Island Ferry) straight from
 * their publishers. Both are tiny (about 50 KB and 10 KB zipped), so the ferry layer
 * needs no trip planner behind it. Ids are prefixed with the feed name so the two
 * feeds cannot collide.
 */
import { strFromU8, unzipSync } from "fflate";

export const FEEDS = {
  ferry: "https://nycferry.connexionz.net/rtt/public/utility/gtfs.aspx",
  siferry: "https://data.cityofnewyork.us/download/b57i-ri22/application/x-zip-compressed",
};

type Row = Record<string, string>;

export interface StopTime { arr: number; dep: number; lon: number; lat: number }
export interface Trip { id: string; route: string; service: string; times: StopTime[] }
export interface Route { id: string; name: string; color: string | null; shapes: [number, number][][]; stops: { name: string; lon: number; lat: number }[] }
export interface Timetable { routes: Route[]; trips: Trip[]; services: (ymd: string) => Set<string> }

/** CSV rows keyed by header; handles quotes, doubled quotes, CRLF and a leading BOM. */
export function parseCsv(text: string): Row[] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((v) => v !== "")) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((v) => v !== "")) rows.push(row);
  const [head, ...body] = rows;
  return head ? body.map((r) => Object.fromEntries(head.map((h, k) => [h.trim(), (r[k] ?? "").trim()]))) : [];
}

/** "25:10:00" -> seconds after the service day starts; null when blank. */
const secs = (t: string | undefined) => {
  const m = t?.match(/^(\d+):(\d\d):(\d\d)$/);
  return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : null;
};

const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/** Builds one feed's routes, trips and service calendar from its unzipped files. */
export function readFeed(prefix: string, files: Record<string, string>): Timetable {
  const csv = (name: string) => (files[name] ? parseCsv(files[name]) : []);
  const id = (v: string) => `${prefix}:${v}`;
  const stops = new Map(csv("stops.txt").map((s) => [s.stop_id, { name: s.stop_name, lon: +s.stop_lon, lat: +s.stop_lat }]));

  const shapePts = new Map<string, { seq: number; pt: [number, number] }[]>();
  for (const p of csv("shapes.txt")) {
    const list = shapePts.get(p.shape_id) ?? [];
    list.push({ seq: +p.shape_pt_sequence, pt: [+p.shape_pt_lon, +p.shape_pt_lat] });
    shapePts.set(p.shape_id, list);
  }
  const shape = (sid: string) => shapePts.get(sid)?.sort((a, b) => a.seq - b.seq).map((p) => p.pt);

  const timesByTrip = new Map<string, { seq: number; stop: string; arr: number | null; dep: number | null }[]>();
  for (const st of csv("stop_times.txt")) {
    const list = timesByTrip.get(st.trip_id) ?? [];
    list.push({ seq: +st.stop_sequence, stop: st.stop_id, arr: secs(st.arrival_time), dep: secs(st.departure_time) });
    timesByTrip.set(st.trip_id, list);
  }

  const routes = new Map(csv("routes.txt").map((r) => [r.route_id, {
    id: id(r.route_id),
    name: (r.route_long_name || r.route_short_name || r.route_id).replace(/\s+Ferry$/i, " Ferry"),
    color: r.route_color || null,
    shapeIds: new Set<string>(),
    stops: new Map<string, { name: string; lon: number; lat: number }>(),
  }]));

  const trips: Trip[] = [];
  for (const t of csv("trips.txt")) {
    const route = routes.get(t.route_id);
    const rows = (timesByTrip.get(t.trip_id) ?? []).sort((a, b) => a.seq - b.seq);
    if (!route) continue;
    if (t.shape_id) route.shapeIds.add(t.shape_id);
    const times: StopTime[] = [];
    for (const r of rows) {
      const s = stops.get(r.stop);
      if (!s) continue;
      route.stops.set(r.stop, s);
      // Untimed stops in between are skipped; the boat is interpolated across them.
      if (r.arr != null || r.dep != null) times.push({ arr: r.arr ?? r.dep!, dep: r.dep ?? r.arr!, lon: s.lon, lat: s.lat });
    }
    if (times.length >= 2) trips.push({ id: id(t.trip_id), route: route.id, service: id(t.service_id), times });
  }

  const calendar = csv("calendar.txt");
  const exceptions = csv("calendar_dates.txt");
  const services = (ymd: string) => {
    const day = DAYS[new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(4, 6) - 1, +ymd.slice(6, 8))).getUTCDay()];
    const on = new Set(calendar.filter((c) => c.start_date <= ymd && ymd <= c.end_date && c[day] === "1").map((c) => id(c.service_id)));
    for (const e of exceptions) {
      if (e.date !== ymd) continue;
      if (e.exception_type === "1") on.add(id(e.service_id));
      else on.delete(id(e.service_id));
    }
    return on;
  };

  return {
    routes: [...routes.values()].map((r) => ({
      id: r.id, name: r.name, color: r.color, stops: [...r.stops.values()],
      shapes: [...r.shapeIds].map(shape).filter((s): s is [number, number][] => !!s && s.length >= 2),
    })),
    trips,
    services,
  };
}

/** Joins several feeds into one timetable. */
export function merge(feeds: Timetable[]): Timetable {
  return {
    routes: feeds.flatMap((f) => f.routes),
    trips: feeds.flatMap((f) => f.trips),
    services: (ymd) => new Set(feeds.flatMap((f) => [...f.services(ymd)])),
  };
}

export async function fetchFeed(prefix: string, url: string): Promise<Timetable> {
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`${new URL(url).host} returned ${res.status}`);
  const zip = unzipSync(new Uint8Array(await res.arrayBuffer()), { filter: (f) => f.name.endsWith(".txt") });
  const files = Object.fromEntries(Object.entries(zip).map(([name, data]) => [name.split("/").pop()!, strFromU8(data)]));
  return readFeed(prefix, files);
}
