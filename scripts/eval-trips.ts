/**
 * Plays multi-turn trip conversations against the app's agent, several times each, and scores every
 * turn's tool use with rule checks (#23): did it plan, did it draw, did "yes" do anything, did it
 * loop, did it leak internal names. Each reply goes back into the conversation, as the app does.
 *
 *   tsx scripts/eval-trips.ts --trials 3 --label baseline
 *   tsx scripts/eval-trips.ts --only trip-then --trials 5
 *   tsx scripts/eval-trips.ts --url https://nyc.design-bakery.com --trials 1   # the live site
 *
 * In process, the model is the app's own settings (INFERHUB_BASE_URL, INFERHUB_MODEL,
 * INFERHUB_API_KEY), trips go to OTP_URL and walks to VALHALLA_URL; without them the built-in
 * subway router and the public OSRM server answer. Rows go to eval-runs/trips/<run id>.jsonl
 * (not committed). See docs/eval/trips/README.md.
 */
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createDailyBudget, createLimiter } from "../server/features/agent/fair-use";
import { stablePrompt } from "../server/features/agent/prompt";
import { DEFAULT_MODEL, POST } from "../server/features/agent/routes";
import { CASES } from "./eval/trips/cases";
import { checkTurn, isReadback } from "./eval/trips/checks";
import { format } from "./eval/trips/report";
import { UnreachableModel, withRetry } from "./eval/line-status/retry";
import type { Case, Observed, Row } from "./eval/trips/types";

const arg = (name: string, fallback: string) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : fallback; };
const trials = Number(arg("trials", "3"));
const parallel = Number(arg("parallel", "2"));
const only = arg("only", "");
const label = arg("label", "run");
const outDir = arg("out", "eval-runs/trips");
const url = arg("url", "").replace(/\/$/, "");

const UNION_SQUARE = { lon: -73.9903, lat: 40.7359 };
const sha = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 12);
const git = () => { try { return execSync("git rev-parse --short=12 HEAD", { encoding: "utf8" }).trim(); } catch { return "unknown"; } };
const versions = {
  gitSha: git(),
  model: url ? `live:${url}` : process.env.INFERHUB_MODEL ?? DEFAULT_MODEL,
  promptHash: sha(stablePrompt()),
  toolsHash: sha(readFileSync("server/features/agent/tools.ts", "utf8")),
};

const cases = CASES.filter((c) => !only || c.id.startsWith(only));
if (!cases.length) { console.error("no cases match"); process.exit(2); }
const fairUse = { limiter: createLimiter({ windowMax: 1e6, windowMs: 60_000, burstMax: 1e6, burstMs: 60_000 }), budget: createDailyBudget({ softCap: 0, hardCap: 0, capModel: null }), now: Date.now };

async function ask(body: string): Promise<string> {
  if (url) {
    const res = await fetch(`${url}/api/agent`, { method: "POST", headers: { "Content-Type": "application/json" }, body, signal: AbortSignal.timeout(180_000) });
    if (!res.ok) throw new Error(`${url} returned ${res.status}`);
    return res.text();
  }
  return (await POST(new Request("http://local/api/agent", { method: "POST", body }), { fairUse })).text();
}

/** One turn: the reply text, the tools in start order and the map commands. */
function observe(stream: string): Observed {
  const o: Observed = { reply: "", tools: [], commands: [] };
  let failure = "";
  for (const line of stream.trim().split("\n")) {
    if (!line) continue;
    const e = JSON.parse(line) as { type: string; text?: string; message?: string; name?: string; status?: string; command?: { type?: string } };
    if (e.type === "error") failure = e.message ?? "the agent reported an error";
    if (e.type === "text") o.reply += e.text ?? "";
    if (e.type === "step" && e.status === "start" && e.name) o.tools.push(e.name);
    if (e.type === "command" && e.command?.type) o.commands.push(e.command.type);
  }
  // A failed model call arrives as an error event on a fine response; retried, then the run stops.
  if (failure) throw new Error(failure);
  o.reply = o.reply.trim();
  return o;
}

async function trial(c: Case, n: number, runId: string): Promise<Row[]> {
  const messages: Array<{ role: "user" | "assistant"; content: string }> = [];
  const location = c.location === undefined ? UNION_SQUARE : c.location;
  const rows: Row[] = [];
  for (const [i, turn] of c.turns.entries()) {
    messages.push({ role: "user", content: turn.user });
    const t0 = Date.now();
    const send = async () => {
      const body = JSON.stringify({ messages, location });
      try {
        return await withRetry(async () => observe(await ask(body)), {
          attempts: 3,
          delayMs: 2000,
          onRetry: (err, next) => console.error(`  ${c.id} trial ${n} turn ${i}: retry ${next} after ${err instanceof Error ? err.message : String(err)}`),
        });
      } catch (err) {
        throw new UnreachableModel(c.id, n, err);
      }
    };
    let observed = await send();
    // The app asks once to confirm an ambiguous station; answer it and score the turn on what follows.
    if (isReadback(observed.reply)) {
      const readback = observed.reply;
      messages.push({ role: "assistant", content: readback }, { role: "user", content: "Yes" });
      const next = await send();
      observed = { ...next, tools: [...observed.tools, ...next.tools], commands: [...observed.commands, ...next.commands], readback };
    }
    messages.push({ role: "assistant", content: observed.reply });
    rows.push({ runId, label, caseId: c.id, trial: n, turn: i, user: turn.user, expect: turn.expect, observed, violations: checkTurn(turn.expect, observed), ms: Date.now() - t0, versions });
  }
  return rows;
}

const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${label}`;
mkdirSync(outDir, { recursive: true });
const file = join(outDir, `${runId}.jsonl`);
writeFileSync(file, "");
const queue = cases.flatMap((c) => Array.from({ length: trials }, (_, i) => ({ c, i })));
const total = queue.length;
const rows: Row[] = [];
let done = 0;
await Promise.all(Array.from({ length: parallel }, async () => {
  for (let job = queue.shift(); job; job = queue.shift()) {
    const got = await trial(job.c, job.i, runId);
    rows.push(...got);
    for (const r of got) appendFileSync(file, `${JSON.stringify(r)}\n`);
    done += 1;
    if (done % 5 === 0 || done === total) console.log(`  ${done}/${total} conversations`);
  }
}));
console.log(`\nrun ${runId}\nmodel ${versions.model}  prompt ${versions.promptHash}  tools ${versions.toolsHash}  commit ${versions.gitSha}\n`);
console.log(format(rows));
console.log(`\nrows: ${file}`);
