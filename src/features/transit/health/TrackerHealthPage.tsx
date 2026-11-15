import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { bandLabel, byPlatform, clock, directions, dowOf, grid, percent, routeTotals, SCHEDULES, schedOf, short, stationLines, stationTotals, complexes, spanLearned, hoursOf, stretches, type HourCell, type Cell, type CoverageRow, type Segment, type StationInfo, type System } from "./summary";
import { nyHourOfWeek } from "../history";
import { removeShell } from "@/lib/shellDraft";

/**
 * The tracker health page at /tracker-health (#11), for technical readers:
 * how much the live train and bus tracker has learned, system-wide and for one
 * line, and how far off its predictions are. Every chart names the endpoint
 * its numbers came from and when they were loaded. Reached from Settings when
 * Advanced is on, or by its address. Its own chunk; plain HTML and CSS bars.
 */
const API = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");
async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return (await res.json()) as T;
}

type Coverage = { ready: boolean; refreshedAt: string | null; bands: Array<[number, number]>; rows: CoverageRow[] };
type Stats = { n: number; maeModel: number | null; maeBase: number | null; w60Model: number | null; w60Base: number | null };
type AccuracyRow = Stats & { system: System; dim: string; key: string; learned: Stats };
type Accuracy = {
  ready: boolean;
  rows: AccuracyRow[];
  thin: Array<{ system: System; route: string; dir: number; from: string; to: string; n: number; learnedN: number; maeModel: number; maeBase: number }>;
  runs: Array<{ system: System; runs: number; opened: number; resolved: number; unresolved: number; stored: number; first: string | null; last: string | null }>;
  stops?: Array<{ system: System; route: string; stop: string; n: number; maeModel: number; maeBase: number; w60Model: number }>;
  /** Error split by rush hour, notice, weather and traffic: a list of its own in the answer. */
  conditions?: AccuracyRow[];
};
type Hours = { ready: boolean; cells: HourCell[] };
type BusSpeeds = { ready: boolean; since: string | null; segments: Array<{ direction: string; order: number; from: string; to: string; seconds: number; metres: number; trips: number }> };
type SubwayStatic = { routes: Record<string, { color: string; text: string }>; stations: { features: Array<{ properties: { id: string; name: string; routes: string }; geometry: { coordinates: [number, number] } }> }; stopM: Record<string, Record<string, number>> };
type BusRoute = { stops: Array<{ id: string; name: string; lon: number; lat: number }> };

const time = (ms: number) => new Date(ms).toLocaleTimeString("en-US", { hour12: false });
const NO_ROWS: CoverageRow[] = [], NO_BANDS: Array<[number, number]> = [], NO_SEGMENTS: Segment[] = [];
const stationOf = (system: System, id: string) => (system === "subway" ? id.replace(/[NS]$/, "") : id);
const SYSTEMS: Array<[System, string]> = [["subway", "Subway"], ["bus", "Buses"]];
const CARD = "rounded-2xl border border-white/10 bg-white/[0.04] p-3 sm:p-4";
const CHIP = "min-h-8 rounded-full px-3 text-[13px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400";
const chip = (on: boolean) => `${CHIP} ${on ? "bg-sky-500 text-[#04121f]" : "bg-white/10 text-white"}`;
const SELECT = "min-h-8 max-w-full rounded-lg border border-white/15 bg-[#0f1a2e] px-2 text-[13px] text-white";

/** Where a chart's numbers come from, and when they were loaded. */
function Source({ url, at, note }: { url: string; at?: number; note?: string }) {
  return (
    <p data-testid="source" className="mt-2 break-all font-mono text-[11px] leading-4 text-white/55">
      GET {url}{at ? ` · loaded ${time(at)}` : ""}{note ? ` · ${note}` : ""}
    </p>
  );
}

function Section({ title, id, children, aside }: { title: string; id: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section data-testid={id} className={CARD}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px] font-bold">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Bullet({ route, colors }: { route: string; colors?: SubwayStatic["routes"] }) {
  const c = colors?.[route];
  return <span className="inline-block min-w-[2.6rem] truncate rounded-md px-1.5 py-0.5 text-center text-[12px] font-bold" style={{ background: c?.color ?? "#1e3a5f", color: c?.text ?? "#fff" }}>{route}</span>;
}

/** Two bars to compare: with learned times (blue) and without (grey). */
function Pair({ label, row, max }: { label: ReactNode; row: Stats; max: number }) {
  const w = (v: number | null) => `${v == null || !max ? 0 : Math.max(2, (v / max) * 100)}%`;
  return (
    <div className="grid grid-cols-[minmax(4.5rem,28%)_1fr_auto] items-center gap-2 py-1 text-[12px]">
      <span className="truncate">{label}</span>
      <span className="flex flex-col gap-0.5">
        <span className="block h-2 rounded bg-sky-400" style={{ width: w(row.maeModel) }} />
        <span className="block h-2 rounded bg-white/35" style={{ width: w(row.maeBase) }} />
      </span>
      <span className="whitespace-nowrap text-right tabular-nums text-white/85">
        {row.maeModel == null ? "–" : `${Math.round(row.maeModel)} s`} / {row.maeBase == null ? "–" : `${Math.round(row.maeBase)} s`} · {percent(row.w60Model)} · n {short(row.n)}
      </span>
    </div>
  );
}

