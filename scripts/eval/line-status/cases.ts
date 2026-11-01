/**
 * Saved cases for line status questions (#629). A scenario is one moment of the alert feed plus
 * the ways a rider might ask about it. The alert wording is the MTA's own (recorded 2026-10-23
 * and 2026-11-01); changing the feed's order, adding an unrelated alert or rewording the
 * question must not change the facts in the answer, which is what the groups test.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { FeedAlert } from "../../../src/lib/transit/trouble";
import type { Case, Snapshot } from "./types";

const AS_OF = "2026-11-01T08:40:00Z";
const asOfS = Date.parse(AS_OF) / 1000;

const alert = (id: string, routes: string[], text: string, type: string): FeedAlert => ({
  id,
  alert: {
    active_period: [{ start: asOfS - 86_400 }],
    informed_entity: routes.map((route_id) => ({ route_id })),
    header_text: { translation: [{ text, language: "en" }] },
    "transit_realtime.mercury_alert": { alert_type: type },
  },
});

const A_DELAY = alert("fx:a:delay", ["A"], "Downtown [A] trains are running with delays while we conduct track maintenance on the line throughout Manhattan.", "Delays");
const A_INWOOD = alert("fx:a:inwood", ["A"], "In Brooklyn and Lower Manhattan, no Inwood-bound [A] at High St, Fulton St, Chambers St, Canal St and Spring St", "Planned - Stops Skipped");
const A_QUEENS = alert("fx:a:queens", ["A"], "In Brooklyn, Queens-bound [A] local skips Lafayette Av, Clinton-Washington Avs, Franklin Av and Kingston-Throop Avs", "Planned - Stops Skipped");
const NQ_FIRE = alert("fx:nq:fire", ["N", "Q"], "Downtown [N][Q] trains are running with delays after FDNY extinguished a track fire earlier at Canal St.", "Delays");
const G_OUT = alert("fx:g:out", ["G"], "No [G] between Bedford-Nostrand Avs and Court Sq. Free [shuttle bus icon] T403 shuttle buses run between those stations.", "Planned - Part Suspended");
const SEVEN_WORK = alert("fx:7:work", ["7"], "In Queens, no [7] at Flushing-Main St", "Planned - Stops Skipped");

interface Scenario {
  id: string;
  split: Case["split"];
  lines: string[];
  alerts: FeedAlert[];
  /** Placed in the feed by the "unrelated alert" variant: an alert for a line the question is not about. */
  unrelated: FeedAlert;
  about?: string[];
  asks: Array<{ variant: string; text: string }>;
}

const SCENARIOS: Scenario[] = [
  {
    id: "a-trouble", split: "train", lines: ["A"], alerts: [A_DELAY, A_INWOOD, A_QUEENS], unrelated: SEVEN_WORK, about: ["Times Square", "Times Sq-42 St"],
    asks: [
      { variant: "times-square", text: "Is the A train running near Times Square right now?" },
      { variant: "plain", text: "Is the A running?" },
      { variant: "typo", text: "is teh A train runing ok rn" },
      { variant: "spanish", text: "¿Está funcionando el tren A ahora?" },
      { variant: "get-to-brooklyn", text: "I need the A to Brooklyn, what's wrong with it today?" },
    ],
  },
  {
    id: "nq-fire", split: "train", lines: ["N", "Q"], alerts: [NQ_FIRE], unrelated: SEVEN_WORK,
    asks: [
      { variant: "plain", text: "Are the N and Q trains delayed?" },
      { variant: "why", text: "Why is the Q so slow?" },
      { variant: "chinese", text: "N线和Q线现在正常吗？" },
    ],
  },
  {
    id: "l-quiet", split: "train", lines: ["L"], alerts: [A_DELAY], unrelated: SEVEN_WORK,
    asks: [
      { variant: "plain", text: "Is the L train running okay?" },
      { variant: "bedford", text: "Any problems on the L at Bedford Av?" },
    ],
  },
  {
    id: "four-quiet", split: "train", lines: ["4"], alerts: [NQ_FIRE], unrelated: SEVEN_WORK, about: ["Grand Central", "Grand Central-42 St"],
    asks: [
      { variant: "grand-central", text: "Is the 4 train okay at Grand Central?" },
      { variant: "plain", text: "Is the 4 on time?" },
    ],
  },
  {
    id: "g-suspended", split: "heldout", lines: ["G"], alerts: [G_OUT], unrelated: SEVEN_WORK,
    asks: [
      { variant: "plain", text: "Is the G running?" },
      { variant: "alternative", text: "The G isn't working, how do I get to Court Square?" },
      { variant: "russian", text: "Поезд G сейчас ходит?" },
    ],
  },
  {
    id: "seven-quiet", split: "heldout", lines: ["7"], alerts: [A_DELAY, A_QUEENS], unrelated: NQ_FIRE,
    asks: [
      { variant: "plain", text: "Is the 7 train running right now?" },
      { variant: "flushing", text: "Is the 7 stopping at Flushing-Main St?" },
    ],
  },
];

