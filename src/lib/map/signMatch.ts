/**
 * Which of a station's signs a phone camera is reading, so the rider's place and
 * facing can come from the sign instead of GPS, which is weak below the street.
 * The words come from a text reader that drops letters, misreads the line
 * bullets and picks up tiles and adverts, so the match is by word, tolerant of
 * partial reads ("Fulton", "Exit Broadway"), and it says how sure it is. Many
 * signs say the same thing (the station's name hangs every 20 m), so a match
 * also says whether the words pin one spot or only the station. Pure: no camera,
 * no DOM. The signs are those `placeSigns` hangs in the app's own model.
 */

/** A sign as `placeSigns` returns it; only what the match reads. */
export interface ReadableSign {
  kind: string;
  /** Its middle, local metres (x east, y north), and height. */
  x: number; y: number; z: number;
  /** The way its face looks, radians anticlockwise from east. */
  angle: number;
  /** It hangs free with a face on both sides. */
  back: boolean;
  name: string;
  routes: ReadonlyArray<{ short: string }>;
  /** An exit's street corner, or "Uptown" / "Downtown". */
  words?: string;
}

export interface SignMatch<S extends ReadableSign = ReadableSign> {
  /** The best sign: among equals, the one nearest `near`, else the first. */
  sign: S;
  /** Every sign whose words fit the read equally well. */
  same: S[];
  /** How well the words fit, 0 to 1. */
  score: number;
  /** The score, lowered when another wording fits nearly as well. */
  confidence: number;
  /** "spot": the words pin one place (within `SPOT_M`). "station": they fit signs far apart. */
  level: "spot" | "station";
  /** The farthest two of `same` are apart, metres. */
  spreadM: number;
  /** Compass bearings (degrees clockwise from north) the rider may be facing: one for a wall sign, two for a sign with a face on both sides. */
  facing: number[];
}

/** Signs this close together count as one place. */
const SPOT_M = 12;
/** Below this the read is not called a match. */
const MIN_SCORE = 0.5;
/** Wordings within this of the best are equals. */
const TIE = 0.05;
/** A sign this much nearer `near` than the next equal is taken as the one. */
const NEAR_M = 25;

const SAME_WORD: Record<string, string> = {
  street: "st", str: "st", avenue: "av", ave: "av", square: "sq", place: "pl", plaza: "plz", boulevard: "blvd", road: "rd", parkway: "pkwy",
  north: "n", south: "s", east: "e", west: "w", northwest: "nw", northeast: "ne", southwest: "sw", southeast: "se", and: "",
};
/** Words on most signs: they say little about which sign it is. */
const COMMON = new Set(["st", "av", "sq", "pl", "plz", "blvd", "rd", "pkwy", "corner"]);

/** Lower-case words of a text: accents and punctuation dropped, "Street" and "St" made one, "42nd" made "42". */
export function signWords(text: string): string[] {
  return text
    .normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, " ").split(" ")
    .map((w) => SAME_WORD[w] ?? w.replace(/^(\d+)(st|nd|rd|th)$/, "$1"))
    .filter(Boolean);
}

/** What a sign's face says: its words and, apart, its line bullets. */
export function signFace(s: ReadableSign): { words: string[]; bullets: string[] } {
  const text = s.kind === "exit" ? `Exit ${s.words ?? ""}` : s.kind === "name" ? s.name : s.words ?? "";
  return { words: signWords(text), bullets: s.routes.map((r) => r.short.toLowerCase()) };
}

function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = row;
  }
  return prev[b.length];
}

/** How alike a read word and a sign's word are, 0 to 1. Short words and numbers must match exactly. */
export function wordFit(read: string, sign: string): number {
  if (read === sign) return 1;
  if (sign.length < 4 || read.length < 3 || /\d/.test(sign) || /\d/.test(read)) return 0;
  // A read cut short: "broadw" for "broadway".
  if (read.length >= 4 && sign.startsWith(read)) return 0.75;
  const d = editDistance(read, sign, 2);
  if (d === 1) return 0.8;
  if (d === 2 && sign.length >= 8) return 0.6;
  return 0;
}

const best = (word: string, among: string[], fit: (a: string, b: string) => number) => among.reduce((m, w) => Math.max(m, fit(word, w)), 0);

/**
 * How well a read fits one sign's face. A read word the sign does not have counts
 * hard against it (the camera saw a word that is not there); a sign word missing
 * from the read counts little (the read was cut short). Bullets only help or hurt
 * when the read has single letters or digits that could be bullets.
 */
function fitFace(read: string[], face: { words: string[]; bullets: string[] }, weight: (w: string) => number): number {
  const single = read.filter((w) => w.length === 1);
  const long = read.filter((w) => w.length > 1);
  if (!face.words.length) {
    // A sign of bullets alone: every bullet read must be on it.
    if (!single.length || !face.bullets.length || long.some((w) => w.length >= 4)) return 0;
    const hit = single.filter((b) => face.bullets.includes(b)).length;
    return (hit / single.length) * (0.5 + 0.5 * (hit / face.bullets.length));
  }
  let [have, haveAll, said, saidAll] = [0, 0, 0, 0];
  for (const w of face.words) { const k = weight(w); haveAll += k; have += k * best(w, long, (a, b) => wordFit(b, a)); }
  for (const r of long) {
    const f = best(r, face.words, wordFit);
    // Scraps of two or three letters are mostly noise from tiles and arrows.
    const k = f > 0 ? weight(face.words.find((w) => wordFit(r, w) === f)!) : r.length >= 4 ? 1 : 0.25;
    saidAll += k; said += k * f;
  }
  if (!saidAll || !have) return 0;
  let score = (said / saidAll) * (0.5 + 0.5 * (have / haveAll));
  if (single.length && face.bullets.length) {
    const hit = single.filter((b) => face.bullets.includes(b)).length;
    score *= 0.85 + 0.15 * (hit / single.length);
  }
  return score;
}

