import { describe, expect, it } from "vitest";

/**
 * The contract for the recorder work on #223 (docs/specs/RECORDER_CONTRIBUTIONS.md). Each block is
 * skipped until its function exists, and checks it as soon as it does, so a pull request that adds a
 * piece is tested without anyone switching a test on. The checks are properties: they must hold for
 * every input, so inputs are generated from a seeded sequence instead of listed.
 */
const mods = import.meta.glob<Record<string, unknown>>(["./camera.ts", "./levels.ts", "./upload.ts"], { eager: true });
const fn = <T>(file: string, name: string): T | null => {
  const f = mods[file]?.[name];
  return typeof f === "function" ? (f as T) : null;
};

/** A repeatable stream of numbers in [0, 1), so a failure can be run again. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

type Device = { deviceId: string };
const nextCamera = fn<(devices: Device[], current: string | null) => string | null>("./camera.ts", "nextCamera");

describe.skipIf(!nextCamera)("switch camera: nextCamera", () => {
  const cams = (n: number): Device[] => Array.from({ length: n }, (_, i) => ({ deviceId: `cam${i}` }));
  it("has nothing to switch to with one camera or none", () => {
    expect(nextCamera!([], null)).toBeNull();
    expect(nextCamera!(cams(1), "cam0")).toBeNull();
  });
  it("visits every camera once and comes back to the first", () => {
    for (let n = 2; n <= 6; n++) {
      const seen: string[] = [];
      let cur: string | null = "cam0";
      for (let i = 0; i < n; i++) { cur = nextCamera!(cams(n), cur); seen.push(cur!); }
      expect(new Set(seen).size).toBe(n);
      expect(cur).toBe("cam0");
    }
  });
  it("moves to the first camera when the current one has gone", () => {
    expect(nextCamera!(cams(3), "unplugged")).toBe("cam0");
  });
});

type Mark = { t: number; kind: "sign" | "stairs" | "elevator"; dir?: "up" | "down" };
type Step = { t: number; level: number };
const levelsFromMarks = fn<(marks: Mark[], start: number) => Step[]>("./levels.ts", "levelsFromMarks");

describe.skipIf(!levelsFromMarks)("up or down: levelsFromMarks", () => {
  const walk = (rand: () => number, n: number): Mark[] => {
    let t = 0;
    return Array.from({ length: n }, () => {
      t += 1 + Math.floor(rand() * 60);
      const r = rand();
      return r < 0.4 ? { t, kind: "sign" } : { t, kind: r < 0.7 ? "stairs" : "elevator", dir: rand() < 0.5 ? "up" : "down" };
    });
  };
  const end = (steps: Step[], start: number) => (steps.length ? steps[steps.length - 1].level : start);
  const levels = (steps: Step[]) => steps.map((s) => s.level);
  const each = (check: (m: Mark[], start: number, rand: () => number) => void) => {
    for (let seed = 1; seed <= 40; seed++) { const rand = seeded(seed); check(walk(rand, 3 + (seed % 12)), Math.floor(rand() * 5) - 2, rand); }
  };

  it("changes no level without a stairs or elevator mark", () => {
    expect(levelsFromMarks!([], 0)).toEqual([]);
    expect(levelsFromMarks!([{ t: 3, kind: "sign" }, { t: 9, kind: "sign" }], 2)).toEqual([]);
  });
  it("ignores a stairs or elevator mark that has no direction", () => {
    expect(levelsFromMarks!([{ t: 5, kind: "stairs" }, { t: 8, kind: "elevator" }], 1)).toEqual([]);
  });
  it("ends where it started after up then down", () => {
    expect(end(levelsFromMarks!([{ t: 1, kind: "stairs", dir: "up" }, { t: 9, kind: "elevator", dir: "down" }], 4), 4)).toBe(4);
  });
  it("gives the same levels when every time is shifted, at the shifted times", () => each((m, start, rand) => {
    const by = 1 + Math.floor(rand() * 1000);
    const a = levelsFromMarks!(m, start), b = levelsFromMarks!(m.map((x) => ({ ...x, t: x.t + by })), start);
    expect(b).toEqual(a.map((s) => ({ t: s.t + by, level: s.level })));
  }));
  it("is not changed by adding sign marks", () => each((m, start, rand) => {
    const extra: Mark[] = Array.from({ length: 4 }, () => ({ t: Math.floor(rand() * 500) + 0.5, kind: "sign" as const }));
    const withSigns = [...m, ...extra].sort((x, y) => x.t - y.t);
    expect(levelsFromMarks!(withSigns, start)).toEqual(levelsFromMarks!(m, start));
  }));
  it("is the first half, then the second half started where the first ended", () => each((m, start) => {
    const cut = Math.floor(m.length / 2), a = levelsFromMarks!(m.slice(0, cut), start);
    expect(levelsFromMarks!(m, start)).toEqual([...a, ...levelsFromMarks!(m.slice(cut), end(a, start))]);
  }));
  it("passes the same levels in reverse when walked backwards with every direction flipped", () => each((m, start) => {
    const forward = levelsFromMarks!(m, start), last = m[m.length - 1].t;
    const back = [...m].reverse().map((x): Mark => ({ ...x, t: last - x.t, dir: x.dir ? (x.dir === "up" ? "down" : "up") : undefined }));
    const there = [start, ...levels(forward)];
    expect([end(forward, start), ...levels(levelsFromMarks!(back, end(forward, start)))]).toEqual([...there].reverse());
  }));
});

const chunkPlan = fn<(size: number, chunk: number, confirmed?: number) => [number, number][]>("./upload.ts", "chunkPlan");
const checkUpload = fn<(a: { bytes: number; sentToday: number }, limits: { maxBytes: number; perDay: number }) => string | null>("./upload.ts", "checkUpload");

describe.skipIf(!chunkPlan || !checkUpload)("send: chunkPlan and checkUpload", () => {
  it("covers the file from the confirmed point to the end, with no gap, no overlap and no oversized piece", () => {
    for (let seed = 1; seed <= 60; seed++) {
      const rand = seeded(seed), size = Math.floor(rand() * 5_000_000), chunk = 1 + Math.floor(rand() * 700_000), confirmed = Math.floor(rand() * (size + 1));
      const plan = chunkPlan!(size, chunk, confirmed);
      let at = confirmed;
      for (const [from, to] of plan) { expect(from).toBe(at); expect(to).toBeGreaterThan(from); expect(to - from).toBeLessThanOrEqual(chunk); at = to; }
      expect(at).toBe(size);
    }
  });
  it("gives the tail of the full plan when it resumes at a piece's edge", () => {
    const full = chunkPlan!(1_000_000, 64_000);
    for (let i = 0; i <= full.length; i++) expect(chunkPlan!(1_000_000, 64_000, i < full.length ? full[i][0] : 1_000_000)).toEqual(full.slice(i));
  });
  it("has nothing left to send for a file that is fully confirmed, or empty", () => {
    expect(chunkPlan!(500, 100, 500)).toEqual([]);
    expect(chunkPlan!(0, 100)).toEqual([]);
  });
  it("refuses a file over the size limit or a sender over the daily limit, in words, and allows one inside both", () => {
    const limits = { maxBytes: 200_000_000, perDay: 5 };
    expect(checkUpload!({ bytes: 1_000, sentToday: 0 }, limits)).toBeNull();
    expect(checkUpload!({ bytes: limits.maxBytes, sentToday: limits.perDay - 1 }, limits)).toBeNull();
    for (const bad of [{ bytes: limits.maxBytes + 1, sentToday: 0 }, { bytes: 1_000, sentToday: limits.perDay }]) {
      const why = checkUpload!(bad, limits);
      expect(typeof why).toBe("string");
      expect(why!.length).toBeGreaterThan(10);
    }
  });
});

describe("the recorder contract", () => {
  it("says which pieces are being checked", () => {
    const state = { "switch camera": !!nextCamera, "up or down": !!levelsFromMarks, send: !!chunkPlan && !!checkUpload };
    console.info("recorder contract (#223), pieces under check:", JSON.stringify(state));
    expect(Object.keys(state)).toHaveLength(3);
  });
});
