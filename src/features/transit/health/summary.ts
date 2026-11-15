/**
 * Pure helpers for the tracker health page (#11): totals per line from the
 * coverage rows, the schedule × band grid, and one line's stretches in stop
 * order. No React, no fetching, so they are unit-tested directly.
 */
export type System = "subway" | "bus";
export type CoverageRow = { system: System; route: string; sched: number; band: number; segments: number; used: number; solid: number; samples: number };
/** One schedule × band cell, or the whole week when null. */
export type Cell = { sched: number; band: number } | null;
export type RouteTotal = { route: string; segments: number; used: number; solid: number; samples: number; share: number };

export const SCHEDULES: Array<[number, string]> = [[1, "Mon–Fri"], [6, "Sat"], [7, "Sun"]];
const pad = (h: number) => String(h).padStart(2, "0");
export const bandLabel = ([from, to]: readonly [number, number]) => `${pad(from)}–${pad(to + 1)}`;
/** The schedule (1 weekdays, 6 Saturday, 7 Sunday) a day of the week runs on; ISO days, 1 = Monday. */
export const schedOf = (dow: number) => (dow <= 5 ? 1 : dow);
/** A day of the week on that schedule, for the per-line endpoints' `dow`. */
export const dowOf = (sched: number) => (sched === 1 ? 3 : sched);

const share = (solid: number, segments: number) => (segments ? solid / segments : 0);

/**
 * One total per route. For one cell the counts are stretches; over the whole
 * week a stretch counts once in each cell it has samples in.
 */
export function routeTotals(rows: CoverageRow[], system: System, cell: Cell, sort: "samples" | "coverage"): RouteTotal[] {
  const by = new Map<string, RouteTotal>();
  for (const r of rows) {
    if (r.system !== system || (cell && (r.sched !== cell.sched || r.band !== cell.band))) continue;
    const t = by.get(r.route) ?? { route: r.route, segments: 0, used: 0, solid: 0, samples: 0, share: 0 };
    t.segments += r.segments; t.used += r.used; t.solid += r.solid; t.samples += r.samples;
    by.set(r.route, t);
  }
  const out = [...by.values()].map((t) => ({ ...t, share: share(t.solid, t.segments) }));
  return out.sort((a, b) => (sort === "samples" ? b.samples - a.samples : b.share - a.share || b.segments - a.segments) || a.route.localeCompare(b.route, "en", { numeric: true }));
}

export type GridCell = { sched: number; band: number; segments: number; solid: number; samples: number; share: number };
/** The schedule × band grid for a system, or for one of its routes. Cells with no data are present with zeros. */
export function grid(rows: CoverageRow[], system: System, bands: ReadonlyArray<readonly [number, number]>, route?: string): GridCell[] {
  const cells = SCHEDULES.flatMap(([sched]) => bands.map(([band]) => ({ sched, band, segments: 0, solid: 0, samples: 0, share: 0 })));
  for (const r of rows) {
    if (r.system !== system || (route && r.route !== route)) continue;
    const c = cells.find((x) => x.sched === r.sched && x.band === r.band);
    if (!c) continue;
    c.segments += r.segments; c.solid += r.solid; c.samples += r.samples;
  }
  return cells.map((c) => ({ ...c, share: share(c.solid, c.segments) }));
}

export type Segment = { dir: number; from: string; to: string; kind: "travel" | "dwell"; n: number; median: number; p80?: number };
export type Stretch = { from: string; to: string; n: number; median: number; p80?: number; thin: boolean };

/**
 * Subway rows by platform: the feed's direction number is the same both ways on some lines (the 1),
 * so a train's direction is read from its platform id, which ends in N or S.
 */
export function byPlatform(segments: Segment[]): Segment[] {
  return segments.map((s) => (/[NS]$/.test(s.from) ? { ...s, dir: s.from.endsWith("S") ? 1 : 0 } : s));
}

