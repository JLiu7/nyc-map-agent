/** Trip search: OpenTripPlanner (or MOTIS, TRIP_PLANNER=motis) first (top 3, all modes), built-in subway router if it is down. */
import type { LngLatTuple, Trip, TripCore } from "../../../src/features/agent/schema";
import type { ServiceChange } from "../../../src/lib/transit/serviceChanges";
import { hazardsAt, weatherAt } from "./services";
import { httpMotis } from "./motis";
import { httpOtp, itineraryToTrip, rankItineraries, type OtpClient, type TripPrefer } from "./otp";
import { buildTrip, changesAt, nyLocalToDate, safe, skippedStops, toNyLocal, tripImpacts, type TripDeps } from "./trip";
import { openDataEntrances, type Station } from "./transit";

export interface PlanDeps extends TripDeps { otp?: OtpClient | null }
type Place = { label: string; at: LngLatTuple };

const blocked = (t: TripCore) => t.impacts.some((i) => i.blocks);

export async function planTrip(origin: Place, destination: Place, local: string, arriveBy: boolean, deps: PlanDeps = {}, prefer: TripPrefer = "fastest"): Promise<Trip> {
  const otp = deps.otp === undefined ? (process.env.TRIP_PLANNER === "motis" ? httpMotis : httpOtp) : deps.otp;
  const its = otp ? await safe(otp.plan(origin.at, destination.at, local, arriveBy, prefer), []) : [];
  const best = rankItineraries(its, 3, arriveBy, prefer);
  // No ferry goes there: the fastest way instead, rather than the subway-only fallback router.
  const top = best.length || prefer !== "ferry" ? best : rankItineraries(its, 3, arriveBy);
  if (!top.length) {
    // Fallback router only knows depart-at; approximate arrive-by with a 75 min lead.
    const dep = arriveBy ? toNyLocal(new Date(nyLocalToDate(local).getTime() - 75 * 60_000)) : local;
    const t = await buildTrip(origin, destination, dep, deps);
    const changes = deps.changes ?? await changesAt(t.departIso);
    t.impacts = changes.length ? tripImpacts(t, changes, await safe((deps.entrances ?? openDataEntrances).stations(), [] as Station[])) : [];
    return t;
  }
  const trips = await Promise.all(top.map((i) => itineraryToTrip(i, origin, destination, deps.entrances)));
  // The changes in effect when the trip leaves ("this weekend" is not now), checked against every station it uses.
  const changes: ServiceChange[] = deps.changes ?? await changesAt(trips[0].departIso);
  const stations = changes.length ? await safe((deps.entrances ?? openDataEntrances).stations(), [] as Station[]) : [];
  for (const t of trips) t.impacts = tripImpacts(t, changes, stations);
  // A line with changes that day: offer the bus too (owner, 2026-10-27: from Elmhurst the bus is often the better way, above all for older riders).
  const hit = trips.some((t) => t.impacts.length);
  const bus = hit && otp && prefer !== "bus" && !trips.some((t) => t.legs.every((l) => l.kind !== "ride" || l.mode === "bus"))
    ? rankItineraries(await safe(otp.plan(origin.at, destination.at, local, arriveBy, "bus"), []), 1, arriveBy, "bus")[0]
    : undefined;
  if (bus) trips.push(await itineraryToTrip(bus, origin, destination, deps.entrances));
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
