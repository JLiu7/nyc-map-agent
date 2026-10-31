/**
 * Traces to Phoenix through Octo (Octo issues #268, #342). Each agent turn and each
 * server speech-to-text call becomes one trace in this workspace's Phoenix project;
 * the conversation id (x-session-id from the browser) groups them into a session.
 * Spans are built after the fact from RunLog's timings, so nothing here sits on the
 * request path. Off unless OCTO_API_KEY and OCTO_WORKSPACE_ID are set, or when
 * OCTO_TRACES=off. Text is masked (SSN, date of birth, email) before it leaves.
 */
import { context, trace, type Attributes, type Tracer } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BasicTracerProvider, BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";

const SSN = /\b\d{3}[- ]?\d{2}[- ]?\d{4}\b/g;
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
// A date with a full year (a birth date); trip times never carry one.
const DOB = /\b(?:\d{1,2}[/.-]\d{1,2}[/.-](?:19|20)\d{2}|(?:19|20)\d{2}-\d{1,2}-\d{1,2}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? \d{1,2},? (?:19|20)\d{2})\b/gi;

/** Pure, for tests. */
export function mask(text: string): string {
  return text.replace(EMAIL, "[email]").replace(DOB, "[dob]").replace(SSN, "[ssn]");
}

let tracer: Tracer | null | undefined;
function getTracer(): Tracer | null {
  if (tracer !== undefined) return tracer;
  const key = process.env.OCTO_API_KEY;
  const ws = process.env.OCTO_WORKSPACE_ID;
  if (!key || !ws || process.env.OCTO_TRACES === "off") return (tracer = null);
  const base = (process.env.OCTO_BASE_URL ?? "https://octodb.design-bakery.com").replace(/\/$/, "");
  const exporter = new OTLPTraceExporter({ url: `${base}/api/workspaces/${ws}/otel/v1/traces`, headers: { authorization: `Bearer ${key}` } });
  const provider = new BasicTracerProvider({
    resource: resourceFromAttributes({ "service.name": "nyc-map-agent" }),
    spanProcessors: [new BatchSpanProcessor(exporter)],
  });
  return (tracer = provider.getTracer("nyc-map-agent"));
}

export interface SpanSpec {
  name: string;
  kind: "CHAIN" | "LLM" | "TOOL" | "RETRIEVER";
  start: number;
  end: number;
  attributes?: Attributes;
  error?: boolean;
  children?: SpanSpec[];
}

/** One trace: a root span and its children, with explicit times (epoch ms). */
export function exportTrace(root: SpanSpec, session?: string | null): void {
  const t = getTracer();
  if (!t) return;
  const write = (spec: SpanSpec, parent?: ReturnType<Tracer["startSpan"]>) => {
    const ctx = parent ? trace.setSpan(context.active(), parent) : context.active();
    const attrs: Attributes = { "openinference.span.kind": spec.kind, ...spec.attributes };
    if (session) attrs["session.id"] = session;
    for (const [k, v] of Object.entries(attrs)) if (typeof v === "string") attrs[k] = mask(v);
    const span = t.startSpan(spec.name, { startTime: spec.start, attributes: attrs }, ctx);
    if (spec.error) span.setStatus({ code: 2 });
    for (const child of spec.children ?? []) write(child, span);
    span.end(spec.end);
  };
  try {
    write(root);
  } catch (e) {
    console.warn(`[trace] ${e instanceof Error ? e.message.slice(0, 120) : "failed"}`);
  }
}

/** The browser's conversation id, if it sent a sane one. */
export function sessionFrom(headers: Headers): string | null {
  const v = headers.get("x-session-id");
  return v && /^[\w-]{8,64}$/.test(v) ? v : null;
}
