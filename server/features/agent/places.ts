/**
 * Landmark and station names win over street-address geocoding. NYC GeoSearch
 * matches tokens, so "Grand Central" can land on "700 Esplanade Gardens Plaza"
 * in Harlem. We check a curated landmark list, then GTFS station names, and
 * only then fall back to GeoSearch (best confidence first).
 */
import type { LngLatTuple } from "../../../src/features/agent/schema";
import type { Station } from "./transit";

interface Landmark { label: string; at: LngLatTuple; aliases: string[] }

export const LANDMARKS: readonly Landmark[] = [
  { label: "Grand Central Terminal", at: [-73.9772, 40.7527], aliases: ["grand central", "grand central terminal", "grand central station", "gct"] },
  { label: "Penn Station", at: [-73.9935, 40.7506], aliases: ["penn station", "penn", "pennsylvania station", "moynihan train hall", "moynihan"] },
  { label: "Port Authority Bus Terminal", at: [-73.9903, 40.7570], aliases: ["port authority", "port authority bus terminal", "pabt"] },
  { label: "Times Square", at: [-73.9855, 40.7580], aliases: ["times square", "times sq", "times sq 42 st"] },
  { label: "Union Square", at: [-73.9903, 40.7359], aliases: ["union square", "union sq"] },
  { label: "Barclays Center", at: [-73.9754, 40.6826], aliases: ["barclays center", "barclays", "barclays centre"] },
  { label: "World Trade Center (Oculus)", at: [-74.0110, 40.7114], aliases: ["world trade center", "wtc", "oculus", "the oculus", "wtc oculus", "one world trade center"] },
  { label: "Columbus Circle", at: [-73.9819, 40.7681], aliases: ["columbus circle"] },
  { label: "Herald Square", at: [-73.9878, 40.7497], aliases: ["herald square", "herald sq"] },
  { label: "Empire State Building", at: [-73.9857, 40.7484], aliases: ["empire state building", "empire state"] },
  { label: "Rockefeller Center", at: [-73.9787, 40.7587], aliases: ["rockefeller center", "rockefeller centre", "30 rock"] },
  { label: "Madison Square Garden", at: [-73.9934, 40.7505], aliases: ["madison square garden", "msg"] },
  { label: "Yankee Stadium", at: [-73.9262, 40.8296], aliases: ["yankee stadium"] },
  { label: "Citi Field", at: [-73.8458, 40.7571], aliases: ["citi field"] },
  { label: "Brooklyn Bridge", at: [-73.9969, 40.7061], aliases: ["brooklyn bridge"] },
  { label: "Central Park", at: [-73.9654, 40.7829], aliases: ["central park"] },
  { label: "Washington Square Park", at: [-73.9973, 40.7308], aliases: ["washington square park", "washington square"] },
  { label: "JFK Airport", at: [-73.7781, 40.6413], aliases: ["jfk", "jfk airport", "kennedy airport"] },
  { label: "Rockaway Beach (Beach 98 St boardwalk)", at: [-73.8197, 40.5833], aliases: ["rockaway beach", "rockaway beach boardwalk", "the rockaways", "rockaways", "rockaway boardwalk"] },
  { label: "LaGuardia Airport", at: [-73.8740, 40.7769], aliases: ["laguardia", "lga", "laguardia airport"] },
  // Neighbourhoods by name. GeoSearch reads a bare "Flushing" as the venue
  // "Flushing Bay" at LaGuardia, so each sits at its main corner and station.
  { label: "Flushing (Main St and Roosevelt Ave)", at: [-73.8303, 40.7596], aliases: ["flushing", "downtown flushing", "flushing chinatown"] },
  { label: "Jackson Heights (Roosevelt Ave and 74 St)", at: [-73.8913, 40.7468], aliases: ["jackson heights"] },
  { label: "Elmhurst (Broadway and Elmhurst Ave)", at: [-73.8820, 40.7424], aliases: ["elmhurst"] },
  { label: "Corona (Roosevelt Ave and 103 St)", at: [-73.8627, 40.7499], aliases: ["corona"] },
  { label: "Jamaica (Parsons Blvd and Archer Ave)", at: [-73.8010, 40.7022], aliases: ["jamaica", "downtown jamaica"] },
  { label: "Astoria (30 Ave and 31 St)", at: [-73.9216, 40.7668], aliases: ["astoria"] },
  { label: "Long Island City (Court Sq)", at: [-73.9456, 40.7471], aliases: ["long island city", "lic"] },
  { label: "Chinatown (Canal St and Mott St)", at: [-73.9970, 40.7158], aliases: ["chinatown", "manhattan chinatown"] },
  { label: "Koreatown (W 32 St and Broadway)", at: [-73.9867, 40.7479], aliases: ["koreatown", "k town", "ktown"] },
  { label: "Harlem (125 St and Lenox Ave)", at: [-73.9455, 40.8077], aliases: ["harlem"] },
  { label: "Washington Heights (181 St and St Nicholas Ave)", at: [-73.9336, 40.8496], aliases: ["washington heights"] },
  { label: "Downtown Brooklyn (Jay St-MetroTech)", at: [-73.9874, 40.6923], aliases: ["downtown brooklyn"] },
  { label: "Williamsburg (Bedford Ave and N 7 St)", at: [-73.9566, 40.7172], aliases: ["williamsburg"] },
  { label: "Bushwick (Myrtle-Wyckoff Aves)", at: [-73.9122, 40.6995], aliases: ["bushwick"] },
  { label: "Sunset Park (8 Ave and 62 St)", at: [-74.0113, 40.6352], aliases: ["sunset park", "brooklyn chinatown"] },
  { label: "Flatbush (Flatbush Ave and Church Ave)", at: [-73.9586, 40.6509], aliases: ["flatbush"] },
  { label: "Brighton Beach (Brighton Beach Ave)", at: [-73.9614, 40.5777], aliases: ["brighton beach"] },
  { label: "Coney Island (Stillwell Ave)", at: [-73.9811, 40.5773], aliases: ["coney island"] },
];

