/**
 * The dollhouse view of a station walk (owner, 2026-11-12, #129): a blocky figure seen from above
 * and behind, inside the station's model drawn in the map itself, so the streets show around it and
 * the walk carries on out of the exit. Walls are see-through and every level above the figure is
 * cut away, so nothing hides it.
 *
 * It opens on the whole platform from above, with the 4/5 train standing at it and the figure by
 * the door it just stepped out of; the camera then eases down behind the figure while the train
 * pulls out, and the figure walks past the signs and through the fare gates to the street.
 *
 * The model is a triangle mesh in metres east, north and up of its origin (street level is 0),
 * with one walk per street exit (each starting a step in from the platform's edge), the platform
 * edges, the downtown track, the station's own lines and the lines it transfers to. Fulton St's
 * comes from Project Subway NYC's station model (credited in the map's credits). Its floors, stairs
 * and walls are dressed here: concrete, stair treads with yellow nosings, cream tile walls with a
 * buff base and a terracotta band, and ceiling lights along the walk. The fare gates and the
 * MTA-style signs are not in that model either: they are placed by rule along the walk (the
 * platform's name a few metres along, an exit sign at each stair, the gates on the last level
 * stretch before the stair to the street), not surveyed.
 */
import * as THREE from "three";
import type { CustomLayerInterface, Map as MaplibreMap } from "maplibre-gl";
import { LEGACY_LIGHT, MercatorCoordinate, sharedRenderer } from "./core";

type P3 = [number, number, number];
type DollhouseWalk = { exit: [number, number]; path: P3[] };
export type DollhouseModel = {
  origin: [number, number];
  /** x, y, z per vertex, metres. */
  v: number[];
  /** Three vertex indices per triangle. */
  t: number[];
  /** One walk from the downtown 4/5 platform to each street exit, feet on the model. */
  walks: DollhouseWalk[];
  /** Platform edges over a track bed: x1, y1, x2, y2, z. */
  edges: Array<[number, number, number, number, number]>;
  /** The downtown 4/5 track beside where the walks start: rail height, and the way the train leaves (radians from east). */
  track: { at: P3; angle: number };
  /** The routes that stop at the platform the walks start from, with their bullet colours: [route, "#rrggbb"]. */
  lines: Array<[string, string]>;
  /** The other routes this station connects to, for the transfer signs. */
  transfers: Array<[string, string]>;
};

type WalkPose = { x: number; y: number; z: number; /** Radians, 0 = north, clockwise. */ heading: number; /** Metres walked so far. */ walked: number };

/** What the trip says each frame: how far along the walk (0 to 1), how far the train has pulled out (0 to 1), or where on the street. */
export type DollhouseState = { walk: number | null; wait: number | null; street: { lon: number; lat: number; heading: number } | null };
/** A camera in the map's terms: eye and the point looked at, with their heights in metres (negative is underground). */
export type DollhouseRig = { eye: [number, number]; eyeAlt: number; look: [number, number]; lookAlt: number };

/** How far the cut sits above the figure's feet: over its head, under the next floor up. */
const CUT_ABOVE_FEET_M = 2.3;
/** Walls stop at this height above the figure's feet, over the tile band, so the rooms read from above. */
const WALL_ABOVE_FEET_M = 2.6;
const FIGURE_M = 1.75;
/** The chase camera: close behind the figure's back and a little over its head (owner, 2026-11-12). */
const BACK_M = 7;
const UP_M = 4.4;
const LOOK_M = 1.2;
/** An exit this close to where a walk comes up is that walk's exit. */
const EXIT_MATCH_M = 50;
/** How long the figure takes to glide from the model's last stair onto the street walk. */
const GLIDE_MS = 1500;
/** Lexington Avenue line green, for the train's stripe. */
const LEX_GREEN = 0x00933c;
const CAR_M = 15.5, CARS = 10;
/** The train pulls out over this many metres of the figure's walk, then it is gone. */
const PULL_OUT_M = 25;
/** The share of the wait spent on the overview of the platform before the camera eases in. */
const OVERVIEW_END = 0.4;
/** The overview's tilt from straight down. */
const OVERVIEW_TILT = (15 * Math.PI) / 180;
/** The map's vertical field of view (MapLibre's default), to fit the train in the overview. */
const MAP_FOV = (36.87 * Math.PI) / 180;
/** Ceiling lights: a strip this far above the walk, every few metres, cut away above this height over the feet. */
const LIGHT_UP_M = 2.9, LIGHT_EVERY_M = 5, LIGHT_CUT_M = 3.2, LIGHT_ASIDE_M = 1.3;
/** Signs on the levels above are cut away over this height above the feet. */
const SIGN_CUT_M = 4;
/** One step's rise, for the stair treads' stripes. */
const STEP_RISE_M = 0.178;
/** The raised walls' tile pattern covers this height from the wall's foot. */
const WALL_PATTERN_M = 3;

/** Length of a walk in metres, stairs measured along their slope. */
export function walkLength(walk: P3[]): number {
  let total = 0;
  for (let i = 1; i < walk.length; i++) total += Math.hypot(walk[i][0] - walk[i - 1][0], walk[i][1] - walk[i - 1][1], walk[i][2] - walk[i - 1][2]);
  return total;
}

/** Where the figure stands a fraction `f` (0 to 1) of the way along the walk, and which way it faces. */
export function walkAt(walk: P3[], f: number): WalkPose {
  const total = walkLength(walk);
  const want = Math.min(Math.max(f, 0), 1) * total;
  let done = 0;
  for (let i = 1; i < walk.length; i++) {
    const [ax, ay, az] = walk[i - 1], [bx, by, bz] = walk[i];
    const len = Math.hypot(bx - ax, by - ay, bz - az);
    if (done + len >= want || i === walk.length - 1) {
      const k = len > 0 ? Math.min((want - done) / len, 1) : 0;
      return { x: ax + (bx - ax) * k, y: ay + (by - ay) * k, z: az + (bz - az) * k, heading: Math.atan2(bx - ax, by - ay), walked: want };
    }
    done += len;
  }
  const [x, y, z] = walk[0] ?? [0, 0, 0];
  return { x, y, z, heading: 0, walked: 0 };
}

const metresBetween = (a: [number, number], b: [number, number]) =>
  Math.hypot((a[0] - b[0]) * 111_320 * Math.cos((a[1] * Math.PI) / 180), (a[1] - b[1]) * 111_320);

/** The walk that comes up at `exit` (the trip's exit), or null when the model has no walk to it. */
export function pickWalk(model: DollhouseModel, exit: [number, number]): DollhouseWalk | null {
  let best: DollhouseWalk | null = null, bestD = EXIT_MATCH_M;
  for (const w of model.walks) {
    const d = metresBetween(w.exit, exit);
    if (d < bestD) { best = w; bestD = d; }
  }
  return best;
}

