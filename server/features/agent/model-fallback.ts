/**
 * InferHub model fallback. The primary model comes from INFERHUB_MODEL (or
 * DEFAULT_MODEL); INFERHUB_MODEL_FALLBACKS is an optional comma-separated list
 * tried in order when a model is missing (4xx model_not_found), unpaid (402),
 * busy (429, or InferHub's "busy or rate-limited" message, retried first) or the provider fails (5xx). Implemented as a fetch wrapper so the AI SDK
 * provider keeps streaming as usual. Logs the provider error type only, never
 * the key or the request.
 */
export function modelChain(primary: string, fallbacks: string | undefined): string[] {
  const list = [primary, ...(fallbacks ?? "").split(",").map((s) => s.trim()).filter(Boolean)];
  return [...new Set(list)];
}

/** Provider error type from an OpenAI-style error body, e.g. "model_not_found". */
export async function errorType(res: Response): Promise<string> {
  try {
    const j = (await res.clone().json()) as { error?: { type?: unknown; code?: unknown } | string; type?: unknown; code?: unknown };
    const e = typeof j.error === "object" && j.error ? j.error : j;
    const t = (e as { code?: unknown }).code ?? (e as { type?: unknown }).type;
    return typeof t === "string" ? t.replace(/[^\w.-]/g, "").slice(0, 64) : "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * InferHub is a priced market: when every provider under the key's max price is
 * busy it answers with a message like "every provider within your price limit is
 * busy or rate-limited right now". It clears within seconds, so it is worth a retry.
 */
const BUSY = /busy|rate.?limit|price limit|overloaded|try again/i;

/** Short provider message from an error body, with anything key-shaped removed. Empty when there is none. */
export async function errorMessage(res: Response): Promise<string> {
  try {
    const j = (await res.clone().json()) as { error?: { message?: unknown } | string; message?: unknown };
    const m = typeof j.error === "string" ? j.error : typeof j.error === "object" && j.error ? j.error.message : j.message;
    return typeof m === "string" ? m.replace(/\b(sk|ih|Bearer)[-_ ]?[\w.-]{8,}/gi, "[redacted]").slice(0, 160) : "";
  } catch {
    return "";
  }
}

export const isBusy = (status: number, message: string): boolean => status === 429 || BUSY.test(message);

export function shouldFallBack(status: number, type: string): boolean {
  return status === 402 || status === 429 || status >= 500 || (status >= 400 && status < 500 && /model_not_found|model.not.found|invalid_model/i.test(type));
}

const BUSY_RETRIES = 2;
const BUSY_WAIT_MS = 600;
const PEEK_MS = 3000;

/**
 * A model that has not started its answer by now is probably queued behind a busy
 * provider (one answer took 18 s to start, owner report 2026-10-24); the next model
 * in the chain is tried instead. Never applied to the last model, which is waited for.
 */
const SLOW_START_MS = 6000;

/**
 * The model's hidden "thinking" before it answers. It roughly doubled the time to
 * the first step without better tool choices on our prompt, so it is off unless
 * INFERHUB_THINKING=on. Each provider family names the switch differently.
 */
export function withoutThinking(model: string, body: Record<string, unknown>, env = process.env.INFERHUB_THINKING): Record<string, unknown> {
  if (env === "on") return body;
  if (/deepseek/i.test(model)) return { ...body, thinking: { type: "disabled" } };
  if (/qwen/i.test(model)) return { ...body, enable_thinking: false };
  // LFM3 on llama.cpp: the chat template's switch. Thinking ran out the output budget before any answer.
  if (/lfm/i.test(model)) return { ...body, chat_template_kwargs: { enable_thinking: false } };
  return body;
}

/**
 * InferHub can answer HTTP 200 and then put the busy error inside the stream
 * ("data: {\"error\":...}"), so the status alone never shows it. Reads the first
 * chunk of a copy of the body: `message` is the error ("" when the stream starts
 * normally) and `slow` says no chunk came within `ms`. The caller's copy is untouched.
 */
export async function peekStream(res: Response, ms = PEEK_MS): Promise<{ message: string; slow: boolean }> {
  const reader = res.clone().body?.getReader();
  if (!reader) return { message: "", slow: false };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // A read still pending when the timer wins rejects once the request is aborted; never leave it unhandled.
    const read = reader.read().catch(() => ({ done: true as const, value: undefined }));
    const first = await Promise.race([read, new Promise<null>((r) => { timer = setTimeout(() => r(null), ms); })]);
    if (!first) return { message: "", slow: true };
    if (first.done || !first.value) return { message: "", slow: false };
    const head = new TextDecoder().decode(first.value);
    const m = /"error"\s*:\s*(?:\{[^}]*?"message"\s*:\s*"([^"]*)"|"([^"]*)")/.exec(head);
    const msg = m?.[1] ?? m?.[2] ?? "";
    return { message: msg.replace(/\b(sk|ih|Bearer)[-_ ]?[\w.-]{8,}/gi, "[redacted]").slice(0, 160), slow: false };
  } catch {
    return { message: "", slow: false };
  } finally {
    if (timer) clearTimeout(timer);
    reader.cancel().catch(() => undefined);
  }
}

/** The error message inside a 200 stream, or "". */
export async function streamError(res: Response): Promise<string> {
  return (await peekStream(res)).message;
}

/**
 * One step of the chain: a model on the caller's own URL (a plain model name), or a whole provider
 * with its own URL and headers (the smart profile, #35). `route` gets the path the SDK asked for.
 */
export interface Step { name: string; model: string; route?: (path: string) => { url: string; headers: Record<string, string> } }

const pathOf = (input: Parameters<typeof fetch>[0]): string => {
  const u = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  try { return new URL(u).pathname.replace(/^\/v\d+/, ""); } catch { return u; }
};

/** The caller's headers without its own key, which belongs to a different provider. */
const headersWithout = (h: HeadersInit | undefined): Record<string, string> => {
  const out: Record<string, string> = {};
  new Headers(h).forEach((v, k) => { if (k !== "authorization") out[k] = v; });
  return out;
};

export function fallbackFetch(chain: Array<string | Step>, base: typeof fetch = fetch, log: (m: string) => void = console.warn, wait: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)), slowMs = SLOW_START_MS, onUse: (model: string) => void = () => undefined): typeof fetch {
  const steps: Step[] = chain.map((s) => (typeof s === "string" ? { name: s, model: s } : s));
  const models = steps.map((s) => s.name);
  return async (input, init) => {
    const body = typeof init?.body === "string" ? init.body : null;
    let parsed: Record<string, unknown> | null = null;
    try { parsed = body ? (JSON.parse(body) as Record<string, unknown>) : null; } catch { parsed = null; }
    if (!parsed || typeof parsed.model !== "string") return base(input, init);
    const body0 = parsed;
    // One attempt: the response, and whether InferHub said "busy" (in the status, the body, or the
    // first stream chunk). With another model to try, a start slower than slowMs is abandoned.
    const attempt = async (step: Step, hasNext: boolean) => {
      const { model } = step;
      const started = Date.now();
      const ctrl = new AbortController();
      const signal = init?.signal ? AbortSignal.any([init.signal, ctrl.signal]) : ctrl.signal;
      const timer = hasNext ? setTimeout(() => ctrl.abort(), slowMs) : undefined;
      const to = step.route?.(pathOf(input));
      try {
        let res: Response;
        try {
          res = await base(to ? to.url : input, { ...init, ...(to ? { headers: { ...headersWithout(init?.headers), ...to.headers } } : {}), signal, body: JSON.stringify(withoutThinking(model, { ...body0, model })) });
        } catch (e) {
          if (ctrl.signal.aborted && !init?.signal?.aborted) return { res: new Response(null, { status: 504 }), msg: "slow", failed: true, busy: false, slow: true };
          throw e;
        }
        const peek = res.ok ? await peekStream(res, hasNext ? Math.max(0, slowMs - (Date.now() - started)) : PEEK_MS) : { message: await errorMessage(res), slow: false };
        // The start timer can fire before the peek's own timer; either way this model was too slow.
        if (hasNext && (peek.slow || (ctrl.signal.aborted && !init?.signal?.aborted))) {
          ctrl.abort();
          return { res, msg: "slow", failed: true, busy: false, slow: true };
        }
        const msg = peek.message;
        const failed = !res.ok || msg !== "";
        return { res, msg, failed, busy: failed && isBusy(res.ok ? 200 : res.status, msg), slow: false };
      } finally {
        if (timer) clearTimeout(timer);
      }
    };
    let last: Response | undefined;
    for (let i = 0; i < models.length; i++) {
      const hasNext = i < models.length - 1;
      let a = await attempt(steps[i], hasNext);
      // A busy market usually clears within a second or two: retry the same model before giving up on it.
      for (let r = 0; a.busy && r < BUSY_RETRIES; r++) {
        log(`[agent] model ${models[i]} busy: HTTP ${a.res.status} ${a.msg}; retrying`);
        await wait(BUSY_WAIT_MS * (r + 1));
        a = await attempt(steps[i], hasNext);
      }
      if (a.slow) {
        log(`[agent] model ${models[i]} slow to start (over ${slowMs} ms); trying ${models[i + 1]}`);
        continue;
      }
      if (!a.failed) {
        onUse(models[i]);
        return a.res;
      }
      last = a.res;
      const type = a.res.ok ? "stream_error" : await errorType(a.res);
      // A separate provider is worth trying after any failure: a refused key or a bad request at one says nothing about the next.
      const fallBack = a.busy || (!a.res.ok && (steps[i].route !== undefined || shouldFallBack(a.res.status, type))) || (a.res.ok && steps[i].route !== undefined);
      if (!fallBack || i === models.length - 1) return a.res;
      log(`[agent] model ${models[i]} failed: HTTP ${a.res.status} ${type}; trying ${models[i + 1]}`);
    }
    return last as Response;
  };
}
