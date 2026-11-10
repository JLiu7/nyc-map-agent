import type { ExitPlace } from "./mapRead";

/**
 * A street corner in a few words, as NYC street signs read ("6 Av & W 47 St · SE corner").
 * Shared by the labels over street entrances and the Exit signs inside a station.
 */
const WORDS: Record<string, string> = { Avenue: "Av", Street: "St", Place: "Pl", Road: "Rd", Boulevard: "Blvd", Parkway: "Pkwy", Square: "Sq", Drive: "Dr", Lane: "Ln", Plaza: "Plz", Terrace: "Ter", West: "W", East: "E", North: "N", South: "S" };

/** "West 47th Street" → "W 47 St", as NYC street signs read; a label over a stair has room for a few words only. */
export function shortStreet(name: string): string {
  return name.split(" ").map((w) => WORDS[w] ?? w.replace(/^(\d+)(st|nd|rd|th)$/i, "$1")).join(" ");
}

/** The corner line, or null when the tiles have no street names here yet. */
export function cornerLine(place: ExitPlace): string | null {
  if (!place.streets) return null;
  // Avenue first, as people say it ("6 Av & W 47 St"), so two stairs on one corner read the same.
  const streets = place.streets.map(shortStreet).sort((a, b) => Number(/\bAv\b/.test(b)) - Number(/\bAv\b/.test(a)) || a.localeCompare(b)).join(" & ");
  return place.corner ? `${streets} · ${place.corner} corner` : streets;
}
