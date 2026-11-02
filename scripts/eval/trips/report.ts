/** Plain-text summary of a trip suite run: clean turns overall, per check and per case. */
import type { Row } from "./types";

const pct = (n: number, d: number) => (d ? `${((100 * n) / d).toFixed(1)}%` : "-");

export function format(rows: Row[]): string {
  const clean = rows.filter((r) => !r.violations.length).length;
  const lines = [`clean turns: ${clean} of ${rows.length} (${pct(clean, rows.length)})`, "", "by check (turns that broke it):"];
  const byCheck = new Map<string, number>();
  for (const r of rows) for (const c of new Set(r.violations.map((v) => v.check))) byCheck.set(c, (byCheck.get(c) ?? 0) + 1);
  for (const [c, n] of [...byCheck].sort((a, b) => b[1] - a[1])) lines.push(`  ${c.padEnd(22)} ${String(n).padStart(4)}  ${pct(n, rows.length)}`);
  if (!byCheck.size) lines.push("  none");
  lines.push("", "by case (clean turns):");
  const byCase = new Map<string, Row[]>();
  for (const r of rows) byCase.set(r.caseId, [...(byCase.get(r.caseId) ?? []), r]);
  for (const [id, rs] of [...byCase].sort((a, b) => a[0].localeCompare(b[0]))) {
    const ok = rs.filter((r) => !r.violations.length).length;
    lines.push(`  ${id.padEnd(22)} ${ok}/${rs.length}`);
  }
  return lines.join("\n");
}
