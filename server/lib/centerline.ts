import { z } from "zod";

/**
 * NYC's own street centerline (DCP CSCL, NYC Open Data inkn-q76z): street-name
 * spellings and an endpoint index that finds where two streets meet. An
 * intersection is a segment endpoint shared by both streets. Used by the
 * permitted-events ingest and by the assistant's corner lookup.
 */
export const CSCL = "https://data.cityofnewyork.us/resource/inkn-q76z.json";

export const BOROUGH_CODE: Record<string, string> = { Manhattan: "1", Bronx: "2", Brooklyn: "3", Queens: "4", "Staten Island": "5" };

const WORDS: Array<[RegExp, string]> = [
  [/\bSTREET\b/g, "ST"], [/\bAVENUE\b/g, "AVE"], [/\bAV\b/g, "AVE"], [/\bBOULEVARD\b/g, "BLVD"], [/\bROAD\b/g, "RD"],
  [/\bPLACE\b/g, "PL"], [/\bPARKWAY\b/g, "PKWY"], [/\bDRIVE\b/g, "DR"], [/\bTERRACE\b/g, "TER"], [/\bLANE\b/g, "LN"],
  [/\bCOURT\b/g, "CT"], [/\bEXPRESSWAY\b/g, "EXPY"], [/\bHIGHWAY\b/g, "HWY"], [/\bSQUARE\b/g, "SQ"], [/\bBEACH\b/g, "BCH"],
  [/\bFT\b/g, "FORT"],
  [/\bFIRST\b/g, "1"], [/\bSECOND\b/g, "2"], [/\bTHIRD\b/g, "3"], [/\bFOURTH\b/g, "4"], [/\bFIFTH\b/g, "5"],
  [/\bSIXTH\b/g, "6"], [/\bSEVENTH\b/g, "7"], [/\bEIGHTH\b/g, "8"], [/\bNINTH\b/g, "9"], [/\bTENTH\b/g, "10"],
  [/\b(\d+)(ST|ND|RD|TH)\b/g, "$1"],
];

const DIRS: Array<[RegExp, string]> = [[/\bEAST\b/g, "E"], [/\bWEST\b/g, "W"], [/\bNORTH\b/g, "N"], [/\bSOUTH\b/g, "S"]];

/** Event street -> CSCL suffix style ("WEST  117 STREET" -> "WEST 117 ST"), spaces collapsed. */
function toCsclName(street: string): string {
  let s = street.toUpperCase().replace(/\s+/g, " ").trim();
  for (const [re, to] of WORDS) s = s.replace(re, to);
  return s;
}

/** Abbreviates directions too, so "WEST BROADWAY" / "W BROADWAY" compare equal. */
const abbreviateDirs = (s: string) => DIRS.reduce((acc, [re, to]) => acc.replace(re, to), s);

/**
 * Spellings to ask CSCL for: Socrata pads numbered streets ("W  117 ST",
 * "E   42 ST") and the padding differs between datasets, so try 1-4 spaces.
 */
export function csclVariants(street: string): string[] {
  const full = toCsclName(street);
  const out = new Set([full, abbreviateDirs(full)]);
  for (const v of [...out]) {
    const m = /^(E|W|N|S|BCH) (\d+)( .*)$/.exec(v);
    if (m) for (const n of [2, 3, 4]) out.add(`${m[1]}${" ".repeat(n)}${m[2]}${m[3]}`);
  }
  return [...out];
}

/** Comparison key: CSCL and events pad numbers differently, so collapse spaces. */
export const streetKey = (s: string): string => abbreviateDirs(toCsclName(s));

const CsclRow = z.object({
  full_street_name: z.string(),
  boroughcode: z.string(),
  the_geom: z.object({ type: z.string(), coordinates: z.array(z.array(z.array(z.number()))).or(z.array(z.array(z.number()))) }),
});
export const CsclRows = z.array(CsclRow);
export type CsclRow = z.infer<typeof CsclRow>;

export type Fetch = (url: string) => Promise<unknown>;
export const pt = (p: number[]): [number, number] => [Number(p[0].toFixed(6)), Number(p[1].toFixed(6))];
const pkey = (p: number[]) => `${p[0].toFixed(5)},${p[1].toFixed(5)}`;

/** Endpoint index for one borough: point -> streets meeting there. */
export class Intersections {
  private ends = new Map<string, { at: [number, number]; streets: Set<string> }>();

  add(rows: CsclRow[]): void {
    for (const r of rows) {
      const g = r.the_geom;
      const lines = (g.type === "MultiLineString" ? g.coordinates : [g.coordinates]) as number[][][];
      for (const line of lines) {
        for (const p of [line[0], line[line.length - 1]]) {
          if (!p) continue;
          const k = pkey(p);
          const e = this.ends.get(k) ?? { at: pt(p), streets: new Set<string>() };
          e.streets.add(streetKey(r.full_street_name));
          this.ends.set(k, e);
        }
      }
    }
  }

  /** Where streets a and b meet (both as streetKey), or null. */
  find(a: string, b: string): [number, number] | null {
    for (const e of this.ends.values()) if (e.streets.has(a) && e.streets.has(b)) return e.at;
    return null;
  }
}

/** Socrata `in (...)` list, quotes escaped. */
export const soqlList = (names: string[]) => names.map((n) => `'${n.replace(/'/g, "''")}'`).join(",");
