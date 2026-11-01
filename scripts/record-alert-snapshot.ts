/**
 * Saves the live MTA subway alert feed as timestamped snapshots, so a past moment can be replayed
 * by scripts/eval-line-status.ts (#629). The feed is public and keyless; nothing about riders is stored.
 *
 *   tsx scripts/record-alert-snapshot.ts                       # one snapshot
 *   tsx scripts/record-alert-snapshot.ts --every 300 --count 288   # every 5 minutes for a day
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { FeedAlert } from "../src/lib/transit/trouble";
import type { Snapshot } from "./eval/line-status/types";

const FEED = "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/camsys%2Fsubway-alerts.json";
const arg = (name: string, fallback: string) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : fallback; };
const dir = arg("dir", "eval-snapshots");
const every = Number(arg("every", "0"));
const count = Number(arg("count", "1"));

async function once(): Promise<string> {
  const res = await fetch(FEED, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`alert feed answered ${res.status}`);
  const data = (await res.json()) as { entity?: FeedAlert[] };
  const snap: Snapshot = { asOf: new Date().toISOString(), alerts: data.entity ?? [] };
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${snap.asOf.replace(/[:.]/g, "-")}.json`);
  writeFileSync(file, JSON.stringify(snap));
  return `${file} (${snap.alerts.length} alerts)`;
}

for (let i = 0; i < count; i++) {
  try { console.log(await once()); } catch (err) { console.error(err instanceof Error ? err.message : err); }
  if (i + 1 < count) await new Promise((r) => setTimeout(r, every * 1000));
}