/** Lowercase, "&"→"and", drop punctuation, collapse spaces, drop a trailing ", NY…". */
export function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/,?\s*(new york|nyc|ny|manhattan|brooklyn|queens|bronx)\s*$/g, "")
    .replace(/&/g, " and ")
    .replace(/\bstreet\b/g, "st")
    .replace(/\bsquare\b/g, "sq")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function matchLandmark(text: string): Landmark | null {
  const q = norm(text).replace(/^the /, "");
  return LANDMARKS.find((l) => l.aliases.some((a) => norm(a) === q)) ?? null;
}

/** "86 St (4 5 6 trains)" → the name and the trains; the form a place read-back writes back into the question. */
const TRAINS = /\s*\(([1-7A-Z ]+?) trains?\)/;

/**
 * Exact (normalized) station name match, ignoring a trailing " station". "34 St-Herald Sq" also matches "34 st herald sq".
 * Trains in brackets ("86 St (4 5 6 trains)", from a read-back) pick the one of several same-name stations that serves them.
 */
export function matchStation(text: string, stations: Station[]): Station | null {
  const trains = TRAINS.exec(text)?.[1].split(" ").filter(Boolean) ?? [];
  const q = norm(text.replace(TRAINS, "")).replace(/ (station|stop|subway station)$/, "");
  if (q.length < 3) return null;
  return stations.find((s) => norm(s.name) === q && trains.every((r) => s.routes.includes(r))) ?? null;
}

export interface GeoCandidate { label: string; at: LngLatTuple; confidence: number }

/** Highest confidence wins; GeoSearch's order breaks ties. Below minConfidence, nothing. */
export function bestCandidate(cands: GeoCandidate[], minConfidence = 0.5): GeoCandidate | null {
  let best: GeoCandidate | null = null;
  for (const c of cands) if (c.confidence >= minConfidence && (!best || c.confidence > best.confidence)) best = c;
  return best;
}
