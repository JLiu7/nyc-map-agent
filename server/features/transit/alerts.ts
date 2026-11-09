/**
 * MTA GTFS-realtime service alerts (camsys feed) slimmed for the map (#253):
 * informed_entity route and stop ids, plus the Mercury extension when present
 * (human-readable active period, affected stations with a direction id).
 * Pure, so the parsing is unit-tested without the network.
 */
import { serviceChanges, type ServiceChange } from "../../../src/lib/transit/serviceChanges";

type Translated = { translation?: Array<{ text: string; language: string }> };
type Entity = { agency_id?: string; route_id?: string; stop_id?: string; direction_id?: number };
export type MercuryAlert = {
  id: string;
  alert: {
    active_period?: Array<{ start?: number; end?: number }>;
    informed_entity?: Entity[];
    header_text?: Translated;
    description_text?: Translated;
    "transit_realtime.mercury_alert"?: {
      alert_type?: string;
      human_readable_active_period?: Translated;
      affected_stations?: Entity[];
      /** Per station: where its shuttle bus stops, or what to do there ("St Nicholas Av at 168 St"). */
      station_alternative?: Array<{ affected_entity?: Entity; notes?: Translated }>;
    };
  };
};

export type SlimAlert = {
  id: string;
  kind: "planned" | "delay" | "notice";
  type: string;
  reroute: boolean;
  text: string;
  description: string;
  agency: string;
  routes: string[];
  stops: string[];
  /** Current active window, unix seconds; end 0 = open-ended. */
  start: number;
  end: number;
  /** Mercury's own wording, e.g. "Oct 19 - 23, Mon to Fri, 9:30 PM to 5:00 AM". */
  period: string;
  /** "Manhattan-bound", "Coney Island-bound", "Both directions" or "". */
  direction: string;
  /** GTFS direction ids of the affected stations (Mercury), when given. */
  directionIds: number[];
  /** Routes the service runs over instead, parsed from "via … [E]" text. */
  via: string[];
  /** Station names parsed from "No [F] service at …" / "skips …" text, for alerts without stop ids. */
  skipNames: string[];
  /** Station-level skips and platform changes (direction-aware). */
  changes: ServiceChange[];
  /** Bus routes named as the replacement ("T102 shuttle buses"). */
  replacement: string[];
  /** The MTA's note for each affected station, usually where its shuttle bus stops (#55). */
  alternatives: Array<{ stop: string; notes: string }>;
};

const en = (t?: Translated) => t?.translation?.find((x) => x.language === "en")?.text ?? "";
const uniq = <T,>(xs: Array<T | undefined>) => [...new Set(xs.filter((x): x is T => x !== undefined && x !== ""))];

/** "a, b, c and d." -> ["a", "b", "c", "d"] */
function nameList(s: string): string[] {
  return s.replace(/\.$/, "").split(/,\s*|\s+and\s+/).map((x) => x.trim()).filter((x) => x && x.length < 60);
}

const cleanEnd = (s: string) => s.replace(/\.$/, "").replace(/^(?:the|and)\s+/i, "").trim();

/**
 * A bus standing in for a train. "Free T102 shuttle buses make all stops
 * between 125 St and Hunts Point Av", and "No [6] between Hunts Point Av and 125 St".
 */
export function replacementBuses(text: string): { routes: string[]; between: string[] } {
  const routes: string[] = [];
  const between: string[] = [];
  const closed = /No \[[A-Z0-9]+\](?: service| trains?)? between\s+(.+?)\s+and\s+([^,.\n]+)/i.exec(text);
  if (closed) between.push(cleanEnd(closed[1]), cleanEnd(closed[2]));
  for (const m of text.matchAll(/\b([A-Z]{1,3}\d{1,4})\s+shuttle buses?\b([^.\n]*)/gi)) {
    routes.push(m[1].toUpperCase());
    const gap = /between\s+(.+?)\s+and\s+([^,.\n]+)/i.exec(m[2]);
    if (gap) between.push(cleanEnd(gap[1]), cleanEnd(gap[2]));
  }
  return { routes: uniq(routes), between: uniq(between) };
}

/** Parse the free-text parts the feed only carries in prose. */
export function parseProse(text: string, route: string | undefined): Pick<SlimAlert, "direction" | "via" | "skipNames"> {
  // "Flushing-bound [7]" — but not "board from the Manhattan-bound platform".
  const bound = [...text.matchAll(/(?:^|[\s,])([A-Z][\w.'/]*(?: [A-Z][\w.'/]*){0,2})-bound(?! platform)/g)][0];
  const direction = bound ? `${bound[1]}-bound` : /both directions/i.test(text) ? "Both directions" : "";
  const via: string[] = [];
  for (const m of text.matchAll(/(?:running|rerouted|runs|then) via (?:the )?(?:[A-Z][\w .'-]*? )?\[([A-Z0-9]+)\]/g)) if (m[1] !== route) via.push(m[1]);
  const skipNames: string[] = [];
  const no = text.match(/No \[[A-Z0-9]+\] (?:service|trains?) (?:at|to|between) ([^\n]+)/i);
  if (no) skipNames.push(...nameList(no[1]));
  const skips = text.match(/skips? ([^\n]+)/i);
  if (skips) skipNames.push(...nameList(skips[1]));
  return { direction, via: uniq(via), skipNames: uniq(skipNames) };
}

/** The alert as of `now`, or, given `until`, its first period that overlaps now…until (planned work for a chosen day). */
export function slimAlert(e: MercuryAlert, now: number, until = now): SlimAlert | null {
  const a = e.alert;
  const period = (a.active_period ?? []).find((p) => (p.start ?? 0) <= until && (!p.end || p.end >= now));
  if (!period) return null;
  const merc = a["transit_realtime.mercury_alert"];
  const type = merc?.alert_type ?? "";
  const text = en(a.header_text);
  const description = en(a.description_text);
  const planned = /^planned/i.test(type) || /maintenance|track work|repairs|construction/i.test(text);
  const kind = planned ? "planned" : /delay|reduced/i.test(type) ? "delay" : "notice";
  const all = `${text}\n${description}`;
  const repl = replacementBuses(all);
  // Reroutes / skipped stops: the informed stops are the ones affected.
  const reroute = /reroute|detour|skipped|express to local|local to express|suspend/i.test(type) || /running via|rerouted|skip|bypass/i.test(text);
  const ents = a.informed_entity ?? [];
  const affected = merc?.affected_stations ?? [];
  const routes = uniq(ents.map((x) => x.route_id));
  return {
    id: e.id,
    kind,
    type,
    reroute,
    text,
    description,
    agency: ents[0]?.agency_id ?? "",
    routes,
    stops: uniq(ents.map((x) => x.stop_id)),
    start: period.start ?? 0,
    end: period.end ?? 0,
    period: en(merc?.human_readable_active_period),
    directionIds: uniq(affected.map((x) => x.direction_id)),
    ...parseProse(all, routes[0]),
    // The header names the reroute; the description often describes other services' changes too.
    via: parseProse(text, routes[0]).via.length ? parseProse(text, routes[0]).via : parseProse(all, routes[0]).via,
    skipNames: uniq([...parseProse(all, routes[0]).skipNames, ...repl.between]),
    changes: serviceChanges({ id: e.id, text, routes }),
    replacement: repl.routes,
    alternatives: (merc?.station_alternative ?? []).flatMap((x) => {
      const notes = en(x.notes).trim();
      return x.affected_entity?.stop_id && notes ? [{ stop: x.affected_entity.stop_id, notes }] : [];
    }),
  };
}
