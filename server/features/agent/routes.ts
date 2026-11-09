/**
 * POST /api/agent — the smart-mode agent. InferHub (OpenAI-compatible) through
 * the AI SDK as a library: tool calling + streaming. Streams NDJSON
 * StreamEvent lines (src/features/agent/schema.ts). INFERHUB_API_KEY is read
 * here only and never sent to the client.
 */
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { stepCountIs, streamText, type LanguageModel } from "ai";
import { requestBody, type StreamEvent } from "../../../src/features/agent/schema";
import { resolveFlags } from "../../../src/lib/flags/registry";
import { isShortReply, makeTools, type ToolContext } from "./tools";
import { toNyLocal } from "./trip";
import { fallbackFetch, modelChain } from "./model-fallback";
import { pickProfile, routeFor, smartProviders, type Profile } from "./providers";
import { byHealth, healthReport, startWatcher } from "./health";
import { clientIp } from "../../lib/clientIp";
import { answerWithoutModel, fastIntent } from "./noModel";
import { budgetConfigFromEnv, createDailyBudget, createLimiter, limitConfigFromEnv, limitedResponse, noModelMessage } from "./fair-use";
import { ActionCollector } from "./mapActions";
import { contextLine, requestFacts, stablePrompt } from "./prompt";
import { AnswerAudit } from "./audit";
import { RunLog } from "./runLog";
import { sessionFrom } from "../../lib/tracing";
import { mayReadBack, planReadBack } from "./readback";
import { askIn, CloseHold, isQuestion, questionsAnswered, riderLanguage, say, sayPrompt, type Lang, type Line } from "./ask";
import { openDataEntrances, type Station } from "./transit";
import { OTP_CONTAINER, VALHALLA_CONTAINER, waker } from "./sablier";

export const INFERHUB_BASE_URL = process.env.INFERHUB_BASE_URL ?? "https://api.inferhub.dev/v1";
/** Cheap, fast, good at tool calls: ~$0.075 in / $0.30 out per M tokens (InferHub market max ask). */
export const DEFAULT_MODEL = "cb/deepseek-v4.1-flash";

// The prompt lives in prompt.ts; re-exported for existing importers.
export { contextLine, systemPrompt } from "./prompt";

export function defaultModel(only?: string, run?: RunLog, profile: Profile = "dev"): LanguageModel {
  const log = (m: string) => { console.warn(m); run?.note(m); };
  // Smart (#35): the hosted providers, healthy ones first; each call goes to that provider's own URL.
  const smart = !only && profile === "smart" ? byHealth(smartProviders()) : [];
  if (smart.length) {
    startWatcher();
    const steps = smart.map((p) => ({ name: `${p.id}:${p.model}`, model: p.model, route: (path: string) => routeFor(p, path) }));
    return createOpenAICompatible({ name: "smart", baseURL: "http://smart.invalid/v1", apiKey: "per-provider", fetch: fallbackFetch(steps, fetch, log, undefined, undefined, (m) => run?.usedModel(m)) })(steps[0].model);
  }
  const key = process.env.INFERHUB_API_KEY;
  if (!key) throw new Error("INFERHUB_API_KEY is not set on the server.");
  // Over the daily cap only the configured cheap model is tried, with no fallbacks to pricier ones.
  const models = only ? [only] : modelChain(process.env.INFERHUB_MODEL ?? DEFAULT_MODEL, process.env.INFERHUB_MODEL_FALLBACKS);
  return createOpenAICompatible({ name: "inferhub", baseURL: INFERHUB_BASE_URL, apiKey: key, fetch: fallbackFetch(models, fetch, log, undefined, undefined, (m) => run?.usedModel(m)) })(models[0]);
}

/** GET /api/agent/health (#35): the default profile and each smart provider's last probe. No keys or URLs. */
export const health = {
  GET: (): Promise<Response> => {
    startWatcher();
    return Promise.resolve(Response.json({ profile: pickProfile(undefined), smart: healthReport() }, { headers: { "cache-control": "no-store" } }));
  },
};

