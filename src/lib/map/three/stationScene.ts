/**
 * The walkable station drawn in three.js, from the same grids that keep the
 * walker on the floor (stationWalk.ts): floors, walls and ceilings below the
 * street; platforms with railings and a canopy above it; stair treads; and the
 * track beds beside the platforms. Local metres, x east, y north, z up.
 */
import * as THREE from "three";
import type { CustomLayerInterface } from "maplibre-gl";
import { LEGACY_LIGHT, MercatorCoordinate, sharedRenderer, type MapLibreMap } from "./core";
import { CELL_M, CEILING_M, drawn, floorsAt, outline, rooms, STAIR_W, toLocal, treads, TRACK_DROP_M, walls, type StationModel } from "../stationWalk";
import { EYE_HEIGHT_M } from "../walk";
import { placeSigns, type Bullet, type Sign, type SignInfo } from "../stationSigns";

/** Railing height on an elevated platform or stair. */
const RAIL_M = 1.1;
/** The yellow strip along a platform's edge: this far in from the edge line, and this far out over the track. */
const EDGE = { inside: 0.45, over: 0.35 };
/** Track gauge (1,435 mm) and track bed width. */
const GAUGE_M = 1.435;
const BED_M = 3;

const COLORS = {
  floor: 0x8f8a84,
  platform: 0xb9b4ad,
  wall: 0xffffff,
  ceiling: 0x6b665f,
  edge: 0xf5c518,
  drop: 0x2a2724,
  bed: 0x4a4540,
  rail: 0xc8c8c8,
  tread: 0x9e9890,
  railing: 0x5b6470,
  canopy: 0x3f4650,
};

/** Quads collected into one mesh per colour. */
class Quads {
  readonly pos: number[] = [];
  readonly uv: number[] = [];
  /** Corners in order around the quad. */
  add(a: number[], b: number[], c: number[], d: number[]) {
    this.pos.push(...a, ...b, ...c, ...a, ...c, ...d);
  }
  /** A wall from its foot a-b up to c-d, its texture laid in metres: along the wall, and up from z = 0 so rows line up. */
  wall(a: number[], b: number[], c: number[], d: number[]) {
    this.add(a, b, c, d);
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    this.uv.push(0, a[2], len, b[2], len, c[2], 0, a[2], len, c[2], 0, d[2]);
  }
  mesh(color: number, opts: THREE.MeshLambertMaterialParameters = {}) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    if (this.uv.length) g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeVertexNormals();
    return new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide, ...opts }));
  }
}

/** A flat ribbon `w` wide along a polyline at height z. */
function ribbon(q: Quads, line: Array<[number, number]>, w: number, z: number, offset = 0) {
  for (let i = 1; i < line.length; i++) {
    const [a, b] = [line[i - 1], line[i]];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const [nx, ny] = [-(b[1] - a[1]) / len, (b[0] - a[0]) / len];
    const [l, r] = [offset - w / 2, offset + w / 2];
    q.add([a[0] + nx * l, a[1] + ny * l, z], [b[0] + nx * l, b[1] + ny * l, z], [b[0] + nx * r, b[1] + ny * r, z], [a[0] + nx * r, a[1] + ny * r, z]);
  }
}

/**
 * A trip preview's walk through the station: the guide line to the train, the
 * spot to stand on, and the train itself. `train` says where the train is each
 * frame: metres its middle is past the stop the way it runs (negative still
 * coming in), or null when there is none.
 */
interface StationTrip {
  guide: Array<[number, number, number]>;
  board: [number, number];
  track: { at: [number, number]; angle: number };
  color: string;
  train: () => number | null;
}

/** The guide line: bright, unlit, a little above the floor so stair treads do not cover it. */
const GUIDE = { color: 0x22d3ee, width: 0.45, lift: 0.14, arrowEvery: 3 };
/** A train: cars this long, wide and tall, with a gap between, its floor at the platform's height. */
const CAR = { length: 18.3, width: 3.05, height: 3.6, gap: 0.8, count: 9, floor: -0.95 };

