/**
 * Timing for one /api/agent request: when the first step and the first words came,
 * how long each tool took, which model answered and how it ended. Written as one
 * "[agent-run]" JSON log line and one core.agent_runs row (migration 20261024010000).
 * A request still running after STUCK_MS is written as "stuck" straight away, so a
 * hang shows up even if it never finishes. The log and the row never record the
 * question, the answer or a location; the finished turn also goes to Phoenix as a
 * trace (server/lib/tracing.ts), with the question and answer masked. The trace alone
 * also carries what each tool was given and returned, and every map command sent to
 * the phone, so a wrong place can be traced to the step that chose it.
 */
import { randomUUID } from "node:crypto";
import { octoQuery } from "../../../api/_lib/octo";
import { exportTrace, type SpanSpec } from "../../lib/tracing";

const STUCK_MS = 45_000;
/** A tool's input or result in the trace is cut to this many characters. */
const DETAIL_CHARS = 4_000;

function clip(value: unknown): string {
  let text: string;
  try { text = typeof value === "string" ? value : JSON.stringify(value) ?? ""; } catch { text = String(value); }
  return text.length > DETAIL_CHARS ? `${text.slice(0, DETAIL_CHARS)}…` : text;
}

type RunOutcome = "done" | "error" | "stuck" | "aborted";
interface RunStep { name: string; ms: number; status: "done" | "error" | "running"; atMs?: number }
export interface RunRecord {
  id: string;
  startedAt: string;
  model: string;
  outcome: RunOutcome;
  firstStepMs: number | null;
  firstTextMs: number | null;
  totalMs: number;
  steps: RunStep[];
  notes: string[];
  inputTokens: number | null;
  outputTokens: number | null;
}

type Write = (r: RunRecord) => Promise<void>;

/** Upsert into core.agent_runs, dropping rows older than 30 days now and then. */
const writeRun: Write = async (r) => {
  if (!process.env.OCTO_API_KEY || !process.env.OCTO_WORKSPACE_ID) return;
  await octoQuery(
    `INSERT INTO core.agent_runs (id, started_at, model, outcome, first_step_ms, first_text_ms, total_ms, steps, notes, input_tokens, output_tokens)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11)
     ON CONFLICT (id) DO UPDATE SET model = EXCLUDED.model, outcome = EXCLUDED.outcome, first_step_ms = EXCLUDED.first_step_ms,
       first_text_ms = EXCLUDED.first_text_ms, total_ms = EXCLUDED.total_ms, steps = EXCLUDED.steps, notes = EXCLUDED.notes,
       input_tokens = EXCLUDED.input_tokens, output_tokens = EXCLUDED.output_tokens`,
    [r.id, r.startedAt, r.model, r.outcome, r.firstStepMs, r.firstTextMs, r.totalMs, JSON.stringify(r.steps), JSON.stringify(r.notes), r.inputTokens, r.outputTokens],
    { rowLimit: 1 },
  );
  if (Math.random() < 0.02) await octoQuery("DELETE FROM core.agent_runs WHERE started_at < now() - interval '30 days'", [], { rowLimit: 1 });
};

export class RunLog {
  readonly id = randomUUID();
  private readonly started: number;
  private firstStep: number | null = null;
  private firstText: number | null = null;
  private readonly open = new Map<string, { name: string; at: number; input: string }>();
  private readonly steps: RunStep[] = [];
  /** For the trace only: each finished step's input and result, in the order of `steps`. */
  private readonly details: Array<{ input: string; output: string }> = [];
  private readonly commands: Array<{ atMs: number; command: string }> = [];
  private readonly notes: string[] = [];
  private ended = false;
  private readonly stuckTimer: ReturnType<typeof setTimeout>;
  /** For the trace only: the conversation id, the question and the answer so far. */
  session: string | null = null;
  input = "";
  private output = "";

  constructor(
    private model: string,
    private readonly write: Write = writeRun,
    private readonly now: () => number = Date.now,
    private readonly log: (line: string) => void = console.log,
    stuckMs = STUCK_MS,
  ) {
    this.started = now();
    this.stuckTimer = setTimeout(() => this.emit("stuck", null), stuckMs);
    this.stuckTimer.unref?.();
  }

