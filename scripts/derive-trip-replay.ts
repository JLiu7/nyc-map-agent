/**
 * Bakes the Walk Guide's checkpoints (Cortlandt St to 14 St-Union Sq, step-free)
 * into src/features/recorder/replay/trip-stops.json, so the replay page does not
 * reach into the walk guide feature at run time.
 *
 *   tsx scripts/derive-trip-replay.ts
 */
import { writeFileSync } from "node:fs";
import { WALK } from "../src/features/walkguide/walks";

const stops = WALK.map((c) => ({ id: c.id, station: c.station, level: c.level, at: c.at, ...(c.via ? { via: c.via } : {}), ...(c.by ? { by: c.by } : {}) }));
writeFileSync("src/features/recorder/replay/trip-stops.json", JSON.stringify(stops) + "\n");