/** The guide line along the trip's way, with arrows pointing on, and a ring where the rider waits. */
function guideMeshes(trip: StationTrip, boardZ: number): THREE.Object3D[] {
  const line: number[] = [], arrows: number[] = [];
  const g = trip.guide;
  let carried = 0;
  for (let i = 1; i < g.length; i++) {
    const [a, b] = [g[i - 1], g[i]];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 0.01) continue;
    const [ux, uy] = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    const [nx, ny] = [-uy * GUIDE.width / 2, ux * GUIDE.width / 2];
    const [za, zb] = [a[2] + GUIDE.lift, b[2] + GUIDE.lift];
    line.push(a[0] + nx, a[1] + ny, za, b[0] + nx, b[1] + ny, zb, b[0] - nx, b[1] - ny, zb, a[0] + nx, a[1] + ny, za, b[0] - nx, b[1] - ny, zb, a[0] - nx, a[1] - ny, za);
    // Chevrons every few metres, carried over from one stretch to the next.
    for (let d = GUIDE.arrowEvery - carried; d < len; d += GUIDE.arrowEvery) {
      const t = d / len, [x, y, zz] = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, za + (zb - za) * t + 0.01];
      const [tip, back, side] = [0.3, 0.25, 0.32];
      arrows.push(x + ux * tip, y + uy * tip, zz, x - ux * back - uy * side, y - uy * back + ux * side, zz, x - ux * back + uy * side, y - uy * back - ux * side, zz);
    }
    carried = (carried + len) % GUIDE.arrowEvery;
  }
  const mesh = (pos: number[], color: number) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, fog: false }));
  };
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.85, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(trip.color), side: THREE.DoubleSide, fog: false }));
  ring.position.set(trip.board[0], trip.board[1], boardZ + GUIDE.lift + 0.02);
  return [mesh(line, GUIDE.color), mesh(arrows, 0xffffff), ring];
}

/** A car's doors along each side, and the lights on the train's ends. */
const DOOR = { perCar: 4, width: 1.3, height: 2.0 };

/** The trip's train: silver cars with a window band, doors and a stripe in the line's colour, headlights in front and red lights behind, centred on its middle. */
function trainMesh(color: string): THREE.Group {
  const train = new THREE.Group();
  const total = CAR.count * CAR.length + (CAR.count - 1) * CAR.gap;
  const body = new THREE.BoxGeometry(CAR.length, CAR.width, CAR.height);
  const band = new THREE.BoxGeometry(CAR.length - 1, CAR.width + 0.04, 0.9);
  const stripe = new THREE.BoxGeometry(CAR.length - 0.2, CAR.width + 0.06, 0.22);
  const door = new THREE.BoxGeometry(DOOR.width, CAR.width + 0.08, DOOR.height);
  const cab = new THREE.BoxGeometry(0.1, CAR.width - 0.7, 1.0);
  const lamp = new THREE.BoxGeometry(0.1, 0.35, 0.22);
  const [metal, glass, paint, doors] = [0xb9bec5, 0x1c2630, color, 0x868c94].map((c) => new THREE.MeshLambertMaterial({ color: new THREE.Color(c) }));
  // Lights are unlit, so they glow in the tunnel.
  const [head, tail] = [0xfff6d8, 0xff3030].map((c) => new THREE.MeshBasicMaterial({ color: c, fog: false }));
  const add = (geo: THREE.BoxGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    train.add(mesh);
  };
  for (let k = 0; k < CAR.count; k++) {
    const x = -total / 2 + CAR.length / 2 + k * (CAR.length + CAR.gap);
    add(body, metal, x, 0, CAR.floor + CAR.height / 2);
    add(band, glass, x, 0, 1.5);
    add(stripe, paint, x, 0, 0.35);
    for (let d = 0; d < DOOR.perCar; d++) add(door, doors, x + CAR.length * ((d + 0.5) / DOOR.perCar - 0.5), 0, DOOR.height / 2);
  }
  // The train runs towards +x: a windscreen and headlights on the front, red lights on the back.
  for (const [end, light] of [[1, head], [-1, tail]] as const) {
    const x = end * (total / 2 + 0.05);
    add(cab, glass, x, 0, 1.6);
    for (const y of [-1, 1]) add(lamp, light, x, y * (CAR.width / 2 - 0.45), 0.5);
  }
  return train;
}