function AccuracyPanel({ system, stopName }: { system: System; stopName: (stop: string) => string }) {
  const url = `${API}/api/transit-health/accuracy`;
  const q = useQuery({ queryKey: ["tracker-health", "accuracy"], queryFn: () => getJson<Accuracy>(url), staleTime: 60_000, retry: 1 });
  const rows = [...(q.data?.rows ?? []), ...(q.data?.conditions ?? [])].filter((r) => r.system === system);
  const run = q.data?.runs.find((r) => r.system === system);
  const all = rows.find((r) => r.dim === "all");
  const of = (dim: AccuracyRow["dim"], order?: string[]) => {
    const list = rows.filter((r) => r.dim === dim);
    return order ? order.flatMap((k) => list.filter((r) => r.key === k)) : list.sort((a, b) => (b.maeModel ?? 0) - (a.maeModel ?? 0));
  };
  const [allRoutes, setAllRoutes] = useState(false);
  const routes = of("route");
  const max = Math.max(1, ...rows.flatMap((r) => [r.maeModel ?? 0, r.maeBase ?? 0]));
  const enough = (all?.n ?? 0) >= 200;
  const thin = (q.data?.thin ?? []).filter((t) => t.system === system);
  const stops = (q.data?.stops ?? []).filter((t) => t.system === system).slice(0, 10);
  const group = (title: string, dim: AccuracyRow["dim"], order: string[], label: (key: string) => string = (k) => k) => {
    const list = of(dim, order);
    return list.length ? (
      <div data-testid={`accuracy-${dim}`}>
        <h3 className="mt-2 text-[12px] font-semibold text-white/70">{title}</h3>
        {list.map((r) => <Pair key={r.key} label={label(r.key)} row={r} max={max} />)}
      </div>
    ) : null;
  };
  return (
    <Section title="Accuracy" id="accuracy">
      {q.isError ? <p role="alert" className="text-[13px] text-amber-300">Could not load.</p> : null}
      {q.data && !enough ? (
        <p data-testid="accuracy-waiting" className="rounded-lg bg-amber-400/15 px-3 py-2 text-[13px] text-amber-200">
          Not enough data yet · {all?.n ?? 0} scored predictions{run ? ` · ${run.runs} runs` : ""}{q.data.ready ? "" : " · recorder not started"}
        </p>
      ) : null}
      {all && all.n > 0 ? (
        <div data-testid="accuracy-data">
          <p className="mb-1 flex flex-wrap gap-x-3 text-[11px] text-white/70">
            <span><span className="mr-1 inline-block h-2 w-3 rounded bg-sky-400" />learned</span>
            <span><span className="mr-1 inline-block h-2 w-3 rounded bg-white/35" />default</span>
            <span>median |error| learned / default · within 1 min · n</span>
          </p>
          <Pair label="All" row={all} max={max} />
          <Pair label="Learned used" row={all.learned} max={max} />
          <h3 className="mt-2 text-[12px] font-semibold text-white/70">Minutes ahead</h3>
          {of("lead", ["1-3", "3-6", "6-10"]).map((r) => <Pair key={r.key} label={r.key} row={r} max={max} />)}
          <h3 className="mt-2 text-[12px] font-semibold text-white/70">Hour band</h3>
          {of("band", ["0", "5", "7", "10", "16", "20"]).map((r) => <Pair key={r.key} label={`from ${r.key.padStart(2, "0")}`} row={r} max={max} />)}
          {group("Rush hour (Mon–Fri 7–10, 16–20)", "rush", ["rush", "off-peak"])}
          {group("Notice on the line", "notice", ["yes", "no"], (k) => (k === "yes" ? "active" : "none"))}
          {group("Weather", "weather", ["dry", "rain", "snow"])}
          {group("Traffic by the stop", "traffic", ["free", "slow", "jam"])}
          <h3 className="mt-2 text-[12px] font-semibold text-white/70">Samples behind the learned time</h3>
          {of("samples", ["2-4", "5-9", "10+", "none"]).map((r) => <Pair key={r.key} label={r.key} row={r} max={max} />)}
          <h3 className="mt-2 text-[12px] font-semibold text-white/70">{system === "subway" ? "Line" : "Route"}, worst first</h3>
          {(allRoutes ? routes : routes.slice(0, 12)).map((r) => <Pair key={r.key} label={r.key} row={r} max={max} />)}
          {routes.length > 12 ? <button type="button" className={`${chip(false)} mt-1`} onClick={() => setAllRoutes(!allRoutes)}>{allRoutes ? "Fewer" : `All ${routes.length}`}</button> : null}
          {stops.length ? (
            <div data-testid="accuracy-stops">
              <h3 className="mt-2 text-[12px] font-semibold text-white/70">Stops, worst first</h3>
              {stops.map((t) => <Pair key={`${t.route}|${t.stop}`} label={<span title={t.stop}>{t.route} {stopName(t.stop)}</span>} row={{ n: t.n, maeModel: t.maeModel, maeBase: t.maeBase, w60Model: t.w60Model, w60Base: null }} max={max} />)}
            </div>
          ) : null}
          {thin.length ? (
            <>
              <h3 className="mt-2 text-[12px] font-semibold text-amber-300">Learned from under 5 samples and worse than default</h3>
              {thin.slice(0, 10).map((t) => <Pair key={`${t.route}${t.dir}${t.from}${t.to}`} label={`${t.route} ${t.from}→${t.to}`} row={{ n: t.n, maeModel: t.maeModel, maeBase: t.maeBase, w60Model: null, w60Base: null }} max={max} />)}
            </>
          ) : null}
        </div>
      ) : null}
      {run ? <p className="mt-2 text-[12px] tabular-nums text-white/70">{run.runs} runs · {short(run.opened)} predictions opened · {short(run.resolved)} resolved · {short(run.unresolved)} unresolved · {short(run.stored)} stored</p> : null}
      <Source url="/api/transit-health/accuracy" at={q.dataUpdatedAt || undefined}
        note={system === "subway" ? "actual = first stopped-at report, else the feed's last listed arrival; default = the feed's time" : "actual = bus seen leaving the stop; default = route speed and 16 s dwell; 16 routes a run"} />
    </Section>
  );
}