/** Where along the walk things go: the stair feet and heads (signs) and the fare line (gates). */
export function walkPlaces(walk: P3[]): { signs: Array<{ at: P3; heading: number; up: boolean; last: boolean }>; gates: { at: P3; heading: number } | null } {
  const signs: Array<{ at: P3; heading: number; up: boolean; last: boolean }> = [];
  const lastClimb = (() => {
    for (let i = walk.length - 2; i >= 0; i--) if (walk[i + 1][2] - walk[i][2] > 0.3 && walk[i][2] < -0.6) {
      let j = i;
      while (j > 0 && walk[j][2] - walk[j - 1][2] > 0.05) j--;
      return j;
    }
    return -1;
  })();
  for (let i = 0; i < walk.length - 1; i++) {
    const dz = walk[i + 1][2] - walk[i][2];
    const flatBefore = i === 0 || Math.abs(walk[i][2] - walk[i - 1][2]) < 0.2;
    if (Math.abs(dz) < 0.3 || !flatBefore) continue;
    const heading = Math.atan2(walk[i + 1][0] - walk[i][0], walk[i + 1][1] - walk[i][1]);
    signs.push({ at: walk[i], heading, up: dz > 0, last: i === lastClimb });
  }
  let gates: { at: P3; heading: number } | null = null;
  if (lastClimb > 0) {
    // Back along the level stretch before the last stair: the fare line sits a few metres short of it.
    const foot = walk[lastClimb];
    let back = 0;
    for (let i = lastClimb; i > 0; i--) {
      const [a, b] = [walk[i - 1], walk[i]];
      if (Math.abs(a[2] - foot[2]) > 0.2) break;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const want = 3.5 - back;
      if (len >= want) {
        const k = want / len;
        gates = { at: [b[0] + (a[0] - b[0]) * k, b[1] + (a[1] - b[1]) * k, foot[2]], heading: Math.atan2(b[0] - a[0], b[1] - a[1]) };
        break;
      }
      back += len;
    }
  }
  return { signs, gates };
}

/** Where the high exit gate stands along the fare line, from the walk's lane (metres, to the walker's left is negative). */
const HIGH_GATE_X = -2.9;

/**
 * The signs along a walk and what they say, by the MTA's rules (owner, 2026-11-12):
 * - the platform's name about 9 m along, 2.6 m up: the platform's bullets and "Fulton St", then
 *   "Downtown & Brooklyn";
 * - a stair going down: "↓ Exit & transfer", the transfer bullets under it (never a street with a
 *   down arrow: going down leads away from the street);
 * - a stair going up that is not the last: "↑ Exit", then the transfer bullets while the walk still
 *   goes down to another line's passage, else the street corner;
 * - the last stair up, to the street: "↑ Exit", then the street corner;
 * - a small "Exit" over the high exit gate at the fare line.
 * `corner` is the exit's street corner ("Fulton St & Nassau St · NE corner"), or null when unknown.
 */
export function planSigns(model: DollhouseModel, walk: DollhouseWalk, corner: string | null): SignPlan[] {
  const path = walk.path, start = path[0];
  const out: SignPlan[] = [];
  const hung = walkAt(path, Math.min(9 / Math.max(walkLength(path), 1), 0.5));
  const toward = Math.hypot(hung.x - start[0], hung.y - start[1]) > 1 ? Math.atan2(hung.x - start[0], hung.y - start[1]) : hung.heading;
  out.push({
    at: [hung.x, hung.y, Math.max(hung.z, start[2]) + 2.6],
    heading: toward,
    lines: [{ bullets: model.lines, text: "Fulton St" }, { text: "Downtown & Brooklyn" }],
  });
  const transfers: SignLine | null = model.transfers.length ? { bullets: model.transfers } : null;
  const street: SignLine | null = corner ? { text: corner } : null;
  const places = walkPlaces(path);
  for (const s of places.signs) {
    const i = path.indexOf(s.at);
    let lines: [SignLine, SignLine | null];
    if (!s.up) lines = [{ arrow: "down", text: "Exit & transfer" }, transfers];
    else if (s.last) lines = [{ arrow: "up", text: "Exit" }, street];
    else {
      // Another line's passage is still ahead while the walk goes down again past this stair.
      const lower = path.slice(i + 1).some((p) => p[2] < s.at[2] - 0.5);
      lines = [{ arrow: "up", text: "Exit" }, lower && transfers ? transfers : street];
    }
    // Hung a little short of the stair, facing whoever walks up to it; a stair the walk starts at
    // gets its sign a few metres in, ahead of the figure rather than over it.
    const ahead = i === 0 ? -3 : 1.5;
    out.push({ at: [s.at[0] - Math.sin(s.heading) * ahead, s.at[1] - Math.cos(s.heading) * ahead, s.at[2] + 2.4], heading: s.heading, lines });
  }
  if (places.gates) {
    const { at, heading } = places.gates;
    out.push({ at: [at[0] + HIGH_GATE_X * Math.cos(heading), at[1] - HIGH_GATE_X * Math.sin(heading), at[2] + 2.62], heading, lines: [{ text: "Exit" }, null], small: true });
  }
  return out;
}

function box(w: number, d: number, h: number, color: number, clip: THREE.Plane[] = []): THREE.Mesh {
  return new THREE.Mesh(new THREE.BoxGeometry(w, d, h), new THREE.MeshLambertMaterial({ color, clippingPlanes: clip }));
}

/** A simple blocky figure, feet at the group's origin, facing +y. Its limbs swing as it walks. */
function buildFigure(): { group: THREE.Group; stride: (walkedM: number, moving: boolean) => void } {
  const group = new THREE.Group();
  const leg = 0.78, torso = 0.62, head = 0.32;
  const limb = (x: number, top: number, len: number, w: number, color: number) => {
    // Pivot at the hip or shoulder so the limb swings from its top.
    const pivot = new THREE.Group();
    pivot.position.set(x, 0, top);
    const part = box(w, w, len, color);
    part.position.z = -len / 2;
    pivot.add(part);
    group.add(pivot);
    return pivot;
  };
  const legL = limb(-0.13, leg, leg, 0.22, 0x1e3a8a), legR = limb(0.13, leg, leg, 0.22, 0x1e3a8a);
  const body = box(0.52, 0.28, torso, 0xf97316);
  body.position.z = leg + torso / 2;
  const top = box(head, head, head, 0xfcd9b6);
  top.position.z = leg + torso + head / 2 + 0.03;
  const armL = limb(-0.36, leg + torso - 0.04, 0.58, 0.17, 0xf97316), armR = limb(0.36, leg + torso - 0.04, 0.58, 0.17, 0xf97316);
  group.add(body, top);
  group.scale.setScalar(FIGURE_M / (leg + torso + head + 0.03));
  const stride = (walkedM: number, moving: boolean) => {
    const swing = moving ? Math.sin((walkedM / 0.7) * Math.PI) * 0.6 : 0;
    legL.rotation.x = swing; legR.rotation.x = -swing;
    armL.rotation.x = -swing * 0.8; armR.rotation.x = swing * 0.8;
  };
  return { group, stride };
}

/** A canvas and its 2D context, for the textures drawn here. */
function canvas2d(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return [c, c.getContext("2d")!];
}

/** The same "random" speckle every time, so the floors look alike from frame to frame. */
function seeded(seed: number): () => number {
  let x = seed;
  return () => { x = (x * 1664525 + 1013904223) % 4294967296; return x / 4294967296; };
}

