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
