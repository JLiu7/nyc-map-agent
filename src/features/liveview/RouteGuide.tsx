import "./nav.css";
import "@/components/task-screens.css";
import { useSharedLocation } from "@/lib/geo/sharedLocation";
import { turnAroundLine, useWrongWay } from "@/lib/geo/wrongWay";
import { metres } from "@/lib/map/mapRead";
import { useFlag } from "@/lib/flags";
import { loadGuideLandmarks, type GuideLandmark } from "@/lib/guide/landmarkGuide";
import { nextCheckpoint } from "./checkpoints";
import { useQuery } from "@tanstack/react-query";
import { ArrowUp, CornerUpLeft, CornerUpRight, Flag, LocateFixed, Navigation, Square, Undo2 } from "lucide-react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { onMapInstance } from "@/lib/map/mapInstance";
import { keepInView } from "@/lib/map/keepInView";
import { LOOK_CENTER_DISTANCE_M, poseAlongRoute } from "@/lib/map/walk";
import { useDataView } from "@/lib/store/DataViewContext";
import { setTripStep, useTripStep } from "@/lib/store/tripStep";
import { useCssHeight } from "@/lib/useCssHeight";
import { appGeo } from "@/lib/geo/devGeo";
import { useMapState } from "@/lib/store/MapStateContext";
import { useActiveTrip } from "@/lib/transit/activeTrip";
import { useT } from "@/lib/i18n/appLang";
import { openLostHelper, useLostHelper } from "@/lib/underground/lostHelper";
import { bearingTo } from "./heading";
import { installNavLayers, readNavColors, removeNavLayers, roadNameAt, updateNavLayers } from "./layers";
import { distanceAlong, fetchGuidedRoute, formatMetres, metresLeft, progressAt, type RouteStep } from "./steps";
import { sendCamera, useCameraMode } from "@/lib/map/cameraMode";

const MILE = 1609.344;
const LiveViewBeta = lazy(() => import("./LiveViewBeta"));

function TurnIcon({ step }: { step: RouteStep | null }) {
  const cls = "h-7 w-7 shrink-0 text-primary";
  if (!step) return <ArrowUp className={cls} />;
  if (step.type === "arrive") return <Flag className={cls} />;
  const m = step.modifier ?? "";
  if (m === "uturn") return <Undo2 className={cls} />;
  if (m.includes("left")) return <CornerUpLeft className={cls} />;
  if (m.includes("right")) return <CornerUpRight className={cls} />;
  return <ArrowUp className={cls} />;
}

interface Fix {
  lon: number;
  lat: number;
  accuracy: number;
  heading: number | null;
}

/**
 * Navigation guidance for the walking route: glowing route with chevrons and a
 * turn arrow, a compact next-turn card, and a street-name pill. In street
 * view it follows the camera; in 2D, "Navigate" follows your location on a
 * still, top-down, north-up map. Location is asked for only when you tap Navigate,
 * stays in this tab, and is never sent to our API.
 */
