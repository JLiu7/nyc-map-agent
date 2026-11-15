/**
 * Live closures and elevators for the trip planner (#133): the MTA's station notices that close an
 * entrance, its elevator equipment list, current and planned elevator outages, and the city's
 * street centrelines (to tell which entrance a notice's street names). The rules that read them are
 * pure, in src/lib/transit/stationAccess.ts. Every feed here is optional: when one fails, the trip
 * is planned as it was before.
 */
import { z } from "zod";
import type { LngLatTuple, Trip } from "../../../src/features/agent/schema";
import { sameStation } from "../../../src/lib/transit/serviceChanges";
import { entranceNotices, stepFreeAt, type EntranceNotice, type OutageSpan, type StepFree, type StreetLine, type Unit } from "../../../src/lib/transit/stationAccess";
import { cached } from "../../lib/ttlCache";
import { activeAt, subwayAlertEntities } from "./services";
import { distM, openDataEntrances, type Station, type StationEntrances } from "./transit";

const UA = { "User-Agent": "nyc-map-agent (github.com/Pukujan-lab/nyc-map-agent)" };
async function getJson(url: string, timeoutMs = 10000): Promise<unknown> {
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`${new URL(url).host} returned ${res.status}`);
  return res.json();
}
async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  try { return await p; } catch { return fallback; }
}

const ENE = "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2F";

/* ---------- the MTA's elevator and escalator list ---------- */
const unitRow = z.object({
  equipmentno: z.string(), equipmenttype: z.string(), station: z.string(), serving: z.string(),
  ADA: z.string().optional(), isactive: z.string().optional(), redundant: z.union([z.number(), z.string()]).optional(),
  alternativeroute: z.string().optional(), elevatorsgtfsstopid: z.string().optional(),
});
export function toUnits(rows: unknown): Unit[] {
  return z.array(unitRow).parse(rows).filter((r) => r.isactive !== "N" && (r.equipmenttype === "EL" || r.equipmenttype === "ES")).map((r) => ({
    id: r.equipmentno, type: r.equipmenttype as "EL" | "ES", station: r.station, serving: r.serving,
    stops: (r.elevatorsgtfsstopid ?? "").split(/[\s/,;]+/).filter(Boolean),
    ada: r.ADA === "Y", redundant: Number(r.redundant ?? 0) === 1, alternative: r.alternativeroute || undefined,
  }));
}
export const equipmentUnits = () => cached("mta-equipment", 6 * 3600_000, async () => toUnits(await getJson(`${ENE}nyct_ene_equipments.json`, 15000)));

/* ---------- outages now and planned ---------- */
const outageRow = z.object({
  station: z.string(), equipment: z.string(), equipmenttype: z.string(), serving: z.string(), ADA: z.string().optional(),
  outagedate: z.string(), estimatedreturntoservice: z.string(), reason: z.string(), isupcomingoutage: z.string().optional(),
});
/** "12/16/2026 10:00:00 PM", New York time, to epoch seconds; null when unreadable. */
export function nyFeedTime(s: string): number | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/i.exec(s.trim());
  if (!m) return null;
  let h = Number(m[4]) % 12;
  if (/pm/i.test(m[7])) h += 12;
  const guess = Date.UTC(Number(m[3]), Number(m[1]) - 1, Number(m[2]), h, Number(m[5]), Number(m[6] ?? 0));
  const off = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", timeZoneName: "longOffset" }).formatToParts(new Date(guess)).find((p) => p.type === "timeZoneName")?.value ?? "GMT-05:00";
  const o = /GMT([+-])(\d\d):(\d\d)/.exec(off);
  const mins = o ? (o[1] === "-" ? -1 : 1) * (Number(o[2]) * 60 + Number(o[3])) : -300;
  return Math.floor((guess - mins * 60_000) / 1000);
}
export function toSpans(rows: unknown): OutageSpan[] {
  return z.array(outageRow).parse(rows).flatMap((r) => {
    const type = r.equipmenttype === "EL" ? "EL" : r.equipmenttype === "ES" ? "ES" : null;
    if (!type) return [];
    // An outage happening now counts from the start of time: its listed start can be a guess.
    const start = r.isupcomingoutage === "Y" ? nyFeedTime(r.outagedate) : 0;
    if (start === null) return [];
    return [{ unit: r.equipment, station: r.station, type, serving: r.serving, ada: r.ADA === "Y", start, end: nyFeedTime(r.estimatedreturntoservice), reason: r.reason, back: r.estimatedreturntoservice }];
  });
}
/** Outages in force now and planned ones (the upcoming list), so a trip planned for later sees the elevators out then. */
export const outageSpans = () => cached("mta-outage-spans", 5 * 60_000, async () => {
  const [now, upcoming] = await Promise.all([getJson(`${ENE}nyct_ene.json`).then(toSpans), safe(getJson(`${ENE}nyct_ene_upcoming.json`).then(toSpans), [])]);
  const seen = new Set(now.map((o) => `${o.unit}|${o.start}`));
  return [...now, ...upcoming.filter((o) => !seen.has(`${o.unit}|${o.start}`))];
});

