/**
 * The where-am-I helper's guess (#131): where the person probably is, from what
 * the app last knew, and how good the phone's network and position look right
 * now. Pure functions; LostHelper.tsx feeds them and lostText.ts words them.
 */
import type { ActiveTrip } from "@/lib/transit/activeTrip";
import type { UndergroundNow } from "@/lib/underground/whereNow";
import type { LostContext, NotedTrain } from "@/lib/underground/lostHelper";
import { metres, type Pt } from "@/lib/map/mapRead";

/** Worse than this and the position cannot place you in a station (big stations span ~200 m). */
export const WEAK_FIX_M = 100;
/** Older than this and the fix is the last place the phone knew, not where you are. */
export const OLD_FIX_S = 120;
/** A followed train older than this is not where you are any more. */
const TRAIN_FRESH_MS = 20 * 60_000;
/** Within this of a station's centre you are at it. */
const AT_STATION_M = 250;

/** The Network Information API (Chromium only; Safari has none). */
export interface Connection { effectiveType?: string; downlink?: number; saveData?: boolean }
export interface Fix { at: Pt; accuracy: number | null; fixAt: number | null }

export type Net = "offline" | "weak" | "ok";
export type Gps = "none" | "weak" | "old" | "ok";
export interface Signal { net: Net; gps: Gps; accuracyM: number | null; ageMin: number | null }

export function readSignal(p: { online: boolean; connection?: Connection | null; fix: Fix | null; now: number }): Signal {
  const c = p.connection;
  const slow = !!c && ((c.effectiveType !== undefined && /(^|-)2g$/.test(c.effectiveType)) || (typeof c.downlink === "number" && c.downlink > 0 && c.downlink < 0.4));
  const net: Net = !p.online ? "offline" : slow ? "weak" : "ok";
  const f = p.fix;
  const ageS = f?.fixAt ? Math.max(0, (p.now - f.fixAt) / 1000) : null;
  const accuracyM = f?.accuracy ?? null;
  const gps: Gps = !f ? "none" : accuracyM !== null && accuracyM > WEAK_FIX_M ? "weak" : ageS !== null && ageS > OLD_FIX_S ? "old" : "ok";
  return { net, gps, accuracyM: accuracyM === null ? null : Math.round(accuracyM), ageMin: ageS === null ? null : Math.round(ageS / 60) };
}

/** Whether the helper should say the signal is poor. */
export const signalPoor = (s: Signal) => s.net !== "ok" || s.gps !== "ok";

/** The five parts of a train, back to front, as the station walk names them (stationWalks.ts trainPart). */
export type Part = "front" | "frontMid" | "middle" | "backMid" | "back";
export function partOf(words: string | null | undefined): Part | null {
  switch (words) {
    case "at the front": return "front";
    case "between the middle and the front": return "frontMid";
    case "in the middle": return "middle";
    case "between the middle and the back": return "backMid";
    case "at the back": return "back";
    default: return null;
  }
}

export interface Guess {
  /** What the guess rests on, best first. */
  from: "walk" | "gps" | "train" | "station" | "trip" | "lastFix" | null;
  /** at: in the station; off: just off the line's train there; riding: on the line toward `station`; waiting: at `station` for the line. */
  stage: "at" | "off" | "riding" | "waiting" | "walking" | null;
  station: string | null;
  stationId: string | null;
  line: string | null;
  /** Which part of the train stops by the exit's stairs. */
  part: Part | null;
  exit: string | null;
  landmark: string | null;
  /** Minutes since what the guess rests on, when it is a past fix. */
  ageMin: number | null;
}

const NONE: Guess = { from: null, stage: null, station: null, stationId: null, line: null, part: null, exit: null, landmark: null, ageMin: null };

interface StationRef { id: string; name: string; at: Pt }

