/**
 * Walk inside Fulton St like a game (#126): WASD or the arrow keys (a joystick on a touch screen)
 * move the figure, dragging looks around. The station is drawn from the watertight shell, and the
 * figure collides with the same floors and walls, cleared along every walk so nothing catches a body
 * there (stationWalkGeometry.ts). Loaded only when opened: the physics engine is large.
 */
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import { CameraControls } from "@react-three/drei";
import { Physics, RigidBody, TrimeshCollider } from "@react-three/rapier";
import { Ecctrl, type EcctrlHandle } from "ecctrl";
import { Joystick, useJoystickStore } from "ecctrl/input";
import { ArrowLeft } from "lucide-react";
import type { DollhouseModel } from "@/lib/map/three/dollhouse";
import { buildFigure, concreteTexture, pickWalk, treadTexture, walkAt, walkLength, wallTexture } from "@/lib/map/three/dollhouse";
import { walkDressing, type WalkDressing } from "@/lib/map/three/stationWalkDressing";
import { fultonCorner } from "@/lib/map/fultonCorners";
import { bakedShellSurfaces, SMOOTH_SEAMS, type BakedShell, toYUp, walkGeometry, type Surface, type WalkGeometry } from "@/lib/map/three/stationWalkGeometry";
import { stationShell } from "@/lib/map/three/stationShell";
import { loadModel } from "@/lib/map/dollhousePreview";
import { forgetWalkSpot, savedWalkSpot, WalkDevHud } from "@/lib/map/three/WalkDevHud";

/** The figure's body: a capsule 1.6 m tall floating 0.25 m over the floor, so it climbs stairs. */
const BODY = { halfHeight: 0.5, radius: 0.3, float: 0.25 };
const FEET_Y = -(BODY.halfHeight + BODY.radius + BODY.float);
/** Where the camera looks: about shoulder height. */
const LOOK_UP_M = 0.55;
/** Start this far down the stairs from the street, inside the station. */
const START_IN_M = 2;

type Keys = { forward: boolean; backward: boolean; leftward: boolean; rightward: boolean; run: boolean };
const KEYS: Record<string, keyof Keys> = {
  KeyW: "forward", ArrowUp: "forward", KeyS: "backward", ArrowDown: "backward",
  KeyA: "leftward", ArrowLeft: "leftward", KeyD: "rightward", ArrowRight: "rightward",
  ShiftLeft: "run", ShiftRight: "run",
};
/** Keys never move the figure while someone is typing in a field. */
const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

function useKeys() {
  const keys = useRef<Keys>({ forward: false, backward: false, leftward: false, rightward: false, run: false });
  useEffect(() => {
    const set = (on: boolean) => (e: KeyboardEvent) => {
      const k = KEYS[e.code];
      if (!k || (on && typing(e.target))) return;
      keys.current[k] = on;
      if (on) e.preventDefault();
    };
    const down = set(true), up = set(false);
    const clear = () => { for (const k of Object.keys(keys.current) as Array<keyof Keys>) keys.current[k] = false; };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", clear);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.removeEventListener("blur", clear); };
  }, []);
  return keys;
}

function geometryOf(s: Surface): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(s.position, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(s.uv, 2));
  g.computeVertexNormals();
  return g;
}

function Station({ geo, walls }: { geo: WalkGeometry; walls: React.MutableRefObject<THREE.Object3D[]> }) {
  const parts = useMemo(() => {
    const floor = new THREE.Mesh(geometryOf(geo.floors), new THREE.MeshLambertMaterial({ map: concreteTexture(), color: 0xc9c6bf, side: THREE.DoubleSide }));
    const stairs = new THREE.Mesh(geometryOf(geo.stairs), new THREE.MeshLambertMaterial({ map: treadTexture(), color: 0xbdb9b1, side: THREE.DoubleSide }));
    const wall = new THREE.Mesh(geometryOf(geo.walls), new THREE.MeshLambertMaterial({ map: wallTexture(), side: THREE.DoubleSide }));
    const ceiling = new THREE.Mesh(geometryOf(geo.ceiling), new THREE.MeshLambertMaterial({ color: 0x8f8c86, side: THREE.FrontSide }));
    return [floor, stairs, wall, ceiling];
  }, [geo]);
  useEffect(() => {
    walls.current = parts;
    return () => { for (const m of parts) { m.geometry.dispose(); const mat = m.material; mat.map?.dispose(); mat.dispose(); } };
  }, [parts, walls]);
  return (
    <>
      {parts.map((m, i) => <primitive key={i} object={m} />)}
      <RigidBody type="fixed" colliders={false}>
        {/* A third argument reaches Rapier's ColliderDesc.trimesh as its flags; the typings stop at two. */}
        {geo.colliders.map((c, i) => <TrimeshCollider key={i} args={[c.vertices, c.indices, SMOOTH_SEAMS] as unknown as [Float32Array, Uint32Array]} />)}
      </RigidBody>
    </>
  );
}