const snap = (alerts: FeedAlert[]): Snapshot => ({ asOf: AS_OF, alerts });

/** Every scenario × question × feed variant. Feed variants of one question share a group; so do wordings of one feed. */
export function builtinCases(): Case[] {
  const out: Case[] = [];
  for (const sc of SCENARIOS) {
    const feeds: Array<[string, FeedAlert[]]> = [["base", sc.alerts], ["reordered", [...sc.alerts].reverse()], ["plus-unrelated", [...sc.alerts, sc.unrelated]]];
    for (const ask of sc.asks) {
      for (const [feed, alerts] of feeds) {
        if (feed === "reordered" && sc.alerts.length < 2) continue;
        out.push({
          id: `${sc.id}/${ask.variant}/${feed}`, split: sc.split, group: `${sc.id}/${ask.variant}`, variant: feed,
          lines: sc.lines, question: ask.text, about: sc.about, snapshot: snap(alerts),
        });
      }
    }
    // Wordings of one feed: the answer's facts must not depend on how it was asked.
    for (const ask of sc.asks) {
      out.push({ id: `${sc.id}/${ask.variant}/wording`, split: sc.split, group: `${sc.id}/wording`, variant: ask.variant, lines: sc.lines, question: ask.text, about: sc.about, snapshot: snap(sc.alerts) });
    }
  }
  return out;
}

/** Whole scenarios (not single questions) go to the held-out half, so wording cannot leak across the split. */
export const splitOf = (key: string): Case["split"] => (createHash("sha256").update(key).digest()[0] < 64 ? "heldout" : "train");

/** Cases written by the generator (generate.ts), one JSON file per batch. */
export function generatedCases(dir: string): Case[] {
  try {
    return readdirSync(dir).filter((f) => f.endsWith(".json")).flatMap((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as Case[]);
  } catch {
    return [];
  }
}

/** A recorded feed becomes one "is the X running?" case per line it mentions: a replay of that moment. */
export function snapshotCases(dir: string): Case[] {
  let files: string[] = [];
  try { files = readdirSync(dir).filter((f) => f.endsWith(".json")); } catch { return []; }
  return files.flatMap((f) => {
    const s = JSON.parse(readFileSync(join(dir, f), "utf8")) as Snapshot;
    const routes = [...new Set(s.alerts.flatMap((a) => (a.alert.informed_entity ?? []).flatMap((e) => (e.route_id ? [e.route_id] : []))))].slice(0, 6);
    return routes.map((line) => ({
      id: `snapshot/${f.replace(/\.json$/, "")}/${line}`, split: splitOf(`${f}`), group: `snapshot/${f}/${line}`, variant: "replay",
      lines: [line], question: `Is the ${line} train running right now?`, snapshot: s,
    }));
  });
}