function LineDetail({ system, route, cell, colors, statics, onStation }: { system: System; route: string; cell: Cell; colors?: SubwayStatic["routes"]; statics?: SubwayStatic; onStation: (stop: string) => void }) {
  const now = nyHourOfWeek(new Date());
  const dow = cell ? dowOf(cell.sched) : now.dow, hour = cell ? cell.band : now.hour;
  const path = `/api/${system === "subway" ? "transit-segments" : "transit-bus-segments"}?${new URLSearchParams({ route, dow: String(dow), hour: String(hour) })}`;
  const q = useQuery({ queryKey: ["tracker-health", "line", path], queryFn: () => getJson<{ segments: Segment[] }>(API + path), staleTime: 5 * 60_000, retry: 1 });
  const stops = useQuery({ queryKey: ["transit", "bus-route", route], queryFn: () => getJson<BusRoute>(`${API}/api/transit/bus-route?${new URLSearchParams({ route })}`), staleTime: Infinity, retry: 0, enabled: system === "bus" });
  const [dirPick, setDir] = useState<number | null>(null);
  const raw = q.data?.segments ?? NO_SEGMENTS;
  const segments = useMemo(() => (system === "subway" ? byPlatform(raw) : raw), [raw, system]);
  const dirs = directions(segments);
  const dir = dirPick !== null && dirs.includes(dirPick) ? dirPick : dirs[0];
  const names = useMemo(() => {
    const m = new Map<string, string>();
    if (system === "subway") for (const f of statics?.stations.features ?? []) m.set(f.properties.id, f.properties.name);
    else for (const s of stops.data?.stops ?? []) m.set(s.id.replace(/^MTA_/, ""), s.name);
    return m;
  }, [system, statics, stops.data]);
  const station = (id: string) => stationOf(system, id);
  const name = (id: string) => names.get(station(id)) ?? id;
  const list = useMemo(() => {
    const m = system === "subway" ? statics?.stopM[route] : undefined;
    return dir === undefined ? [] : stretches(segments, dir, m ? (id) => m[stationOf(system, id)] : undefined);
  }, [segments, dir, statics, route, system]);
  const max = Math.max(1, ...list.map((s) => s.p80 ?? s.median));
  const thin = list.filter((s) => s.thin).length;
  return (
    <Section title="One line" id="line-detail" aside={<Bullet route={route} colors={system === "subway" ? colors : undefined} />}>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-[12px] text-white/75">
        {dirs.length > 1 ? (
          <select aria-label="Direction" data-testid="line-direction" className={SELECT} value={dir} onChange={(e) => setDir(Number(e.target.value))}>
            {dirs.map((d) => {
              const last = stretches(segments, d, system === "subway" && statics?.stopM[route] ? (id) => statics.stopM[route][station(id)] : undefined).at(-1);
              return <option key={d} value={d}>{last ? `to ${name(last.to)}` : `Direction ${d}`}</option>;
            })}
          </select>
        ) : null}
        <span data-testid="line-count" className="tabular-nums">{list.length} stretches · {thin} under 5 samples</span>
      </div>
      {q.isError ? <p role="alert" className="text-[13px] text-amber-300">Could not load.</p> : null}
      {q.data && !list.length ? <p className="text-[13px] text-white/70">No learned times here.</p> : null}
      <ol className="max-h-[26rem] overflow-y-auto pr-1">
        {list.map((s) => (
          <li key={`${s.from}|${s.to}`} data-testid="stretch" className="grid grid-cols-[minmax(0,1fr)_minmax(3rem,30%)_auto] items-center gap-2 border-t border-white/5 text-[12px]">
            <button type="button" data-testid="stretch-station" aria-label={`Station ${name(s.from)}`} onClick={() => onStation(s.from)}
              className="min-h-7 truncate rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400">{name(s.from)} → {name(s.to)}</button>
            <span className="relative block h-2.5 rounded bg-white/10">
              {s.p80 !== undefined ? <span className="absolute inset-y-0 left-0 rounded bg-sky-900" style={{ width: `${(s.p80 / max) * 100}%` }} /> : null}
              <span className={`absolute inset-y-0 left-0 rounded ${s.thin ? "bg-amber-400" : "bg-sky-400"}`} style={{ width: `${(s.median / max) * 100}%` }} />
            </span>
            <span className="whitespace-nowrap text-right tabular-nums text-white/85">{clock(s.median)}{s.p80 !== undefined ? ` · p80 ${clock(s.p80)}` : ""} · n {s.n}</span>
          </li>
        ))}
      </ol>
      <Source url={path} at={q.dataUpdatedAt || undefined} note={`${cell ? "" : "now · "}${system === "subway" ? "n = observations" : "n = run medians"}`} />
    </Section>
  );
}

