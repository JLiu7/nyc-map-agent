/**
 * Asks DeepSeek (or any OpenAI-compatible model) to write new rider questions for the alert feeds in
 * eval-snapshots/ and the built-in scenarios, and saves them as cases in eval-cases/generated/ (#629).
 * It sees invented text and public alert wording only. Real rider questions are not read here.
 *
 *   DEEPSEEK_API_KEY=... tsx scripts/eval-line-status-generate.ts --per 8
 *   tsx scripts/eval-line-status-generate.ts --dry-run          # print the prompt, call nothing
 *
 * Env: DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL (default https://api.deepseek.com), DEEPSEEK_MODEL (default deepseek-chat).
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { builtinCases, snapshotCases, splitOf } from "./eval/line-status/cases";
import type { Case } from "./eval/line-status/types";

const arg = (name: string, fallback: string) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : fallback; };
const per = Number(arg("per", "6"));
const dry = process.argv.includes("--dry-run");
const LANGS = "English (most), Spanish, Chinese, Russian, French, Haitian Creole, Bengali, Korean, with typos and slang in some";

const seeds = [...snapshotCases("eval-snapshots"), ...builtinCases().filter((c) => c.variant === "base")].slice(0, 40);
const prompt = (c: Case) => `You write test questions for a New York subway chat assistant. A rider is asking about the line(s) ${c.lines.join(", ")}.
The MTA's alerts right now are:
${c.snapshot.alerts.map((a) => `- ${a.alert.header_text?.translation?.[0]?.text ?? ""}`).join("\n") || "- (none)"}
Write ${per} different short things a real rider might type or say. Vary the wording, how vague it is, whether they name a station they are at or heading to, and the language (${LANGS}). Some should name a station the alerts do not mention. Do not answer them. Reply with only a JSON array of strings.`;

if (dry) { console.log(prompt(seeds[0])); process.exit(0); }
const key = process.env.DEEPSEEK_API_KEY;
if (!key) { console.error("DEEPSEEK_API_KEY is not set"); process.exit(2); }
const base = (process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com").replace(/\/$/, "");

const out: Case[] = [];
for (const c of seeds) {
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: process.env.DEEPSEEK_MODEL ?? "deepseek-chat", temperature: 1, messages: [{ role: "user", content: prompt(c) }] }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) { console.error(`${c.id}: ${res.status}`); continue; }
  const text = ((await res.json()) as { choices: Array<{ message: { content: string } }> }).choices[0].message.content;
  let qs: unknown;
  try { qs = JSON.parse(text.replace(/^```(?:json)?|```$/gm, "").trim()); } catch { console.error(`${c.id}: reply was not JSON`); continue; }
  if (!Array.isArray(qs)) continue;
  for (const q of qs.filter((x): x is string => typeof x === "string" && x.length > 2 && x.length < 300)) {
    const id = `gen/${c.group}/${createHash("sha256").update(q).digest("hex").slice(0, 8)}`;
    out.push({ ...c, id, group: `gen/${c.group}`, variant: "generated", question: q, split: splitOf(c.group) });
  }
}
mkdirSync("eval-cases/generated", { recursive: true });
const file = join("eval-cases/generated", `${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
writeFileSync(file, JSON.stringify(out, null, 1));
console.log(`${out.length} cases written to ${file}`);
