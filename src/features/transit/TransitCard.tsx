import "@/components/task-screens.css";
import { NoticeIcon, noticeKind } from "./noticeKind";
import { useFlag } from "@/lib/flags";
import { useMapState } from "@/lib/store/MapStateContext";
import { noteTrain, openLostHelper } from "@/lib/underground/lostHelper";
import { useT } from "@/lib/i18n/appLang";
import { formatStreetText } from "@/lib/streetName";
import { liveProgress } from "./monotonic";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Accessibility, ChevronDown, Crosshair, ScanEye, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { arrivalsAt, directionLabel, estimateTrain, minutesUntil, stationOf, SYSTEM_LABELS, type LiveSystem, type StaticSystem, type SystemId, type Vehicle } from "./model";
import { useAlerts, useBusRoute, useBusTrip, useNow, useStarred, useTransitData, type Outage, type TransitAlert } from "./hooks";
import { setFollowed, stopFollowing, useBoardedOnFoot, useFollowed } from "./follow";
import { useSharedLocation } from "@/lib/geo/sharedLocation";
import { getXray, setXray, useXray } from "./xray";
import { AlertRow, presentAlert, StationNotice } from "./AlertCard";
import { lineOf, setSelectedLine, useSelectedLine } from "@/lib/transit/selectedLine";
import { stationChanges } from "./alertFocus";
import { alertTimeLabel, classifyRouteAlerts, plainAlert, skipNamesFor, upcomingStops } from "./followInfo";
import { usePanel } from "@/lib/store/PanelContext";
import { FollowSheet } from "./FollowSheet";

type Data = Partial<Record<SystemId, { stat?: StaticSystem; live?: LiveSystem }>>;

/** MTA entrance types in plain words: "Easement - Street" is a way up through a building. */
const doorKind = (kind: string | undefined): string =>
  !kind ? "Entrance" : /easement - street/i.test(kind) ? "Through a building" : /passage/i.test(kind) ? "Passage" : kind;

export function RouteBullet({ system, route, data }: { system: SystemId | "bus"; route: string; data: Data }) {
  const info = system === "bus" ? undefined : data[system]?.stat?.routes[route];
  return (
    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold"
      style={{ background: info?.color ?? "#0039A6", color: info?.text ?? "#fff" }}>
      {system === "subway" ? (info?.short ?? route) : route.length > 4 ? (info?.short ?? route).split(" ")[0] : (info?.short ?? route)}
    </span>
  );
}

export const stopName = (data: Data, system: SystemId | "bus", stop?: string) => {
  if (!stop || system === "bus") return stop;
  const id = stationOf(system, stop);
  return data[system]?.stat?.stations.features.find((f) => f.properties.id === id)?.properties.name ?? stop;
};

const rowBtn = "mt-1 block w-full rounded-md border border-border bg-card px-2 py-1.5 text-left text-xs font-medium hover:border-[hsl(var(--acc))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Stations a skip covers, and the alert's time when it has one. */
function SkipPlaces({ alert, route }: { alert: TransitAlert | undefined; route: string }) {
  const names = skipNamesFor(alert, route);
  const time = alertTimeLabel(alert);
  return (
    <div data-testid="skip-places" className="mt-1 rounded-md bg-muted px-2 py-1.5 text-xs">
      <div className="font-semibold">Where this trip skips</div>
      {names.length ? <ul className="mt-1 list-disc pl-4">{names.map((n) => <li key={n}>{n}</li>)}</ul> : <p className="mt-1">This station.</p>}
      <p className="mt-1">{time ?? "No time given"}</p>
    </div>
  );
}

/** Map click on Skipped: every skip at that station, with places and time. */
export function SkipDetails({ stationId }: { stationId: string }) {
  const data = useTransitData(["subway"]);
  const alerts = useAlerts(true);
  const st = data.subway?.stat;
  const change = st ? stationChanges(alerts.data?.alerts ?? [], st).get(stationId) : undefined;
  const list = alerts.data?.alerts ?? [];
  if (!change?.skips.length) return <p className="text-sm text-muted-foreground">No skip is listed for this station right now.</p>;
  return (
    <div className="space-y-3 text-sm">
      {change.skips.map((k) => (
        <div key={`${k.alertId}|${k.route}`}>
          <div className="font-semibold">{k.label}</div>
          <SkipPlaces alert={list.find((a) => a.id === k.alertId)} route={k.route} />
        </div>
      ))}
    </div>
  );
}

