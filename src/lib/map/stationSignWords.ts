/**
 * What a station's signs say: its name, its lines as bullets, the tracks that
 * tell which lines stop at which platform, and its wall trim colour. Kept apart
 * from where the signs hang (stationSigns.ts), which loads with the 3D view.
 */
type P = [number, number];

/** A line's round bullet: its letter or number and colours. */
export type Bullet = { route: string; short: string; color: string; text: string };

export interface SignInfo {
  /** Each station in the model (a complex has several): its name and the lines that stop there. */
  stations: Array<{ name: string; routes: Bullet[] }>;
  /** Each line's track through the station, local metres. */
  lines: Array<{ route: string; c: P[] }>;
  /** The colour of the band along the tile walls. */
  trim: string;
}

/** The bullets for a station's `routes` field ("4 5 6 6X"): express runs drawn as their line, shuttles as one S, each once. */
export function bulletsFor(routes: string, table: Record<string, { short: string; color: string; text: string }>): Bullet[] {
  const out: Bullet[] = [];
  for (const r of routes.split(/\s+/).filter(Boolean)) {
    const base = /^[0-9A-Z]X$/.test(r) ? r[0] : r;
    const t = table[base];
    if (!t || out.some((b) => b.short === t.short)) continue;
    out.push({ route: base, short: t.short, color: t.color, text: t.text });
  }
  return out;
}

/** Trim colours seen on station walls (the band varies station to station); one is picked per station. */
const TRIMS = ["#8a2432", "#2f6b45", "#25508f", "#b8892b", "#5d3a86", "#a8502a", "#2a7f80", "#6b6f2a"];
export function trimFor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return TRIMS[Math.abs(h) % TRIMS.length];
}
