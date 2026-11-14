/**
 * Makes the station replay's small fixture from Friday's real walk
 * (2026-11-13, 5:04 to 5:17 pm: off the R/W at 14 St-Union Sq, up two
 * elevators, out at 14 St & 4 Av, and along 14th St to University Hall).
 *
 *   pnpm walk:from-sensor-logger "<leg 2 sensor logger export.zip>" leg2.json --station "14 St-Union Sq"
 *   tsx scripts/derive-union-sq-walk.ts leg2.json public/replay/union-sq-walk.json
 *
 * It also writes src/features/recorder/replay/union-sq-line.json: the Walk Guide's line through the
 * station with each point's level, and the two elevators, so the replay does not
 * reach into the walk guide feature at run time.
 *
 * Nothing is invented: rows are cut to the replay window and thinned. Motion is
 * dropped (the replay does not use it) and heading is kept twice a second,
 * which is plenty for one heading per step. Marks stay empty because no marks
 * were tapped on the walk (Annotation.csv has no rows).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { parseRecording, type Recording } from "../src/features/recorder/format";
import { legPath } from "../src/features/walkguide/progress";
import { WALK } from "../src/features/walkguide/walks";

type LonLat = [number, number];
const r6 = (p: readonly number[]): LonLat => [round(p[0], 6), round(p[1], 6)];

/** The Walk Guide's line through 14 St-Union Sq, platform to street, corners included. */
export function deriveLine() {
  const at = (id: string): LonLat => {
    const c = WALK.find((w) => w.id === id);
    if (!c) throw new Error(`no checkpoint ${id}`);
    return r6(c.at);
  };
  const ids = WALK.map((c, j) => ({ c, j })).filter((x) => x.c.station === "14 St-Union Sq");
  // An elevator's stretch leads off on the level it arrives at (the platform and mezzanine elevators sit one above the other).
  const legs = ids.map((x, k) => ({
    level: (x.c.by === "elevator" ? (WALK[x.j + 1]?.level ?? x.c.level) : x.c.level) as string,
    pts: k === ids.length - 1 || x.c.by ? [x.c.at] : legPath(WALK, x.j).slice(0, -1),
  }));
  return {
    line: legs.flatMap((l) => l.pts.map(r6)),
    lineLevels: legs.flatMap((l) => l.pts.map(() => l.level)),
    // EL219 (platform to mezzanine) and EL217 (mezzanine to 14 St & 4 Av).
    // Each sign the rider meets, in order, as the Walk Guide shows it.
    signs: ids.map(({ c }) => ({ id: c.id, sign: c.sign, say: c.say, photo: c.photo, steps: c.steps, at: r6(c.at) })),
    rides: [
      { from: at("us-to-mezzanine"), to: at("us-to-mezzanine"), name: "EL219" },
      { from: at("us-mural-elevator"), to: at("us-climate-clock"), name: "EL217" },
    ],
  };
}

/** The replay's clock starts at the phone screen recording's first second, 22:04:27 UTC. */
export const REPLAY_T0 = Date.UTC(2026, 10, 13, 22, 4, 27);
const FROM = REPLAY_T0 + 10_000;
const TO = REPLAY_T0 + 790_000;

const within = <T extends [number, ...number[]]>(rows: T[]): T[] => rows.filter((r) => r[0] >= FROM && r[0] <= TO);
function round(x: number, places: number) {
  return Math.round(x * 10 ** places) / 10 ** places + 0;
}

export function derive(rec: Recording): Recording {
  const heading: Recording["heading"] = [];
  let next = 0;
  for (const h of within(rec.heading)) {
    if (h[0] < next) continue;
    heading.push([h[0], round(h[1], 1), round(h[2], 1), round(h[3], 1)]);
    next = h[0] + 500;
  }
  return {
    v: 1,
    station: rec.station,
    startedAt: rec.startedAt,
    device: rec.device,
    motion: [],
    heading,
    gps: within(rec.gps).map((g) => [g[0], round(g[1], 6), round(g[2], 6), round(g[3], 1)]),
    baro: within(rec.baro).map((b) => [b[0], round(b[1], 2)]),
    steps: within(rec.steps),
    marks: [],
  };
}

if (process.argv[1]?.endsWith("derive-union-sq-walk.ts")) {
  const [src, out] = process.argv.slice(2);
  if (!src || !out) throw new Error("usage: derive-union-sq-walk.ts <converted.json> <out.json>");
  const parsed = parseRecording(JSON.parse(readFileSync(src, "utf8")));
  if (!parsed.ok) throw new Error(parsed.errors.join("\n"));
  const d = derive(parsed.recording);
  writeFileSync(out, JSON.stringify(d) + "\n");
  writeFileSync("src/features/recorder/replay/union-sq-line.json", JSON.stringify(deriveLine()) + "\n");
  console.log(`heading ${d.heading.length}, gps ${d.gps.length}, baro ${d.baro.length}, steps ${d.steps.length}`);
}
