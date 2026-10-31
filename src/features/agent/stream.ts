import { gapLeft, markAsked, QUESTION_GAP_MS, RETRY_WITHIN_S, waitFor } from "./askSpacing";
import { streamEvent, type AgentRequest, type StreamEvent } from "./schema";
import { SESSION_ID } from "../../lib/sessionId";

/** Parse an NDJSON body into validated events; bad lines are dropped. */
export async function* readEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<StreamEvent> {
  const reader = body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (value) buf += value;
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      try {
        const ev = streamEvent.safeParse(JSON.parse(line));
        if (ev.success) yield ev.data;
      } catch {
        /* partial or junk line */
      }
    }
    if (done) return;
  }
}

/** Plain words for a failed request; the raw status stays out of the UI. */
export function friendlyError(status: number): string {
  if (status === 400) return "Sorry, I couldn't understand that request. Try rephrasing it.";
  if (status === 429) return "I'm getting a lot of questions right now. Try again in a moment.";
  return "The assistant is unavailable right now. Try again in a moment.";
}

/**
 * Asks the agent. A question asked within the server's gap is held until the gap ends, and a
 * short fair-use refusal is waited out and retried, so the person never sees "one moment between
 * questions". onWait(true) while held, onWait(false) once it goes. Aborting the signal (a newer
 * question) ends the wait and the answer.
 */
export async function* askAgent(req: AgentRequest, signal?: AbortSignal, onWait?: (waiting: boolean) => void): AsyncGenerator<StreamEvent> {
  const base = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");
  let res: Response | null = null;
  for (let tries = 0; ; tries++) {
    const left = gapLeft(Date.now());
    if (left > 0) {
      onWait?.(true);
      if (!(await waitFor(left, signal))) return;
    }
    onWait?.(false);
    markAsked();
    res = await fetch(`${base}/api/agent`, { method: "POST", headers: { "content-type": "application/json", "x-session-id": SESSION_ID }, body: JSON.stringify(req), signal });
    if (res.status !== 429 || tries >= 2) break;
    const j = (await res.clone().json().catch(() => null)) as { retryAfterSeconds?: unknown } | null;
    const after = typeof j?.retryAfterSeconds === "number" ? j.retryAfterSeconds : Number(res.headers.get("retry-after"));
    if (!Number.isFinite(after) || after > RETRY_WITHIN_S) break;
    // Another tab or device on the same address asked just now: wait the server's own time out.
    markAsked(Date.now() + Math.max(1, after) * 1000 - QUESTION_GAP_MS);
  }
  if (!res.ok || !res.body) {
    // A long fair-use 429 carries its own wording (when the next question frees up); show that when present.
    let message = friendlyError(res.status);
    if (res.status === 429) {
      const j = (await res.json().catch(() => null)) as { message?: unknown } | null;
      if (typeof j?.message === "string" && j.message) message = j.message;
    }
    yield { type: "error", message };
    return;
  }
  yield* readEvents(res.body);
}
