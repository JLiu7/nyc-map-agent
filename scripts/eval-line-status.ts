/**
 * Asks the app's agent many line status questions against recorded MTA alert feeds, several times
 * each, and scores every reply with rule checks (#629). The feed is replaced by the case's snapshot
 * and the clock by its time, so a run is repeatable and can replay any past moment.
 *
 *   tsx scripts/eval-line-status.ts --trials 5 --label baseline
 *   tsx scripts/eval-line-status.ts --split train --only a-trouble --trials 3
 *   tsx scripts/eval-line-status.ts --sample 60 --label night1     # a fixed random 60 of all cases
 *
 * Model: the app's own settings, INFERHUB_BASE_URL, INFERHUB_MODEL and INFERHUB_API_KEY. For LFM3 on the
 * MacBook Pro: INFERHUB_BASE_URL=http://127.0.0.1:8099/v1 INFERHUB_MODEL=lfm3 INFERHUB_API_KEY=local.
 * Rows go to eval-runs/line-status/<run id>.jsonl (not committed). See docs/eval/line-status/PROGRAM.md.
 */
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { lineTroubles } from "../src/lib/transit/trouble";
import { createDailyBudget, createLimiter } from "../server/features/agent/fair-use";
import { stablePrompt } from "../server/features/agent/prompt";
import { DEFAULT_MODEL, POST } from "../server/features/agent/routes";
import { troubleStations } from "../server/features/agent/services";
import { openDataEntrances } from "../server/features/agent/transit";
import { builtinCases, generatedCases, snapshotCases } from "./eval/line-status/cases";
import { checkReply, factsFrom } from "./eval/line-status/checks";
import { format } from "./eval/line-status/report";
import { UnreachableModel, withRetry } from "./eval/line-status/retry";
import type { Case, Row } from "./eval/line-status/types";

const arg = (name: string, fallback: string) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : fallback; };
const trials = Number(arg("trials", "3"));
const parallel = Number(arg("parallel", "2"));
const split = arg("split", "all");
const only = arg("only", "");
const label = arg("label", "run");
const outDir = arg("out", "eval-runs/line-status");
const sources = arg("sources", "builtin,generated,snapshots").split(",");
const sample = Number(arg("sample", "0"));

const sha = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 12);
const git = () => { try { return execSync("git rev-parse --short=12 HEAD", { encoding: "utf8" }).trim(); } catch { return "unknown"; } };
const versions = {
  gitSha: git(),
  model: process.env.INFERHUB_MODEL ?? DEFAULT_MODEL,
  promptHash: sha(stablePrompt()),
  toolsHash: sha(readFileSync("server/features/agent/tools.ts", "utf8") + readFileSync("src/lib/transit/trouble.ts", "utf8")),
};

const cases: Case[] = [
  ...(sources.includes("builtin") ? builtinCases() : []),
  ...(sources.includes("generated") ? generatedCases("eval-cases/generated") : []),
  ...(sources.includes("snapshots") ? snapshotCases("eval-snapshots") : []),
].filter((c) => (split === "all" || c.split === split) && (!only || c.id.startsWith(only)));
if (!cases.length) { console.error("no cases match"); process.exit(2); }
// A fixed-seed shuffle: the same label draws the same cases, so two runs with one label are comparable.
if (sample && sample < cases.length) cases.sort((a, b) => sha(label + a.id).localeCompare(sha(label + b.id))).length = sample;

const stations = await openDataEntrances.stations();
const stationNames = [...new Set(stations.map((s) => s.name))];
const trouble = troubleStations(stations);
const fairUse = { limiter: createLimiter({ windowMax: 1e6, windowMs: 60_000, burstMax: 1e6, burstMs: 60_000 }), budget: createDailyBudget({ softCap: 0, hardCap: 0, capModel: null }), now: Date.now };

async function trial(c: Case, n: number, runId: string): Promise<Row> {
  const asOfMs = Date.parse(c.snapshot.asOf);
  const deps = {
    alertEntities: () => Promise.resolve(c.snapshot.alerts),
    alerts: (routes: string[]) => Promise.resolve(c.snapshot.alerts.filter((a) => a.alert.informed_entity?.some((e) => e.route_id && routes.includes(e.route_id))).map((a) => a.alert.header_text?.translation?.[0]?.text ?? "")),
    vehicles: () => Promise.resolve([]),
    outages: () => Promise.resolve([]),
    now: () => asOfMs,
  };
  const t0 = Date.now();
  const body = JSON.stringify({ messages: [{ role: "user", content: c.question }], location: null, now: c.snapshot.asOf });
  let reply = "";
  let planned = false;
  // A call that cannot reach the model is retried, then stops the run. Recording it as an empty
  // reply would score the network against the model and make two runs incomparable (#629).
  try {
    await withRetry(async () => {
      reply = "";
      planned = false;
      const res = await POST(new Request("http://local/api/agent", { method: "POST", body }), { deps, fairUse });
      let failure = "";
      for (const line of (await res.text()).trim().split("\n")) {
        const e = JSON.parse(line) as { type: string; text?: string; message?: string; name?: string; command?: { type?: string } };
        if (e.type === "error") failure = e.message ?? "the agent reported an error";
        if (e.type === "text") reply += e.text ?? "";
        if ((e.type === "step" && (e.name === "showRoute" || e.name === "openPanel")) || (e.type === "command" && (e.command?.type === "showRoute" || e.command?.type === "openPanel"))) planned = true;
      }
      // The route reports a failed model call as an error event on an otherwise fine response,
      // so this is where "could not reach the model" actually shows up.
      if (failure) throw new Error(failure);
    }, {
      attempts: 3,
      delayMs: 2000,
      onRetry: (err, next) => console.error(`  ${c.id} trial ${n}: retry ${next} after ${err instanceof Error ? err.message : String(err)}`),
    });
  } catch (err) {
    throw new UnreachableModel(c.id, n, err);
  }
  const facts = factsFrom(lineTroubles(c.snapshot.alerts, trouble, c.lines, Math.floor(asOfMs / 1000)));
  reply = reply.trim();
  const violations = checkReply({ reply, question: c.question, facts, stationNames, planned, about: c.about });
  return { runId, label, caseId: c.id, split: c.split, group: c.group, variant: c.variant, trial: n, question: c.question, reply, planned, violations, facts, ms: Date.now() - t0, versions };
}

const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${label}`;
mkdirSync(outDir, { recursive: true });
const file = join(outDir, `${runId}.jsonl`);
writeFileSync(file, "");
const queue = cases.flatMap((c) => Array.from({ length: trials }, (_, i) => ({ c, i })));
const rows: Row[] = [];
let done = 0;
await Promise.all(Array.from({ length: parallel }, async () => {
  for (let job = queue.shift(); job; job = queue.shift()) {
    const row = await trial(job.c, job.i, runId);
    rows.push(row);
    appendFileSync(file, `${JSON.stringify(row)}\n`);
    done += 1;
    if (done % 10 === 0 || done === cases.length * trials) console.log(`  ${done}/${cases.length * trials}`);
  }
}));
console.log(`\nrun ${runId}\nmodel ${versions.model}  prompt ${versions.promptHash}  tools ${versions.toolsHash}  commit ${versions.gitSha}\n`);
console.log(format(rows));
console.log(`\nrows: ${file}`);