/** Concrete: near white with a faint speckle, multiplied by the floors' greys. */
function concreteTexture(): THREE.Texture {
  const [c, g] = canvas2d(128, 128);
  g.fillStyle = "#ecebe7"; g.fillRect(0, 0, 128, 128);
  const rnd = seeded(7);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = rnd() < 0.6 ? "#d3d1cb" : rnd() < 0.5 ? "#c4c1ba" : "#fbfaf7";
    const r = rnd() < 0.85 ? 1 : 2;
    g.fillRect(Math.floor(rnd() * 128), Math.floor(rnd() * 128), r, r);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * One stair step, bottom to top (v = 0 is the foot of the step): a dark riser, the yellow safety
 * nosing on the tread's front edge, then the grey tread.
 */
function treadTexture(): THREE.Texture {
  const [c, g] = canvas2d(16, 64);
  // The canvas is drawn top down; v runs bottom up.
  g.fillStyle = "#c4c2bd"; g.fillRect(0, 0, 16, 64);
  g.fillStyle = "#e9b824"; g.fillRect(0, 44, 16, 9);
  g.fillStyle = "#4a4845"; g.fillRect(0, 53, 16, 11);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Subway wall tile over the whole height of a wall (WALL_PATTERN_M), 0.6 m wide: a buff base
 * course at the foot, cream glazed 0.15 m tiles with grey grout above it, and a terracotta mosaic
 * band at about 2.3 to 2.5 m.
 */
function wallTexture(): THREE.Texture {
  const W = 128, perM = W / 0.6, H = Math.round(WALL_PATTERN_M * perM);
  const [c, g] = canvas2d(W, H);
  const y = (m: number) => H - m * perM; // metres up from the foot to canvas rows
  const tile = 0.15 * perM;
  g.fillStyle = "#efe7d2"; g.fillRect(0, 0, W, H);
  // Base course: larger buff tiles.
  g.fillStyle = "#b99c6b"; g.fillRect(0, y(0.3), W, 0.3 * perM);
  // The band: small terracotta squares over a dark red ground, a cream line above and below.
  const bandTop = y(2.5), bandBottom = y(2.3);
  g.fillStyle = "#7c3426"; g.fillRect(0, bandTop, W, bandBottom - bandTop);
  const rnd = seeded(11);
  const sq = (bandBottom - bandTop - 6) / 4;
  for (let row = 0; row < 4; row++) for (let col = 0; col * sq < W; col++) {
    g.fillStyle = ["#a24b35", "#8f3f2e", "#b8613f", "#6e2f24"][Math.floor(rnd() * 4)];
    g.fillRect(col * sq + 1, bandTop + 3 + row * sq + 1, sq - 1.5, sq - 1.5);
  }
  g.fillStyle = "#3a3632"; g.fillRect(0, bandTop - 2, W, 2); g.fillRect(0, bandBottom, W, 2);
  // Grout over the cream tiles and the base.
  g.fillStyle = "#a8a296";
  for (let m = 0.3; m < WALL_PATTERN_M; m += 0.15) if (m < 2.29 || m > 2.51) g.fillRect(0, y(m) - 1, W, 2);
  for (let x = 0; x < W; x += tile) {
    g.fillRect(x, 0, 2, bandTop - 2);
    g.fillRect(x, bandBottom + 2, 2, y(0.3) - bandBottom - 2);
  }
  g.fillStyle = "#8a7550";
  g.fillRect(0, y(0.3) - 1, W, 2);
  for (let x = 0; x < W; x += 0.3 * perM) g.fillRect(x, y(0.3), 2, 0.3 * perM);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.anisotropy = 4;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** One line of a sign: an arrow, route bullets, then words, left to right. */
type SignLine = { arrow?: "up" | "down"; bullets?: Array<[string, string]>; text?: string };
/** A sign to hang: where (the panel's middle), the way the walker faces when reading it, and its big and small lines. */
type SignPlan = { at: P3; heading: number; lines: [SignLine, SignLine | null]; small?: boolean };

const SIGN_FONT = (px: number) => `bold ${px}px "Helvetica Neue", Helvetica, Arial, sans-serif`;

/** Whether a bullet colour is light enough (the yellow N, Q, R, W) to need black lettering. */
function lightBullet(hex: string): boolean {
  const n = parseInt(hex.replace("#", ""), 16);
  return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) > 160;
}

/** Draws (or with `draw` false only measures) one sign line from `x`, centred on `mid`; returns its width. */
function signLine(g: CanvasRenderingContext2D, line: SignLine, x: number, mid: number, size: number, draw: boolean): number {
  let cx = x;
  const gap = size * 0.3;
  const items: number[] = [];
  if (line.arrow) {
    const w = size * 0.72, h = size * 0.92;
    if (draw) {
      const dir = line.arrow === "up" ? -1 : 1, tip = mid + (dir * h) / 2, base = mid - (dir * h) / 2, neck = tip - dir * w * 0.55;
      g.fillStyle = "#fff";
      g.beginPath();
      g.moveTo(cx + w / 2, tip); g.lineTo(cx + w, neck); g.lineTo(cx + w * 0.64, neck); g.lineTo(cx + w * 0.64, base);
      g.lineTo(cx + w * 0.36, base); g.lineTo(cx + w * 0.36, neck); g.lineTo(cx, neck); g.closePath(); g.fill();
    }
    items.push(w);
  }
  const bullets = line.bullets ?? [];
  if (bullets.length) {
    const d = size * 1.04, step = d + size * 0.14;
    if (draw) bullets.forEach(([route, colour], i) => {
      const bx = cx + (items.length ? items.reduce((a, b) => a + b + gap, 0) : 0) + i * step + d / 2;
      g.fillStyle = colour; g.beginPath(); g.arc(bx, mid, d / 2, 0, Math.PI * 2); g.fill();
      g.fillStyle = lightBullet(colour) ? "#000" : "#fff";
      g.font = SIGN_FONT(Math.round(size * 0.8)); g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(route, bx, mid + size * 0.05);
    });
    items.push(bullets.length * step - size * 0.14);
  }
  if (line.text) {
    g.font = SIGN_FONT(Math.round(size));
    const w = g.measureText(line.text).width;
    if (draw) {
      const tx = cx + (items.length ? items.reduce((a, b) => a + b + gap, 0) : 0);
      g.fillStyle = "#fff"; g.textAlign = "left"; g.textBaseline = "middle";
      g.fillText(line.text, tx, mid + size * 0.05);
    }
    items.push(w);
  }
  cx += items.reduce((a, b) => a + b, 0) + gap * Math.max(items.length - 1, 0);
  return cx - x;
}

/**
 * A sign as the MTA hangs them: a black panel with a thin white rule along its top, white
 * Helvetica Bold, route bullets in their colours, a big first line and an optional smaller second
 * line. The panel widens to fit its words (up to 4 m; past that the lettering shrinks) and hangs
 * from two thin rods. The group's origin is the panel's middle; it faces -y (turn it with
 * rotation.z = -heading to face someone walking that way).
 */
function signMesh(lines: [SignLine, SignLine | null], clip: THREE.Plane[], small = false): THREE.Group {
  const PX = 256, pad = 0.12, maxW = 4;
  let big = (small ? 0.15 : 0.24) * PX, little = 0.15 * PX;
  const [, probe] = canvas2d(4, 4);
  const content = () => Math.max(signLine(probe, lines[0], 0, 0, big, false), lines[1] ? signLine(probe, lines[1], 0, 0, little, false) : 0);
  let inner = content();
  if (inner > (maxW - 2 * pad) * PX) {
    const k = ((maxW - 2 * pad) * PX) / inner;
    big *= k; little *= k; inner = content();
  }
  const ruleAt = 0.035 * PX, top = ruleAt + 0.03 * PX;
  const row1 = big * 1.45, row2 = lines[1] ? little * 1.5 : 0;
  const w = Math.max(inner / PX + 2 * pad, small ? 0.7 : 1.4), h = (top + row1 + row2) / PX + 0.06;
  const [c, g] = canvas2d(Math.round(w * PX), Math.round(h * PX));
  g.fillStyle = "#111214"; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = "#f4f4f2"; g.fillRect(0, ruleAt, c.width, Math.max(2, 0.012 * PX));
  signLine(g, lines[0], pad * PX, top + row1 / 2, big, true);
  if (lines[1]) signLine(g, lines[1], pad * PX, top + row1 + row2 / 2 - little * 0.05, little, true);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  const group = new THREE.Group();
  const front = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, clippingPlanes: clip }));
  front.rotation.x = Math.PI / 2;
  const back = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: 0x111214, clippingPlanes: clip }));
  back.rotation.x = -Math.PI / 2;
  back.position.y = 0.01;
  group.add(front, back);
  const rodX = w / 2 - Math.min(0.3, w / 4);
  for (const x of [-rodX, rodX]) {
    const rod = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.025, 0.6), new THREE.MeshBasicMaterial({ color: 0x2a2c30, clippingPlanes: clip }));
    rod.position.set(x, 0.005, h / 2 + 0.3);
    group.add(rod);
  }
  return group;
}