/** Panel body for a station: next arrivals by line and direction, outages, planned work. */
export function StationDetails({ system, id }: { system: SystemId; id: string }) {
  const data = useTransitData([system]);
  const alerts = useAlerts(true).data;
  const now = useNow();
  const { isStarred, toggle } = useStarred();
  const starKey = `${system}:station:${id}`;
  const xray = useXray();
  // Leaving the station panel turns x-ray off.
  useEffect(() => () => { if (getXray() === id) setXray(null); }, [id]);
  const st = data[system]?.stat;
  const routes = [...new Set(String(st?.stations.features.find((f) => f.properties.id === id)?.properties.routes ?? "").split(/[\s,]+/).filter(Boolean))];
  // A line picked here (or on the map) narrows the panel to it; no pick shows every line at the station.
  const picked = useSelectedLine();
  const only = system === "subway" && picked && routes.includes(lineOf(picked.route)) ? lineOf(picked.route) : null;
  const forLine = (rs: readonly string[]) => !only || rs.some((r) => lineOf(r) === only);
  const rows = arrivalsAt(system, data[system]?.live, id, now).filter((a) => forLine([a.route]));
  const doors = system === "subway" ? (st?.entrances?.features ?? []).filter((f) => f.properties.id === id) : [];
  const lineAlerts = (alerts?.alerts ?? []).filter((a) => a.kind === "delay" && a.routes.some((r) => routes.includes(r)) && forLine(a.routes));
  const change = system === "subway" && st ? stationChanges(alerts?.alerts ?? [], st).get(id) : undefined;
  const skips = (change?.skips ?? []).filter((k) => forLine([k.route]));
  const platforms = (change?.platform ?? []).filter((p) => forLine([p.route]));
  const [openSkip, setOpenSkip] = useState<string | null>(null);
  const alertById = new Map((alerts?.alerts ?? []).map((a) => [a.id, a]));
  // Notices that name this station come first: a skipped or closed station must say so when tapped (#419).
  const skipIds = new Set(skips.map((k) => k.alertId));
  const stationNotices = (alerts?.alerts ?? []).filter((a) => (a.kind === "planned" || a.reroute) && !skipIds.has(a.id) && a.stops.some((s) => stationOf(system, s) === id) && forLine(a.routes));
  const outages = system === "subway" ? (alerts?.outages ?? []).filter((o) => o.stops.some((s) => stationOf("subway", s) === id)) : [];
  // "Stair" ×5 reads better than five identical rows.
  const doorKinds = [...doors.reduce((m, d) => m.set(doorKind(d.properties.kind), (m.get(doorKind(d.properties.kind)) ?? 0) + 1), new Map<string, number>())];
  return (
    <div className="space-y-3 text-sm">
      {routes.length ? (
        system === "subway" ? (
          // Every line here is highlighted on the map; tap one to show only it and its notices, tap again for all (owner, 2026-10-25).
          <div className="flex flex-wrap items-center gap-1.5" aria-label="Lines at this station">
            {routes.filter((r) => !r.endsWith("X")).map((r) => (
              <button key={r} type="button" aria-pressed={only === r} aria-label={only === r ? `Show every line at this station` : `Show only the ${r} line`}
                onClick={() => setSelectedLine(only === r ? null : lineOf(r))}
                className={`rounded-full p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${only === r ? "ring-2 ring-white" : only ? "opacity-50" : "hover:ring-2 hover:ring-white/60"}`}>
                <RouteBullet system={system} route={r} data={data} />
              </button>
            ))}
            <span className="text-xs text-muted-foreground">{only ? `Only the ${only} · tap it again for all lines` : "Tap a line to show only it"}</span>
          </div>
        ) : (
          <div className="flex flex-wrap gap-1" aria-label="Lines at this station">
            {routes.map((r) => <RouteBullet key={r} system={system} route={r} data={data} />)}
          </div>
        )
      ) : null}
      {stationNotices.map((a) => <StationNotice key={a.id} alert={a} />)}
      {skips.map((k) => {
        const key = `${k.alertId}|${k.route}`;
        const open = openSkip === key;
        return (
          <div key={key}>
            <button type="button" data-testid="station-skip" aria-expanded={open} onClick={() => setOpenSkip(open ? null : key)}
              className="flex w-full items-center gap-2 rounded-md border-2 border-[#d4183d] px-2 py-1.5 text-left text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <RouteBullet system={system} route={k.route} data={data} />
              <span><s>{k.end === null ? "Skipped both directions" : `Skipped ${k.toward}-bound`}</s>{k.end === null ? "" : ` · ${k.other}-bound stops`}</span>
            </button>
            {open ? <SkipPlaces alert={alertById.get(k.alertId)} route={k.route} /> : null}
          </div>
        );
      })}
      {platforms.map((p) => (
        <div key={`${p.alertId}|${p.route}`} data-testid="station-platform" className="flex items-center gap-2 rounded-md border-2 border-[hsl(var(--acc))] bg-[hsl(var(--acc)/0.2)] px-2 py-1.5 text-xs font-semibold">
          <RouteBullet system={system} route={p.route} data={data} />
          <span>Platform change: {p.notice}</span>
        </div>
      ))}
      <ul className="space-y-2">
        {rows.map((a) => (
          <li key={`${a.route}|${a.direction}`} className="flex items-center gap-2">
            <RouteBullet system={system} route={a.route} data={data} />
            <span className="flex-1 text-muted-foreground">{a.direction}</span>
            <span className="tabular-nums">{a.times.map((t) => `${minutesUntil(t, now)}`).join(", ")} min</span>
            <Button size="icon" variant="ghost" className="h-6 w-6" aria-label={`Star line ${a.route}`}
              aria-pressed={isStarred(`${system}:line:${a.route}`)} onClick={() => toggle(`${system}:line:${a.route}`)}>
              <Star className="h-3.5 w-3.5" fill={isStarred(`${system}:line:${a.route}`) ? "currentColor" : "none"} />
            </Button>
          </li>
        ))}
        {rows.length === 0 ? <li className="text-muted-foreground">No live arrivals right now.</li> : null}
      </ul>
      {lineAlerts.map((a) => (
        <div key={a.id} className="rounded-md border px-2 py-1.5 text-xs"><span className="mr-1 font-semibold">Delay</span>{a.text}</div>
      ))}
      {/* The rest waits behind a tap: a short summary first, detail on request. */}
      {outages.length ? (
        <details className="group rounded-md border px-2 py-1.5">
          <summary className="flex cursor-pointer list-none items-center gap-2 font-medium">
            <Accessibility className="h-4 w-4 shrink-0 text-blue-600" />
            {outages.length === 1 ? `${outages[0].equipment} out` : `${outages.length} elevators or escalators out`}
            {outages.some((o) => o.ada === "no") ? <span className="text-xs text-muted-foreground">· not step-free now</span> : null}
            <ChevronDown className="ml-auto h-4 w-4 transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <div className="mt-2 space-y-2">{outages.map((o) => <OutageRow key={o.id} o={o} />)}</div>
        </details>
      ) : null}
      {doors.length ? (
        <details className="group rounded-md border px-2 py-1.5">
          <summary className="flex cursor-pointer list-none items-center gap-2 font-medium">
            Entrances <span className="text-xs font-normal text-muted-foreground">{doorKinds.map(([k, n]) => (n > 1 ? `${k} ×${n}` : k)).join(" · ")}</span>
            <ChevronDown className="ml-auto h-4 w-4 transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <ul className="mt-1 space-y-0.5">{doors.map((d, i) => <li key={i}>{d.properties.name || "Entrance"}{d.properties.kind ? <span className="text-muted-foreground"> · {doorKind(d.properties.kind)}</span> : null}</li>)}</ul>
        </details>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" aria-pressed={isStarred(starKey)} onClick={() => toggle(starKey)}>
          <Star className="mr-1.5 h-4 w-4" fill={isStarred(starKey) ? "currentColor" : "none"} />
          {isStarred(starKey) ? "Starred" : "Star station"}
        </Button>
        {system === "subway" ? (
          <Button size="sm" variant="outline" aria-pressed={xray === id} onClick={() => setXray(xray === id ? null : id)}>
            <ScanEye className="mr-1.5 h-4 w-4" />
            X-ray
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/** Panel body for a vehicle: next stop, ETA and the Follow toggle. */
/** Nearest of a route's stops to a point, by equirectangular metres. Pure; runs only in the browser. */
export function nearestStop<T extends { lon: number; lat: number }>(stops: T[], at: { lon: number; lat: number }): T | undefined {
  const k = Math.cos((at.lat * Math.PI) / 180);
  let best: T | undefined, bd = Infinity;
  for (const st of stops) {
    const d = ((st.lon - at.lon) * k) ** 2 + (st.lat - at.lat) ** 2;
    if (d < bd) { bd = d; best = st; }
  }
  return best;
}

function RouteAlerts({ route }: { route: string }) {
  const alerts = useAlerts(true);
  const list = (alerts.data?.alerts ?? []).filter((a) => a.routes.includes(route));
  if (!list.length) return <p className="text-xs text-muted-foreground">No active alerts for the {route}.</p>;
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Alerts and detours</div>
      {list.slice(0, 6).map((a) => <AlertRow key={a.id} alert={a} />)}
    </div>
  );
}

function Upcoming({ rows, now }: { rows: Array<{ id: string; name: string; eta: number | null }>; now: number }) {
  if (!rows.length) return null;
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Next stops</div>
      <ol className="mt-1 space-y-0.5">
        {rows.map((r) => (
          <li key={r.id} className="flex justify-between gap-2">
            <span className="truncate">{r.name}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">{r.eta ? `${minutesUntil(r.eta, now)} min` : ""}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function BusDetails({ id, route }: { id: string; route: string }) {
  const trip = useBusTrip(id);
  const shape = useBusRoute(route || undefined);
  const now = useNow();
  const me = useSharedLocation();
  const calls = trip.data?.calls ?? [];
  // Your stop is worked out here in the browser from the route's stop list; your location never leaves the device for this.
  const mine = me.coords && shape.data ? nearestStop(shape.data.stops, me.coords) : undefined;
  const myCall = mine ? calls.find((c) => c.id === mine.id) : undefined;
  if (trip.isLoading) return <p className="text-muted-foreground">Loading this bus…</p>;
  if (!trip.data?.found) return <p className="text-muted-foreground">No longer in the live feed.</p>;
  return (
    <>
      <div><span className="font-semibold">{trip.data.route}</span> <span className="text-muted-foreground">to</span> <span className="font-medium">{trip.data.destination}</span></div>
      {calls[0] ? (
        <div>Next stop <span className="font-medium">{formatStreetText(calls[0].name)}</span>
          {calls[0].eta ? <span className="tabular-nums text-muted-foreground"> · {minutesUntil(calls[0].eta, now)} min</span> : calls[0].away ? <span className="text-muted-foreground"> · {calls[0].away}</span> : null}
        </div>
      ) : null}
      {mine ? (
        <div className="rounded-md bg-muted px-2 py-1.5">
          Near you: <span className="font-medium">{formatStreetText(mine.name)}</span>
          {myCall?.eta ? <span className="tabular-nums"> · {minutesUntil(myCall.eta, now)} min</span> : <span className="text-muted-foreground"> · not on this bus&apos;s way</span>}
        </div>
      ) : null}
      <Upcoming rows={calls.slice(1, 6)} now={now} />
    </>
  );
}

export function VehicleDetails({ vehicleKey }: { vehicleKey: string }) {
  const [system, ...rest] = vehicleKey.split(":");
  const tripId = rest.join(":");
  const rail = system === "bus" ? [] : [system as SystemId];
  const data = useTransitData(rail);
  const busTrip = useBusTrip(system === "bus" ? tripId : undefined);
  const now = useNow();
  const followed = useFollowed();
  let v: Vehicle | null | undefined;
  let upcoming: Array<{ id: string; name: string; eta: number | null }> = [];
  if (system === "bus") {
    const route = busTrip.data?.route;
    if (route) v = { key: vehicleKey, system: "bus", route, label: route, color: "#0039A6", lon: 0, lat: 0, bearing: 0, grade: "grade", dir: null };
  } else {
    const st = data[system as SystemId]?.stat, trip = data[system as SystemId]?.live?.trips.find((t) => t.id === tripId);
    v = st && trip ? estimateTrain(st, trip, now, liveProgress) : undefined;
    if (trip) upcoming = trip.stops.filter(([, t]) => t >= now - 30).slice(1, 6).map(([id, t]) => ({ id, name: stopName(data, system as SystemId, id) ?? id, eta: t }));
  }
  const following = followed === vehicleKey;
  return (
    <div className="space-y-3 text-sm">
      {system === "bus" ? <BusDetails id={tripId} route={v?.route ?? ""} /> : (
        <>
          {v ? <div className="text-muted-foreground">{directionLabel(v.system, v.nextStop ?? "", v.dir)}</div> : <div className="text-muted-foreground">No longer in the live feed.</div>}
          {v?.stopped ? (
            <div className="font-medium">
              {v.stopped.kind === "at" ? <>At {stopName(data, v.system, v.stopped.stop)}</>
                : v.stopped.kind === "departs" ? <>Departs {stopName(data, v.system, v.stopped.stop)} in <span className="tabular-nums">{minutesUntil(v.stopped.t, now)}</span> min</>
                : <>Arrived at {stopName(data, v.system, v.stopped.stop)}</>}
            </div>
          ) : null}
          {v?.nextStop && v.stopped?.kind !== "arrived" ? (
            <div>
              Next stop <span className="font-medium">{stopName(data, v.system, v.nextStop)}</span>
              {v.eta ? <span className="tabular-nums text-muted-foreground"> · {minutesUntil(v.eta, now)} min</span> : null}
            </div>
          ) : null}
          <Upcoming rows={upcoming} now={now} />
          {v ? <p className="text-xs text-muted-foreground">Position estimated from predicted arrival times.</p> : null}
        </>
      )}
      {v ? <RouteAlerts route={v.route} /> : null}
      <Button size="sm" variant={following ? "default" : "outline"} aria-pressed={following} disabled={!v}
        onClick={() => (following ? stopFollowing() : setFollowed(vehicleKey))}>
        <Crosshair className="mr-1.5 h-4 w-4" />
        {following ? "Following · drag or Esc to stop" : "Follow"}
      </Button>
    </div>
  );
}

/** One elevator / escalator outage: what is out, why, when it is back, and step-free status. */
export function OutageRow({ o }: { o: Outage }) {
  return (
    <div className="flex gap-2">
      <Accessibility className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
      <div className="text-sm">
        <div><span className="font-medium">{o.equipment} out</span> · {o.serving}</div>
        <div className="text-xs text-muted-foreground">{o.reason} · back {o.back || "unknown"}</div>
        <div className="text-xs">
          {o.ada === "yes" ? "Station still step-free accessible" : o.ada === "no" ? "Not step-free accessible right now" : "Station is not ADA-accessible"}
        </div>
      </div>
    </div>
  );
}

/** Gap under the card matching --sp-2, so the phone Layers control clears it. */
const FOLLOW_CARD_GAP = 8;

/**
 * Follow mode's card: where the trip is going, the upcoming stops, and the
 * delay and notices are buttons. It sits below the top bar. On a phone its
 * height is published as --follow-card-h so the Layers button and its menu
 * start underneath the card. On a wide screen the card stays in the band
 * between the left sheet and the Layers menu. The camera switcher and
 * "Stop following" stay in the view switcher.
 */
export function FollowCard({ vehicle }: { vehicle: Vehicle }) {
  const home = useFlag("agentHome");
  const { seedChat, setChatOpen, chatOpen, startWalk } = useMapState();
  const appT = useT();
  const onFoot = useBoardedOnFoot();
  // Off the bus or train where it is now, facing the way it was going, back in street view.
  const getOff = () => {
    setFollowed(null);
    startWalk({ lon: vehicle.lon, lat: vehicle.lat, heading: vehicle.bearing });
  };
  const now = useNow();
  const sys = vehicle.system === "bus" ? [] : [vehicle.system];
  const data = useTransitData(sys);
  const alerts = useAlerts(true);
  const { showPanel, setSnap } = usePanel();
  const tripId = vehicle.key.split(":").slice(1).join(":");
  const busTrip = useBusTrip(vehicle.system === "bus" ? tripId : undefined);
  const grouped = classifyRouteAlerts(alerts.data?.alerts ?? [], vehicle.route);
  const railTrip = vehicle.system === "bus" ? undefined : data[vehicle.system]?.live?.trips.find((t) => t.id === tripId);
  const stops = vehicle.system === "bus"
    ? (busTrip.data?.calls ?? []).slice(0, 6).map((c) => ({ id: c.id, name: formatStreetText(c.name), eta: c.eta }))
    : upcomingStops(railTrip?.stops ?? [], vehicle.stopped?.kind === "at" ? vehicle.stopped.stop : vehicle.nextStop, now, (a, b) => stationOf(vehicle.system as SystemId, a) === stationOf(vehicle.system as SystemId, b)).slice(0, 6).map(([id, t]) => ({ id, name: stopName(data, vehicle.system, id) ?? id, eta: t }));
  const next = vehicle.stopped?.kind === "at" ? vehicle.stopped.stop : vehicle.nextStop;
  const nextName = next ? (stopName(data, vehicle.system, next) ?? next) : "—";
  const head = vehicle.system === "bus" ? stops[0] : undefined;
  const headId = head?.id ?? next;
  const headName = head?.name ?? nextName;
  // The same stop's time as the list below it: the trip's own, when it lists the next stop first.
  const listed = stops[0] && headId && vehicle.system !== "bus" && stationOf(vehicle.system, stops[0].id) === stationOf(vehicle.system, headId) ? stops[0] : undefined;
  const headEta = head ? head.eta : (listed?.eta ?? vehicle.eta ?? null);
  // The where-am-I helper's guess knows which train you followed, if you lose signal later (#131).
  useEffect(() => {
    if (vehicle.system !== "bus") noteTrain({ line: vehicle.route, nextStop: headName !== "—" ? headName : null, at: Date.now() });
  }, [vehicle.system, vehicle.route, headName]);
  const busCalls = busTrip.data?.calls ?? [];
  const busLast = busCalls[busCalls.length - 1];
  const busDestName = busTrip.data?.destination || busLast?.name;
  const dest = vehicle.system === "bus"
    ? (busDestName ? { id: busLast?.id, name: formatStreetText(busDestName), eta: busLast?.eta ?? null } : undefined)
    : (railTrip?.stops.length
      ? { id: railTrip.stops[railTrip.stops.length - 1][0], name: stopName(data, vehicle.system, railTrip.stops[railTrip.stops.length - 1][0]) ?? railTrip.stops[railTrip.stops.length - 1][0], eta: railTrip.stops[railTrip.stops.length - 1][1] }
      : undefined);
  const destLoading = vehicle.system === "bus" && busTrip.isLoading && !busTrip.data;
  const openAlert = (a: TransitAlert) => {
    if (home) setFollowed(null);
    presentAlert(a);
    setSnap("half");
  };
  const openStop = (id: string, name: string, eta: number | null) => {
    if (vehicle.system === "bus") {
      showPanel({
        id: `transit:bus-stop:${id}`,
        title: name,
        subtitle: `${vehicle.route} stop`,
        details: <p className="text-sm">{eta ? <><span className="tabular-nums">{minutesUntil(eta, now)}</span> min</> : "No time given"}</p>,
      });
    } else {
      const sid = stationOf(vehicle.system, id);
      showPanel({
        id: `transit:station:${vehicle.system}:${sid}`,
        title: name,
        subtitle: `${SYSTEM_LABELS[vehicle.system]} station`,
        details: <StationDetails system={vehicle.system} id={sid} />,
      });
    }
    setSnap("half");
  };
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    const root = document.documentElement;
    if (!el) return;
    const publish = () => {
      const h = Math.ceil(el.getBoundingClientRect().height) + FOLLOW_CARD_GAP;
      root.style.setProperty("--follow-card-h", `${h}px`);
    };
    publish();
    if (typeof ResizeObserver === "undefined") {
      return () => root.style.removeProperty("--follow-card-h");
    }
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty("--follow-card-h");
    };
  }, []);
  if (home) {
    const ask = (text: string) => { setFollowed(null); seedChat(text); setChatOpen(true); };
    const notices = [...grouped.delays, ...grouped.notices].map((a) => <button key={a.id} type="button" data-testid={grouped.delays.includes(a) ? "follow-delay" : "follow-notice"} onClick={() => openAlert(a)} className="flex items-center gap-2.5 rounded-[14px] border border-slate-400/15 bg-slate-900/35 px-3 py-2 text-left text-sm">
      <NoticeIcon kind={noticeKind(a.text, { kind: a.kind, reroute: a.reroute })} color="#fcd34d" />
      {/* One line each; tapping opens the full notice and frames it on the map. */}
      <span className="flex min-w-0 flex-1 flex-col"><span className="truncate font-semibold">{plainAlert(a.text)}</span><span className="truncate text-[12px] text-slate-300">{alertTimeLabel(a) ?? "No time given"}</span></span>
    </button>);
    // The stops list starts with the next stop too, so it can be opened from the sheet; the trip's own times win.
    const stopRows = [...(headId && !stops.some((s) => s.id === headId) ? [{ id: headId, name: headName, eta: headEta }] : []), ...stops].slice(0, 6).map((s) => <button key={s.id} type="button" data-testid="follow-stop" onClick={() => openStop(s.id, s.name, s.eta)} className="flex min-h-9 items-center justify-between gap-2 text-left text-[13px] text-slate-300"><span className="truncate">{s.name}</span><span className="shrink-0">{s.eta ? `${minutesUntil(s.eta, now)} min` : "—"}</span></button>);
    return chatOpen ? null : <FollowSheet
      route={vehicle.route}
      color={vehicle.color}
      bus={vehicle.system === "bus"}
      status={`${vehicle.system === "bus" ? "Bus" : vehicle.grade === "underground" ? "Underground" : "Train"} · ${grouped.delays.length ? "Delays reported" : "No delay reported"}`}
      next={headId ? { name: headName, eta: headEta ? `${minutesUntil(headEta, now)} min` : "—" } : null}
      stops={stopRows}
      dest={dest ? <p data-testid="follow-dest" className="px-1 text-[13px] text-slate-300">To {dest.name}</p> : destLoading ? <p className="px-1 text-[13px]">Loading destination…</p> : null}
      notices={notices}
      noticeCount={notices.length}
      // No "Other ways": trips are asked in the chat (owner, 2026-11-07).
      actions={<div className="grid grid-cols-1 gap-2">
        {vehicle.system === "bus" ? <button type="button" className="task-action bg-sky-500" onClick={() => ask(`Where should I get off the ${vehicle.route} bus for my trip?`)}>Where to get off</button> : <button type="button" className="task-action" onClick={() => { setFollowed(null); openLostHelper({ from: "train", line: vehicle.route, nextStop: headName !== "—" ? headName : null, ...(headId ? { stationId: stationOf(vehicle.system === "bus" ? "subway" : vehicle.system, headId) } : {}) }); }}>{appT("findExit")}</button>}
        {onFoot ? <button type="button" data-testid="get-off" className="task-action bg-[#c6f702] text-[#121212]" onClick={getOff}>Get off and walk</button> : null}
      </div>}
    />;
  }
  return (
    <div className="pointer-events-none absolute z-30 flex justify-center top-[calc(env(safe-area-inset-top)+var(--edge)+var(--topbar-h)+var(--sp-2))] left-[max(var(--edge),var(--sheet-left,0px))] right-[var(--edge)] lg:right-[calc(var(--edge)+13rem+var(--sp-3))]">
      <div ref={ref} data-testid="follow-card" className="pointer-events-auto max-h-[min(52vh,440px)] w-[min(92vw,420px)] max-w-full overflow-y-auto rounded-xl border border-border bg-card/95 px-[var(--sp-3)] py-1.5 text-[12px] shadow-lg backdrop-blur-md">
        <div className="flex items-center gap-[var(--sp-2)]">
          <RouteBullet system={vehicle.system} route={vehicle.route} data={data} />
          <button type="button" className="min-w-0 flex-1 truncate text-left font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => headId && openStop(headId, headName, headEta)}>
            {vehicle.stopped?.kind === "at" ? "At " : "Next "}
            {headName}
            {vehicle.eta && vehicle.stopped?.kind !== "at" ? <span className="tabular-nums text-muted-foreground"> · {minutesUntil(vehicle.eta, now)} min</span> : null}
          </button>
          <span className="shrink-0 text-[11px] font-medium text-muted-foreground">{vehicle.grade === "underground" ? "Underground" : vehicle.grade === "elevated" ? "Elevated" : "At grade"}</span>
        </div>
        <div className="mt-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Where it&apos;s going</div>
        {dest?.id ? (
          <button type="button" data-testid="follow-dest" className={rowBtn} onClick={() => openStop(dest.id, dest.name, dest.eta)}>
            <span className="font-semibold">To</span> {dest.name}
          </button>
        ) : dest ? (
          <p data-testid="follow-dest" className="mt-1 text-xs font-medium">To {dest.name}</p>
        ) : destLoading ? <p className="text-[11px] text-muted-foreground">Loading destination…</p> : <p className="text-[11px] text-muted-foreground">No destination reported</p>}
        <div className="mt-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Stops</div>
        {vehicle.system === "bus" && busTrip.isLoading ? <p className="text-[11px] text-muted-foreground">Loading stops…</p> : null}
        {stops.length ? stops.map((s) => (
          <button key={s.id} type="button" data-testid="follow-stop" className={rowBtn} onClick={() => openStop(s.id, s.name, s.eta)}>
            <span className="font-semibold">Stop</span> {s.name}
            {s.eta ? <span className="tabular-nums text-muted-foreground"> · {minutesUntil(s.eta, now)} min</span> : <span className="text-muted-foreground"> · No time given</span>}
          </button>
        )) : vehicle.system === "bus" && busTrip.isLoading ? null : <p className="text-[11px] text-muted-foreground">No upcoming stops</p>}
        <div className="mt-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Delay</div>
        {grouped.delays.length ? grouped.delays.slice(0, 3).map((a) => (
          <button key={a.id} type="button" data-testid="follow-delay" className={rowBtn} onClick={() => openAlert(a)}>
            <span className="font-semibold">{a.reroute ? "Detour" : "Delay"}</span> {plainAlert(a.text)}
          </button>
        )) : <p className="text-[11px] text-muted-foreground">No delay reported</p>}
        <div className="mt-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Notices</div>
        {grouped.notices.length ? grouped.notices.slice(0, 3).map((a) => (
          <button key={a.id} type="button" data-testid="follow-notice" className={rowBtn} onClick={() => openAlert(a)}>
            <span className="font-semibold">{a.kind === "planned" ? "Planned work" : "Notice"}</span> {plainAlert(a.text)}
          </button>
        )) : <p className="text-[11px] text-muted-foreground">No notices</p>}
      </div>
    </div>
  );
}