const HOUR_COLS = "grid grid-cols-12 gap-0.5 sm:[grid-template-columns:repeat(24,minmax(0,1fr))]";
/** Samples per single hour: where an hour alone has enough data (8 or more per stretch), and where only the band pool does. */
function HoursStrip({ system, route, bands }: { system: System; route?: string; bands: Array<[number, number]> }) {
  const path = `/api/transit-health/hours?${new URLSearchParams({ system, ...(route ? { route } : {}) })}`;
  const q = useQuery({ queryKey: ["tracker-health", "hours", path], queryFn: () => getJson<Hours>(API + path), staleTime: 5 * 60_000, retry: 1 });
  const cells = q.data?.cells ?? NO_HOURS;
  return (
    <div data-testid="hours">
      <h3 className="mb-1 text-[12px] font-semibold text-white/70">By single hour · {route ?? (system === "subway" ? "all subway lines" : "all bus routes")} · share of stretches with 8+ in that hour</h3>
      {q.data && !q.data.ready ? <p data-testid="hours-waiting" className="text-[12px] text-amber-200">Not built yet.</p> : null}
      {q.isError ? <p role="alert" className="text-[12px] text-amber-300">Could not load.</p> : null}
      {cells.length ? SCHEDULES.map(([sched, label]) => (
        <div key={sched} className="mb-1 grid grid-cols-[2.9rem_minmax(0,1fr)] items-start gap-1">
          <span className="pt-1 text-[11px] text-white/70">{label}</span>
          <div className={HOUR_COLS}>
            {hoursOf(cells, sched).map((c) => {
              const share = c.segments ? c.enough / c.segments : 0;
              return (
                <span key={c.hour} data-testid="hour-cell" aria-label={`${label} ${c.hour}:00, ${percent(share)} of ${c.segments} stretches with 8 or more samples, ${c.samples} samples`}
                  className={`flex min-h-8 flex-col items-center justify-center rounded-sm text-[9px] leading-tight tabular-nums ${bands.some(([a]) => a === c.hour) ? "border-l-2 border-white/70" : ""}`}
                  style={{ background: c.segments ? `rgba(56,189,248,${0.12 + 0.78 * share})` : "rgba(255,255,255,0.05)", color: share > 0.55 ? "#04121f" : "#fff" }}>
                  <span className="font-bold">{c.hour}</span>
                  <span className="opacity-80">{c.samples ? short(c.samples) : "–"}</span>
                </span>
              );
            })}
          </div>
        </div>
      )) : null}
      <Source url={path} at={q.dataUpdatedAt || undefined} note="hour and samples in each cell · a white edge starts a band" />
    </div>
  );
}
const NO_HOURS: HourCell[] = [];

