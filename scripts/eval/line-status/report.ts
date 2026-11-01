/** Pass rates and the keep-or-reject rule for comparing two runs (#629). */
import type { Row } from "./types";

interface Summary {
  trials: number;
  clean: number;
  /** Share of trials with no violation. */
  rate: number;
  byCheck: Record<string, number>;
}

const empty = (): Summary => ({ trials: 0, clean: 0, rate: 0, byCheck: {} });

function summarize(rows: Row[]): { all: Summary; train: Summary; heldout: Summary } {
  const out = { all: empty(), train: empty(), heldout: empty() };
  for (const r of rows) {
    for (const s of [out.all, out[r.split]]) {
      s.trials += 1;
      if (!r.violations.length) s.clean += 1;
      for (const v of new Set(r.violations.map((x) => x.check))) s.byCheck[v] = (s.byCheck[v] ?? 0) + 1;
    }
  }
  for (const s of Object.values(out)) s.rate = s.trials ? s.clean / s.trials : 0;
  return out;
}

/** Groups whose variants (reordered feed, extra alert, other wording) do not pass at similar rates. */
function unstableGroups(rows: Row[], gap = 0.4): Array<{ group: string; rates: Record<string, number> }> {
  const by = new Map<string, Map<string, { n: number; ok: number }>>();
  for (const r of rows) {
    const g = by.get(r.group) ?? new Map<string, { n: number; ok: number }>();
    const v = g.get(r.variant) ?? { n: 0, ok: 0 };
    v.n += 1;
    if (!r.violations.length) v.ok += 1;
    g.set(r.variant, v);
    by.set(r.group, g);
  }
  const out: Array<{ group: string; rates: Record<string, number> }> = [];
  for (const [group, variants] of by) {
    const rates = Object.fromEntries([...variants].map(([k, v]) => [k, v.ok / v.n]));
    const vals = Object.values(rates);
    if (vals.length > 1 && Math.max(...vals) - Math.min(...vals) >= gap) out.push({ group, rates });
  }
  return out;
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

export function format(rows: Row[]): string {
  const s = summarize(rows);
  const lines: string[] = [];
  for (const k of ["train", "heldout", "all"] as const) lines.push(`${k.padEnd(8)} ${s[k].clean}/${s[k].trials} trials clean (${pct(s[k].rate)})`);
  lines.push("", "violations per check (trials, all splits):");
  for (const [c, n] of Object.entries(s.all.byCheck).sort((a, b) => b[1] - a[1])) lines.push(`  ${c.padEnd(32)} ${n}`);
  const unstable = unstableGroups(rows);
  if (unstable.length) {
    lines.push("", "groups that should answer alike but do not:");
    for (const u of unstable) lines.push(`  ${u.group}: ${Object.entries(u.rates).map(([k, v]) => `${k} ${pct(v)}`).join(", ")}`);
  }
  return lines.join("\n");
}

/**
 * Keep a change only when it helps on the cases being studied, does not hurt the held-out ones,
 * and does not make any one check clearly worse on them. Small runs are noisy, so too few trials is "inconclusive".
 */
export function verdict(before: Row[], after: Row[], minTrials = 30): { keep: boolean | null; why: string } {
  const a = summarize(before), b = summarize(after);
  if (Math.min(a.train.trials, b.train.trials, a.heldout.trials, b.heldout.trials) < minTrials) return { keep: null, why: `inconclusive: need at least ${minTrials} trials per split in both runs` };
  if (b.heldout.rate < a.heldout.rate - 0.03) return { keep: false, why: `held-out got worse (${pct(a.heldout.rate)} to ${pct(b.heldout.rate)})` };
  for (const [check, n] of Object.entries(b.heldout.byCheck)) {
    const was = (a.heldout.byCheck[check] ?? 0) / a.heldout.trials;
    if (n / b.heldout.trials > was + 0.1) return { keep: false, why: `held-out "${check}" rose from ${pct(was)} to ${pct(n / b.heldout.trials)}` };
  }
  if (b.train.rate < a.train.rate + 0.03) return { keep: false, why: `train did not improve (${pct(a.train.rate)} to ${pct(b.train.rate)})` };
  return { keep: true, why: `train ${pct(a.train.rate)} to ${pct(b.train.rate)}, held-out ${pct(a.heldout.rate)} to ${pct(b.heldout.rate)}` };
}
