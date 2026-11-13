/**
 * Walk inside Fulton St like a game (#126): WASD or the arrow keys (a joystick on a touch screen)
 * move the figure, dragging looks around. The station is drawn from the watertight shell, and the
 * figure collides with the same floors and walls, cleared along every walk so nothing catches a body
 * there (stationWalkGeometry.ts). Loaded only when opened: the physics engine is large.
 */
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import { CameraControls } from "@react-three/drei";
import { Physics, RigidBody, TrimeshCollider } from "@react-three/rapier";
import { Ecctrl, type EcctrlHandle } from "ecctrl";
import { Joystick, useJoystickStore } from "ecctrl/input";
import { ArrowLeft } from "lucide-react";
import type { DollhouseModel } from "@/lib/map/three/dollhouse";
import { buildFigure, concreteTexture, pickWalk, treadTexture, walkAt, walkLength, wallTexture } from "@/lib/map/three/dollhouse";
import { SMOOTH_SEAMS, toYUp, walkGeometry, type Surface, type WalkGeometry } from "@/lib/map/three/stationWalkGeometry";
import { loadModel } from "@/lib/map/dollhousePreview";

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
    const ceiling = new THREE.Mesh(geometryOf(geo.ceiling), new THREE.MeshLambertMaterial({ color: 0x8f8c86, side: THREE.DoubleSide }));
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

function Walker({ start, heading, lowest, walls }: { start: THREE.Vector3; heading: number; lowest: number; walls: React.MutableRefObject<THREE.Object3D[]> }) {
  const body = useRef<EcctrlHandle>(null);
  const cam = useRef<React.ElementRef<typeof CameraControls>>(null);
  const keys = useKeys();
  const walked = useRef(0);
  const last = useRef(start.clone());
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
  }, [start, heading]);

  useFrame((state) => {
    const b = body.current, c = cam.current;
    if (!b) return;
    const j = Object.values(useJoystickStore.getState().joysticks)[0];
    const k = keys.current;
    // Dev and test hook: window.__walkDrive = { x, y } steers like the joystick (x right, y ahead of the camera).
    const drive = import.meta.env.DEV ? (window as unknown as { __walkDrive?: { x: number; y: number } }).__walkDrive : undefined;
    b.setMovement({ ...k, joystick: drive ?? (j?.active ? { x: j.x, y: j.y } : { x: 0, y: 0 }) });
    const p = b.currPos;
    if (import.meta.env.DEV) Object.assign(window, { __walkBody: b, __walkCamera: state.camera });
    // Fell out of the station somehow: back to the start.
    if (p.y < lowest - 6) {
      b.body.setTranslation(start, true);
      b.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    }
    walked.current += Math.hypot(p.x - last.current.x, p.z - last.current.z);
    last.current.copy(p);
    figure.stride(walked.current, b.isMoving);
    if (c) {
      c.colliderMeshes = walls.current;
      void c.moveTo(p.x, p.y + LOOK_UP_M, p.z, true);
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

export function StationWalk({ exit, onClose }: { exit: [number, number] | null; onClose: () => void }) {
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
  const geo = useMemo(() => (model ? walkGeometry(model) : null), [model]);
  const start = useMemo(() => {
    if (!model) return null;
    const walk = (exit && pickWalk(model, exit)) || [...model.walks].sort((a, b) => walkLength(b.path) - walkLength(a.path))[0];
    // Walks run from the platform up to the street: start a little way in from the street end.
    const len = walkLength(walk.path);
    const p = walkAt(walk.path, 1 - START_IN_M / len);
    const [x, y, z] = toYUp(p.x, p.y, p.z + 1.2);
    // Face down the walk, into the station.
    return { at: new THREE.Vector3(x, y, z), heading: p.heading + Math.PI, path: walk.path };
  }, [model, exit]);

  return (
    <div data-testid="station-walk" className="fixed inset-0 z-[70] bg-[#1d1f23] touch-none select-none">
      {geo && start ? (
        <Canvas camera={{ fov: 62, near: 0.05, far: 300 }} dpr={[1, 2]} gl={{ antialias: true }}>
          <color attach="background" args={["#1d1f23"]} />
          <hemisphereLight args={[0xfdfbf3, 0x55524c, 1.6]} />
          <ambientLight intensity={0.5} />
          <Suspense fallback={null}>
            {/* A fixed step: a slow frame takes several small steps, never one big one that throws the body. */}
            <Physics timeStep={1 / 60}>
              <Station geo={geo} walls={walls} />
              <Guide path={start.path} />
              <Walker start={start.at} heading={start.heading} lowest={geo.lowest} walls={walls} />
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
      {touch ? (
        <Joystick joystickWrapperStyle={{ left: 24, bottom: "calc(env(safe-area-inset-bottom) + 24px)", position: "absolute" }} />
      ) : (
        <p className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-3 py-1.5 text-xs text-white/90 backdrop-blur">
          WASD or arrow keys to walk · drag to look
        </p>
      )}
    </div>
  );
}