/** GET /api/agent/warm (#44): sent once when the page opens, so the trip planner is up before the first question. */
export const warm = {
  GET: (): Promise<Response> => {
    waker.poke([OTP_CONTAINER, VALHALLA_CONTAINER]);
    return Promise.resolve(Response.json({ ok: true }, { headers: { "cache-control": "no-store" } }));
  },
};

/** The request's facts as a system message right before the latest user message. */
function withFacts<M extends { role: string }>(messages: M[], facts: string): (M | { role: "system"; content: string })[] {
  const i = messages.map((m) => m.role).lastIndexOf("user");
  return i < 0 ? [...messages, { role: "system", content: facts }] : [...messages.slice(0, i), { role: "system", content: facts }, ...messages.slice(i)];
}

export type FairUse = { limiter: ReturnType<typeof createLimiter>; budget: ReturnType<typeof createDailyBudget>; now: () => number };

/** In-memory, per process (see fair-use.ts): one Node process serves the deployment. Created on first use so env is read at runtime. */
let shared: FairUse | undefined;
const sharedFairUse = (): FairUse =>
  (shared ??= { limiter: createLimiter(limitConfigFromEnv()), budget: createDailyBudget(budgetConfigFromEnv()), now: Date.now });

export async function POST(request: Request, opts: { model?: LanguageModel; deps?: ToolContext["deps"]; fairUse?: FairUse } = {}): Promise<Response> {
  const parsed = requestBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });
  // Only well-formed questions count. The client sends no device id, so the key is the address alone.
  const fair = opts.fairUse ?? sharedFairUse();
  const limit = fair.limiter.take(`ip:${clientIp(request.headers)}`);
  if (!limit.ok) return limitedResponse(limit.retryAt, limit.reason, fair.now());
  // A question often leads to a trip or a walk: start them while the model thinks (#44).
  waker.poke([OTP_CONTAINER, VALHALLA_CONTAINER]);
  const budget = fair.budget.tier();
  const { now, mode, context, lang, memory, underground, heard } = parsed.data;
  const profile = pickProfile(parsed.data.profile);
  const smartFirst = profile === "smart" ? byHealth(smartProviders())[0] : undefined;
  let messages = parsed.data.messages;
  // In street view, "here" is the spot on screen (the prompt says so); otherwise the shared location.
  const location = context ? { lon: context.lon, lat: context.lat } : parsed.data.location ?? null;
  const enc = new TextEncoder();
  const modelId = budget.tier === "cheap" ? budget.model : budget.tier === "none" ? "none" : smartFirst ? `${smartFirst.id}:${smartFirst.model}` : (process.env.INFERHUB_MODEL ?? DEFAULT_MODEL);
  // The asker's clock resolves "tomorrow"; a missing or broken one falls back to the server's.
  const asked = now ? new Date(now) : null;
  const clock = asked && Number.isFinite(asked.getTime()) ? asked : new Date();

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: StreamEvent) => controller.enqueue(enc.encode(`${JSON.stringify(e)}\n`));
      // Timings for this request: one log line and one core.agent_runs row (no question text).
      const run = new RunLog(modelId);
      run.session = sessionFrom(request.headers);
      let finished = false;
      // A place several stations share, or one speech-to-text was unsure of, is read back first (readback.ts).
      if (mayReadBack(messages)) {
        const stations = await (opts.deps?.entrances ?? openDataEntrances).stations().catch(() => [] as Station[]);
        const rb = planReadBack(messages, stations, heard);
        if (rb?.kind === "rewrite") messages = [...messages.slice(0, -1), { role: "user", content: rb.question }];
        else if (rb) {
          run.input = messages.at(-1)?.content ?? "";
          run.text(rb.text);
          send({ type: "text", text: rb.text });
          run.finish("done", { inputTokens: 0, outputTokens: 0 });
          send({ type: "done", model: "none", usage: { inputTokens: 0, outputTokens: 0 } });
          controller.close();
          return;
        }
      }
      // Buttons under the answer, from the tool results (#371); one "actions" line before "done".
      const actions = new ActionCollector();
      let answerText = "";
      const flushActions = () => {
        const list = actions.list(answerText);
        if (list.length) send({ type: "actions", actions: list });
      };
      // The app's own sentence (ask.ts): a question before planning, or a planned trip's follow-up,
      // in the language the model named. It is said by code, after the model's text.
      const closing: { line: Line | null; lang: Lang | null } = { line: null, lang: null };
      const clearLine = () => { closing.line = null; };
      const hold = new CloseHold();
      const nowLocal = toNyLocal(clock);
      // Data sources and their age, plus the "no guessing" check (#375); one "sources" line before "done".
      const audit = new AnswerAudit([nowLocal, contextLine(context) ?? "", ...messages.filter((m) => m.role === "user").map((m) => m.content)]);
      const tools = makeTools({ location, now: clock, emit: (command) => { run.command(command); send({ type: "command", command }); }, actions: (a) => actions.add(a), sources: audit.ledger, deps: opts.deps, followedTrain: context?.followedTrain ?? null, replying: isShortReply(messages), answered: questionsAnswered(messages), say: (line, language) => { closing.line = line; closing.lang = riderLanguage(lastAsked, language); }, drive: resolveFlags({ env: process.env.VITE_FLAGS, advancedMode: false }).agentDrive });
      // Restrooms and line status still get a real answer with no model (#199).
      const lastAsked = messages.filter((m) => m.role === "user").at(-1)?.content ?? "";
      run.input = lastAsked;
      const answerAlone = async (fast = false): Promise<boolean> => {
        clearLine();
        const q = { text: lastAsked, hasLocation: location !== null, now: clock };
        const text = await answerWithoutModel(q, tools, fast ? fastIntent(lastAsked) : undefined);
        if (!text) return false;
        // The fast path speaks English only, so its follow-up needs no translating.
        answerText = closing.line && !isQuestion(closing.line) ? `${text} ${say(closing.line, "en")}` : text;
        run.text(answerText);
        audit.text(answerText);
        send({ type: "text", text: answerText });
        flushActions();
        return true;
      };
      // A plain restroom or line question is answered from the app's own feeds first: instant, and
      // no model to be slow or fail. Anything the matcher is unsure of still goes to the model.
      // Trips follow the mode chip; only the transit one is planned here.
      const fast = fastIntent(lastAsked);
      if (budget.tier !== "none" && fast && (fast.kind !== "trip" || parsed.data.mode === "transit") && (await answerAlone(true).catch(() => false))) {
        const sources = audit.event();
        if (sources) send(sources);
        run.finish("done", { inputTokens: 0, outputTokens: 0 });
        send({ type: "done", model: "none", usage: { inputTokens: 0, outputTokens: 0 } });
        controller.close();
        return;
      }
      if (budget.tier === "none") {
        // Daily budget spent: answer without a model call so the chat still says something useful.
        if (!(await answerAlone())) send({ type: "text", text: noModelMessage(budget.resetAt) });
        run.finish("done", { inputTokens: 0, outputTokens: 0 });
        send({ type: "done", model: modelId, usage: { inputTokens: 0, outputTokens: 0 } });
        controller.close();
        return;
      }
      try {
        const model = opts.model ?? defaultModel(budget.tier === "cheap" ? budget.model : undefined, run, profile);
        const result = streamText({
          model,
          // Rules first and identical every time, facts just before the latest question, so the cached
          // prefix (rules, tools, earlier turns) is reused; see requestFacts.
          system: stablePrompt(),
          messages: withFacts(messages, requestFacts(nowLocal, location, mode, context, lang, memory, underground)),
          allowSystemInMessages: true,
          tools,
          // A question the app can say itself ends the model's turn right after the tool asks for it.
          stopWhen: [stepCountIs(8), () => !!closing.line && isQuestion(closing.line) && closing.lang !== null],
          // A trip tool that needs one more detail (ask.ts): the next step only writes that question, with no tool to plan on a guess.
          // In another language the model words it, in a step with no tools and only that question to say.
          prepareStep: ({ steps }) => {
            const ask = askIn(steps.at(-1)?.toolResults ?? []);
            return ask ? { toolChoice: "none" as const, activeTools: [], system: sayPrompt(ask.question, lang), messages } : {};
          },
          // Spoken answers are 1-4 sentences; this bounds a runaway reply's cost (#199).
          maxOutputTokens: 800,
          maxRetries: 1,
          // The default handler console.logs the raw provider error; keep logs to the request id only.
          onError: ({ error }) => {
            const e = error as { responseHeaders?: Record<string, string>; statusCode?: number; message?: string };
            const id = e.responseHeaders?.["x-inferhub-request-id"];
            // Status and the provider's own message say why (busy market, price limit, bad model); the key and request never appear in either.
            const why = [e.statusCode ? `HTTP ${e.statusCode}` : null, typeof e.message === "string" ? e.message.replace(/\b(sk|ih|Bearer)[-_ ]?[\w.-]{8,}/gi, "[redacted]").slice(0, 160) : null].filter(Boolean).join(" ");
            console.warn(`[agent] model call failed${why ? `: ${why}` : ""}${id ? ` (x-inferhub-request-id ${id})` : ""}`);
          },
        });
        for await (const part of result.fullStream) {
          if (part.type === "text-delta") {
            const text = hold.push(part.text);
            run.text(text); audit.text(text); answerText += text;
            if (text) send({ type: "text", text });
          }
          else if (part.type === "tool-call") {
            // "tool" stays for older clients; "step" pairs a start with its end (#370).
            send({ type: "tool", name: part.toolName });
            send({ type: "step", id: part.toolCallId.slice(0, 100), name: part.toolName, status: "start" });
            run.stepStart(part.toolCallId, part.toolName, part.input);
          } else if (part.type === "tool-result") {
            audit.toolResult(part.toolName, part.output);
            send({ type: "step", id: part.toolCallId.slice(0, 100), name: part.toolName, status: "done" });
            run.stepEnd(part.toolCallId, true, part.output);
          } else if (part.type === "tool-error") { run.stepEnd(part.toolCallId, false, part.error); send({ type: "step", id: part.toolCallId.slice(0, 100), name: part.toolName, status: "error" }); }
          else if (part.type === "error") {
            const left = hold.rest(false);
            if (left) { answerText += left; send({ type: "text", text: left }); }
            run.finish("error", null);
            finished = true;
            if (answerText || !(await answerAlone())) send({ type: "error", message: "I couldn't answer just now. Please try again in a moment." });
            else send({ type: "done", model: "none", usage: { inputTokens: 0, outputTokens: 0 } });
          }
          else if (part.type === "finish") {
            fair.budget.record((part.totalUsage.inputTokens ?? 0) + (part.totalUsage.outputTokens ?? 0));
            // The model's own "Want to start?" gives way to the app's one follow-up offer, and goes
            // when no trip set one: a line status or restroom answer has no trip to start (#629).
            const line = closing.line;
            // A question the model already worded (a language without phrases) is not said twice.
            const asking = !!line && isQuestion(line) && closing.lang !== null;
            const following = !!line && !isQuestion(line) && !!answerText;
            const own = hold.rest(following || line === null).trimEnd();
            const ours = line && (asking || following) ? (say(line, closing.lang) ?? (following ? say(line, "en") : null)) : null;
            const close = `${own}${ours ? `${answerText || own ? " " : ""}${ours}` : ""}`;
            if (close) { run.text(close); audit.text(close); answerText += close; send({ type: "text", text: close }); }
            flushActions();
            const sources = audit.event();
            if (sources) send(sources);
            const usage = { inputTokens: part.totalUsage.inputTokens ?? 0, outputTokens: part.totalUsage.outputTokens ?? 0 };
            run.finish("done", usage);
            finished = true;
            send({ type: "done", model: modelId, usage });
          }
        }
      } catch (err) {
        run.finish("error", null);
        finished = true;
        // Never echo provider errors verbatim: they can include request headers.
        if (!answerText && (await answerAlone().catch(() => false))) send({ type: "done", model: "none", usage: { inputTokens: 0, outputTokens: 0 } });
        else send({ type: "error", message: err instanceof Error && /INFERHUB_API_KEY/.test(err.message) ? err.message : "The assistant is unavailable right now." });
      } finally {
        // The stream ended with no finish part: the person left or the provider hung up.
        if (!finished) run.finish("aborted", null);
        controller.close();
      }
    },
  });
  return new Response(body, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}