  stepStart(id: string, name: string, input?: unknown): void {
    const at = this.now();
    this.firstStep ??= at - this.started;
    this.open.set(id, { name, at, input: input === undefined ? "" : clip(input) });
  }

  /** `output` is the tool's result, or its error when `ok` is false. */
  stepEnd(id: string, ok: boolean, output?: unknown): void {
    const s = this.open.get(id);
    if (!s) return;
    this.open.delete(id);
    this.steps.push({ name: s.name, ms: this.now() - s.at, status: ok ? "done" : "error", atMs: s.at - this.started });
    this.details.push({ input: s.input, output: output === undefined ? "" : clip(output instanceof Error ? output.message : output) });
  }

  /** A map command sent to the phone (flyTo, showRoute, …). */
  command(command: unknown): void {
    this.commands.push({ atMs: this.now() - this.started, command: clip(command) });
  }

  text(chunk = ""): void {
    this.firstText ??= this.now() - this.started;
    this.output += chunk;
  }

  /** A model fallback or slow start; the message names models only. */
  note(message: string): void {
    this.notes.push(message.slice(0, 200));
  }

  usedModel(model: string): void {
    this.model = model;
  }

  finish(outcome: Exclude<RunOutcome, "stuck">, usage: { inputTokens: number; outputTokens: number } | null): void {
    if (this.ended) return;
    this.ended = true;
    clearTimeout(this.stuckTimer);
    this.emit(outcome, usage);
    this.trace(outcome, usage);
  }

  private trace(outcome: RunOutcome, usage: { inputTokens: number; outputTokens: number } | null): void {
    const r = this.record(outcome, usage);
    const end = this.started + r.totalMs;
    const tools: SpanSpec[] = r.steps.map((s, i) => {
      const start = this.started + (s.atMs ?? 0);
      const d = this.details[i];
      const io = d ? { "input.value": d.input, "input.mime_type": "application/json", "output.value": d.output, "output.mime_type": "application/json" } : {};
      return { name: s.name, kind: "TOOL", start, end: start + s.ms, error: s.status === "error", attributes: { "tool.name": s.name, ...io } };
    });
    const llm: SpanSpec[] = r.model === "none" ? [] : [{
      name: "model", kind: "LLM", start: this.started, end,
      attributes: { "llm.model_name": r.model, "llm.token_count.prompt": r.inputTokens ?? 0, "llm.token_count.completion": r.outputTokens ?? 0, "output.value": this.output },
    }];
    exportTrace({
      name: "agent turn", kind: "CHAIN", start: this.started, end, error: outcome !== "done", children: [...llm, ...tools],
      attributes: {
        "input.value": this.input, "output.value": this.output, outcome, "first_text_ms": r.firstTextMs ?? -1, notes: r.notes.join("; "),
        "map.commands": this.commands.map((c) => `+${c.atMs}ms ${c.command}`).join("\n"),
      },
    }, this.session);
  }

  record(outcome: RunOutcome, usage: { inputTokens: number; outputTokens: number } | null): RunRecord {
    const now = this.now();
    const running: RunStep[] = [...this.open.values()].map((s) => ({ name: s.name, ms: now - s.at, status: "running" }));
    return {
      id: this.id,
      startedAt: new Date(this.started).toISOString(),
      model: this.model,
      outcome,
      firstStepMs: this.firstStep,
      firstTextMs: this.firstText,
      totalMs: now - this.started,
      steps: [...this.steps, ...running],
      notes: [...this.notes],
      inputTokens: usage?.inputTokens ?? null,
      outputTokens: usage?.outputTokens ?? null,
    };
  }

  private emit(outcome: RunOutcome, usage: { inputTokens: number; outputTokens: number } | null): void {
    const r = this.record(outcome, usage);
    this.log(`[agent-run] ${JSON.stringify(r)}`);
    this.write(r).catch((e: unknown) => console.warn(`[agent-run] could not save run ${r.id}: ${e instanceof Error ? e.message.slice(0, 120) : "unknown"}`));
  }
}