/** One repeat of the wall tile: 15 by 7.5 cm white tiles in running bond, this many metres square. */
const TILE_M = 0.6;
/** The coloured band along the walls, from and to these heights above the floor. */
const TRIM = { from: 2.15, to: 2.4, line: 2.5, lineTo: 2.55 };

/** White glazed tile with grey grout, a little uneven from tile to tile. */
function tileTexture(): THREE.Texture | null {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  const [cols, rows] = [4, 8];
  const [w, h] = [c.width / cols, c.height / rows];
  ctx.fillStyle = "#b9b4a9";
  ctx.fillRect(0, 0, c.width, c.height);
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let r = 0; r < rows; r++)
    for (let k = -1; k < cols; k++) {
      const x = k * w + (r % 2 ? w / 2 : 0);
      const v = 236 - Math.round(rand() * 10);
      ctx.fillStyle = `rgb(${v},${v - 3},${v - 10})`;
      ctx.fillRect(x + 2, r * h + 2, w - 4, h - 4);
    }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / TILE_M, 1 / TILE_M);
  t.anisotropy = 4;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A sign's face drawn once per wording: black, a white rule across the top, white lettering and the lines' bullets. */
const SIGN = { px: 128, height: 0.5, font: '600 60px "Helvetica Neue", Helvetica, Arial, sans-serif' };
function signTexture(s: Sign): { tex: THREE.Texture; width: number } | null {
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  const words = s.kind === "exit" ? "Exit" : s.kind === "name" ? s.name : "";
  const r = 38, gap = 12, pad = 34;
  ctx.font = SIGN.font;
  const textW = words ? ctx.measureText(words).width : 0;
  const bulletsW = s.routes.length * (2 * r + gap);
  c.width = Math.ceil(pad * 2 + textW + (words && s.routes.length ? 40 : 0) + bulletsW - (s.routes.length ? gap : 0));
  c.height = SIGN.px;
  ctx.fillStyle = "#111214";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 12, c.width, 4);
  ctx.font = SIGN.font;
  ctx.textBaseline = "middle";
  ctx.fillText(words, pad, c.height / 2 + 8);
  let x = pad + textW + (words && s.routes.length ? 40 : 0) + r;
  for (const b of s.routes) {
    bullet(ctx, b, x, c.height / 2 + 8, r);
    x += 2 * r + gap;
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { tex, width: (SIGN.height * c.width) / c.height };
}

