/**
 * Makes the station replay's small fixture from Friday's real walk
 * (2026-11-13, 5:04 to 5:17 pm: off the R/W at 14 St-Union Sq, up two
 * elevators, out at 14 St & 4 Av, and along 14th St to University Hall).
 *
 *   pnpm walk:from-sensor-logger "<leg 2 sensor logger export.zip>" leg2.json --station "14 St-Union Sq"
 *   tsx scripts/replay/derive-union-sq-walk.ts leg2.json src/features/replay/union-sq-walk.json
 *
 * Nothing is invented: rows are cut to the replay window and thinned. Motion is
 * dropped (the replay does not use it) and heading is kept twice a second,
 * which is plenty for one heading per step. Marks stay empty because no marks
 * were tapped on the walk (Annotation.csv has no rows).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { parseRecording, type Recording } from "../../src/features/recorder/format";

/** The replay's clock starts at the phone screen recording's first second, 22:04:27 UTC. */
export const REPLAY_T0 = Date.UTC(2026, 10, 13, 22, 4, 27);
const FROM = REPLAY_T0 + 10_000;
const TO = REPLAY_T0 + 790_000;

const within = <T extends [number, ...number[]]>(rows: T[]): T[] => rows.filter((r) => r[0] >= FROM && r[0] <= TO);
const round = (x: number, places: number) => Math.round(x * 10 ** places) / 10 ** places + 0;

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
  console.log(`heading ${d.heading.length}, gps ${d.gps.length}, baro ${d.baro.length}, steps ${d.steps.length}`);
}