export default function RouteGuide() {
  const home = useFlag("agentHome");
  const { routeStart, routeEnd, clearRoute, followingRoute } = useDataView();
  const { walking, stopWalk, chatOpen } = useMapState();
  // Where am I opens the where-am-I helper with this walk's destination and landmark (#131).
  const walkTo = useActiveTrip()?.destination.label ?? null;
  const t = useT();
  const lost = useLostHelper();
  const [landmarks, setLandmarks] = useState<readonly GuideLandmark[]>([]);
  const [confirmed, setConfirmed] = useState<string[]>([]);
  const [showPhoto, setShowPhoto] = useState(false);
  useEffect(() => { void loadGuideLandmarks().then(setLandmarks).catch(() => {}); }, []);
  useEffect(() => { setConfirmed([]); setShowPhoto(false); }, [routeStart, routeEnd]);
  const shared = useSharedLocation();
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [pos, setPos] = useState<{ lon: number; lat: number; bearing: number } | null>(null);
  // Guidance is a camera mode: it can't overlap a street walk, and a view you pick keeps it from re-tilting.
  const camera = useCameraMode();
  const navigating = camera.kind === "guide" || (camera.kind === "street" && camera.back === "guide");
  const centered = camera.kind === "guide" && camera.centred;
  const tilt = camera.kind === "guide" && camera.tilt;
  const [fix, setFix] = useState<Fix | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const watchRef = useRef<number | null>(null);
  const arFlag = useFlag("liveviewAr");

  useEffect(() => onMapInstance(setMap), []);

  const { data: route } = useQuery({
    queryKey: ["walk-steps", routeStart?.lon, routeStart?.lat, routeEnd?.lon, routeEnd?.lat],
    enabled: routeStart !== null && routeEnd !== null,
    staleTime: Number.POSITIVE_INFINITY,
    retry: 1,
    queryFn: ({ signal }) => fetchGuidedRoute(routeStart!, routeEnd!, signal),
  });

  const active = Boolean(route) && (walking || navigating || (home && followingRoute));
  // The rest of a train or bus trip, waiting at the end of this walk.
  const tripStep = useTripStep();
  const bottomCard = useCssHeight("--task-bottom-h");
  useEffect(() => { if (!followingRoute && !walking && !navigating) setTripStep(null); }, [followingRoute, walking, navigating]);

  // Layers live while guidance is active; re-added after a style reload and on theme change.
  useEffect(() => {
    if (!map || !active) return;
    let busy = false;
    const install = () => {
      // Only when missing, and never re-entrantly: installing fires styledata itself.
      if (busy || map.getSource("nav-puck") || !map.isStyleLoaded()) return;
      busy = true;
      try {
        installNavLayers(map, readNavColors());
      } finally {
        busy = false;
      }
    };
    install();
    map.on("styledata", install);
    const obs = new MutationObserver(() => {
      removeNavLayers(map);
      install();
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] });
    return () => {
      map.off("styledata", install);
      obs.disconnect();
      removeNavLayers(map);
    };
  }, [map, active]);

  // Street view: the camera is the walker.
  useEffect(() => {
    if (!map || !walking || !route) return;
    const read = () => {
      // The street camera looks at a point LOOK_CENTER_DISTANCE_M ahead; step back to the eye.
      const c = map.getCenter();
      const b = (map.getBearing() * Math.PI) / 180;
      const back = LOOK_CENTER_DISTANCE_M / 111_320;
      setPos({
        lon: c.lng - (Math.sin(b) * back) / Math.cos((c.lat * Math.PI) / 180),
        lat: c.lat - Math.cos(b) * back,
        bearing: map.getBearing(),
      });
    };
    read();
    map.on("move", read);
    return () => {
      map.off("move", read);
    };
  }, [map, walking, route]);

  // 2D navigation: geolocation only after the tap, cleared on stop and unmount.
  const stopNav = () => {
    if (watchRef.current !== null) appGeo()?.clearWatch(watchRef.current);
    watchRef.current = null;
    sendCamera({ type: "stop-guide" });
    setFix(null);
  };
  // Precise GPS for the walker, shared by navigation and the home screen's Live View.
  const watchFix = () => {
    const g = appGeo();
    if (!g) {
      setGeoError("This browser has no location access.");
      return false;
    }
    setGeoError(null);
    if (watchRef.current !== null) return true;
    watchRef.current = g.watchPosition(
      (p) =>
        setFix({
          lon: p.coords.longitude,
          lat: p.coords.latitude,
          accuracy: p.coords.accuracy,
          heading: p.coords.speed && p.coords.speed > 0.5 ? p.coords.heading : null,
        }),
      (e) => setGeoError(e.code === e.PERMISSION_DENIED ? "Location permission was declined." : "Location is unavailable."),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 20_000 },
    );
    return true;
  };
  const startNav = () => {
    if (watchFix()) sendCamera({ type: "guide" });
  };
  // Live View opened from the home walking card: GPS only while the camera is up.
  const liveViewOpen = (open: boolean) => {
    if (open) watchFix();
    else if (!navigating) {
      if (watchRef.current !== null) appGeo()?.clearWatch(watchRef.current);
      watchRef.current = null;
      setFix(null);
    }
  };
  useEffect(() => () => {
    if (watchRef.current !== null) appGeo()?.clearWatch(watchRef.current);
    sendCamera({ type: "stop-guide" });
  }, []);
  useEffect(() => {
    if (!routeStart || !routeEnd) stopNav();
  }, [routeStart, routeEnd]);

  const here = walking ? pos : fix ?? (home && followingRoute ? shared.coords ?? routeStart : null);
  const along = route && here ? distanceAlong(route.coordinates, here) : 0;
  const routeBearing = route ? poseAlongRoute(route.coordinates, along + 1)?.bearing ?? 0 : 0;
  const heading = walking ? pos?.bearing ?? 0 : fix?.heading ?? routeBearing;
  const progress = route && here ? progressAt(route, here) : null;
  const stepStreet = progress && route ? route.steps[progress.nextIndex - 1]?.name ?? "" : "";
  // In street view the eye is below the screen; probe a little ahead along the heading.
  const probe = here && walking ? poseAlongRoute(route?.coordinates ?? [], along + 15) : here;
  const street = stepStreet || (map && active && probe ? roadNameAt(map, probe.lon, probe.lat) : "");
  // Real walking only (not the street-view camera): warn when you head away from the next turn.
  const accuracy = fix ? fix.accuracy : home && followingRoute ? shared.accuracy ?? null : null;
  const awayFrom = active && !walking && progress && here ? progress.next.name || street : null;
  const away = useWrongWay(awayFrom !== null && progress && here ? { key: String(progress.nextIndex), metres: metres([here.lon, here.lat], progress.next.location), accuracy, place: awayFrom } : null);

  // Draw the frame.
  useEffect(() => {
    if (!map || !active || !route || !map.getSource("nav-route")) return;
    updateNavLayers(map, {
      route,
      along,
      next: progress?.next ?? null,
      puck: here
        ? { lon: here.lon, lat: here.lat, bearing: heading, accuracyM: fix?.accuracy ?? 0, show: !walking }
        : null,
    });
  });

  // The camera follows the fix until you pan away.
  useEffect(() => {
    if (!map || !navigating || walking) return;
    const off = () => sendCamera({ type: "pan" });
    map.on("dragstart", off);
    return () => {
      map.off("dragstart", off);
    };
  }, [map, navigating, walking]);
  // Top-down and north up. The first fix frames you close (until you pick a view yourself);
  // after that the map stays still and re-centres only when you near the edge, not on every fix.
  const framed = useRef(false);
  useEffect(() => {
    if (!map || camera.kind !== "guide" || !centered) { framed.current = false; return; }
    if (!fix) return;
    if (!framed.current) {
      framed.current = true;
      map.easeTo({ center: [fix.lon, fix.lat], pitch: 0, bearing: 0, ...(tilt ? { zoom: Math.max(map.getZoom(), 17) } : {}), duration: 600 });
      return;
    }
    keepInView(map, [fix.lon, fix.lat]);
  }, [map, camera.kind, fix, centered, tilt]);
  // Walking guidance from the answer: your shared dot stays on screen the same way.
  const homeWalk = home && followingRoute && !walking && !navigating && here !== null;
  useEffect(() => {
    if (!map || !homeWalk || !here) return;
    keepInView(map, [here.lon, here.lat]);
  }, [map, homeWalk, here?.lon, here?.lat]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!route) return null;

  const left = here ? metresLeft(route, here) : route.steps.reduce((s, x) => s + x.distance, 0);

  const checkpoint = here ? nextCheckpoint(here, heading, landmarks, confirmed) : null;
  if (home && active) return chatOpen || lost ? null : <>
    <section className="task-panel task-top flex items-center gap-3 px-3.5 py-3 min-[380px]:gap-3.5 min-[380px]:px-4 min-[380px]:py-3.5" aria-label="Walking guidance">
      <TurnIcon step={progress?.next ?? null} />
      {/* A few short lines at most, so on a small phone the walk still shows between this and the checkpoint card. */}
      <div className="min-w-0 flex-1"><h2 className="text-base font-bold leading-tight min-[380px]:text-xl">{checkpoint ? <span className="block text-xs font-semibold text-slate-300">Walk toward</span> : null}<span className="line-clamp-3 min-[380px]:line-clamp-2">{checkpoint ? checkpoint.landmark.name : progress?.instruction ?? "Follow the walking route"}</span></h2>
        {away ? <p className="mt-0.5 truncate text-sm font-semibold text-amber-300" role="alert" data-testid="wrong-way">{turnAroundLine(awayFrom ?? "")}</p> : <p className="mt-0.5 truncate text-sm text-slate-300">{[progress && !checkpoint ? `In ${formatMetres(progress.metresToNext)}` : progress?.instruction, street, `${Math.max(1, Math.round(left / 80))} min left`].filter(Boolean).join(" · ")}</p>}</div>
      {arFlag && progress ? (
        <Suspense fallback={null}>
          <LiveViewBeta
            compact
            onOpenChange={liveViewOpen}
            accuracyM={fix?.accuracy ?? null}
            targetBearing={here ? bearingTo(here, { lon: progress.next.location[0], lat: progress.next.location[1] }) : routeBearing}
            instruction={progress.instruction}
            distanceLabel={formatMetres(progress.metresToNext)}
            frame={{ route, along, next: progress.next }}
            at={fix}
          />
        </Suspense>
      ) : null}
      <button type="button" className="task-action task-secondary h-11 w-11 shrink-0 p-0" aria-label="Stop walking guidance" onClick={() => { stopNav(); stopWalk(); clearRoute(); setTripStep(null); }}><Square size={18} /></button>
    </section>
    {/* Near the station the next step wins over a landmark checkpoint. */}
    {checkpoint?.landmark.picture && !(tripStep && left < 150) ? <section ref={bottomCard} className="task-panel task-bottom flex flex-col gap-2.5 p-3.5" aria-label="Landmark checkpoint">
      <div className="flex items-center gap-2.5">
        <img src={checkpoint.landmark.picture.url} alt={checkpoint.landmark.name} className="h-11 w-11 shrink-0 rounded-xl border border-slate-400/25 object-cover" />
        <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug min-[380px]:text-base">See {checkpoint.landmark.name} {checkpoint.direction}?</h3>
      </div>
      {showPhoto ? <figure><img src={checkpoint.landmark.picture.url} alt={`Look for ${checkpoint.landmark.name}`} className="max-h-40 w-full rounded-xl object-contain" /><figcaption className="mt-1 text-xs text-slate-300">About {checkpoint.distanceM} m · {checkpoint.direction}</figcaption></figure> : null}
      <div className="grid grid-cols-3 gap-2 text-[13px] min-[380px]:text-sm">
        <button type="button" className="task-action min-h-11 !text-[length:inherit]" onClick={() => { setConfirmed([...confirmed, checkpoint.landmark.id]); setShowPhoto(false); }}>Yes, I see it</button>
        <button type="button" className="task-action task-secondary min-h-11 !text-[length:inherit]" aria-expanded={showPhoto} onClick={() => setShowPhoto(!showPhoto)}>Not yet</button>
        <button type="button" className="task-action task-secondary min-h-11 !text-[length:inherit]" onClick={() => openLostHelper({ from: "walk", walkingTo: walkTo, landmark: checkpoint.landmark.name })}>{t("whereAmI")}</button>
      </div>
      <a href={checkpoint.landmark.picture.page} target="_blank" rel="noreferrer" className="block truncate text-xs text-slate-300">Photo: {checkpoint.landmark.picture.artist} · {checkpoint.landmark.picture.license}</a>
    </section> : tripStep ? <section ref={bottomCard} className="task-panel task-bottom flex flex-col gap-2.5 p-3.5" aria-label="Next on this trip">
      <p className="line-clamp-2 text-[15px] font-semibold leading-snug">{tripStep.then}</p>
      <div className="grid grid-cols-2 gap-2 text-[13px] min-[380px]:text-sm">
        <button type="button" className="task-action min-h-11 !text-[length:inherit]" onClick={() => { stopNav(); stopWalk(); tripStep.go(); }}>{tripStep.action}</button>
        <button type="button" className="task-action task-secondary min-h-11 !text-[length:inherit]" onClick={() => openLostHelper({ from: "walk", walkingTo: walkTo, landmark: null })}>{t("whereAmI")}</button>
      </div>
    </section> : <div ref={bottomCard} className="task-panel task-bottom"><button type="button" className="task-action task-secondary w-full" onClick={() => openLostHelper({ from: "walk", walkingTo: walkTo, landmark: null })}>{t("whereAmI")}</button></div>}
  </>;

  return (
    <>
      {active && progress ? (
        <div className={`pointer-events-none absolute left-1/2 z-30 w-[min(20rem,calc(100%-1.5rem))] -translate-x-1/2 ${walking ? "bottom-[16rem] sm:bottom-24" : "bottom-40"}`}>
          <div className="flex items-center gap-3 rounded-lg border bg-background/90 p-3 shadow-lg backdrop-blur" role="status">
            <TurnIcon step={progress.next} />
            <div className="min-w-0">
              <div className={`truncate text-sm font-semibold ${away ? "text-amber-600" : "text-foreground"}`} data-testid={away ? "wrong-way" : undefined}>
                {away ? turnAroundLine(awayFrom ?? "") : `${progress.instruction}, ${formatMetres(progress.metresToNext)}`}
              </div>
              <div className="text-xs tabular-nums text-muted-foreground">{(left / MILE).toFixed(2)} mi to go</div>
            </div>
          </div>
        </div>
      ) : null}

      {active && street && walking ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-[4.5rem] z-30 flex justify-center">
          <span className="rounded-full border bg-background/90 px-3 py-1 text-xs font-medium text-foreground shadow">
            {street}
          </span>
        </div>
      ) : null}

      {!walking ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-8 z-30 flex flex-col items-center gap-2 [&>*]:pointer-events-auto">
          {navigating && !centered ? (
            <Button type="button" size="sm" variant="secondary" onClick={() => sendCamera({ type: "recenter" })}>
              <LocateFixed className="h-4 w-4" /> Recenter
            </Button>
          ) : null}
          <Button type="button" size="sm" variant={navigating ? "outline" : "default"} onClick={navigating ? stopNav : startNav}>
            {navigating ? <Square className="h-4 w-4" /> : <Navigation className="h-4 w-4" />}
            {navigating ? "Stop navigation" : "Navigate"}
          </Button>
          {arFlag && navigating && progress ? (
            <Suspense fallback={null}>
              <LiveViewBeta
                accuracyM={fix?.accuracy ?? null}
                targetBearing={fix ? bearingTo(fix, { lon: progress.next.location[0], lat: progress.next.location[1] }) : routeBearing}
                instruction={progress.instruction}
                distanceLabel={formatMetres(progress.metresToNext)}
                frame={route ? { route, along, next: progress.next } : null}
                at={fix}
              />
            </Suspense>
          ) : null}
          {navigating && fix ? (
            <span className="rounded bg-background/90 px-2 py-0.5 text-[11px] text-muted-foreground">
              Location accuracy: about {Math.round(fix.accuracy)} m
            </span>
          ) : null}
          {geoError ? <span className="rounded bg-background/90 px-2 py-0.5 text-[11px] text-destructive">{geoError}</span> : null}
        </div>
      ) : null}
    </>
  );
}