/* ---------- station notices that close an entrance ---------- */
const text = z.object({ translation: z.array(z.object({ text: z.string(), language: z.string().optional() })) }).optional();
const noticeEntity = z.object({
  id: z.string().default(""),
  alert: z.object({
    active_period: z.array(z.object({ start: z.number().optional(), end: z.number().optional() })).default([]),
    informed_entity: z.array(z.object({ stop_id: z.string().optional() })).default([]),
    header_text: text,
  }),
});
const english = (t: z.infer<typeof text>) => t?.translation.find((x) => !x.language || x.language === "en")?.text ?? "";
/** Every notice in the subway alerts feed, in force at `at`, that closes or narrows an entrance. */
export function noticesIn(entities: unknown[], at: number): EntranceNotice[] {
  return entities.flatMap((e) => {
    const p = noticeEntity.safeParse(e);
    if (!p.success || !activeAt(p.data.alert.active_period, at)) return [];
    const stopIds = [...new Set(p.data.alert.informed_entity.map((x) => x.stop_id).filter((s): s is string => Boolean(s)).map((s) => s.replace(/[NS]$/, "")))];
    return stopIds.length ? entranceNotices({ id: p.data.id, text: english(p.data.alert.header_text), stopIds }) : [];
  });
}
export const stationNoticesAt = async (at: number) => noticesIn(await subwayAlertEntities(), at);

/* ---------- the city's street centrelines near a station ---------- */
const centreRow = z.object({ full_street_name: z.string().optional(), stname_label: z.string().optional(), the_geom: z.object({ type: z.string(), coordinates: z.array(z.unknown()) }).optional() });
export function toStreetLines(rows: unknown): StreetLine[] {
  return z.array(centreRow).parse(rows).flatMap((r) => {
    const name = r.full_street_name ?? r.stname_label;
    if (!name || !r.the_geom) return [];
    const lines = (r.the_geom.type === "MultiLineString" ? r.the_geom.coordinates : [r.the_geom.coordinates]) as Array<Array<[number, number]>>;
    return lines.filter((l) => Array.isArray(l) && l.length >= 2).map((line) => ({ name, line }));
  });
}
/** NYC street centreline (data.cityofnewyork.us inkn-q76z) within 250 m, cached for a day. */
export function streetsNear([lon, lat]: LngLatTuple): Promise<StreetLine[]> {
  const q = new URLSearchParams({ $where: `within_circle(the_geom,${lat.toFixed(5)},${lon.toFixed(5)},250)`, $select: "full_street_name,the_geom", $limit: "400" });
  return cached(`centreline:${lon.toFixed(4)},${lat.toFixed(4)}`, 24 * 3600_000, async () => toStreetLines(await getJson(`https://data.cityofnewyork.us/resource/inkn-q76z.json?${q}`, 10000)));
}

/* ---------- per station ---------- */
/** GTFS stop ids of a station's whole complex: a notice may be filed under any of them. */
export const complexStops = (st: Station, all: Station[]) => [...new Set([st.gtfsId, ...all.filter((s) => s.complexId === st.complexId).map((s) => s.gtfsId)].filter((s): s is string => Boolean(s)))];

/** Everything the planner reads about closures and elevators, loaded once per trip. */
export interface AccessData {
  stations: Station[];
  units: Unit[];
  outages: OutageSpan[];
  notices: EntranceNotice[];
  /** Epoch seconds the trip leaves. */
  at: number;
}
export async function accessData(at: number, src: StationEntrances = openDataEntrances): Promise<AccessData> {
  const [stations, units, outages, notices] = await Promise.all([
    safe(src.stations(), [] as Station[]), safe(equipmentUnits(), [] as Unit[]), safe(outageSpans(), [] as OutageSpan[]), safe(stationNoticesAt(at), [] as EntranceNotice[]),
  ]);
  return { stations, units, outages, notices, at };
}
export function noticesFor(st: Station, d: AccessData): EntranceNotice[] {
  const stops = new Set(complexStops(st, d.stations));
  return d.notices.filter((n) => n.stopIds.some((s) => stops.has(s)));
}
export function stepFreeFor(st: Station, d: AccessData): StepFree {
  return stepFreeAt({ name: st.name, stopIds: st.gtfsId ? [st.gtfsId] : [], ada: st.ada, adaNotes: st.adaNotes }, d.units, d.outages, d.at);
}

/** "SI" in the alert and OTP feeds is "SIR" in the station list; express "6X" rides the 6's stations. */
const serves = (s: Station, route: string) => { const r = route.replace(/X$/, ""); return s.routes.includes(r) || (r === "SI" && s.routes.includes("SIR")); };
/** The station on a route at a ride's end: by name when given, else the nearest within 400 m. */
export function stationOn(stations: Station[], route: string, at: LngLatTuple, name?: string): Station | undefined {
  const on = stations.filter((s) => serves(s, route));
  const named = name ? on.filter((s) => sameStation(name, s.name)).sort((a, b) => distM(a.at, at) - distM(b.at, at))[0] : undefined;
  if (named && distM(named.at, at) < 800) return named;
  const near = on.reduce<Station | undefined>((b, s) => (!b || distM(s.at, at) < distM(b.at, at) ? s : b), undefined);
  return near && distM(near.at, at) < 400 ? near : undefined;
}

export interface RideEnds { route: string; from: LngLatTuple; to: LngLatTuple; fromName?: string; toName?: string }
/**
 * Where a rider who uses only elevators cannot get on or off on this trip, one line each, worded
 * for the rider and blocking (#133). Rides other than the subway are left alone: buses kneel and
 * the planner's wheelchair routing covers the rest.
 */
export function stepFreeImpacts(rides: RideEnds[], d: AccessData): Trip["impacts"] {
  const out: Trip["impacts"] = [];
  for (const r of rides) {
    for (const [at, name] of [[r.from, r.fromName], [r.to, r.toName]] as const) {
      const st = stationOn(d.stations, r.route, at, name);
      if (!st) continue;
      const s = stepFreeFor(st, d);
      if (s.ok) continue;
      const text = `Not step-free: ${s.why}${s.alternative ? ` The MTA suggests: ${s.alternative}` : ""}`;
      if (!out.some((o) => o.text === text)) out.push({ route: r.route.replace(/X$/, ""), text, blocks: true });
    }
  }
  return out;
}