/** A waist-high turnstile, walked through along +y: its body to the right of the lane, its three arms across it. */
function turnstile(): { group: THREE.Group; rotor: THREE.Group } {
  const group = new THREE.Group();
  const steel = 0xc7ccd3;
  const body = box(0.3, 0.9, 0.95, steel);
  body.position.set(0.32, 0, 0.475);
  const top = box(0.34, 0.95, 0.06, 0x3a3f47);
  top.position.set(0.32, 0, 0.98);
  const rotor = new THREE.Group();
  rotor.position.set(0.17, 0, 0.85);
  for (let i = 0; i < 3; i++) {
    const arm = box(0.5, 0.05, 0.05, steel);
    arm.position.x = -0.25;
    const holder = new THREE.Group();
    holder.rotation.y = (i * 2 * Math.PI) / 3;
    holder.add(arm);
    rotor.add(holder);
  }
  group.add(body, top, rotor);
  return { group, rotor };
}

/** The tall gate that only lets people out: a cage of bars, full height. */
function highExitGate(): THREE.Group {
  const group = new THREE.Group();
  const frame = 0x5b616b;
  for (const x of [-0.6, 0.6]) { const post = box(0.08, 0.08, 2.3, frame); post.position.set(x, 0, 1.15); group.add(post); }
  const lintel = box(1.28, 0.1, 0.08, frame); lintel.position.set(0, 0, 2.3); group.add(lintel);
  for (let i = 0; i < 9; i++) { const bar = box(0.04, 0.04, 2.2, 0x9aa1ab); bar.position.set(-0.5 + i * 0.125, 0, 1.12); group.add(bar); }
  return group;
}

/** The emergency gate: a waist-high swing gate with its red sign. */
function emergencyGate(): THREE.Group {
  const group = new THREE.Group();
  const post = box(0.1, 0.1, 1.05, 0x5b616b); post.position.set(-0.55, 0, 0.52); group.add(post);
  const leaf = box(1.0, 0.04, 0.8, 0xc7ccd3); leaf.position.set(0, 0, 0.55); group.add(leaf);
  const red = box(0.5, 0.05, 0.16, 0xd62f2f); red.position.set(0, 0.03, 0.8); group.add(red);
  return group;
}

function dispose(root: THREE.Object3D) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    mesh.geometry?.dispose();
    const mat = mesh.material;
    (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach((m) => { (m as THREE.MeshBasicMaterial).map?.dispose(); m.dispose(); });
  });
}

type Dollhouse = {
  layer: CustomLayerInterface;
  /** The chase camera for this frame: behind and above the figure, its bearing eased toward the way it walks. */
  rig: (dt: number) => DollhouseRig | null;
};

export const DOLLHOUSE_LAYER = "dollhouse";

/** A wall to raise: from (x1, y1, z1) to (x2, y2, z2) along a floor's outer edge. */
type WallRun = [number, number, number, number, number, number];
const WALL_M = 3;
/** The model's upright pieces up to this tall are left out (see the surfaces in dollhouseLayer). */
const LOW_PIECE_M = 1.3;
/** How thick walls are drawn (owner, 2026-11-13: one-sided walls read as sheets of paper). */
const WALL_THICK_M = 0.25;
/** The flat colour a wall shows where the cut above the figure slices through it: its cap. */
const WALL_CAP_COLOR = 0xcfc6b2;

/**
 * Pushes a closed prism: the flat face `face` (3 or 4 corners, metres) pushed `by` metres along `dir`
 * (a horizontal unit vector). Every triangle faces outward, so the inside shows only where a clipping
 * plane opens the prism, and the back-face material paints that opening as a solid cap.
 * Tile coordinates run along the wall (`along`) and up it from `foot`.
 */
function pushPrism(pos: number[], uv: number[], face: number[][], dir: [number, number], by: number, along: [number, number], foot: number) {
  const back = face.map(([x, y, z]) => [x + dir[0] * by, y + dir[1] * by, z]);
  const n = face.length;
  const all = [...face, ...back];
  const c = [0, 1, 2].map((k) => all.reduce((s, p) => s + p[k], 0) / all.length);
  const tri = (a: number[], b: number[], d: number[]) => {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
    const nn = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    const out = (a[0] + b[0] + d[0]) / 3 - c[0], outY = (a[1] + b[1] + d[1]) / 3 - c[1], outZ = (a[2] + b[2] + d[2]) / 3 - c[2];
    const order = nn[0] * out + nn[1] * outY + nn[2] * outZ < 0 ? [a, d, b] : [a, b, d];
    for (const p of order) { pos.push(p[0], p[1], p[2]); uv.push((p[0] * along[0] + p[1] * along[1]) / 0.6, (p[2] - foot) / WALL_PATTERN_M); }
  };
  for (let i = 1; i + 1 < n; i++) { tri(face[0], face[i], face[i + 1]); tri(back[0], back[i], back[i + 1]); }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    tri(face[i], face[j], back[j]);
    tri(face[i], back[j], back[i]);
  }
}
/** The guide on the floor: its colour, the line's width, and an arrow this often (metres). */
const GUIDE_COLOR = 0x1d6ff2;
const GUIDE_W = 0.3;
const ARROW_EVERY_M = 3;

/**
 * The walk drawn on the floor: a line a hand wide and arrows pointing the way. It rides a few
 * centimetres over the floor, and higher on a stair so the step nosings do not cut it.
 */
