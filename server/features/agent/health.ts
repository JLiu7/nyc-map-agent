/**
 * The smart profile's health watcher (#35). Every few minutes it sends each provider one small
 * streaming request that should call a tool, and keeps whether it worked and how long it took.
 * The agent tries healthy providers first, so a dead or slow one costs riders nothing until it
 * recovers. Once a day it renews each vault working key, which otherwise lapses after 30 days.
 * State is in memory: one Node process serves the deployment.
 */
import { isWorkingKey, octoOrigin, routeFor, smartProviders, type Provider } from "./providers";

export interface Health {
  ok: boolean;
  /** Time to the tool call, in ms; null when the probe failed. */
  ms: number | null;
  checkedAt: number;
  /** Why the probe failed: an HTTP status or a short reason, never a key. */
  error: string | null;
}

const state = new Map<string, Health>();

export const healthOf = (id: string): Health | undefined => state.get(id);
export const recordHealth = (id: string, h: Health): void => { state.set(id, h); };
export const clearHealth = (): void => state.clear();

/** Healthy and never-probed providers first, in their own order; failing ones after, as a last resort. */
export function byHealth<T extends { id: string }>(providers: T[]): T[] {
  const failing = (p: T) => state.get(p.id)?.ok === false;
  return [...providers.filter((p) => !failing(p)), ...providers.filter(failing)];
}

/** What the menu shows: each provider's health, without keys or URLs. */
export function healthReport(providers: Provider[] = smartProviders()): Array<{ id: string; label: string; model: string } & Partial<Health>> {
  return providers.map((p) => ({ id: p.id, label: p.label, model: p.model, ...state.get(p.id) }));
}

const PROBE_TOOL = [{ type: "function", function: { name: "transit_plan", description: "Plan a transit trip", parameters: { type: "object", properties: { to: { type: "string" } }, required: ["to"] } } }];
const PROBE_MESSAGES = [
  { role: "system", content: "You help riders in New York City. Use tools to plan trips." },
  { role: "user", content: "How do I get to Times Square?" },
];

/** One probe: a streaming chat that should call transit_plan. Healthy only when the tool call arrives. */
export async function probe(p: Provider, f: typeof fetch = fetch, timeoutMs = 20_000, now: () => number = Date.now): Promise<Health> {
  const { url, headers } = routeFor(p, "/chat/completions");
  const started = now();
  const fail = (error: string): Health => ({ ok: false, ms: null, checkedAt: now(), error });
  try {
    const res = await f(url, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ model: p.model, messages: PROBE_MESSAGES, tools: PROBE_TOOL, max_tokens: 200, stream: true }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok || !res.body) return fail(`HTTP ${res.status}`);
    const text = await res.text();
    if (/"error"\s*:/.test(text) && !/"tool_calls"/.test(text)) return fail("error in stream");
    return /"tool_calls"[\s\S]*"transit_plan"/.test(text) ? { ok: true, ms: now() - started, checkedAt: now(), error: null } : fail("no tool call");
  } catch (e) {
    return fail(e instanceof Error && e.name === "TimeoutError" ? "timeout" : "unreachable");
  }
}

/** Renew one working key for another 30 days. Plain keys need nothing. */
export async function renew(p: Provider, f: typeof fetch = fetch): Promise<boolean> {
  if (!isWorkingKey(p.key)) return true;
  try {
    const res = await f(`${octoOrigin()}/api/vault/lease/renew`, {
      method: "POST",
      headers: { authorization: `Bearer ${p.key}`, "content-type": "application/json" },
      body: JSON.stringify({ expiresInDays: 30 }),
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

const PROBE_EVERY_MS = 5 * 60_000;
const RENEW_EVERY_MS = 24 * 3600_000;
let started = false;

/** Probe every provider now and then every five minutes; renew keys now and then daily. Starts once. */
export function startWatcher(log: (m: string) => void = console.warn): void {
  if (started || smartProviders().length === 0) return;
  started = true;
  const probeAll = async () => {
    for (const p of smartProviders()) {
      const before = state.get(p.id)?.ok;
      const h = await probe(p);
      state.set(p.id, h);
      if (before !== h.ok) log(`[agent] ${p.label} (${p.model}) is ${h.ok ? `healthy, ${h.ms} ms` : `failing: ${h.error}`}`);
    }
  };
  const renewAll = async () => {
    for (const p of smartProviders()) if (!(await renew(p))) log(`[agent] ${p.label} working key renewal failed`);
  };
  void probeAll();
  void renewAll();
  setInterval(() => void probeAll(), PROBE_EVERY_MS).unref();
  setInterval(() => void renewAll(), RENEW_EVERY_MS).unref();
}