/** The blue line to follow, from the street down to the platform, just over the floor. */
function Guide({ path }: { path: Array<[number, number, number]> }) {
  const line = useMemo(() => {
    const g = new THREE.BufferGeometry().setFromPoints(path.map(([x, y, z]) => new THREE.Vector3(...toYUp(x, y, z + 0.06))));
    return new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0x1d6ff2 }));
  }, [path]);
  useEffect(() => () => { line.geometry.dispose(); (line.material as THREE.Material).dispose(); }, [line]);
  return <primitive object={line} />;
}

/** Within this of a door (metres, feet level with the platform) the train can be boarded. */
const BOARD_NEAR_M = 1.8;
/** The doors open while the walker is this close to the train's side. */
const DOORS_NEAR_M = 8;
/** After a drag, the camera stays where it was put this long before it eases behind again. */
const HOLD_AFTER_DRAG_MS = 1200;
/** How fast the camera swings behind (share of the gap closed per second). */
const SWING_PER_S = 2.2;

/** Shortest signed turn from a to b, in radians. */
const turn = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

/** Nearer than this to the figure's middle, the camera would sit inside it, so the figure hides. */
const HIDE_FIGURE_M = 1.1;

export type Ride = "walking" | "boarding" | "riding";

function Walker({ start, heading, lowest, walls, dressing, ride, onNearDoor, onRide }: {
  start: THREE.Vector3; heading: number; lowest: number; walls: React.MutableRefObject<THREE.Object3D[]>;
  dressing: WalkDressing; ride: Ride; onNearDoor: (near: boolean) => void; onRide: (r: Ride) => void;
}) {
  const body = useRef<EcctrlHandle>(null);
  const cam = useRef<React.ElementRef<typeof CameraControls>>(null);
  const keys = useKeys();
  const walked = useRef(0);
  const last = useRef(start.clone());
  const dragged = useRef({ on: false, at: -Infinity });
  const near = useRef(false);
  const doors = useRef(0);
  /** The boarding: from where the figure stood to the door and in, then the train pulls out. */
  const board = useRef<{ t: number; from: THREE.Vector3; door: THREE.Vector3; inside: THREE.Vector3 } | null>(null);
  const figure = useMemo(() => {
    const { group, stride } = buildFigure();
    // The figure stands on z and faces +y; the controller stands on y and faces +z.
    const inner = new THREE.Group();
    inner.rotation.x = -Math.PI / 2;
    inner.add(group);
    const outer = new THREE.Group();
    outer.rotation.y = Math.PI;
    outer.position.y = FEET_Y;
    outer.add(inner);
    return { object: outer, stride };
  }, []);

  useEffect(() => {
    const c = cam.current;
    if (!c) return;
    // Behind the figure, looking the way the walk goes down into the station.
    const back = new THREE.Vector3(-Math.sin(heading), 0, Math.cos(heading)).multiplyScalar(3.2);
    void c.setLookAt(start.x + back.x, start.y + 1.2, start.z + back.z, start.x, start.y + LOOK_UP_M, start.z, false);
    const down = () => { dragged.current.on = true; };
    const up = () => { dragged.current = { on: false, at: performance.now() }; };
    c.addEventListener("controlstart", down);
    c.addEventListener("controlend", up);
    return () => { c.removeEventListener("controlstart", down); c.removeEventListener("controlend", up); };
  }, [start, heading]);

  // Board (the button, E or Enter): walk to the nearest door and step in.
  useEffect(() => {
    if (ride !== "boarding" || board.current) return;
    const b = body.current;
    if (!b) return;
    const p = b.currPos;
    let best: THREE.Vector3 | null = null;
    for (const [x, y, z] of dressing.doors) {
      const d = new THREE.Vector3(...toYUp(x, y, z));
      if (!best || d.distanceTo(p) < best.distanceTo(p)) best = d;
    }
    if (!best) return;
    // Into the car: across the platform edge, toward the track.
    const [dx, dy] = dressing.track.dir;
    const track = new THREE.Vector3(...toYUp(...dressing.track.at));
    const across = new THREE.Vector3(...toYUp(-dy, dx, 0));
    if (across.dot(track.clone().sub(best)) < 0) across.negate();
    const inside = best.clone().add(across.clone().multiplyScalar(1.6));
    // The camera stands back on the platform, a little along it, and watches the walker step in and
    // the train pull out; following into the car it would see only the car's grey insides.
    const along = new THREE.Vector3(...toYUp(dx, dy, 0));
    const eye = best.clone().addScaledVector(across, -3.2).addScaledVector(along, -3.5).add(new THREE.Vector3(0, 1.7, 0));
    const look = best.clone().add(new THREE.Vector3(0, 1.1, 0));
    if (cam.current) {
      // The walker steps into the car out of the camera's sight line, so only walls hold it back now.
      cam.current.colliderMeshes = walls.current;
      void cam.current.setLookAt(eye.x, eye.y, eye.z, look.x, look.y, look.z, true);
    }
    board.current = { t: 0, from: new THREE.Vector3(p.x, p.y + FEET_Y, p.z), door: best, inside };
  }, [ride, dressing, walls]);

  useFrame((state, dt) => {
    const b = body.current, c = cam.current;
    if (!b?.body) return;
    const p = b.currPos;
    const feet = p.y + FEET_Y;
    // The model's frame (z up) for the dressing: x, -z, y.
    const mx = p.x, my = -p.z, mz = feet;

    if (board.current) {
      // Scripted: no controls. Walk to the door, step in, the doors shut and the train pulls out.
      const k = board.current;
      k.t += dt;
      const walkS = Math.max(0.6, k.from.distanceTo(k.door) / 1.4);
      let at: THREE.Vector3;
      if (k.t < walkS) at = k.from.clone().lerp(k.door, k.t / walkS);
      else if (k.t < walkS + 1) at = k.door.clone().lerp(k.inside, k.t - walkS);
      else at = k.inside.clone();
      const closeT = walkS + 1.2, leaveT = closeT + 1.2;
      doors.current = k.t < closeT ? 1 : Math.max(0, 1 - (k.t - closeT) / 0.8);
      dressing.train.open(doors.current);
      // Pulls out at about 1 m/s², the figure riding inside.
      const gone = k.t > leaveT ? 0.5 * 1.1 * (k.t - leaveT) ** 2 : 0;
      const [dx, dy] = dressing.track.dir;
      dressing.train.position.set(dressing.track.at[0] + dx * gone, dressing.track.at[1] + dy * gone, dressing.track.at[2]);
      const shift = new THREE.Vector3(...toYUp(dx * gone, dy * gone, 0));
      at.add(shift);
      b.body.setTranslation({ x: at.x, y: at.y - FEET_Y, z: at.z }, true);
      b.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      walked.current += dt * 1.4;
      figure.stride(walked.current, k.t < walkS + 1);
      if (ride !== "riding" && k.t > leaveT + 4.5) onRide("riding");
      return;
    }

    const j = Object.values(useJoystickStore.getState().joysticks)[0];
    const kk = keys.current;
    // Dev and test hook: window.__walkDrive = { x, y } steers like the joystick (x right, y ahead of the camera).
    const drive = import.meta.env.DEV ? (window as unknown as { __walkDrive?: { x: number; y: number } }).__walkDrive : undefined;
    b.setMovement({ ...kk, joystick: drive ?? (j?.active ? { x: j.x, y: j.y } : { x: 0, y: 0 }) });
    if (import.meta.env.DEV) Object.assign(window, { __walkBody: b, __walkCamera: state.camera, __walkScene: state.scene, __walkControls: c, __THREE: THREE });
    // Fell out of the station somehow: back to the start.
    if (p.y < lowest - 6) {
      b.body.setTranslation(start, true);
      b.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    }
    walked.current += Math.hypot(p.x - last.current.x, p.z - last.current.z);
    last.current.copy(p);
    figure.stride(walked.current, b.isMoving);
    // In a tight stairwell the camera is pushed in against the figure; seen from inside its head it
    // only blocks the view, so it fades out of sight until the camera can back off again.
    figure.object.visible = state.camera.position.distanceTo(p) > HIDE_FIGURE_M;
    dressing.turnstiles(mx, my, mz);

    // The doors open as the walker comes up to the train, and Board shows at a door.
    let doorD = Infinity;
    for (const d of dressing.doors) if (Math.abs(d[2] - mz) < 0.7) doorD = Math.min(doorD, Math.hypot(d[0] - mx, d[1] - my));
    const want = doorD < DOORS_NEAR_M ? 1 : 0;
    doors.current += Math.sign(want - doors.current) * Math.min(Math.abs(want - doors.current), dt / 0.9);
    dressing.train.open(doors.current);
    const isNear = doorD < BOARD_NEAR_M;
    if (isNear !== near.current) { near.current = isNear; onNearDoor(isNear); }

    if (c) {
      // The train counts as a wall for the camera, so it never swings into a car.
      if (c.colliderMeshes.length !== walls.current.length + 1) c.colliderMeshes = [...walls.current, dressing.train];
      void c.moveTo(p.x, p.y + LOOK_UP_M, p.z, true);
      // A chase camera: it eases round behind the way the figure walks, unless someone just dragged
      // it, or the figure is walking back toward it (S), which would spin the view round.
      const v = b.body.linvel();
      const speed = Math.hypot(v.x, v.z);
      const held = dragged.current.on || performance.now() - dragged.current.at < HOLD_AFTER_DRAG_MS;
      if (speed > 0.4 && !held) {
        const az = c.azimuthAngle;
        const facing = -Math.sin(az) * v.x - Math.cos(az) * v.z; // along the camera's view, flat
        if (facing > -0.3 * speed) {
          const want = Math.atan2(-v.x, -v.z);
          void c.rotateAzimuthTo(az + turn(az, want) * Math.min(1, SWING_PER_S * dt), false);
        }
      }
    }
  });

  return (
    <>
      <Ecctrl ref={body} position={[start.x, start.y, start.z]} capsuleHalfHeight={BODY.halfHeight} capsuleRadius={BODY.radius}
        floatHeight={BODY.float} maxWalkVel={2.2} maxRunVel={4.5} slopeMaxAngle={1.1}>
        <primitive object={figure.object} />
      </Ecctrl>
      <CameraControls ref={cam} makeDefault minDistance={0.8} maxDistance={6} smoothTime={0.12} />
    </>
  );
}