/** A bus route's MTA-published average between timepoints beside our learned times over the same stops. */
function MtaCompare({ route, cell }: { route: string; cell: Cell }) {
  const now = nyHourOfWeek(new Date());
  const dow = cell ? dowOf(cell.sched) : now.dow, hour = cell ? cell.band : now.hour;
  const params = new URLSearchParams({ route, dow: String(dow), hour: String(hour) });
  const path = `/api/transit-health/bus-speeds?${params}`;
  const mta = useQuery({ queryKey: ["tracker-health", "bus-speeds", path], queryFn: () => getJson<BusSpeeds>(API + path), staleTime: 30 * 60_000, retry: 1 });
  const oursPath = `/api/transit-bus-segments?${params}`;
  const ours = useQuery({ queryKey: ["tracker-health", "line", oursPath], queryFn: () => getJson<{ segments: Segment[] }>(API + oursPath), staleTime: 5 * 60_000, retry: 1 });
  const stops = useQuery({ queryKey: ["transit", "bus-route", route], queryFn: () => getJson<BusRoute>(`${API}/api/transit/bus-route?${new URLSearchParams({ route })}`), staleTime: Infinity, retry: 0 });
  const names = useMemo(() => new Map((stops.data?.stops ?? []).map((s) => [s.id.replace(/^MTA_/, ""), s.name])), [stops.data]);
  const name = (id: string) => names.get(id) ?? id;
  const segments = ours.data?.segments ?? NO_SEGMENTS;
  const rows = (mta.data?.segments ?? []).map((m) => ({ m, span: spanLearned(segments, m.from, m.to) }));
  const max = Math.max(1, ...rows.flatMap((r) => [r.m.seconds, r.span?.seconds ?? 0]));
  return (
    <Section title="MTA published times" id="mta-compare" aside={<Bullet route={route} />}>
      {mta.data && !mta.data.ready ? <p data-testid="mta-waiting" className="text-[13px] text-amber-200">Not imported for this route yet.</p> : null}
      {mta.data?.ready && !rows.length ? <p className="text-[13px] text-white/70">No published figure for this hour.</p> : null}
      {rows.length ? (
        <p className="mb-1 flex flex-wrap gap-x-3 text-[11px] text-white/70">
          <span><span className="mr-1 inline-block h-2 w-3 rounded bg-white/35" />MTA average</span>
          <span><span className="mr-1 inline-block h-2 w-3 rounded bg-sky-400" />ours, summed over the stops between</span>
        </p>
      ) : null}
      <ul>
        {rows.map(({ m, span }) => (
          <li key={`${m.direction}|${m.from}|${m.to}`} data-testid="mta-row" className="border-t border-white/5 py-1 text-[12px]">
            <p>{m.direction} · {name(m.from)} → {name(m.to)}</p>
            <span className="my-0.5 flex flex-col gap-0.5">
              <span className="block h-2 rounded bg-white/35" style={{ width: `${(m.seconds / max) * 100}%` }} />
              <span className={`block h-2 rounded ${span && span.least < 5 ? "bg-amber-400" : "bg-sky-400"}`} style={{ width: `${Math.max(1, ((span?.seconds ?? 0) / max) * 100)}%` }} />
            </span>
            <p className="tabular-nums text-white/85">
              {clock(m.seconds)} · {short(m.trips)} trips / {span ? `${clock(span.seconds)} · ${span.stretches} stretches · least n ${span.least}` : "no full chain"}
            </p>
          </li>
        ))}
      </ul>
      <Source url={path} at={mta.dataUpdatedAt || undefined} note={`data.ny.gov kufs-yh3x${mta.data?.since ? `, months from ${mta.data.since}` : ""} · ours: ${oursPath}`} />
    </Section>
  );
}

const NO_BY_ROUTE: Record<string, Segment[]> = {};
/**
 * Stations: how much is learned at each, least first, and one station up close: per line and
 * direction, the dwell there and the stretch in from the previous stop and out to the next.
 * Subway reads every line in one request and groups a complex's station ids; a bus stop is
 * shown for the chosen route.
 */
