/**
 * What the voice says on the dollhouse walk (owner, 2026-11-12): where the figure stepped off the
 * train (front, middle or back, and the side the train leaves on), so people know roughly where they
 * are, then short directions as it walks ("Take the first left", "Up the stairs"). English here; the
 * trip translates its lines into the app's language before they are shown and spoken.
 */
import { walkAt, walkLength, walkPlaces, type DollhouseModel } from "./dollhouse";

type P3 = [number, number, number];
/** `f` is how far along the walk (0 to 1); `wait` marks the line said while the train is still in. */
export type WalkCallout = { f: number; text: string; wait?: boolean };

const CARS = 10;
/** Said this far before the turn or stair it is about. */
const LEAD_M = 6;

/** "Turn left" or "Bear right"; the walk's first turn is "Walk ahead, then take the first left". */
function turnLine(deg: number, first: boolean): string {
  const side = deg > 0 ? "right" : "left";
  if (Math.abs(deg) < 60) return first ? `Walk ahead, then bear ${side}.` : `Bear ${side}.`;
  return first ? `Walk ahead, then take the first ${side}.` : `Turn ${side}.`;
}

/** Turns along the walk: where (metres walked) and by how much (degrees, right positive). */
function turns(path: P3[]): Array<{ at: number; deg: number }> {
  const out: Array<{ at: number; deg: number }> = [];
  // Headings of the level stretches only: a stair's own bends are part of "take the stairs".
  let walked = 0, last: number | null = null;
  for (let i = 1; i < path.length; i++) {
    const [a, b] = [path[i - 1], path[i]];
    const flat = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const len = Math.hypot(flat, b[2] - a[2]);
    if (flat > 1.2 && Math.abs(b[2] - a[2]) < 0.3) {
      const heading = Math.atan2(b[0] - a[0], b[1] - a[1]);
      if (last != null) {
        const deg = (Math.atan2(Math.sin(heading - last), Math.cos(heading - last)) * 180) / Math.PI;
        if (Math.abs(deg) >= 35) {
          const prev = out[out.length - 1];
          // Two bends a few steps apart are one turn.
          if (prev && walked - prev.at < 4) prev.deg += deg;
          else out.push({ at: walked, deg });
        }
      }
      last = heading;
    }
    walked += len;
  }
  return out.filter((t) => Math.abs(t.deg) >= 35);
}

/**
 * The walk's spoken lines. `exitLine` names the corner the exit comes up on ("Fulton St & Nassau St ·
 * NE corner"), or the street.
 */
export function walkCallouts(model: DollhouseModel, path: P3[], exitLine: string | null): WalkCallout[] {
  const L = walkLength(path);
  if (L <= 0) return [];
  const at = (m: number) => Math.min(Math.max(m / L, 0), 1);
  const out: WalkCallout[] = [];

  // Where on the train: the door the figure steps out of, along the train standing at the platform.
  const start = path[0];
  const { at: track, angle } = model.track;
  const ux = Math.cos(angle), uy = Math.sin(angle);
  const along = (start[0] - track[0]) * ux + (start[1] - track[1]) * uy;
  // The train stands centred on that door (dollhouse.ts), so ask instead where the platform is:
  // how far the door is from the platform's ends, along the track.
  // Only this platform's edges: Fulton St's model also has the A/C platform's, a level below.
  const ends = model.edges.filter((e) => Math.abs(e[4] - start[2]) < 0.5).flatMap(([x1, y1, x2, y2]) => [(x1 - track[0]) * ux + (y1 - track[1]) * uy, (x2 - track[0]) * ux + (y2 - track[1]) * uy]);
  const lo = Math.min(...ends), hi = Math.max(...ends);
  // The train leaves toward +along: its front is the high end.
  const k = hi > lo ? (along - lo) / (hi - lo) : 0.5;
  const car = Math.min(CARS, Math.max(1, CARS - Math.floor(k * CARS)));
  const part = k > 0.66 ? "near the front" : k < 0.34 ? "near the back" : "in the middle";
  // Which side the train is on, facing the way the walk starts.
  const p1 = walkAt(path, Math.min(3 / L, 1));
  const hx = p1.x - start[0], hy = p1.y - start[1];
  const tx = track[0] + ux * along - start[0], ty = track[1] + uy * along - start[1];
  const side = hx * ty - hy * tx < 0 ? "right" : "left";
  out.push({ f: 0, wait: true, text: `You got off ${part} of the train, about car ${car} of ${CARS}. The train pulls out on your ${side}.` });

  // Directions: turns, stairs and the fare line, each said a few steps before.
  const { signs, gates } = walkPlaces(path);
  const metresTo = (p: P3) => {
    let best = 0, bestD = Infinity, walked = 0;
    for (let i = 1; i < path.length; i++) {
      const [a, b] = [path[i - 1], path[i]];
      const d = Math.hypot(a[0] - p[0], a[1] - p[1], a[2] - p[2]);
      if (d < bestD) { bestD = d; best = walked; }
      walked += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    }
    return best;
  };
  type Ev = { m: number; text: (first: boolean) => string };
  const events: Ev[] = [];
  for (const t of turns(path)) events.push({ m: t.at, text: (first) => turnLine(t.deg, first) });
  for (const s of signs) {
    const m = metresTo(s.at);
    if (s.last) events.push({ m, text: () => `Up the stairs to the street${exitLine ? `: ${exitLine}` : ""}.` });
    else events.push({ m, text: () => (s.up ? "Take the stairs up." : "Take the stairs down.") });
  }
  if (gates) events.push({ m: metresTo(gates.at), text: () => "Out through the turnstiles or the exit gate." });
  events.sort((a, b) => a.m - b.m);
  let lastF = 0;
  let lastText = "", lastM = -Infinity;
  events.forEach((e, i) => {
    const text = e.text(i === 0);
    // One flight of stairs in a few pieces is said once.
    if (text === lastText && e.m - lastM < 12) { lastM = e.m; return; }
    // At least a little after the line before, so each is heard.
    const f = Math.max(at(e.m - LEAD_M), lastF + 0.02, 0.02);
    if (f >= 0.99) return;
    out.push({ f, text: i === 0 && !text.startsWith("Walk ahead") ? `${text.slice(0, -1)}, just ahead.` : text });
    lastF = f; lastText = text; lastM = e.m;
  });
  out.push({ f: 1, text: exitLine ? `You're on the street at ${exitLine}.` : "You're on the street." });
  return out;
}
