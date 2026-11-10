import "@/components/task-screens.css";
import { ArrowUp, Camera, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { PullSheet } from "@/components/PullSheet";
import type { SheetLevel } from "@/components/sheetSwipe";
import { sharedCoords } from "@/lib/geo/sharedLocation";
import { useAppLang } from "@/lib/i18n/appLang";
import { cornerLine } from "@/lib/map/cornerLine";
import { getMapInstance } from "@/lib/map/mapInstance";
import { readMap } from "@/lib/map/mapRead";
import { bearingBetween, exitToward, facingFrom, matchSign, turnBetween, type SignMatch } from "@/lib/map/signMatch";
import { stationAt } from "@/lib/map/stationNear";
import { placeSigns, type Sign } from "@/lib/map/stationSigns";
import { toLngLat } from "@/lib/map/stationWalk";
import { watchCompass } from "./compass";
import { FRAME_W, openReader, type SignReader } from "./reader";
import { signText } from "./text";

/** A read is shown as a match from this confidence up; below it the last good match stays. */
const SURE = 0.55;
/** A breath between reads, so the phone does not run hot. */
const REST_MS = 400;

type Cam = "off" | "starting" | "on" | "blocked";
type Found = { match: SignMatch<Sign>; compassThen: number | null };
type Place = { name: string; signs: Sign[] };

/** A sign as its face reads: "Exit · Broadway & Fulton St", "Fulton St A C", "Uptown 4 5". Never translated. */
function label(s: Sign): string {
  const bullets = s.routes.map((r) => r.short).join(" ");
  if (s.kind === "exit") return s.words ? `Exit · ${s.words}` : "Exit";
  return [s.kind === "name" ? s.name : s.words, bullets].filter(Boolean).join(" ");
}

/**
 * The sign camera: a small camera view in the phone's one sheet, the words it
 * read, the sign of ours they belong to, and an arrow to the exit. The map
 * stays in view above it. It opens with the flag; a button for it comes later.
 */
export default function SignCamera() {
  const lang = useAppLang();
  const t = (k: Parameters<typeof signText>[1]) => signText(lang, k);
  const [open, setOpen] = useState(true);
  const [level, setLevel] = useState<SheetLevel>(1);
  const [cam, setCam] = useState<Cam>("off");
  const [loading, setLoading] = useState(false);
  const [place, setPlace] = useState<Place | null | undefined>(undefined);
  const [read, setRead] = useState("");
  const [found, setFound] = useState<Found | null>(null);
  const [compass, setCompass] = useState<number | null>(null);

  const video = useRef<HTMLVideoElement>(null);
  const live = useRef<{ stream?: MediaStream; reader?: SignReader; stopCompass?: (() => void) | null; alive: boolean }>({ alive: false });
  const placeRef = useRef<Place | null>(null);
  const compassRef = useRef<number | null>(null);
  const lastAt = useRef<{ x: number; y: number } | undefined>(undefined);

  const stop = useCallback(() => {
    const l = live.current;
    l.alive = false;
    l.stream?.getTracks().forEach((tr) => tr.stop());
    l.reader?.stop();
    l.stopCompass?.();
    live.current = { alive: false };
    setCam((c) => (c === "blocked" ? c : "off"));
  }, []);

  // The camera never outlives the screen: stop when the tab hides and when this closes.
  useEffect(() => {
    const hide = () => { if (document.visibilityState === "hidden") stop(); };
    document.addEventListener("visibilitychange", hide);
    return () => { document.removeEventListener("visibilitychange", hide); stop(); };
  }, [stop]);

  /** The station at a point: where you shared you are, else the middle of the map. */
  const locate = useCallback(async (at?: { lon: number; lat: number }) => {
    const map = getMapInstance();
    const mid = map?.getCenter();
    const c = at ?? sharedCoords() ?? (mid ? { lon: mid.lng, lat: mid.lat } : null);
    const st = c ? await stationAt(c.lon, c.lat) : null;
    // A street exit's sign names its corner, from the streets the map has drawn there; without them it just says Exit.
    const streets = map ? readMap(map) : null;
    const corner = st && streets ? (x: number, y: number) => cornerLine(streets.placeAt(toLngLat(st.model, x, y))) : undefined;
    const next = st ? { name: st.signs.stations[0]?.name ?? "", signs: placeSigns(st.model, st.signs, corner) } : null;
    placeRef.current = next;
    setPlace(next);
    return next;
  }, []);

  const feed = useCallback((text: string) => {
    setRead(text);
    const p = placeRef.current;
    if (!p || !text) return;
    const match = matchSign(text, p.signs, lastAt.current);
    if (!match || match.confidence < SURE) return;
    if (match.level === "spot") lastAt.current = { x: match.sign.x, y: match.sign.y };
    setFound({ match, compassThen: compassRef.current });
  }, []);

  // For tests and for trying the match on a desktop with no camera: name a place and the words read there.
  useEffect(() => {
    if (!(import.meta.env.DEV || import.meta.env.VITE_E2E)) return;
    const w = window as unknown as { __signCam?: unknown };
    w.__signCam = async (p: { lon: number; lat: number; text: string }) => { await locate(p); feed(p.text); };
    return () => { delete w.__signCam; };
  }, [locate, feed]);

  const start = () => {
    const l = (live.current = { alive: true } as typeof live.current);
    setCam("starting");
    // iOS only shows its compass question inside the tap, so this goes first.
    void watchCompass((deg) => {
      const d = Math.round(deg / 5) * 5;
      if (d !== compassRef.current) { compassRef.current = d; setCompass(d); }
    }).then((off) => { if (l.alive) l.stopCompass = off; else off?.(); });
    void locate();
    if (!navigator.mediaDevices?.getUserMedia) { setCam("blocked"); return; }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } }, audio: false }).then(async (stream) => {
      if (!l.alive) { stream.getTracks().forEach((tr) => tr.stop()); return; }
      l.stream = stream;
      setCam("on");
      const v = video.current;
      if (v) { v.srcObject = stream; await v.play().catch(() => {}); }
      setLoading(true);
      const reader = await openReader().catch(() => null);
      setLoading(false);
      if (!reader || !l.alive) { reader?.stop(); return; }
      l.reader = reader;
      const frame = document.createElement("canvas");
      while (l.alive) {
        const el = video.current;
        if (el && el.videoWidth) {
          const k = Math.min(1, FRAME_W / el.videoWidth);
          frame.width = Math.round(el.videoWidth * k);
          frame.height = Math.round(el.videoHeight * k);
          frame.getContext("2d")?.drawImage(el, 0, 0, frame.width, frame.height);
          const text = await reader.read(frame).catch(() => "");
          if (l.alive) feed(text);
        }
        await new Promise((r) => setTimeout(r, REST_MS));
      }
    }).catch(() => { if (l.alive) { l.alive = false; setCam("blocked"); } });
  };

  if (!open) return null;

  const sign = found?.match.sign;
  const spot = found?.match.level === "spot" && sign ? sign : null;
  const exit = spot && place ? exitToward(place.signs, spot) : null;
  // Which way you face: from the sign when it was read, turned by however far the compass has turned since.
  const facedThen = found && spot ? facingFrom(found.match, found.compassThen) : null;
  const facing = facedThen === null ? null : found!.compassThen !== null && compass !== null ? facedThen + turnBetween(found!.compassThen, compass) : facedThen;
  const here = exit && exit === spot;
  const turn = here ? 0 : exit && spot && facing !== null ? turnBetween(facing, bearingBetween(spot, exit)) : null;
  const metres = exit && spot && !here ? Math.max(5, Math.round(Math.hypot(exit.x - spot.x, exit.y - spot.y) / 5) * 5) : null;
  const line = spot ? label(spot) : found && place ? place.name : cam === "on" ? t("point") : t("title");

  return (
    <PullSheet testId="sign-camera" label={t("title")} level={level} onLevel={setLevel} onClose={() => { stop(); setOpen(false); }}
      header={<div className="flex items-center gap-2.5">
        <button type="button" className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left" aria-expanded={level > 0} onClick={() => setLevel((l) => (l === 0 ? 1 : l))}>
          <Camera size={18} className="shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">
            {found ? <span className="task-caption block truncate">{spot ? t("near") : t("inStation")}</span> : null}
            <span className="block truncate text-[15px] font-bold" data-testid="sign-near">{line}</span>
          </span>
        </button>
        <button type="button" aria-label={t("close")} className="task-action task-close" onClick={() => { stop(); setOpen(false); }}><X size={18} /></button>
      </div>}>
      <section className="pull-sheet-body mt-1 flex flex-col gap-2" aria-label={t("title")}>
        {/* Kept small: the map above it stays the main view. */}
        <video ref={video} playsInline muted aria-hidden className={`${cam === "on" ? "block" : "hidden"} max-h-[22dvh] w-full rounded-xl bg-black object-cover`} style={{ aspectRatio: "16 / 9" }} />
        {cam === "off" || cam === "starting" ? <button type="button" className="task-action min-h-11 px-3" disabled={cam === "starting"} onClick={start}>{cam === "starting" ? t("starting") : t("start")}</button> : null}
        {cam === "blocked" ? <p className="text-xs text-amber-200" role="status">{t("noCamera")}</p> : null}
        {loading ? <p className="text-xs text-slate-300" role="status">{t("readerSlow")}</p> : null}
        {place === null ? <p className="text-xs text-amber-200" role="status">{t("noStation")}</p> : null}
        {read ? <p className="truncate text-xs text-slate-300" data-testid="sign-read">{read}</p> : null}
        {exit ? <div className="flex items-center gap-3" data-testid="sign-exit">
          {turn !== null ? <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-slate-400/25" role="img" aria-label={t("exit")}><ArrowUp className="h-7 w-7 text-blue-400" style={{ transform: `rotate(${turn}deg)` }} /></div> : null}
          <div className="min-w-0 flex-1">
            <span className="task-caption">{here ? t("thisExit") : t("exit")}</span>
            <p className="truncate text-sm font-bold">{label(exit).replace(/^Exit(?: · )?/, "") || "Exit"}</p>
            {metres !== null ? <p className="text-xs text-slate-300">{t("about").replace("{n}", String(metres))}</p> : null}
          </div>
        </div> : found && !spot ? <p className="text-xs text-slate-300">{t("pointExit")}</p> : null}
      </section>
    </PullSheet>
  );
}