function StationPanel({ system, route, cell, statics, colors, picked, onPick }: { system: System; route?: string; cell: Cell; statics?: SubwayStatic; colors?: SubwayStatic["routes"]; picked: string | null; onPick: (stop: string | null) => void }) {
  const now = nyHourOfWeek(new Date());
  const dow = cell ? dowOf(cell.sched) : now.dow, hour = cell ? cell.band : now.hour;
  const lines = useMemo(() => Object.keys(statics?.routes ?? {}).filter((r) => /^[A-Za-z0-9]{1,4}$/.test(r)).sort().slice(0, 50), [statics]);
  const path = system === "subway"
    ? `/api/transit-segments/all?${new URLSearchParams({ routes: lines.join(","), dow: String(dow), hour: String(hour) })}`
    : `/api/transit-bus-segments?${new URLSearchParams({ route: route ?? "", dow: String(dow), hour: String(hour) })}`;
  const q = useQuery({
    queryKey: ["tracker-health", system === "subway" ? "stations" : "line", path],
    queryFn: () => getJson<{ routes?: Record<string, Segment[]>; segments?: Segment[] }>(API + path),
    staleTime: 5 * 60_000, retry: 1, enabled: system === "subway" ? lines.length > 0 : !!route,
  });
  const stops = useQuery({ queryKey: ["transit", "bus-route", route], queryFn: () => getJson<BusRoute>(`${API}/api/transit/bus-route?${new URLSearchParams({ route: route ?? "" })}`), staleTime: Infinity, retry: 0, enabled: system === "bus" && !!route });
  const [all, setAll] = useState(false);
  const data = q.data;
  const byRoute = useMemo(() => {
    if (!data) return NO_BY_ROUTE;
    if (system === "bus") return { [route ?? ""]: data.segments ?? NO_SEGMENTS };
    return Object.fromEntries(Object.entries(data.routes ?? {}).map(([r, rows]) => [r, byPlatform(rows)]));
  }, [data, system, route]);
  const info = useMemo((): StationInfo[] => (system === "subway"
    ? (statics?.stations.features ?? []).map((f) => ({ id: f.properties.id, name: f.properties.name, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], routes: f.properties.routes.split(" ").filter(Boolean) }))
    : (stops.data?.stops ?? []).map((s) => ({ id: s.id.replace(/^MTA_/, ""), name: s.name, lon: s.lon, lat: s.lat, routes: route ? [route] : [] }))), [system, statics, stops.data, route]);
  const groups = useMemo(() => (system === "subway" ? complexes(info) : new Map(info.map((s) => [s.id, s.id]))), [system, info]);
  const keyOf = (stop: string) => groups.get(stationOf(system, stop));
  const names = useMemo(() => new Map(info.map((s) => [s.id, s.name])), [info]);
  const totals = useMemo(() => {
    const merged = new Map<string, { key: string; name: string; routes: string[] }>();
    for (const s of info) {
      const key = groups.get(s.id) ?? s.id;
      const m = merged.get(key) ?? { key, name: s.name, routes: [] };
      m.routes = [...new Set([...m.routes, ...s.routes])];
      merged.set(key, m);
    }
    return stationTotals(byRoute, [...merged.values()], (stop) => groups.get(stationOf(system, stop)));
  }, [byRoute, info, groups, system]);
  const key = picked ? keyOf(picked) : undefined;
  const station = totals.find((t) => t.key === key);
  const here = useMemo(() => stationLines(byRoute, (stop) => key !== undefined && groups.get(stationOf(system, stop)) === key), [byRoute, key, groups, system]);
  const name = (stop: string) => names.get(stationOf(system, stop)) ?? stop;
  const timed = (t?: { stop: string; median: number; n: number }) => (t ? <><span className={t.n < 5 ? "text-amber-300" : ""}>{clock(t.median)}</span> <span className="text-white/60">n {t.n}</span></> : <span className="text-white/40">–</span>);
  const none = totals.filter((t) => t.samples === 0).length, thin = totals.filter((t) => t.samples > 0 && t.thin > 0).length;
  const shown = all ? totals : totals.slice(0, 20);
  return (
    <Section title="Stations" id="stations" aside={station ? <button type="button" data-testid="station-clear" className={chip(false)} onClick={() => onPick(null)}>All stations</button> : undefined}>
      {q.isError ? <p role="alert" className="text-[13px] text-amber-300">Could not load.</p> : null}
      {station ? (
        <div data-testid="station-detail">
          <p className="mb-1 text-[14px] font-semibold">{station.name}</p>
          <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-1 text-[12px] tabular-nums">
            {here.map((l) => (
              <div key={`${l.route}|${l.dir}`} data-testid="station-line" className="col-span-2 grid grid-cols-subgrid items-start border-t border-white/5 pt-1">
                <Bullet route={l.route} colors={system === "subway" ? colors : undefined} />
                <div className="min-w-0">
                  <p className="truncate text-white/75">{l.next ? `to ${name(l.next.stop)}` : l.prev ? `from ${name(l.prev.stop)}, last stop` : "dwell only"}</p>
                  <p className="flex flex-wrap gap-x-3">
                    <span>in {timed(l.prev)}</span>
                    <span>dwell {timed(l.dwell ? { stop: l.stop, ...l.dwell } : undefined)}</span>
                    <span>out {timed(l.next)}</span>
                  </p>
                </div>
              </div>
            ))}
          </div>
          {data && !here.length ? <p className="text-[13px] text-white/70">No learned times here.</p> : null}
        </div>
      ) : (
        <>
          <p data-testid="station-total" className="mb-1 text-[12px] tabular-nums text-white/80">{totals.length} {system === "subway" ? "stations" : `stops on ${route ?? ""}`} · {none} with no data · {thin} with a line under 5 samples · least first</p>
          <ul className="max-h-[22rem] overflow-y-auto pr-1">
            {shown.map((t) => (
              <li key={t.key}>
                <button type="button" data-testid="station-row" onClick={() => onPick(t.key)}
                  className="grid min-h-8 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md border-t border-white/5 px-1 text-left text-[12px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400">
                  <span className="truncate">{t.name}{system === "subway" ? <span className="ml-1 text-white/55">{t.routes.join(" ")}</span> : null}</span>
                  <span className={`whitespace-nowrap tabular-nums ${t.samples === 0 ? "text-rose-300" : t.thin ? "text-amber-300" : "text-white/85"}`}>{t.samples === 0 ? "no data" : `${t.lines} lines · ${t.thin} thin · ${short(t.samples)}`}</span>
                </button>
              </li>
            ))}
          </ul>
          {totals.length > 20 ? <button type="button" data-testid="station-all" className={`${chip(false)} mt-1`} onClick={() => setAll(!all)}>{all ? "Fewest 20" : `All ${totals.length}`}</button> : null}
        </>
      )}
      <Source url={path} at={q.dataUpdatedAt || undefined} note={`${cell ? "" : "now · "}in = from the previous stop · out = to the next${system === "subway" ? " · same name within 400 m is one station" : ""}`} />
    </Section>
  );
}

