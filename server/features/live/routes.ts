import { CODE, createSessions } from "./sessions";

const sessions = createSessions();
const json = (body: unknown, status: number) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const MAX_BODY = 200_000;

/** POST /api/live/:code/state: the phone's newest state, as JSON. */
export function postState(code: string, body: unknown, bytes: number): Response {
  if (!CODE.test(code)) return json({ error: "bad_code" }, 400);
  if (bytes > MAX_BODY || !body || typeof body !== "object" || Array.isArray(body)) return json({ error: "bad_state" }, 400);
  if (!sessions.post(code, body as Record<string, unknown>)) return json({ error: "full" }, 503);
  return json({ ok: true }, 200);
}

/** GET /api/live/:code/watch: the state now, then every change, as server-sent events. */
export function watch(code: string, signal: AbortSignal): Response {
  if (!CODE.test(code)) return json({ error: "bad_code" }, 400);
  const enc = new TextEncoder();
  let stop: (() => void) | null = null;
  let beat: ReturnType<typeof setInterval> | null = null;
  let refused: "full" | "busy" | null = null;
  const stream = new ReadableStream<Uint8Array>({
    start(ctrl) {
      const send = (line: string) => { try { ctrl.enqueue(enc.encode(line)); } catch { /* the watcher has gone */ } };
      const r = sessions.watch(code, send);
      if (typeof r === "string") { refused = r; ctrl.close(); return; }
      stop = r;
      // A comment every 15 s keeps proxies from closing a quiet stream.
      beat = setInterval(() => send(": keep\n\n"), 15_000);
      const end = () => { if (beat) clearInterval(beat); stop?.(); try { ctrl.close(); } catch { /* closed already */ } };
      signal.addEventListener("abort", end, { once: true });
    },
    cancel() { if (beat) clearInterval(beat); stop?.(); },
  });
  if (refused) return json({ error: refused }, refused === "full" ? 503 : 429);
  return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", "x-accel-buffering": "no" } });
}
