/** Trip search: OpenTripPlanner (or MOTIS, TRIP_PLANNER=motis) first (top 3, all modes), built-in subway router if it is down. */
import type { LngLatTuple, Trip, TripCore } from "../../../src/features/agent/schema";
import type { ServiceChange } from "../../../src/lib/transit/serviceChanges";
import { hazardsAt, weatherAt } from "./services";
import { httpMotis } from "./motis";
import { bullet, httpOtp, itineraryToTrip, rankItineraries, type OtpClient, type OtpItinerary, type TripPrefer } from "./otp";
import { accessData, stepFreeImpacts, type RideEnds } from "./access";
import { buildTrip, changesAt, nyLocalToDate, safe, skippedStops, toNyLocal, tripImpacts, type TripDeps } from "./trip";
import { openDataEntrances, type Station } from "./transit";

export interface PlanDeps extends TripDeps { otp?: OtpClient | null }
type Place = { label: string; at: LngLatTuple };

const blocked = (t: TripCore) => t.impacts.some((i) => i.blocks);

/** A plan's subway rides, by their ends, for the step-free check. */
const itRides = (i: OtpItinerary): RideEnds[] => i.legs.filter((l) => l.route && l.mode === "SUBWAY").map((l) => ({ route: bullet(l), from: [l.from.lon, l.from.lat], to: [l.to.lon, l.to.lat], fromName: l.from.stop?.name ?? l.from.name ?? undefined, toName: l.to.stop?.name ?? l.to.name ?? undefined }));
const tripRides = (t: TripCore): RideEnds[] => t.legs.flatMap((l) => (l.kind === "ride" && l.mode === "subway" ? [{ route: l.route, from: l.coords[0], to: l.coords[l.coords.length - 1], fromName: l.fromStop, toName: l.toStop }] : []));

/** What the rider needs beyond the fastest way. */
export interface PlanOpts {
  /** Elevators only, from Settings or said in the chat (#133). */
  stepFree?: boolean;
}

export async function planTrip(origin: Place, destination: Place, local: string, arriveBy: boolean, deps: PlanDeps = {}, prefer: TripPrefer = "fastest", opts: PlanOpts = {}): Promise<Trip> {
  const otp = deps.otp === undefined ? (process.env.TRIP_PLANNER === "motis" ? httpMotis : httpOtp) : deps.otp;
  const stepFree = !!opts.stepFree;
  const [its, access] = await Promise.all([
    otp ? safe(otp.plan(origin.at, destination.at, local, arriveBy, prefer, stepFree), []) : Promise.resolve([]),
    deps.access === undefined ? accessData(Math.floor(nyLocalToDate(local).getTime() / 1000), deps.entrances ?? openDataEntrances) : Promise.resolve(deps.access),
  ]);
  // Elevators only: plans through stations with a working elevator first; when none has one, the rest, which say why.
  const reachable = stepFree && access ? its.filter((i) => !stepFreeImpacts(itRides(i), access).length) : its;
  const pool = reachable.length ? reachable : its;
  const best = rankItineraries(pool, 3, arriveBy, prefer);
  // No ferry goes there: the fastest way instead, rather than the subway-only fallback router.
  const top = best.length || prefer !== "ferry" ? best : rankItineraries(pool, 3, arriveBy);
  const sfImpacts = (t: TripCore) => (stepFree && access ? stepFreeImpacts(tripRides(t), access) : []);
  if (!top.length) {
    // Fallback router only knows depart-at; approximate arrive-by with a 75 min lead.
    const dep = arriveBy ? toNyLocal(new Date(nyLocalToDate(local).getTime() - 75 * 60_000)) : local;
    const t = await buildTrip(origin, destination, dep, { ...deps, access, stepFree });
    const changes = deps.changes ?? await changesAt(t.departIso);
    t.impacts = [...(changes.length ? tripImpacts(t, changes, await safe((deps.entrances ?? openDataEntrances).stations(), [] as Station[])) : []), ...sfImpacts(t)];
    return t;
  }
  const trips = await Promise.all(top.map((i) => itineraryToTrip(i, origin, destination, deps.entrances, { data: access, stepFree })));
  // The changes in effect when the trip leaves ("this weekend" is not now), checked against every station it uses.
  const changes: ServiceChange[] = deps.changes ?? await changesAt(trips[0].departIso);
  const stations = changes.length ? await safe((deps.entrances ?? openDataEntrances).stations(), [] as Station[]) : [];
  for (const t of trips) t.impacts = [...tripImpacts(t, changes, stations), ...sfImpacts(t)];
  // A line with changes that day: offer the bus too (owner, 2026-10-27: from Elmhurst the bus is often the better way, above all for older riders).
  const hit = trips.some((t) => t.impacts.length);
  const bus = hit && otp && prefer !== "bus" && !trips.some((t) => t.legs.every((l) => l.kind !== "ride" || l.mode === "bus"))
    ? rankItineraries(await safe(otp.plan(origin.at, destination.at, local, arriveBy, "bus", stepFree), []), 1, arriveBy, "bus")[0]
    : undefined;
  if (bus) trips.push(await itineraryToTrip(bus, origin, destination, deps.entrances, { data: access, stepFree }));
  // A trip that can't be made as planned goes last; it stays listed so the rider sees why.
  const ranked = [...trips.filter((t) => !blocked(t)), ...trips.filter(blocked)];
  // The plan moved off a line because of that day's changes: say why on the plan itself.
  if (!blocked(ranked[0])) {
    for (const i of ranked.filter(blocked).flatMap((t) => t.impacts.filter((x) => x.blocks))) {
      const why = `Why not the ${i.route}: ${i.text}`;
      if (!ranked[0].impacts.some((x) => x.text === why)) ranked[0].impacts.push({ route: i.route, text: why, blocks: false });
    }
  }
  const [weather, hazards] = await Promise.all([
    safe(weatherAt(origin.at, ranked[0].departIso), null),
    safe(hazardsAt(origin.at), [] as string[]),
  ]);
  for (const t of ranked) {
    t.weather = weather; t.hazards = hazards;
    t.skips = skippedStops(changes, stations, t.routes);
  }
  return { ...ranked[0], alternatives: ranked.slice(1) };
}
