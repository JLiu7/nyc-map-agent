/**
 * The walkable station drawn in three.js, from the same grids that keep the
 * walker on the floor (stationWalk.ts): floors, walls and ceilings below the
 * street; platforms with railings and a canopy above it; stair treads; and the
 * track beds beside the platforms. Local metres, x east, y north, z up.
 */
import * as THREE from "three";
import type { CustomLayerInterface } from "maplibre-gl";
import { LEGACY_LIGHT, MercatorCoordinate, sharedRenderer, type MapLibreMap } from "./core";
import { CELL_M, floorRuns, floorsAt, outline, rooms, STAIR_W, toLocal, trainway, treads, walls, type StationModel } from "../stationWalk";
import { EYE_HEIGHT_M } from "../walk";

/** Floor to ceiling below the street. */
const CEILING_M = 3.2;
/** Railing height on an elevated platform or stair. */
const RAIL_M = 1.1;
/** Platform edge above the track bed. */
const TRACK_DROP_M = 1.2;
/** Track gauge (1,435 mm) and track bed width. */
const GAUGE_M = 1.435;
const BED_M = 3;

const COLORS = {
  floor: 0x8f8a84,
  platform: 0xb9b4ad,
  wall: 0xe8e4dc,
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
  /** Corners in order around the quad. */
  add(a: number[], b: number[], c: number[], d: number[]) {
    this.pos.push(...a, ...b, ...c, ...a, ...c, ...d);
  }
  mesh(color: number, opts: THREE.MeshLambertMaterialParameters = {}) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
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

function buildStationScene(m: StationModel, tracks: Array<Array<[number, number]>>): THREE.Group {
  const group = new THREE.Group();
  const under = !m.elevated;
  const [floor, platform, ceiling, wall, edge, drop, bed, rail, railing, canopy] = Array.from({ length: 10 }, () => new Quads());

  const platformRuns: Array<{ x: number; y: number; z: number }> = [];
  for (const g of m.pieces) {
    if (g.stair) continue;
    for (const r of floorRuns(g)) {
      const q = r.kind === 2 ? platform : floor;
      const [x0, x1, y0, y1] = [r.x, r.x + r.w, r.y, r.y + CELL_M];
      q.add([x0, y0, r.z], [x1, y0, r.z], [x1, y1, r.z], [x0, y1, r.z]);
      if (!under && r.kind === 2) canopy.add([x0, y0, r.z + 3.6], [x1, y0, r.z + 3.6], [x1, y1, r.z + 3.6], [x0, y1, r.z + 3.6]);
      if (r.kind === 2) platformRuns.push({ x: r.x + r.w / 2, y: r.y, z: r.z });
    }
  }
  for (const w of walls(m)) {
    const [a, b] = [[w.x1, w.y1], [w.x2, w.y2]];
    if (w.edge) {
      // The platform's edge: a yellow strip on the floor and the drop to the track bed.
      ribbon(edge, [[a[0], a[1]], [b[0], b[1]]], 0.6, w.z1 + 0.01);
      drop.add([a[0], a[1], w.z1], [b[0], b[1], w.z2], [b[0], b[1], w.z2 - TRACK_DROP_M], [a[0], a[1], w.z1 - TRACK_DROP_M]);
      continue;
    }
    // Below the street the rooms' outlines (further down) are the walls; only stair sides come from here.
    if (under && !w.stair) continue;
    const top = under ? CEILING_M : RAIL_M;
    (under ? wall : railing).add([a[0], a[1], w.z1], [b[0], b[1], w.z2], [b[0], b[1], w.z2 + top], [a[0], a[1], w.z1 + top]);
  }

  // Below the street each floor is a room: the trainway beside its platforms, a ceiling over both, walls round it.
  const floors = m.pieces.filter((g) => !g.stair);
  rooms(m).forEach((room, n) => {
    for (const r of floorRuns(room)) {
      const [x0, x1, y0, y1, zc] = [r.x, r.x + r.w, r.y, r.y + CELL_M, r.z + CEILING_M];
      ceiling.add([x0, y0, zc], [x1, y0, zc], [x1, y1, zc], [x0, y1, zc]);
    }
    for (const r of trainway(room, floors[n])) {
      const [x0, x1, y0, y1, zb] = [r.x, r.x + r.w, r.y, r.y + CELL_M, r.z - TRACK_DROP_M];
      bed.add([x0, y0, zb], [x1, y0, zb], [x1, y1, zb], [x0, y1, zb]);
    }
    for (const w of outline(room, (look, h) => floorsAt(m, ...look).some((f) => Math.abs(f - h) <= 0.75))) {
      wall.add([w.x1, w.y1, w.z1 - TRACK_DROP_M], [w.x2, w.y2, w.z2 - TRACK_DROP_M], [w.x2, w.y2, w.z2 + CEILING_M], [w.x1, w.y1, w.z1 + CEILING_M]);
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
    wall.mesh(COLORS.wall),
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

  group.add(new THREE.AmbientLight(0xffffff, (under ? 0.6 : 0.5) * LEGACY_LIGHT));
  const sun = new THREE.DirectionalLight(0xffffff, 0.45 * LEGACY_LIGHT);
  sun.position.set(0.3, -0.5, 1);
  group.add(sun);
  return group;
}

function disposeGroup(g: THREE.Object3D) {
  g.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const mesh = o as THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
    mesh.geometry.dispose();
    mesh.material.dispose();
  });
}

export const STATION_LAYER = "station-walk";

/**
 * An elevated station drawn on the map itself, so street view can stand on the
 * platform over the real city: the camera is simply raised to platform height.
 */
export function createStationLayer(m: StationModel, tracks: Array<Array<[number, number]>>): CustomLayerInterface {
  let renderer: THREE.WebGLRenderer;
  const scene = new THREE.Scene();
  const camera = new THREE.Camera();
  const group = buildStationScene(m, tracks);
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
export function mountStationView(canvas: HTMLCanvasElement, m: StationModel, tracks: Array<Array<[number, number]>>, getEye: () => Eye | null, fov: number): () => void {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1b1a19);
  scene.fog = new THREE.Fog(0x1b1a19, 20, 120);
  const group = buildStationScene(m, tracks);
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