/** The directions a line's learned stretches run in, most stretches first. */
export function directions(segments: Segment[]): number[] {
  const count = new Map<number, number>();
  for (const s of segments) if (s.kind === "travel") count.set(s.dir, (count.get(s.dir) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([d]) => d);
}

/**
 * One direction's stretches in stop order. With `position` (metres along the
 * line for a stop, as the subway's static data has) they are sorted by where
 * they start, in the direction most of them run. Without it (buses) they are
 * chained: start at a stop nothing leads to and follow the best-sampled
 * stretch out of each stop; whatever the chain misses follows after.
 */
export function stretches(segments: Segment[], dir: number, position?: (stop: string) => number | undefined): Stretch[] {
  const rows = segments.filter((s) => s.kind === "travel" && s.dir === dir);
  const out = (s: Segment): Stretch => ({ from: s.from, to: s.to, n: s.n, median: s.median, ...(s.p80 === undefined ? {} : { p80: s.p80 }), thin: s.n < 5 });
  if (position) {
    const at = (s: Segment) => position(s.from) ?? Infinity;
    const forward = rows.reduce((k, s) => k + Math.sign((position(s.to) ?? 0) - (position(s.from) ?? 0)), 0) >= 0 ? 1 : -1;
    return [...rows].sort((a, b) => forward * (at(a) - at(b)) || forward * ((position(a.to) ?? 0) - (position(b.to) ?? 0))).map(out);
  }
  const left = new Set(rows);
  const ordered: Segment[] = [];
  while (left.size) {
    const targets = new Set([...left].map((s) => s.to));
    // A stop nothing leads to starts a chain; in a loop, the best-sampled stretch does.
    let cur: Segment | undefined = [...left].filter((s) => !targets.has(s.from)).sort((a, b) => b.n - a.n)[0] ?? [...left].sort((a, b) => b.n - a.n)[0];
    while (cur) {
      ordered.push(cur);
      left.delete(cur);
      const stop: string = cur.to;
      cur = [...left].filter((s) => s.from === stop).sort((a, b) => b.n - a.n)[0];
    }
  }
  return ordered.map(out);
}

/** 95 → "1:35"; under a minute → "42 s". */
export function clock(seconds: number): string {
  const s = Math.round(seconds);
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
/** 1526 → "1.5k"; 11151259 → "11.2M". */
export function short(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}
export const percent = (x: number | null | undefined) => (x == null ? "–" : `${Math.round(x * 100)}%`);

export type StationInfo = { id: string; name: string; lon: number; lat: number; routes: string[] };
const metres = (a: StationInfo, b: StationInfo) => Math.hypot((a.lon - b.lon) * 111_320 * Math.cos((a.lat * Math.PI) / 180), (a.lat - b.lat) * 111_320);

/**
 * Stations grouped into complexes: the same name within 400 m is one place (Times Sq-42 St is four
 * station ids). The same name further apart (the many "86 St") stays separate. Returns each
 * station id's group key, the lowest id in its group.
 */
export function complexes(stations: StationInfo[]): Map<string, string> {
  const key = new Map<string, string>();
  const sorted = [...stations].sort((a, b) => a.id.localeCompare(b.id));
  for (const s of sorted) {
    const mate = sorted.find((o) => key.has(o.id) && o.name === s.name && metres(o, s) < 400);
    key.set(s.id, mate ? key.get(mate.id)! : s.id);
  }
  return key;
}

type Timed = { stop: string; median: number; n: number };
/** One line and direction at a station: the dwell there, and the stretch in from the previous stop and out to the next. */
export type StationLine = { route: string; dir: number; stop: string; dwell?: { median: number; n: number }; prev?: Timed; next?: Timed };

/**
 * What is learned at a station, per line and direction. `here` says whether a stop id belongs to the
 * station. With several stretches into or out of it on one line (express and local), the best-sampled is kept.
 */
export function stationLines(byRoute: Record<string, Segment[]>, here: (stop: string) => boolean): StationLine[] {
  const out = new Map<string, StationLine>();
  const line = (route: string, dir: number, stop: string) => {
    const k = `${route}|${dir}`;
    let l = out.get(k);
    if (!l) out.set(k, (l = { route, dir, stop }));
    return l;
  };
  for (const [route, rows] of Object.entries(byRoute)) {
    for (const s of rows) {
      if (s.kind === "dwell") {
        if (here(s.from)) line(route, s.dir, s.from).dwell = { median: s.median, n: s.n };
        continue;
      }
      if (here(s.to) && !here(s.from)) {
        const l = line(route, s.dir, s.to);
        if (!l.prev || s.n > l.prev.n) l.prev = { stop: s.from, median: s.median, n: s.n };
      }
      if (here(s.from) && !here(s.to)) {
        const l = line(route, s.dir, s.from);
        if (!l.next || s.n > l.next.n) l.next = { stop: s.to, median: s.median, n: s.n };
      }
    }
  }
  return [...out.values()].sort((a, b) => a.route.localeCompare(b.route, "en", { numeric: true }) || a.dir - b.dir);
}

export type StationTotal = { key: string; name: string; routes: string[]; lines: number; thin: number; samples: number };
/**
 * Every station with how much is learned there, least first, so stations with little or no data
 * lead the list. `lines` counts line-directions with a learned stretch; `thin` those with a
 * stretch in or out that has under 5 samples; `samples` adds the stretches in and out.
 */
export function stationTotals(byRoute: Record<string, Segment[]>, stations: Array<{ key: string; name: string; routes: string[] }>, keyOf: (stop: string) => string | undefined): StationTotal[] {
  const totals = new Map<string, StationTotal>(stations.map((s) => [s.key, { key: s.key, name: s.name, routes: s.routes, lines: 0, thin: 0, samples: 0 }]));
  const least = new Map<string, number>();
  for (const [route, rows] of Object.entries(byRoute)) {
    for (const s of rows) {
      if (s.kind !== "travel") continue;
      for (const key of new Set([keyOf(s.from), keyOf(s.to)])) {
        const t = key === undefined ? undefined : totals.get(key);
        if (!t) continue;
        t.samples += s.n;
        const k = `${key}|${route}|${s.dir}`;
        least.set(k, Math.min(least.get(k) ?? Infinity, s.n));
      }
    }
  }
  for (const [k, n] of least) {
    const t = totals.get(k.split("|")[0])!;
    t.lines++;
    if (n < 5) t.thin++;
  }
  return [...totals.values()].sort((a, b) => a.samples - b.samples || b.thin - a.thin || a.name.localeCompare(b.name));
}

export type Span = { seconds: number; stretches: number; least: number };
/**
 * Our learned time from one stop to a later one, by following the best-sampled stretch out of
 * each stop until the target (at most 80 hops). Undefined when the chain does not reach it. Used
 * to set our stop-to-stop times beside the MTA's timepoint-to-timepoint average, which spans
 * several stops. Both count the time spent at the stops in between.
 */
export function spanLearned(segments: Segment[], from: string, to: string): Span | undefined {
  const out = new Map<string, Segment>();
  for (const s of segments) {
    if (s.kind !== "travel") continue;
    const cur = out.get(`${s.dir}|${s.from}`);
    if (!cur || s.n > cur.n) out.set(`${s.dir}|${s.from}`, s);
  }
  let best: Span | undefined;
  for (const dir of directions(segments)) {
    let at = from, seconds = 0, least = Infinity;
    const seen = new Set<string>();
    for (let hops = 1; hops <= 80; hops++) {
      const s = out.get(`${dir}|${at}`);
      if (!s || seen.has(at)) break;
      seen.add(at);
      seconds += s.median;
      least = Math.min(least, s.n);
      if (s.to === to) {
        if (!best || hops < best.stretches) best = { seconds, stretches: hops, least };
        break;
      }
      at = s.to;
    }
  }
  return best;
}

export type HourCell = { sched: number; hour: number; segments: number; solid: number; enough: number; samples: number };
/** Every hour of a schedule, with zeros where the endpoint had no row. */
export function hoursOf(cells: HourCell[], sched: number): HourCell[] {
  return Array.from({ length: 24 }, (_, hour) => cells.find((c) => c.sched === sched && c.hour === hour) ?? { sched, hour, segments: 0, solid: 0, enough: 0, samples: 0 });
}
