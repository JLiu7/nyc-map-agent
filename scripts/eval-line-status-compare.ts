/**
 * Compares two eval-line-status runs and says whether to keep the change between them (#629).
 *   tsx scripts/eval-line-status-compare.ts eval-runs/line-status/<before>.jsonl <after>.jsonl
 * Exit 0 keep, 1 reject, 2 inconclusive.
 */
import { readFileSync } from "node:fs";
import { format, verdict } from "./eval/line-status/report";
import type { Row } from "./eval/line-status/types";

const load = (p: string) => readFileSync(p, "utf8").trim().split("\n").map((l) => JSON.parse(l) as Row);
const [a, b] = process.argv.slice(2).map(load);
if (!a || !b) { console.error("usage: eval-line-status-compare <before.jsonl> <after.jsonl>"); process.exit(2); }
console.log(`BEFORE  ${a[0].versions.model} prompt ${a[0].versions.promptHash} tools ${a[0].versions.toolsHash}\n${format(a)}\n\nAFTER   ${b[0].versions.model} prompt ${b[0].versions.promptHash} tools ${b[0].versions.toolsHash}\n${format(b)}\n`);
const v = verdict(a, b);
console.log(`VERDICT ${v.keep === null ? "inconclusive" : v.keep ? "keep" : "reject"}: ${v.why}`);
process.exit(v.keep === null ? 2 : v.keep ? 0 : 1);