/** Compass bearing (degrees clockwise from north) of a direction given in radians anticlockwise from east. */
export function bearingOf(angle: number): number {
  return (((90 - (angle * 180) / Math.PI) % 360) + 360) % 360;
}

/** Signed turn from `from` to `to`, degrees in (-180, 180]: positive is to the right. */
export function turnBetween(from: number, to: number): number {
  const d = (((to - from) % 360) + 360) % 360;
  return d > 180 ? d - 360 : d;
}

/** Someone reading a sign looks against the way its face looks; a sign with two faces leaves two answers. */
export function facingOf(s: ReadableSign): number[] {
  const toward = bearingOf(s.angle + Math.PI);
  return s.back ? [toward, bearingOf(s.angle)] : [toward];
}

/**
 * The sign the read words belong to, or null when nothing fits well enough.
 * `near`: where the rider was last thought to be (local metres), to choose among signs that say the same.
 */
export function matchSign<S extends ReadableSign>(text: string, signs: readonly S[], near?: { x: number; y: number }): SignMatch<S> | null {
  const read = signWords(text);
  if (!read.length || !signs.length) return null;
  // One entry per wording, with every sign that says it.
  const faces = new Map<string, { face: ReturnType<typeof signFace>; signs: S[] }>();
  for (const s of signs) {
    const face = signFace(s);
    const key = `${face.words.join(" ")}|${face.bullets.join(" ")}`;
    const had = faces.get(key);
    if (had) had.signs.push(s);
    else faces.set(key, { face, signs: [s] });
  }
  // A word on few of the station's wordings says more than one on most of them.
  const n = faces.size;
  const seen = new Map<string, number>();
  for (const { face } of faces.values()) for (const w of new Set(face.words)) seen.set(w, (seen.get(w) ?? 0) + 1);
  const weight = (w: string) => (COMMON.has(w) ? 0.3 : 1 + Math.min(1.5, Math.log(n / (seen.get(w) ?? 1))));
  // The reader often drops the gap between two words ("FultonSt"): split a word no sign has into two that signs do have.
  const known = (w: string) => seen.has(w) || COMMON.has(w);
  const words = read.flatMap((w) => {
    if (w.length < 5 || known(w)) return [w];
    for (let i = 2; i <= w.length - 2; i++) if (known(w.slice(0, i)) && known(w.slice(i))) return [w.slice(0, i), w.slice(i)];
    return [w];
  });

  const ranked = [...faces.values()].map((f) => ({ ...f, score: fitFace(words, f.face, weight) })).sort((a, b) => b.score - a.score);
  const top = ranked[0];
  if (top.score < MIN_SCORE) return null;
  const equals = ranked.filter((f) => top.score - f.score <= TIE);
  const next = ranked.find((f) => top.score - f.score > TIE)?.score ?? 0;
  let same = equals.flatMap((f) => f.signs);

  if (near && same.length > 1) {
    const by = same.map((s) => ({ s, d: Math.hypot(s.x - near.x, s.y - near.y) })).sort((a, b) => a.d - b.d);
    if (by[1].d - by[0].d >= NEAR_M) same = [by[0].s];
    else same = by.map((b) => b.s);
  }
  let spreadM = 0;
  for (const a of same) for (const b of same) spreadM = Math.max(spreadM, Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z));
  const level = spreadM <= SPOT_M ? "spot" : "station";
  const sign = same[0];
  // The same facing from every equal sign is still an answer; otherwise only the best sign's.
  const facing = facingOf(sign);
  const margin = Math.min(1, (top.score - next) / 0.2);
  return { sign, same, score: top.score, confidence: top.score * (0.6 + 0.4 * margin), level, spreadM, facing };
}

/**
 * The one facing a match gives, degrees clockwise from north, or null. A sign with
 * two faces needs the phone's compass to say which side the rider is on; the
 * compass only has to be right to within a quarter turn for that.
 */
export function facingFrom(match: Pick<SignMatch, "facing" | "level">, compass: number | null): number | null {
  if (match.level !== "spot") return null;
  if (match.facing.length === 1) return match.facing[0];
  if (compass === null) return null;
  const [a, b] = match.facing.map((f) => ({ f, off: Math.abs(turnBetween(compass, f)) })).sort((p, q) => p.off - q.off);
  return b.off - a.off < 40 ? null : a.f;
}

/** Bearing from one point of the station to another, degrees clockwise from north (local metres, x east, y north). */
export function bearingBetween(from: { x: number; y: number }, to: { x: number; y: number }): number {
  return bearingOf(Math.atan2(to.y - from.y, to.x - from.x));
}

/**
 * The exit sign to walk to: the one whose street corner fits `wanted` (the trip's exit, in words), else the nearest.
 * Straight-line distance; the walls between are not known here.
 */
export function exitToward<S extends ReadableSign>(signs: readonly S[], from: { x: number; y: number }, wanted?: string): S | null {
  const exits = signs.filter((s) => s.kind === "exit");
  if (!exits.length) return null;
  const named = wanted ? matchSign(wanted, exits.filter((s) => s.words), from) : null;
  if (named) return named.sign;
  return exits.reduce((a, b) => (Math.hypot(a.x - from.x, a.y - from.y) <= Math.hypot(b.x - from.x, b.y - from.y) ? a : b));
}