/** The trip's last ride and the stations around it, read from the published trip's legs. */
function tripRide(trip: ActiveTrip | null) {
  if (!trip) return null;
  const i = trip.legs.map((l) => l.kind).lastIndexOf("ride");
  if (i < 0) return null;
  const ride = trip.legs[i];
  const exitLeg = trip.legs.slice(i + 1).find((l) => l.station);
  const enterLeg = [...trip.legs.slice(0, i)].reverse().find((l) => l.kind === "enter" && l.station);
  const st = (s: { id: string; name: string; lon: number; lat: number } | undefined): StationRef | null => (s ? { id: s.id, name: s.name, at: [s.lon, s.lat] } : null);
  return { line: ride.route ?? null, off: st(exitLeg?.station), on: st(enterLeg?.station), exit: exitLeg?.portal?.label ?? null };
}

export function bestGuess(p: {
  ctx: LostContext;
  trip: ActiveTrip | null;
  train: NotedTrain | null;
  under: UndergroundNow | null;
  fix: Fix | null;
  signal: Signal;
  now: number;
  nearest: (at: Pt) => (StationRef & { d: number }) | null;
  partFor: (stationId: string | undefined) => string | null;
}): Guess {
  const ride = tripRide(p.trip);
  const withTrip = (g: Guess): Guess => {
    // The trip's line, exit and train part apply only at the station the trip gets off at.
    if (!ride?.off || (g.station && g.station !== ride.off.name)) return g;
    return { ...g, line: g.line ?? ride.line, exit: g.exit ?? ride.exit, part: g.part ?? partOf(p.partFor(ride.off.id)), stationId: g.stationId ?? ride.off.id };
  };

  if (p.ctx.from === "walk") return { ...NONE, from: "walk", stage: "walking", station: p.ctx.walkingTo, landmark: p.ctx.landmark };

  // A good, fresh fix wins: it says which station you are in.
  if (p.fix && p.signal.gps === "ok") {
    const st = p.nearest(p.fix.at);
    if (st && st.d <= AT_STATION_M) {
      if (ride?.on && st.id === ride.on.id) return { ...NONE, from: "gps", stage: "waiting", station: st.name, stationId: st.id, line: ride.line };
      return withTrip({ ...NONE, from: "gps", stage: ride?.off?.id === st.id ? "off" : "at", station: st.name, stationId: st.id });
    }
  }

  const train = p.ctx.from === "train" ? { line: p.ctx.line, nextStop: p.ctx.nextStop } : p.train && p.now - p.train.at < TRAIN_FRESH_MS ? p.train : null;
  if (train) return withTrip({ ...NONE, from: "train", stage: "riding", line: train.line, station: train.nextStop, stationId: p.ctx.from === "train" ? p.ctx.stationId ?? null : null });

  if (p.under) {
    const g: Guess = { ...NONE, from: "station", stage: p.under.stage === "riding" ? "riding" : "at", station: p.under.station, exit: p.under.exit };
    return withTrip(g);
  }

  if (ride?.off) {
    // A fix by the boarding station, however old, says you have not ridden yet.
    if (ride.on && p.fix && metres(p.fix.at, ride.on.at) <= AT_STATION_M) return { ...NONE, from: "trip", stage: "waiting", station: ride.on.name, stationId: ride.on.id, line: ride.line };
    return withTrip({ ...NONE, from: "trip", stage: "off", station: ride.off.name, stationId: ride.off.id });
  }

  // A trip with no subway ride to get off (a bus while the line is out, or only a walk) still says where it
  // ends. When that is a station, someone looking for its exit is most likely there.
  if (p.trip && /\bstation$/i.test(p.trip.destination.label)) {
    const st = p.nearest(p.trip.destination.at);
    if (st && st.d <= AT_STATION_M) return { ...NONE, from: "trip", stage: "at", station: st.name, stationId: st.id };
  }

  if (p.fix) {
    const st = p.nearest(p.fix.at);
    if (st && st.d <= 400) return { ...NONE, from: "lastFix", stage: "at", station: st.name, stationId: st.id, ageMin: p.signal.ageMin };
  }
  return NONE;
}