function bullet(ctx: CanvasRenderingContext2D, b: Bullet, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = b.color;
  ctx.fill();
  ctx.fillStyle = b.text;
  ctx.textAlign = "center";
  ctx.font = `700 ${b.short.length > 1 ? 34 : 52}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
  ctx.fillText(b.short, x, y + 3);
  ctx.textAlign = "start";
}

/** The station's signs, one face (or two, back to back) per sign; faces with the same wording share a texture. */
function signMeshes(m: StationModel, info: SignInfo): THREE.Object3D[] {
  const faces = new Map<string, { mat: THREE.Material; geo: THREE.PlaneGeometry } | null>();
  const out: THREE.Object3D[] = [];
  for (const s of placeSigns(m, info)) {
    const key = `${s.kind}|${s.name}|${s.routes.map((b) => b.short).join(",")}`;
    if (!faces.has(key)) {
      const t = signTexture(s);
      // Upright and facing -y before it is turned.
      faces.set(key, t ? { mat: new THREE.MeshBasicMaterial({ map: t.tex }), geo: new THREE.PlaneGeometry(t.width, SIGN.height).rotateX(Math.PI / 2) } : null);
    }
    const face = faces.get(key);
    if (!face) continue;
    for (const turn of s.back ? [0, Math.PI] : [0]) {
      const mesh = new THREE.Mesh(face.geo, face.mat);
      const a = s.angle + turn;
      mesh.position.set(s.x + Math.cos(a) * 0.02, s.y + Math.sin(a) * 0.02, s.z);
      mesh.rotation.z = a + Math.PI / 2;
      out.push(mesh);
    }
  }
  return out;
}

function buildStationScene(m: StationModel, tracks: Array<Array<[number, number]>>, trip?: StationTrip, signs?: SignInfo): { group: THREE.Group; update: () => void } {
  const group = new THREE.Group();
  const under = !m.elevated;
  const [floor, platform, ceiling, wall, edge, drop, bed, rail, railing, canopy, trim] = Array.from({ length: 11 }, () => new Quads());
  /** A wall below the street: tile, with the station's coloured band along it. */
  const tiled = (a: number[], b: number[], foot: [number, number], top: number) => {
    wall.wall([a[0], a[1], foot[0]], [b[0], b[1], foot[1]], [b[0], b[1], b[2] + top], [a[0], a[1], a[2] + top]);
    for (const [lo, hi] of [[TRIM.from, TRIM.to], [TRIM.line, TRIM.lineTo]]) trim.add([a[0], a[1], a[2] + lo], [b[0], b[1], b[2] + lo], [b[0], b[1], b[2] + hi], [a[0], a[1], a[2] + hi]);
  };

  const surfaces = drawn(m);
  const flat = (q: Quads, r: { x: number; y: number; w: number }, z: number) => q.add([r.x, r.y, z], [r.x + r.w, r.y, z], [r.x + r.w, r.y + CELL_M, z], [r.x, r.y + CELL_M, z]);
  const platformRuns: Array<{ x: number; y: number; z: number }> = [];
  for (const r of surfaces.floors) {
    flat(r.kind === 2 ? platform : floor, r, r.z);
    if (!under && r.kind === 2) flat(canopy, r, r.z + 3.6);
    if (r.kind === 2) platformRuns.push({ x: r.x + r.w / 2, y: r.y, z: r.z });
  }
  for (const w of walls(m)) {
    const [a, b] = [[w.x1, w.y1], [w.x2, w.y2]];
    if (w.edge) {
      // The platform's edge: a yellow strip on the floor and the drop to the track bed. The platform is
      // drawn in cells that stick out past the straightened edge in steps, so the strip reaches a little
      // over the track, like a platform's nosing, and the drop falls from its outer side, hiding them.
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const [nx, ny] = [-(b[1] - a[1]) / len, (b[0] - a[0]) / len];
      const look = (k: number) => floorsAt(m, (a[0] + b[0]) / 2 + nx * k, (a[1] + b[1]) / 2 + ny * k).some((f) => Math.abs(f - w.z1) < 0.3);
      const out = look(EDGE.inside) && !look(-EDGE.inside) ? -1 : 1;
      ribbon(edge, [[a[0], a[1]], [b[0], b[1]]], EDGE.inside + EDGE.over, w.z1 + 0.01, (out * (EDGE.over - EDGE.inside)) / 2);
      const [ox, oy] = [nx * out * EDGE.over, ny * out * EDGE.over];
      drop.add([a[0] + ox, a[1] + oy, w.z1], [b[0] + ox, b[1] + oy, w.z2], [b[0] + ox, b[1] + oy, w.z2 - TRACK_DROP_M], [a[0] + ox, a[1] + oy, w.z1 - TRACK_DROP_M]);
      continue;
    }
    // Below the street the rooms' outlines (further down) are the walls; only stair sides come from here.
    if (under && !w.stair) continue;
    if (under) tiled([a[0], a[1], w.z1], [b[0], b[1], w.z2], [w.z1, w.z2], CEILING_M);
    else railing.add([a[0], a[1], w.z1], [b[0], b[1], w.z2], [b[0], b[1], w.z2 + RAIL_M], [a[0], a[1], w.z1 + RAIL_M]);
  }

  // Below the street each floor is a room: the trainway beside its platforms, a ceiling over both, walls round it.
  for (const r of surfaces.ceilings) flat(ceiling, r, r.z + CEILING_M);
  for (const r of surfaces.beds) flat(bed, r, r.z - TRACK_DROP_M);
  rooms(m).forEach((room) => {
    for (const w of outline(room, (look, h) => floorsAt(m, ...look).some((f) => Math.abs(f - h) <= 0.75))) {
      tiled([w.x1, w.y1, w.z1], [w.x2, w.y2, w.z2], [w.z1 - TRACK_DROP_M, w.z2 - TRACK_DROP_M], CEILING_M);
    }
  });

  // Track beds sit a platform edge below the nearest platform.
  for (const line of tracks) {
    const mid = line[Math.floor(line.length / 2)];
    let z = NaN, best = 60;
    for (const r of platformRuns) {
      const d = Math.hypot(r.x - mid[0], r.y - mid[1]);
      if (d < best) { best = d; z = r.z; }
    }
    if (Number.isNaN(z)) continue;
    const bz = z - TRACK_DROP_M;
    if (!under) ribbon(bed, line, BED_M, bz);
    for (const side of [-GAUGE_M / 2, GAUGE_M / 2]) ribbon(rail, line, 0.08, bz + 0.15, side);
  }

  group.add(
    floor.mesh(COLORS.floor),
    platform.mesh(COLORS.platform),
    ceiling.mesh(COLORS.ceiling),
    wall.mesh(COLORS.wall, { map: under ? tileTexture() : null }),
    trim.mesh(new THREE.Color(signs?.trim ?? "#2f6b45").getHex(), { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    edge.mesh(COLORS.edge),
    drop.mesh(COLORS.drop),
    bed.mesh(COLORS.bed),
    rail.mesh(COLORS.rail),
    railing.mesh(COLORS.railing, under ? {} : { transparent: true, opacity: 0.75 }),
    canopy.mesh(COLORS.canopy),
  );

  const steps = treads(m);
  if (steps.length) {
    const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0, -0.5);
    const mesh = new THREE.InstancedMesh(box, new THREE.MeshLambertMaterial({ color: COLORS.tread }), steps.length);
    const mx = new THREE.Matrix4(), q = new THREE.Quaternion(), zAxis = new THREE.Vector3(0, 0, 1);
    steps.forEach((t, i) => mesh.setMatrixAt(i, mx.compose(new THREE.Vector3(t.x, t.y, t.z), q.setFromAxisAngle(zAxis, t.angle), new THREE.Vector3(t.run + 0.02, STAIR_W, 0.35))));
    group.add(mesh);
  }

  if (signs) group.add(...signMeshes(m, signs));

  group.add(new THREE.AmbientLight(0xffffff, (under ? 0.6 : 0.5) * LEGACY_LIGHT));
  const sun = new THREE.DirectionalLight(0xffffff, 0.45 * LEGACY_LIGHT);
  sun.position.set(0.3, -0.5, 1);
  group.add(sun);

  if (!trip) return { group, update: () => {} };
  const boardZ = trip.guide.length ? trip.guide.reduce((z, p) => (Math.hypot(p[0] - trip.board[0], p[1] - trip.board[1]) < 1 ? p[2] : z), trip.guide[trip.guide.length - 1][2]) : 0;
  group.add(...guideMeshes(trip, boardZ));
  const train = trainMesh(trip.color);
  train.rotation.z = trip.track.angle;
  train.visible = false;
  group.add(train);
  const [dx, dy] = [Math.cos(trip.track.angle), Math.sin(trip.track.angle)];
  const update = () => {
    const off = trip.train();
    train.visible = off !== null;
    if (off !== null) train.position.set(trip.track.at[0] + dx * off, trip.track.at[1] + dy * off, boardZ);
  };
  return { group, update };
}

function disposeGroup(g: THREE.Object3D) {
  g.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const mesh = o as THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
    mesh.geometry.dispose();
    const mat = mesh.material as THREE.MeshBasicMaterial;
    mat.map?.dispose();
    mat.dispose();
  });
}

export const STATION_LAYER = "station-walk";

/**
 * An elevated station drawn on the map itself, so street view can stand on the
 * platform over the real city: the camera is simply raised to platform height.
 */
export function createStationLayer(m: StationModel, tracks: Array<Array<[number, number]>>, trip?: StationTrip, signs?: SignInfo): CustomLayerInterface {
  let renderer: THREE.WebGLRenderer;
  const scene = new THREE.Scene();
  const camera = new THREE.Camera();
  const { group, update } = buildStationScene(m, tracks, trip, signs);
  scene.add(group);
  const origin = MercatorCoordinate.fromLngLat(m.origin, 0);
  const s = origin.meterInMercatorCoordinateUnits();
  const local = new THREE.Matrix4().makeTranslation(origin.x, origin.y, origin.z).scale(new THREE.Vector3(s, -s, s));
  return {
    id: STATION_LAYER,
    type: "custom",
    renderingMode: "3d",
    onAdd(map: MapLibreMap, gl) {
      renderer = sharedRenderer(map, gl);
    },
    onRemove() {
      disposeGroup(group);
    },
    render(_gl, args) {
      camera.projectionMatrix = new THREE.Matrix4().fromArray(args.defaultProjectionData.mainMatrix as unknown as number[]).multiply(local);
      update();
      renderer.resetState();
      renderer.render(scene, camera);
    },
  };
}

type Eye = { lon: number; lat: number; bearing: number; pitch: number; z?: number };

/**
 * Street view below the street, drawn on its own canvas: MapLibre lifts any
 * camera that goes under the ground. The camera stands 1.7 m above the
 * walker's feet and looks where the map's street view looks. Returns the
 * function that stops it.
 */
export function mountStationView(canvas: HTMLCanvasElement, m: StationModel, tracks: Array<Array<[number, number]>>, getEye: () => Eye | null, fov: number, trip?: StationTrip, signs?: SignInfo): () => void {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1b1a19);
  scene.fog = new THREE.Fog(0x1b1a19, 20, 120);
  const { group, update } = buildStationScene(m, tracks, trip, signs);
  scene.add(group);
  const camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 400);
  camera.up.set(0, 0, 1);
  const resize = () => {
    const { clientWidth: w, clientHeight: h } = canvas;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(h, 1);
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();
  let frame = 0;
  const look = new THREE.Vector3();
  const tick = () => {
    const eye = getEye();
    if (eye) {
      const [x, y] = toLocal(m, eye.lon, eye.lat);
      const z = (eye.z ?? 0) + EYE_HEIGHT_M;
      // MapLibre's pitch: 0 looks straight down, 90 at the horizon, above 90 up.
      const b = (eye.bearing * Math.PI) / 180, p = (eye.pitch * Math.PI) / 180;
      camera.position.set(x, y, z);
      camera.lookAt(look.set(x + Math.sin(b) * Math.sin(p), y + Math.cos(b) * Math.sin(p), z - Math.cos(p)));
      update();
      renderer.render(scene, camera);
    }
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return () => {
    cancelAnimationFrame(frame);
    ro.disconnect();
    disposeGroup(group);
    renderer.dispose();
  };
}