/** Signs, lamps, the fare lines and the train, shared with the dollhouse; turned from z up to y up. */
function Dressing({ dressing }: { dressing: WalkDressing }) {
  useEffect(() => () => dressing.dispose(), [dressing]);
  // Declared, not built in a memo: React runs a memo twice in development, and the second wrapper
  // would take the dressing away from the one it keeps.
  return <group rotation-x={-Math.PI / 2}><primitive object={dressing.group} /></group>;
}

export function StationWalk({ exit, onClose: close }: { exit: [number, number] | null; onClose: () => void }) {
  const onClose = useCallback(() => { if (import.meta.env.DEV) forgetWalkSpot(); close(); }, [close]);
  const [model, setModel] = useState<DollhouseModel | null>(null);
  const [failed, setFailed] = useState(false);
  const walls = useRef<THREE.Object3D[]>([]);
  const touch = useMemo(() => typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches, []);
  useEffect(() => {
    let live = true;
    loadModel().then((m) => { if (live) setModel(m); }, () => { if (live) setFailed(true); });
    return () => { live = false; };
  }, []);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape" && !typing(e.target)) onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  const shell = useMemo(() => (model ? stationShell(model) : null), [model]);
  // Walls and ceilings baked from the model (pnpm build:station-shell). Until they load nothing is
  // drawn; if they fail, the walls built here stand in.
  const [baked, setBaked] = useState<BakedShell | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    fetch("/transit/fulton-shell.json").then((r) => (r.ok ? (r.json() as Promise<BakedShell>) : null)).then(
      (b) => { if (live) setBaked(b); }, () => { if (live) setBaked(null); });
    return () => { live = false; };
  }, []);
  const geo = useMemo(() => {
    if (!model || !shell || baked === undefined) return null;
    const g = walkGeometry(model, shell);
    return baked ? { ...g, ...bakedShellSurfaces(model, shell, baked) } : g;
  }, [model, shell, baked]);
  const [ride, setRide] = useState<Ride>("walking");
  const [nearDoor, setNearDoor] = useState(false);
  // Walk again starts a fresh round: a new scene, the train back at the platform.
  const [round, setRound] = useState(0);
  const dressing = useMemo(() => (model && shell ? walkDressing(model, fultonCorner, shell) : null), [model, shell, round]); // eslint-disable-line react-hooks/exhaustive-deps
  const boardTrain = () => { if (ride === "walking") setRide("boarding"); };
  // E or Enter at a door boards, as the button does.
  useEffect(() => {
    if (!nearDoor || ride !== "walking") return;
    const key = (e: KeyboardEvent) => { if ((e.code === "KeyE" || e.key === "Enter") && !typing(e.target)) { e.preventDefault(); setRide("boarding"); } };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [nearDoor, ride]);
  const start = useMemo(() => {
    if (!model) return null;
    const walk = (exit && pickWalk(model, exit)) || [...model.walks].sort((a, b) => walkLength(b.path) - walkLength(a.path))[0];
    // Walks run from the platform up to the street: start a little way in from the street end.
    const len = walkLength(walk.path);
    const p = walkAt(walk.path, 1 - START_IN_M / len);
    const [x, y, z] = toYUp(p.x, p.y, p.z + 1.2);
    // Dev: a reload puts the walker back where it stood, facing the same way.
    const saved = import.meta.env.DEV ? savedWalkSpot() : null;
    if (saved) return { at: new THREE.Vector3(saved.x, saved.y, saved.z), heading: saved.heading, path: walk.path };
    // Face down the walk, into the station.
    return { at: new THREE.Vector3(x, y, z), heading: p.heading + Math.PI, path: walk.path };
  }, [model, exit]);

  return (
    <div data-testid="station-walk" className="fixed inset-0 z-[70] bg-[#1d1f23] touch-none select-none">
      {geo && start && dressing ? (
        <Canvas key={round} camera={{ fov: 62, near: 0.05, far: 300 }} dpr={[1, 2]} gl={{ antialias: true }}>
          <color attach="background" args={["#1d1f23"]} />
          <hemisphereLight args={[0xfdfbf3, 0x55524c, 1.6]} />
          <ambientLight intensity={0.5} />
          <Suspense fallback={null}>
            {/* A fixed step: a slow frame takes several small steps, never one big one that throws the body. */}
            <Physics timeStep={1 / 60}>
              <Station geo={geo} walls={walls} />
              <Guide path={start.path} />
              <Dressing dressing={dressing} />
              <Walker start={start.at} heading={start.heading} lowest={geo.lowest} walls={walls} dressing={dressing}
                ride={ride} onNearDoor={setNearDoor} onRide={setRide} />
            </Physics>
          </Suspense>
        </Canvas>
      ) : (
        <p className="absolute inset-0 grid place-items-center text-sm text-white/80">{failed ? "Couldn't load the station." : "Loading Fulton St…"}</p>
      )}
      <button type="button" onClick={onClose} data-testid="station-walk-close"
        className="absolute left-[var(--edge,12px)] top-[calc(env(safe-area-inset-top)+12px)] flex h-11 items-center gap-1.5 rounded-full bg-black/55 px-4 text-sm font-semibold text-white backdrop-blur focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to the map
      </button>
      {nearDoor && ride === "walking" ? (
        <button type="button" onClick={boardTrain} data-testid="board-train"
          className="absolute bottom-[calc(env(safe-area-inset-bottom)+128px)] left-1/2 flex h-12 -translate-x-1/2 items-center gap-2 rounded-full bg-[#00933c] px-5 text-base font-semibold text-white shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
          Board the train{touch ? "" : " (E)"}
        </button>
      ) : null}
      {ride === "riding" ? (
        <div role="status" data-testid="riding" className="absolute inset-x-4 top-1/3 mx-auto max-w-sm rounded-2xl bg-black/70 p-5 text-center text-white backdrop-blur">
          <p className="text-lg font-semibold">On the downtown 4 train</p>
          <p className="mt-1 text-sm text-white/80">Next stop: Wall St</p>
          <div className="mt-4 flex justify-center gap-2">
            <button type="button" data-testid="walk-again" onClick={() => { setRide("walking"); setNearDoor(false); setRound((r) => r + 1); }}
              className="h-11 rounded-full bg-white px-4 text-sm font-semibold text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">Walk again</button>
            <button type="button" onClick={onClose} className="h-11 rounded-full bg-white/15 px-4 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">Back to the map</button>
          </div>
        </div>
      ) : null}
      {import.meta.env.DEV ? <WalkDevHud /> : null}
      {touch && ride === "walking" ? (
        <Joystick joystickWrapperStyle={{ left: 24, bottom: "calc(env(safe-area-inset-bottom) + 24px)", position: "absolute" }} />
      ) : ride !== "walking" ? null : (
        <p className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-3 py-1.5 text-xs text-white/90 backdrop-blur">
          WASD or arrow keys to walk · drag to look
        </p>
      )}
    </div>
  );
}
