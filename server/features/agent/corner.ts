/**
 * Street corners ("Fulton Street and Broadway, New York") for the assistant's
 * place lookup. GeoSearch only knows addresses, so it answered that corner with
 * 14 Fulton St by the Seaport (live trace, 2026-11-09). The corner table
 * (data/corners.json, built by scripts/build-corners.ts from the city's street
 * centerline) lists every point where named streets meet; this finds the
 * corner's two streets there, in the named borough or Manhattan when none is.
 */
import { readFileSync } from "node:fs";
import { streetKey } from "../../lib/centerline";
import type { LngLatTuple } from "../../../src/features/agent/schema";
import { boroughOf } from "./places";

export interface Corner { a: string; b: string; borough: string }
export interface CornerTable { [borough: string]: { names: string[]; nodes: number[][] } }

const CODE: Record<string, string> = { M: "1", Bx: "2", Bk: "3", Q: "4", SI: "5" };
const BOROUGH_NAME: Record<string, string> = { "1": "Manhattan", "2": "Bronx", "3": "Brooklyn", "4": "Queens", "5": "Staten Island" };

const DIR = String.raw`(?:(?:east|west|north|south|e|w|n|s)\.?\s+)?`;
const SUFFIX = /\b(?:st|street|ave|avenue|av|blvd|boulevard|rd|road|pl|place|dr|drive|pkwy|parkway|ln|lane|way|ter|terrace|ct|court|hwy|highway|expy|expressway|plaza|row|slip)\.?$/i;
const NAMED = new RegExp(`^${DIR}(?:broadway|bowery|the bowery)$`, "i");
const NUMBERED = new RegExp(`^${DIR}\\d+(?:st|nd|rd|th)?$`, "i");
const JOIN = /\s+(?:and|at|x)\s+|\s*[&/@]\s*/i;

/** A part of the text that names a street, not a place ("Rego Park", "the Met"). */
export const looksLikeStreet = (s: string): boolean => SUFFIX.test(s) || NAMED.test(s) || NUMBERED.test(s);

/** "Fulton Street and Broadway, New York" -> Fulton Street / Broadway in Manhattan; null when it is not two streets. */
export function parseCorner(text: string): Corner | null {
  const head = text.split(",")[0].trim().replace(/^(?:the\s+)?(?:corner|intersection)\s+of\s+/i, "");
  const parts = head.split(JOIN).map((p) => p.trim());
  if (parts.length !== 2 || !parts.every(looksLikeStreet)) return null;
  return { a: parts[0], b: parts[1], borough: CODE[boroughOf(text) ?? "M"] ?? "1" };
}

/** Street keys to look for: a bare number ("42nd", "42 St") may be East or West 42 St. */
function keysFor(street: string): string[] {
  const key = streetKey(/^\d+(?:st|nd|rd|th)?$/i.test(street.trim()) ? `${street} street` : street);
  return /^\d+ ST$/.test(key) ? [key, `E ${key}`, `W ${key}`] : [key];
}

type Index = Map<string, number[][]>;
const indexes = new Map<CornerTable, Map<string, Index>>();

/** Per borough: street key -> the corners on that street. Built once per table. */
function indexOf(table: CornerTable, borough: string): Index {
  let byBorough = indexes.get(table);
  if (!byBorough) indexes.set(table, (byBorough = new Map<string, Index>()));
  let idx = byBorough.get(borough);
  if (idx) return idx;
  idx = new Map();
  const t = table[borough];
  if (t) {
    const keys = t.names.map(streetKey);
    for (const node of t.nodes) {
      for (const i of node.slice(2)) {
        const list = idx.get(keys[i]) ?? [];
        list.push(node);
        idx.set(keys[i], list);
      }
    }
  }
  byBorough.set(borough, idx);
  return idx;
}

let shipped: CornerTable | null = null;
const shippedTable = (): CornerTable =>
  (shipped ??= JSON.parse(readFileSync(new URL("./data/corners.json", import.meta.url), "utf8")) as CornerTable);

/**
 * Where the corner's two streets meet, or null when they don't meet in that
 * borough. A wide crossing (a divided avenue) has several nodes a few metres
 * apart; their middle is the corner.
 */
export function findCorner(corner: Corner, table: CornerTable = shippedTable()): { label: string; at: LngLatTuple } | null {
  const t = table[corner.borough];
  if (!t) return null;
  const idx = indexOf(table, corner.borough);
  const bs = new Set(keysFor(corner.b));
  const hits = keysFor(corner.a).flatMap((a) => (idx.get(a) ?? []).filter((node) => node.slice(2).some((i) => bs.has(streetKey(t.names[i])))));
  if (!hits.length) return null;
  const [x0, y0] = hits[0];
  // 1e-5 degrees is about a metre; keep nodes within about 120 m of the first.
  const near = hits.filter(([x, y]) => Math.hypot((x - x0) * 0.76, y - y0) < 110);
  const lon = near.reduce((s, n) => s + n[0], 0) / near.length / 1e5;
  const lat = near.reduce((s, n) => s + n[1], 0) / near.length / 1e5;
  return { label: `${corner.a} & ${corner.b}, ${BOROUGH_NAME[corner.borough]}`, at: [Number(lon.toFixed(5)), Number(lat.toFixed(5))] };
}