function guideLine(path: P3[], clip: THREE.Plane[]): THREE.Mesh {
  const total = walkLength(path);
  const pos: number[] = [];
  const at = (d: number) => walkAt(path, Math.min(Math.max(d / total, 0), 1));
  const lift = (d: number) => (Math.abs(at(d + 0.25).z - at(d - 0.25).z) > 0.05 ? 0.22 : 0.04);
  /** A point `side` metres to the right of the walk at `d`, and `ahead` metres along it. */
  const off = (d: number, side: number, ahead = 0): P3 => {
    const p = at(d), h = p.heading;
    return [p.x + Math.cos(h) * side + Math.sin(h) * ahead, p.y - Math.sin(h) * side + Math.cos(h) * ahead, p.z + lift(d)];
  };
  const STEP = 0.4;
  for (let d = 0; d < total; d += STEP) {
    const e = Math.min(d + STEP, total);
    const [a, b, c, q] = [off(d, -GUIDE_W / 2), off(d, GUIDE_W / 2), off(e, GUIDE_W / 2), off(e, -GUIDE_W / 2)];
    pos.push(...a, ...b, ...c, ...a, ...c, ...q);
  }
  // Arrows on the level stretches, where they lie flat and read.
  for (let d = ARROW_EVERY_M / 2; d < total - 1; d += ARROW_EVERY_M) {
    if (lift(d) > 0.05) continue;
    const tip = off(d, 0, 0.55), l = off(d, -0.45, -0.1), r = off(d, 0.45, -0.1);
    [tip, l, r].forEach((p) => (p[2] += 0.01));
    pos.push(...tip, ...r, ...l);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  const mat = new THREE.MeshBasicMaterial({ color: GUIDE_COLOR, side: THREE.DoubleSide, clippingPlanes: clip, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  return new THREE.Mesh(geo, mat);
}

/** The grid the wall finder buckets floors and steps in, metres a cell. */
const CELL_M = 2;
const cellKey = (x: number, y: number) => `${Math.floor(x / CELL_M)},${Math.floor(y / CELL_M)}`;
/** Calls `fn` with each grid cell the points' bounding box touches. */
export function forCells(points: ArrayLike<ArrayLike<number>>, fn: (key: string) => void): void {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]);
  }
  for (let i = Math.floor(x0 / CELL_M); i <= Math.floor(x1 / CELL_M); i++) for (let j = Math.floor(y0 / CELL_M); j <= Math.floor(y1 / CELL_M); j++) fn(`${i},${j}`);
}

/**
 * The model has floors and stairs but no walls taller than a railing, so the station's walls are
 * raised here: along every outer edge of a floor or stair, except where more floor carries on just
 * past it (a seam between two pieces of the model) and along the platform's edge by the track.
 */
export function outlineWalls(model: DollhouseModel): WallRun[] {
  const { v, t } = model;
  const P = (k: number): P3 => [v[k * 3], v[k * 3 + 1], v[k * 3 + 2]];
  const floors: P3[][] = [];
  for (let i = 0; i < t.length; i += 3) {
    const tri = [P(t[i]), P(t[i + 1]), P(t[i + 2])];
    const [a, b, c] = tri;
    const nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
    const ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
    const nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const len = Math.hypot(nx, ny, nz);
    if (len > 1e-9 && Math.abs(nz) / len >= 0.3) floors.push(tri);
  }
  const key = (p: P3) => `${Math.round(p[0] * 20)},${Math.round(p[1] * 20)},${Math.round(p[2] * 20)}`;
  const uses = new Map<string, number>();
  const edgeKey = (p: P3, q: P3) => [key(p), key(q)].sort().join("|");
  for (const tri of floors) for (let e = 0; e < 3; e++) {
    const k = edgeKey(tri[e], tri[(e + 1) % 3]);
    uses.set(k, (uses.get(k) ?? 0) + 1);
  }
  // Floors bucketed in a grid by their bounding boxes, so a lookup checks only those nearby.
  const floorGrid = new Map<string, P3[][]>();
  for (const tri of floors) forCells(tri, (k) => { const list = floorGrid.get(k); if (list) list.push(tri); else floorGrid.set(k, [tri]); });
  /** Whether some floor lies under (x, y) within 0.4 m of height z. */
  const floorAt = (x: number, y: number, z: number) => (floorGrid.get(cellKey(x, y)) ?? []).some(([a, b, c]) => {
    const d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
    if (Math.abs(d) < 1e-9) return false;
    const u = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / d;
    const w = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / d;
    if (u < -0.01 || w < -0.01 || u + w > 1.01) return false;
    return Math.abs(u * a[2] + w * b[2] + (1 - u - w) * c[2] - z) < 0.4;
  });
  const nearEdge = (x: number, y: number, z: number) => model.edges.some(([x1, y1, x2, y2, ez]) => {
    if (Math.abs(z - ez) > 0.5) return false;
    const dx = x2 - x1, dy = y2 - y1, L2 = dx * dx + dy * dy || 1e-9;
    const k = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / L2));
    return Math.hypot(x - (x1 + dx * k), y - (y1 + dy * k)) < 1;
  });
  // The walks' own steps: where two pieces of floor meet at slightly different heights the seam looks
  // like an edge, and a wall there would stand across the way.
  const steps: Array<[P3, P3]> = model.walks.flatMap((w) => w.path.slice(1).map((q, i): [P3, P3] => [w.path[i], q]));
  const stepGrid = new Map<string, Array<[P3, P3]>>();
  for (const step of steps) forCells(step, (k) => { const list = stepGrid.get(k); if (list) list.push(step); else stepGrid.set(k, [step]); });
  const side = (a: P3 | number[], b: P3 | number[], p: P3 | number[]) => Math.sign((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]));
  const crossed = (p: P3, q: P3) => {
    const near = new Set<[P3, P3]>();
    forCells([p, q], (k) => stepGrid.get(k)?.forEach((s) => near.add(s)));
    return [...near].some(([a, b]) => Math.abs((a[2] + b[2]) / 2 - (p[2] + q[2]) / 2) < 1.5
      && side(p, q, a) * side(p, q, b) <= 0 && side(a, b, p) * side(a, b, q) <= 0);
  };
  const runs: WallRun[] = [];
  for (const tri of floors) for (let e = 0; e < 3; e++) {
    const p = tri[e], q = tri[(e + 1) % 3], o = tri[(e + 2) % 3];
    if (uses.get(edgeKey(p, q)) !== 1) continue;
    const L = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (L < 0.05) continue;
    const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2, mz = (p[2] + q[2]) / 2;
    // Outward: away from the triangle's third corner.
    let ox = -(q[1] - p[1]) / L, oy = (q[0] - p[0]) / L;
    if ((o[0] - mx) * ox + (o[1] - my) * oy > 0) { ox = -ox; oy = -oy; }
    if (floorAt(mx + ox * 0.25, my + oy * 0.25, mz)) continue;
    if (nearEdge(mx, my, mz) || crossed(p, q)) continue;
    runs.push([p[0], p[1], p[2], q[0], q[1], q[2]]);
  }
  return runs;
}

/**
 * The dollhouse as a map layer: add `layer` to the map, update the state `getState` returns each
 * frame, and point the map's camera with `rig`. `corner` is the exit's street corner for the exit
 * signs ("Fulton St & Nassau St · NE corner"), or failing that the street's name, or null.
 */
