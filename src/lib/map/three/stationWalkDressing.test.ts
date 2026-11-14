import { beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { type DollhouseModel, type P3 } from "./dollhouse";
import { fultonCorner } from "@/lib/map/fultonCorners";
import { inWall, stationShell, walkPoints, type Shell } from "./stationShell";
import { boardsOverlap, fareRows, inFront, walkSignPlans, walkDressing, type Board, type Placed, type WalkDressing } from "./stationWalkDressing";

const model = JSON.parse(readFileSync("public/transit/fulton-model.json", "utf8")) as DollhouseModel;

// signMesh draws on a canvas. A stand-in with no pixels, whose text measures 0.65 of its font size
// a letter, wider than Helvetica Bold, so the boards tested are at least as big as the real ones.
vi.stubGlobal("document", {
  createElement: () => ({
    width: 0, height: 0,
    getContext: () => {
      let px = 10;
      return new Proxy({}, {
        // Gradients (the street picture's sky) take colour stops and draw nothing.
        get: (_, k) => (k === "measureText" ? (t: string) => ({ width: t.length * px * 0.65 }) : () => ({ addColorStop: () => {} })),
        set: (_, k, v) => { if (k === "font") px = parseFloat(/([\d.]+)px/.exec(String(v))?.[1] ?? "10"); return true; },
      });
    },
  }),
});

let shell: Shell, dressing: WalkDressing;
const walkPts: P3[] = [];
beforeAll(() => {
  shell = stationShell(model);
  dressing = walkDressing(model, fultonCorner, shell);
  dressing.group.updateMatrixWorld(true);
  for (const w of model.walks) for (const [x, y, z] of walkPoints(w.path, 0.1)) walkPts.push([x, y, z]);
}, 120_000);

/** Points over a board at `at` facing `heading`, 2 cm apart over both its faces. */
function boardPoints(b: Board, at: P3, heading: number): P3[] {
  const ux = Math.cos(heading), uy = -Math.sin(heading), fx = Math.sin(heading), fy = Math.cos(heading);
  const out: P3[] = [], n = Math.ceil(b.half / 0.01), m = Math.ceil((b.z1 - b.z0) / 0.02);
  for (let i = 0; i <= n; i++) for (const d of [b.y0, b.y1]) for (let j = 0; j <= m; j++) {
    const s = -b.half + (2 * b.half * i) / n;
    out.push([at[0] + ux * s + fx * d, at[1] + uy * s + fy * d, at[2] + b.z0 + ((b.z1 - b.z0) * j) / m]);
  }
  return out;
}

const signs = () => dressing.group.children.filter((c) => c.userData.sign);

describe("Fulton St's dressing for walking inside", () => {
  it("hangs every sign planned along every walk and on both platforms", () => {
    const hung = signs().map((s) => s.userData.sign as { key: string; planned: P3 });
    const missing: string[] = [];
    for (const plan of walkSignPlans(model, fultonCorner)) {
      const key = JSON.stringify(plan.lines);
      // The same sign planned again within 1.5 m by another walk is hung once.
      if (!hung.some((h) => h.key === key && Math.hypot(h.planned[0] - plan.at[0], h.planned[1] - plan.at[1]) < 1.5 && Math.abs(h.planned[2] - plan.at[2]) < 1)) missing.push(key);
    }
    expect(missing).toEqual([]);
    expect(hung.filter((h) => h.key.includes("Downtown & Brooklyn")).length).toBeGreaterThan(1);
    expect(hung.filter((h) => h.key.includes("Uptown & The Bronx")).length).toBeGreaterThan(1);
  });

  it("hangs the platform's name over the downtown track, facing whoever steps off and looks at the train", () => {
    // Where the owner stood on 2026-11-13, looking south-east across the track (compass 120°).
    const [vx, vy, look] = [-87.7, 35.1, (120 * Math.PI) / 180];
    const ahead = signs().filter((s) => {
      const key = (s.userData.sign as { key: string }).key;
      if (!key.includes("Fulton St") || !key.includes("Downtown & Brooklyn")) return false;
      const dx = s.position.x - vx, dy = s.position.y - vy, d = Math.hypot(dx, dy);
      // Within 25° of the way they look, and its face toward them: the front faces -(sin h, cos h).
      const h = -s.rotation.z, off = Math.acos((dx * Math.sin(look) + dy * Math.cos(look)) / d);
      return d < 12 && off < (25 * Math.PI) / 180 && Math.sin(h) * dx + Math.cos(h) * dy > 0;
    });
    expect(ahead.length).toBeGreaterThan(0);
  });

  // Tests every board against every wall slab: about 5 s on a CI runner.
  it("keeps every sign's board, rods and all, out of every wall", { timeout: 30_000 }, () => {
    const stuck: string[] = [];
    for (const s of signs()) {
      // The board's own box, turned and scaled as it hangs, sampled every 3 cm.
      const { position: at, rotation: { z: turn }, scale: { x: k } } = s;
      const keep = [at.clone(), turn, k] as const;
      s.position.set(0, 0, 0); s.rotation.z = 0; s.scale.setScalar(1);
      const box = new THREE.Box3().setFromObject(s);
      s.position.copy(keep[0]); s.rotation.z = keep[1]; s.scale.setScalar(keep[2]);
      s.updateMatrixWorld(true);
      const b = { half: Math.max(-box.min.x, box.max.x) * k, y0: box.min.y * k, y1: box.max.y * k, z0: box.min.z * k, z1: box.max.z * k };
      const near = shell.walls.filter((w) => Math.min(Math.hypot(w.a[0] - s.position.x, w.a[1] - s.position.y), Math.hypot(w.b[0] - s.position.x, w.b[1] - s.position.y)) < Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) + b.half + 1);
      if (boardPoints(b, [s.position.x, s.position.y, s.position.z], -s.rotation.z).some(([x, y, z]) => near.some((w) => inWall(w, x, y, z, 0)))) stuck.push((s.userData.sign as { key: string }).key);
    }
    expect(stuck).toEqual([]);
  });

  it("never hangs one board over another", () => {
    const boxes: Array<Placed & { key: string }> = signs().map((s) => {
      const { position: at, rotation: { z: turn }, scale: { x: k } } = s;
      const keep = [at.clone(), turn, k] as const;
      s.position.set(0, 0, 0); s.rotation.z = 0; s.scale.setScalar(1);
      const box = new THREE.Box3().setFromObject(s);
      s.position.copy(keep[0]); s.rotation.z = keep[1]; s.scale.setScalar(keep[2]);
      s.updateMatrixWorld(true);
      return { key: (s.userData.sign as { key: string }).key, at: [at.x, at.y, at.z], heading: -turn, b: { half: Math.max(-box.min.x, box.max.x) * k, y0: box.min.y, y1: box.max.y, z0: box.min.z * k, z1: box.max.z * k } };
    });
    const covered = boxes.flatMap((p, i) => boxes.slice(i + 1).filter((q) => boardsOverlap(p, q)).map((q) => `${p.key} / ${q.key}`));
    expect(covered).toEqual([]);
  });

  it("hangs one board for each way at each place, never two saying the same over each other", () => {
    // Owner, 2026-11-13: "multiple signboards for same exit".
    const all = signs().map((s) => ({ head: JSON.stringify((JSON.parse((s.userData.sign as { key: string }).key) as unknown[])[0]), p: s.position }));
    const twice = all.flatMap((a, i) => all.slice(i + 1).filter((b) => b.head === a.head && Math.hypot(b.p.x - a.p.x, b.p.y - a.p.y) < 3 && Math.abs(b.p.z - a.p.z) < 1).map(() => a.head));
    expect(twice).toEqual([]);
    // The A/C level's walks add their own stairs' boards (42 with them, 2026-11-13).
    expect(all.length).toBeLessThan(48);
  });

  it("hangs each stair's board at the stair's foot, facing whoever walks up to it", () => {
    // Owner, 2026-11-13: the Broadway & John St board hung off to the left of its stair.
    const off: string[] = [];
    for (const plan of walkSignPlans(model, fultonCorner).filter((p) => p.stair)) {
      const key = JSON.stringify(plan.lines);
      const s = signs().find((o) => { const u = o.userData.sign as { key: string; planned: P3 }; return u.key === key && u.planned.every((v, i) => Math.abs(v - plan.at[i]) < 0.01); });
      if (!s) continue;
      const turn = Math.abs(Math.atan2(Math.sin(-s.rotation.z - plan.heading), Math.cos(-s.rotation.z - plan.heading)));
      // Moved back along the walk is fine; aside, no more than a metre.
      // Over the stair's middle (`aim`), or moved back from it along the walk.
      const aim = (s.userData.sign as { aim: P3 }).aim;
      if (turn > Math.PI / 6 + 1e-6 || !inFront(s.position.x - aim[0], s.position.y - aim[1], plan.heading)) off.push(`${key} at ${s.position.x.toFixed(1)},${s.position.y.toFixed(1)}`);
    }
    expect(off).toEqual([]);
  });

  it("puts a sign near a wall flat on it, facing out", () => {
    // Without rods: a sign on a wall has only its two faces. A stair's board goes flat only on a wall
    // facing whoever walks up to it, so most of those hang.
    const flat = signs().filter((s) => s.children.length === 2);
    expect(flat.length).toBeGreaterThan(5);
  });

  it("sends each walk through a turnstile where it crosses a fare line, its arms turning a third of a turn", () => {
    expect(dressing.crossings.length).toBeGreaterThanOrEqual(5);
    const rotors: THREE.Object3D[] = [];
    dressing.group.traverse((o) => { if (o.parent?.rotation.x && o.children.length === 3) rotors.push(o); });
    for (const { at, dir } of dressing.crossings) {
      // This crossing's arms: the hub nearest the middle of its lane.
      const hub = (r: THREE.Object3D) => r.getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3(at[0], at[1], at[2] + 0.85));
      const r = rotors.reduce((a, b) => (hub(b) < hub(a) ? b : a));
      expect(hub(r)).toBeLessThan(0.5);
      const step = (d: number) => { dressing.turnstiles(at[0] + dir[0] * d, at[1] + dir[1] * d, at[2]); dressing.group.updateMatrixWorld(true); };
      // Before the lane, the arms rest; halfway, a sixth of a turn; through, a third (the rest pose again).
      step(-1);
      expect(r.rotation.y).toBeCloseTo(0, 5);
      step(0);
      expect(r.rotation.y).toBeCloseTo(-Math.PI / 3, 5);
      // The resting arm swings forward and down, the way the walker goes.
      const tip = () => r.children[0].children[0].getWorldPosition(new THREE.Vector3());
      step(-0.34);
      const before = tip();
      step(-0.2);
      const after = tip();
      expect((after.x - before.x) * dir[0] + (after.y - before.y) * dir[1]).toBeGreaterThan(0);
      expect(after.z).toBeLessThan(before.z);
      step(1);
      expect(r.rotation.y).toBeCloseTo(-(2 * Math.PI) / 3, 5);
    }
  });

  it("keeps every turnstile's cabinet out of every walk", () => {
    const cabs: THREE.Vector3[] = [];
    dressing.group.traverse((o) => {
      if (o instanceof THREE.Mesh && o.geometry instanceof THREE.BoxGeometry && o.geometry.parameters.depth === 0.95) cabs.push(o.getWorldPosition(new THREE.Vector3()));
    });
    expect(cabs.length).toBeGreaterThan(100);
    const hit = cabs.filter((c) => walkPts.some(([x, y, z]) => Math.abs(z - (c.z - 0.475)) < 1.2 && Math.hypot(x - c.x, y - c.y) < 0.3 + 0.15));
    expect(hit.map((c) => c.toArray().map((v) => v.toFixed(1)).join())).toEqual([]);
  });

  it("puts one accessible gate in every fare line, clear of the walks and the walls", () => {
    const rows = fareRows(model);
    const gates = dressing.group.children.filter((c) => c.userData.accessible);
    expect(gates.length).toBe(rows.length);
    // Where two lines meet at a corner, never two gates on top of each other.
    for (const g of gates) expect(gates.filter((o) => o.position.distanceTo(g.position) < 1.1)).toHaveLength(1);
    for (const g of gates) {
      const { x, y, z } = g.position, ux = Math.cos(g.rotation.z), uy = Math.sin(g.rotation.z);
      // Nearer than 0.45 m to the leaf, a walker's body would touch it.
      const toLeaf = (px: number, py: number) => {
        const s = Math.max(-0.45, Math.min(0.45, (px - x) * ux + (py - y) * uy));
        return Math.hypot(px - x - ux * s, py - y - uy * s);
      };
      expect(walkPts.filter(([px, py, pz]) => Math.abs(pz - z) < 1.2 && toLeaf(px, py) < 0.45)).toEqual([]);
      expect(shell.walls.filter((w) => inWall(w, x, y, z + 0.6))).toEqual([]);
    }
  });
});