export default function TrackerHealthPage() {
  // The static chat bar from index.html belongs to the map screen.
  useEffect(() => { removeShell(); }, []);
  const [params, setParams] = useSearchParams();
  const system: System = params.get("system") === "bus" ? "bus" : "subway";
  const [sort, setSort] = useState<"samples" | "coverage">("samples");
  const [cell, setCell] = useState<Cell>(null);
  const [all, setAll] = useState(false);
  const [station, setStation] = useState<string | null>(null);
  const url = "/api/transit-health/coverage";
  const cov = useQuery({ queryKey: ["tracker-health", "coverage"], queryFn: () => getJson<Coverage>(API + url), staleTime: 5 * 60_000, retry: 1 });
  const statics = useQuery({ queryKey: ["transit", "static", "subway"], queryFn: () => getJson<SubwayStatic>("/transit/subway.json"), staleTime: Infinity, retry: 0 }).data;
  const rows = cov.data?.rows ?? NO_ROWS;
  const bands = cov.data?.bands ?? NO_BANDS;
  const totals = useMemo(() => routeTotals(rows, system, cell, sort), [rows, system, cell, sort]);
  const route = params.get("route") && totals.some((t) => t.route === params.get("route")) ? params.get("route")! : totals[0]?.route;
  const set = (next: Record<string, string>) => setParams({ system, ...(route ? { route } : {}), ...next }, { replace: true });
  const cells = useMemo(() => grid(rows, system, bands, undefined), [rows, system, bands]);
  const routeCells = useMemo(() => (route ? grid(rows, system, bands, route) : []), [rows, system, bands, route]);
  const maxSeg = Math.max(1, ...totals.map((t) => t.segments)), maxSamples = Math.max(1, ...totals.map((t) => t.samples));
  const sum = totals.reduce((a, t) => ({ segments: a.segments + t.segments, solid: a.solid + t.solid, samples: a.samples + t.samples }), { segments: 0, solid: 0, samples: 0 });
  const shown = all ? totals : totals.slice(0, 30);
  const stationNames = useMemo(() => new Map((statics?.stations.features ?? []).map((f) => [f.properties.id, f.properties.name])), [statics]);
  const stopName = (stop: string) => (system === "subway" ? stationNames.get(stationOf(system, stop)) ?? stop : `stop ${stop}`);
  const now = nyHourOfWeek(new Date());
  const unit = system === "subway" ? "observations" : "run medians";
  const cellName = cell ? `${SCHEDULES.find(([s]) => s === cell.sched)?.[1]} ${bandLabel(bands.find(([b]) => b === cell.band) ?? [cell.band, cell.band])}` : "All week";
  const note = `${cell ? `sched ${cell.sched}, band ${cell.band}` : "all 18 schedule × band cells"}${cov.data?.refreshedAt ? ` · built ${time(Date.parse(cov.data.refreshedAt))}` : ""}`;

  const gridView = (data: typeof cells, id: string, title: string) => (
    <div data-testid={id}>
      <h3 className="mb-1 text-[12px] font-semibold text-white/70">{title}</h3>
      <div className="grid gap-1" style={{ gridTemplateColumns: `2.9rem repeat(${Math.max(1, bands.length)}, minmax(0, 1fr))` }}>
        <span />
        {bands.map((b) => <span key={b[0]} className="truncate text-center text-[10px] tabular-nums text-white/60">{bandLabel(b)}</span>)}
        {SCHEDULES.map(([sched, label]) => [
          <span key={`l${sched}`} className="self-center text-[11px] text-white/70">{label}</span>,
          ...data.filter((c) => c.sched === sched).map((c) => {
            const on = cell?.sched === c.sched && cell.band === c.band;
            const isNow = schedOf(now.dow) === c.sched && bands.some(([a, b]) => a === c.band && now.hour >= a && now.hour <= b);
            return (
              <button key={`${c.sched}-${c.band}`} type="button" data-testid="grid-cell" aria-pressed={on}
                aria-label={`${label} ${c.band}h: ${percent(c.share)} of ${c.segments} stretches with 5 or more samples, ${c.samples} samples`}
                onClick={() => setCell(on ? null : { sched: c.sched, band: c.band })}
                className={`flex min-h-10 flex-col items-center justify-center rounded-md px-0.5 text-[11px] leading-tight tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${on ? "ring-2 ring-white" : isNow ? "ring-1 ring-sky-300" : ""}`}
                style={{ background: c.segments ? `rgba(56,189,248,${0.12 + 0.78 * c.share})` : "rgba(255,255,255,0.05)", color: c.share > 0.55 ? "#04121f" : "#fff" }}>
                <span className="font-bold">{c.segments ? percent(c.share) : "–"}</span>
                <span className="opacity-80">{short(c.samples)}</span>
              </button>
            );
          }),
        ])}
      </div>
    </div>
  );

  return (
    <main data-testid="tracker-health" className="fixed inset-0 overflow-y-auto overflow-x-hidden bg-[#0b1220] text-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-3 pb-10 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-5">
        <header className="flex flex-wrap items-center gap-2">
          <Link to="/" data-testid="tracker-health-back" aria-label="Back to the map" className="grid h-9 w-9 place-items-center rounded-full bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"><ArrowLeft size={18} aria-hidden /></Link>
          <h1 className="mr-auto text-lg font-bold">Tracker health</h1>
          <div role="tablist" aria-label="System" className="flex gap-1">
            {SYSTEMS.map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={system === id} data-testid={`system-${id}`} className={chip(system === id)} onClick={() => { setAll(false); setStation(null); setParams({ system: id }, { replace: true }); }}>{label}</button>)}
          </div>
        </header>

        {cov.isError ? <p role="alert" className="text-[13px] text-amber-300">Could not load coverage.</p> : null}
        {cov.data && !cov.data.ready ? <p data-testid="coverage-waiting" className="rounded-lg bg-amber-400/15 px-3 py-2 text-[13px] text-amber-200">Coverage is not built yet.</p> : null}

        <div className="grid gap-3 lg:grid-cols-2">
          <Section title="Coverage" id="coverage" aside={
            <div className="flex flex-wrap items-center gap-1">
              <button type="button" data-testid="sort-samples" aria-pressed={sort === "samples"} className={chip(sort === "samples")} onClick={() => setSort("samples")}>Samples</button>
              <button type="button" data-testid="sort-coverage" aria-pressed={sort === "coverage"} className={chip(sort === "coverage")} onClick={() => setSort("coverage")}>Coverage</button>
            </div>}>
            <p data-testid="coverage-total" className="mb-1 text-[12px] tabular-nums text-white/80">
              {cellName} · {totals.length} {system === "subway" ? "lines" : "routes"} · {short(sum.solid)} of {short(sum.segments)} stretches with 5+ · {short(sum.samples)} {unit}
            </p>
            <p className="mb-1 flex flex-wrap gap-x-3 text-[11px] text-white/70">
              <span><span className="mr-1 inline-block h-2 w-3 rounded bg-sky-400" />5+ samples</span>
              <span><span className="mr-1 inline-block h-2 w-3 rounded bg-amber-400" />under 5</span>
              <span><span className="mr-1 inline-block h-1 w-3 rounded bg-white/60 align-middle" />samples</span>
            </p>
            <ul>
              {shown.map((t) => (
                <li key={t.route}>
                  <button type="button" data-testid="coverage-row" data-route={t.route} aria-pressed={route === t.route} onClick={() => set({ route: t.route })}
                    className={`grid min-h-8 w-full grid-cols-[2.8rem_minmax(0,1fr)_auto] items-center gap-2 rounded-md px-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${route === t.route ? "bg-white/10" : ""}`}>
                    <Bullet route={t.route} colors={system === "subway" ? statics?.routes : undefined} />
                    <span className="flex flex-col gap-0.5">
                      <span className="flex h-2.5 overflow-hidden rounded bg-white/5">
                        <span className="bg-sky-400" style={{ width: `${(t.solid / maxSeg) * 100}%` }} />
                        <span className="bg-amber-400" style={{ width: `${((t.segments - t.solid) / maxSeg) * 100}%` }} />
                      </span>
                      <span className="block h-1 rounded bg-white/60" style={{ width: `${Math.max(1, (t.samples / maxSamples) * 100)}%` }} />
                    </span>
                    <span className="whitespace-nowrap text-right text-[12px] tabular-nums text-white/85">{t.solid}/{t.segments} · {short(t.samples)}</span>
                  </button>
                </li>
              ))}
            </ul>
            {totals.length > 30 ? <button type="button" data-testid="coverage-all" className={`${chip(false)} mt-1`} onClick={() => setAll(!all)}>{all ? "Top 30" : `All ${totals.length}`}</button> : null}
            <Source url={url} at={cov.dataUpdatedAt || undefined} note={note} />
          </Section>

          <div className="flex flex-col gap-3">
            <Section title="By time of the week" id="time-of-week" aside={cell ? <button type="button" data-testid="cell-clear" className={chip(false)} onClick={() => setCell(null)}>All week</button> : undefined}>
              <p className="mb-2 text-[11px] text-white/70">Share of stretches with 5+ samples · {unit}</p>
              <div className="flex flex-col gap-3">
                {gridView(cells, "grid-system", system === "subway" ? "All subway lines" : "All bus routes")}
                {route ? gridView(routeCells, "grid-route", route) : null}
              </div>
              <Source url={url} at={cov.dataUpdatedAt || undefined} note="bands as the server pools them" />
              <div className="mt-3"><HoursStrip system={system} route={route} bands={bands} /></div>
            </Section>
            {route ? <LineDetail key={`${system}-${route}`} system={system} route={route} cell={cell} colors={statics?.routes} statics={statics} onStation={setStation} /> : null}
            <StationPanel key={`st-${system}-${system === "bus" ? route : ""}`} system={system} route={route} cell={cell} statics={statics} colors={statics?.routes} picked={station} onPick={setStation} />
          </div>
        </div>

        {system === "bus" && route ? <MtaCompare key={`mta-${route}`} route={route} cell={cell} /> : null}
        <AccuracyPanel system={system} stopName={stopName} />
      </div>
    </main>
  );
}