export function dollhouseLayer(model: DollhouseModel, walk: DollhouseWalk, getState: () => DollhouseState, corner: string | null): Dollhouse {
  const scene = new THREE.Scene();
  const cut = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
  const wallCut = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
  const lightCut = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
  const signCut = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
  const station = new THREE.Group();

  // Flat floors, stairs and walls apart: each has its own surface.
  const fv: number[] = [], fc: number[] = [], fuv: number[] = [];
  const sv: number[] = [], sc: number[] = [], suv: number[] = [];
  const wv: number[] = [], wuv: number[] = [];
  let lowest = 0;
  for (let i = 2; i < model.v.length; i += 3) lowest = Math.min(lowest, model.v[i]);
  // Concrete, a little darker the deeper it is.
  const high = new THREE.Color(0xd2d0cb), low = new THREE.Color(0x8e8c87), mix = new THREE.Color();
  const P = (k: number): P3 => [model.v[k * 3], model.v[k * 3 + 1], model.v[k * 3 + 2]];
  for (let i = 0; i < model.t.length; i += 3) {
    const [a, b, c] = [P(model.t[i]), P(model.t[i + 1]), P(model.t[i + 2])];
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    const len = Math.hypot(n[0], n[1], n[2]);
    if (len < 1e-9) continue;
    const nz = Math.abs(n[2]) / len;
    if (nz < 0.3) {
      const foot = Math.min(a[2], b[2], c[2]);
      // The model's own waist-high upright pieces come in short, angled lengths that read as broken
      // walls standing on the floor (owner, 2026-11-12); no walk passes them, so they are left out.
      if (Math.max(a[2], b[2], c[2]) - foot <= LOW_PIECE_M) continue;
      // Tile coordinates: along the wall, and up it from the triangle's foot.
      const h = Math.hypot(n[0], n[1]), ux = -n[1] / h, uy = n[0] / h;
      // Thickened behind its face, so the side people see stays where the model puts it.
      pushPrism(wv, wuv, [a, b, c], [-n[0] / h, -n[1] / h], WALL_THICK_M, [ux, uy], foot);
      continue;
    }
    const stair = nz < 0.97;
    for (const p of [a, b, c]) {
      mix.copy(low).lerp(high, lowest < 0 ? 1 - p[2] / lowest : 1);
      if (stair) {
        // One stripe of the tread texture per step's rise, so the nosings run along the step edges.
        sv.push(...p); sc.push(mix.r, mix.g, mix.b); suv.push((p[0] + p[1]) / 2, p[2] / STEP_RISE_M);
      } else {
        fv.push(...p); fc.push(mix.r, mix.g, mix.b); fuv.push(p[0] / 1.5, p[1] / 1.5);
      }
    }
  }
  const surface = (pos: number[], col: number[], uv: number[]) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.computeVertexNormals();
    return geo;
  };
  const concrete = concreteTexture(), treads = treadTexture(), tiles = wallTexture();
  const floorGeo = surface(fv, fc, fuv), stairGeo = surface(sv, sc, suv);
  station.add(new THREE.Mesh(floorGeo, new THREE.MeshLambertMaterial({ map: concrete, vertexColors: true, side: THREE.DoubleSide, clippingPlanes: [cut] })));
  station.add(new THREE.Mesh(stairGeo, new THREE.MeshLambertMaterial({ map: treads, vertexColors: true, side: THREE.DoubleSide, clippingPlanes: [cut] })));
  for (const geo of [floorGeo, stairGeo]) station.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 20), new THREE.LineBasicMaterial({ color: 0x6b6862, clippingPlanes: [cut] })));
  // Raised walls along the floors' outer edges, tiled from their foot up.
  for (const [x1, y1, z1, x2, y2, z2] of outlineWalls(model)) {
    const L = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / L, uy = (y2 - y1) / L;
    // Centred on the floor's edge: half a wall's thickness either side of it.
    const nx = -uy, ny = ux, half = WALL_THICK_M / 2;
    const face = [[x1 + nx * half, y1 + ny * half, z1], [x2 + nx * half, y2 + ny * half, z2], [x2 + nx * half, y2 + ny * half, z2 + WALL_M], [x1 + nx * half, y1 + ny * half, z1 + WALL_M]];
    pushPrism(wv, wuv, face, [-nx, -ny], WALL_THICK_M, [ux, uy], Math.min(z1, z2));
  }
  const wallGeo = new THREE.BufferGeometry();
  wallGeo.setAttribute("position", new THREE.Float32BufferAttribute(wv, 3));
  wallGeo.setAttribute("uv", new THREE.Float32BufferAttribute(wuv, 2));
  wallGeo.computeVertexNormals();
  // Solid walls (owner, 2026-11-12: see-through walls were confusing). They stop a little over the
  // figure's head, and the figure shows through anything in front of it (its ghost, below).
  // Walls are closed slabs: tile outside, and a flat cap where the cut over the figure opens them.
  station.add(new THREE.Mesh(wallGeo, new THREE.MeshLambertMaterial({ map: tiles, side: THREE.FrontSide, clippingPlanes: [wallCut, cut] })));
  station.add(new THREE.Mesh(wallGeo, new THREE.MeshBasicMaterial({ color: WALL_CAP_COLOR, side: THREE.BackSide, clippingPlanes: [wallCut, cut] })));

  // The yellow strip along each platform edge, on the platform's side.
  for (const [x1, y1, x2, y2, z] of model.edges) {
    const L = Math.hypot(x2 - x1, y2 - y1);
    const strip = box(L, 0.6, 0.02, 0xf2c94c, [cut]);
    const ang = Math.atan2(y2 - y1, x2 - x1);
    // Toward the platform: away from the track when the track is near, else either side.
    const nx = -Math.sin(ang), ny = Math.cos(ang);
    const [tx, ty] = model.track.at;
    const side = (tx - x1) * nx + (ty - y1) * ny > 0 ? -1 : 1;
    strip.position.set((x1 + x2) / 2 + nx * 0.3 * side, (y1 + y2) / 2 + ny * 0.3 * side, z + 0.01);
    strip.rotation.z = ang;
    station.add(strip);
  }

  // Ceiling lights along the walk: a solid ceiling would sit between the chase camera and the figure.
  // They hang a little to the walker's left, so none lies on the line from the camera to the figure.
  const total = walkLength(walk.path);
  const lampGeo = new THREE.BoxGeometry(0.12, 1.2, 0.04);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xfffbea, clippingPlanes: [lightCut] });
  for (let d = 2; d < total; d += LIGHT_EVERY_M) {
    const p = walkAt(walk.path, d / total);
    const lamp = new THREE.Mesh(lampGeo, lampMat);
    lamp.position.set(p.x - Math.cos(p.heading) * LIGHT_ASIDE_M, p.y + Math.sin(p.heading) * LIGHT_ASIDE_M, p.z + LIGHT_UP_M);
    lamp.rotation.z = -p.heading;
    station.add(lamp);
  }

  // The way to follow, painted on the floor: a line along the walk with an arrow every few metres.
  station.add(guideLine(walk.path, [cut]));

  // Signs, placed from the walk and the model's lines (see planSigns).
  const start = walk.path[0];
  const away = Math.atan2(walk.path[1][0] - start[0], walk.path[1][1] - start[1]);
  for (const plan of planSigns(model, walk, corner)) {
    const sign = signMesh(plan.lines, [signCut], plan.small);
    sign.position.set(...plan.at);
    sign.rotation.z = -plan.heading;
    station.add(sign);
  }
  const places = walkPlaces(walk.path);

  // The fare line: turnstiles, the high exit gate and the emergency gate, the walk through the middle turnstile.
  const rotors: Array<{ rotor: THREE.Group; at: THREE.Vector3 }> = [];
  if (places.gates) {
    const g = places.gates;
    const line = new THREE.Group();
    line.position.set(...g.at);
    line.rotation.z = -g.heading;
    // The lane the walk takes runs between the turnstile at 0.155 and the one before it.
    const pieces: Array<[number, "turnstile" | "high" | "emergency" | "rail"]> = [[-4.1, "rail"], [HIGH_GATE_X, "high"], [-1.75, "turnstile"], [-0.8, "turnstile"], [0.155, "turnstile"], [1.1, "turnstile"], [2.35, "emergency"], [3.6, "rail"]];
    for (const [x, kind] of pieces) {
      if (kind === "turnstile") {
        const t = turnstile();
        t.group.position.x = x;
        line.add(t.group);
        rotors.push({ rotor: t.rotor, at: new THREE.Vector3(x + 0.17, 0, 0) });
      } else if (kind === "high") {
        const h = highExitGate(); h.position.x = x; line.add(h);
      } else if (kind === "emergency") {
        const e = emergencyGate(); e.position.x = x; line.add(e);
      } else {
        const rail = box(1.2, 0.06, 0.06, 0x5b616b); rail.position.set(x, 0, 1.0); line.add(rail);
        const post = box(0.08, 0.08, 1.0, 0x5b616b); post.position.set(x + Math.sign(x) * 0.6, 0, 0.5); line.add(post);
      }
    }
    station.add(line);
    line.updateMatrixWorld(true);
    rotors.forEach((r) => r.at.applyMatrix4(line.matrixWorld));
  }

  // The 4/5 train on the downtown track, pulling out while the figure steps off.
  const train = new THREE.Group();
  for (let i = 0; i < CARS; i++) {
    const car = new THREE.Group();
    // Not cut: the train's roof sits below the platform's ceiling, and a cut-open car reads as a hole.
    const shell = box(CAR_M - 0.5, 2.7, 3.2, 0xb8bec6); shell.position.z = 1.9; car.add(shell);
    const roof = box(CAR_M - 0.9, 2.2, 0.12, 0x8e959e); roof.position.z = 3.56; car.add(roof);
    const windows = box(CAR_M - 1.2, 2.72, 0.7, 0x2b3038); windows.position.z = 2.5; car.add(windows);
    const stripe = box(CAR_M - 0.6, 2.74, 0.18, LEX_GREEN); stripe.position.z = 1.7; car.add(stripe);
    car.position.x = -i * CAR_M;
    train.add(car);
  }
  train.position.set(...model.track.at);
  train.rotation.z = model.track.angle;
  scene.add(train);

  const { group: figure, stride } = buildFigure();
  // In the overview the figure is a few pixels tall: an orange ring on the floor round it says where it is.
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xf97316, transparent: true, side: THREE.DoubleSide, depthTest: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.4, 3.4, 48), ringMat);
  ring.renderOrder = 1;
  scene.add(station, figure, ring);
  // The scene is z-up; three's hemisphere light assumes y-up unless told.
  // Warm light from above and a low key light from one side, so floors, stairs and walls read apart.
  const sky = new THREE.HemisphereLight(0xfffaf0, 0x5d6068, 0.55 * LEGACY_LIGHT);
  sky.position.set(0, 0, 1);
  scene.add(sky);
  const sun = new THREE.DirectionalLight(0xffffff, 0.5 * LEGACY_LIGHT);
  sun.position.set(-40, -25, 45);
  scene.add(sun);

  // The train stands with the middle of a car at the door the figure steps out of.
  const dir: [number, number] = [Math.cos(model.track.angle), Math.sin(model.track.angle)];
  const along = (p: P3) => (p[0] - model.track.at[0]) * dir[0] + (p[1] - model.track.at[1]) * dir[1];
  const doorAlong = along(start);
  const standing = doorAlong + CAR_M * (CARS / 2);
  /**
   * The overview's middle: halfway between the track and the figure's side of the platform, level
   * with the middle of the standing train.
   */
  const midAlong = standing - (CAR_M * (CARS - 1)) / 2;
  const overview: [number, number] = [
    (model.track.at[0] + dir[0] * midAlong + start[0] + dir[0] * (midAlong - doorAlong)) / 2,
    (model.track.at[1] + dir[1] * midAlong + start[1] + dir[1] * (midAlong - doorAlong)) / 2,
  ];
  /** The track's compass bearing (0 = north, clockwise). */
  const trackBearing = Math.atan2(dir[0], dir[1]);

  const origin = MercatorCoordinate.fromLngLat(model.origin, 0);
  const s = origin.meterInMercatorCoordinateUnits();
  const local = new THREE.Matrix4().makeTranslation(origin.x, origin.y, origin.z).scale(new THREE.Vector3(s, -s, s));
  const lift = new THREE.Matrix4();
  const ghost = new THREE.MeshBasicMaterial({ color: 0xf97316, transparent: true, opacity: 0.45, depthFunc: THREE.GreaterDepth, depthWrite: false });
  const ghosted: Array<{ mesh: THREE.Mesh; material: THREE.Material | THREE.Material[] }> = [];
  figure.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const mesh = o as THREE.Mesh;
    ghosted.push({ mesh, material: mesh.material });
  });
  const toLngLat = (x: number, y: number): [number, number] => {
    const ll = new MercatorCoordinate(origin.x + x * s, origin.y - y * s, 0).toLngLat();
    return [ll.lng, ll.lat];
  };
  const fromLngLat = (lon: number, lat: number): [number, number] => {
    const m = MercatorCoordinate.fromLngLat([lon, lat], 0);
    return [(m.x - origin.x) / s, (origin.y - m.y) / s];
  };

  const camera = new THREE.Camera();
  let renderer: THREE.WebGLRenderer | null = null;
  let map: MaplibreMap | null = null;
  /** The camera's own bearing, eased toward the figure's so a switchback does not whip the view round. */
  let behind: number | null = null;
  let feet: P3 = [...start];
  let heading = away;
  let glide: { from: P3; at: number } | null = null;
  const place = () => {
    const st = getState();
    if (st.street) {
      let [x, y] = fromLngLat(st.street.lon, st.street.lat);
      // The trip's exit can be a stair the model does not have, a few dozen metres on: coming up, the
      // figure glides from the top of the model's stair onto the street walk instead of jumping.
      if (station.visible) glide = { from: walk.path[walk.path.length - 1], at: performance.now() };
      if (glide) {
        const k = Math.min(1, (performance.now() - glide.at) / GLIDE_MS), e = k * k * (3 - 2 * k);
        x = glide.from[0] + (x - glide.from[0]) * e;
        y = glide.from[1] + (y - glide.from[1]) * e;
        if (k >= 1) glide = null;
      }
      feet = [x, y, 0];
      heading = (st.street.heading * Math.PI) / 180;
      station.visible = false;
      train.visible = false;
      ring.visible = false;
      figure.position.set(x, y, 0);
      figure.rotation.z = -heading;
      stride(Math.hypot(x, y), true);
      cut.constant = CUT_ABOVE_FEET_M;
      return;
    }
    station.visible = true;
    glide = null;
    const f = st.wait != null ? 0 : st.walk ?? 0;
    const pose = walkAt(walk.path, f);
    feet = [pose.x, pose.y, pose.z];
    heading = st.wait != null ? away : pose.heading;
    figure.position.set(pose.x, pose.y, pose.z);
    figure.rotation.z = -heading;
    stride(pose.walked, st.wait == null);
    cut.constant = pose.z + CUT_ABOVE_FEET_M;
    wallCut.constant = pose.z + WALL_ABOVE_FEET_M;
    lightCut.constant = pose.z + LIGHT_CUT_M;
    signCut.constant = pose.z + SIGN_CUT_M;
    // The train stands through the overview, starts to pull out as the camera comes down, and is
    // into the tunnel (about 40 km/h) by the time the figure has walked PULL_OUT_M.
    const k = st.wait != null
      ? Math.max(0, st.wait - OVERVIEW_END) / (1 - OVERVIEW_END) / 2
      : 0.5 + Math.min(pose.walked / PULL_OUT_M, 1) / 2;
    train.visible = k < 1;
    if (train.visible) {
      const front = standing + 170 * k * k;
      train.position.set(model.track.at[0] + dir[0] * front, model.track.at[1] + dir[1] * front, model.track.at[2]);
    }
    // The ring fades as the camera comes down from the overview.
    const zoomIn = st.wait == null ? 1 : Math.max(0, st.wait - OVERVIEW_END) / (1 - OVERVIEW_END);
    ring.visible = zoomIn < 1;
    ring.position.set(pose.x, pose.y, pose.z + 0.05);
    ringMat.opacity = 0.9 * (1 - zoomIn);
    for (const r of rotors) {
      const d = Math.hypot(r.at.x - pose.x, r.at.y - pose.y);
      if (d < 0.8) r.rotor.rotation.y = ((0.8 - d) / 0.8) * (Math.PI / 3);
    }
  };

  /** The map's extruded buildings, hidden while the figure is underground and shown again on the street. */
  let hidden: Array<[string, unknown]> | null = null;
  const buildings = (show: boolean) => {
    if (!map) return;
    if (!show && !hidden) {
      hidden = [];
      for (const l of map.getStyle().layers) {
        if (l.type !== "fill-extrusion") continue;
        hidden.push([l.id, map.getLayoutProperty(l.id, "visibility") ?? "visible"]);
        map.setLayoutProperty(l.id, "visibility", "none");
      }
    } else if (show && hidden) {
      for (const [id, v] of hidden) if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", v as "visible" | "none");
      hidden = null;
    }
  };
  const layer: CustomLayerInterface = {
    id: DOLLHOUSE_LAYER,
    type: "custom",
    renderingMode: "3d",
    onAdd(m, gl) {
      map = m;
      renderer = sharedRenderer(m, gl);
    },
    onRemove() {
      buildings(true);
      // The renderer is shared by every three.js layer; never dispose it here.
      renderer = null;
      map = null;
      dispose(scene);
      ghost.dispose();
    },
    render(_gl, args) {
      if (!renderer) return;
      place();
      // The map can only aim at street level, so the station is lifted until the figure's feet are
      // there; its levels keep their places relative to each other, and the street map is the floor.
      lift.makeTranslation(0, 0, -feet[2]);
      camera.projectionMatrix = new THREE.Matrix4().fromArray(args.defaultProjectionData.mainMatrix as unknown as number[]).multiply(local).multiply(lift);
      const clipping = renderer.localClippingEnabled;
      renderer.localClippingEnabled = true;
      renderer.resetState();
      // Underground, the street's ground and buildings would hide the station: draw it over them.
      if (station.visible) renderer.clearDepth();
      renderer.render(scene, camera);
      // The figure once more, faintly, only where a floor or stair is in front of it: an x-ray when it is hidden.
      ghosted.forEach(({ mesh }) => { mesh.material = ghost; });
      renderer.render(figure, camera);
      ghosted.forEach(({ mesh, material }) => { mesh.material = material; });
      renderer.localClippingEnabled = clipping;
      map?.triggerRepaint();
    },
  };


  const rig = (dt: number): DollhouseRig | null => {
    place();
    buildings(!station.visible);
    if (behind == null) behind = heading;
    else {
      const turn = Math.atan2(Math.sin(heading - behind), Math.cos(heading - behind));
      behind += turn * Math.min(dt * 1.2, 1);
    }
    // The chase camera: BACK_M behind the figure's back and UP_M over its feet, looking at its chest.
    // The layer lifts the station so the feet are at street level (see `lift`), so heights here are over the feet.
    const chaseD = Math.hypot(BACK_M, UP_M - LOOK_M), chaseTilt = Math.atan2(BACK_M, UP_M - LOOK_M);
    // While the train stands at the platform: the whole platform and train from above, the train
    // along the screen's long side; then the camera eases down into the chase as the train pulls out.
    const st = getState();
    const e = st.street || st.wait == null ? 1 : Math.max(0, st.wait - OVERVIEW_END) / (1 - OVERVIEW_END);
    const ease = e * e * (3 - 2 * e);
    let tx = feet[0], ty = feet[1], tz = LOOK_M, bearing = behind, dist = chaseD, tilt = chaseTilt;
    if (ease < 1) {
      const canvas = map?.getCanvas();
      const aspect = canvas && canvas.clientHeight ? canvas.clientWidth / canvas.clientHeight : 1.6;
      const halfTan = Math.tan(MAP_FOV / 2), longHalfTan = aspect >= 1 ? halfTan * aspect : halfTan;
      // Portrait: look along the track; landscape: across it. Of the two ways, the one nearer the chase's.
      const base = aspect >= 1 ? trackBearing + Math.PI / 2 : trackBearing;
      const near = (b: number) => Math.abs(Math.atan2(Math.sin(b - behind!), Math.cos(b - behind!)));
      const over = near(base) <= near(base + Math.PI) ? base : base + Math.PI;
      const overD = ((CAR_M * CARS) / 2) * 1.12 / longHalfTan;
      tx = overview[0] + (tx - overview[0]) * ease;
      ty = overview[1] + (ty - overview[1]) * ease;
      tz = LOOK_M * ease;
      bearing = over + Math.atan2(Math.sin(behind - over), Math.cos(behind - over)) * ease;
      dist = Math.exp(Math.log(overD) + (Math.log(chaseD) - Math.log(overD)) * ease);
      tilt = OVERVIEW_TILT + (chaseTilt - OVERVIEW_TILT) * ease;
    }
    const ex = tx - Math.sin(bearing) * dist * Math.sin(tilt), ey = ty - Math.cos(bearing) * dist * Math.sin(tilt), ez = tz + dist * Math.cos(tilt);
    // The map draws custom layers as if the screen's centre were at street level, whatever elevation
    // the camera is given. So look at where the line from the eye to the point looked at crosses
    // street level: that point stays in the middle of the screen.
    const k = ez / (ez - tz);
    return {
      eye: toLngLat(ex, ey),
      eyeAlt: ez,
      look: toLngLat(ex + (tx - ex) * k, ey + (ty - ey) * k),
      lookAlt: 0,
    };
  };

  return { layer, rig };
}
