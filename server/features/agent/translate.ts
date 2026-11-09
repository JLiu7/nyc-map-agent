/**
 * POST /api/agent/translate {lang, lines}: a service notice's short steps in the rider's language
 * (owner, 2026-11-08: "explaining it live with voice, in user preffered language"). The agent's own
 * model translates our plain summary, not the MTA's paragraph; station, street and line names stay as
 * the map shows them. Answers are kept in memory, so a notice many riders open is translated once.
 */
import { generateText, type LanguageModel } from "ai";
import { clientIp } from "../../lib/clientIp";
import { APP_LANGS, LANG_LABELS, type AppLang } from "../../../src/lib/voice/langPref";
import { createLimiter } from "./fair-use";
import { pickProfile } from "./providers";

const MAX_LINES = 24;
const MAX_LINE = 400;
const limiter = createLimiter({ windowMax: 200, windowMs: 3_600_000, burstMax: 20, burstMs: 60_000 });
const cache = new Map<string, string[]>();
const CACHE_MAX = 300;

const json = (body: unknown, status: number) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

/** The instruction for one language. Pure, for tests. */
export function translatePrompt(lang: AppLang): string {
  return [
    `Translate each string in the JSON array into ${LANG_LABELS[lang]} (${lang}), for a subway rider in New York.`,
    "Keep station names, street names, subway line letters and numbers, and bus route names (M4, Bx32, T432) exactly as written.",
    "Keep it short and plain. Reply with only a JSON array of strings, the same length and order as the input.",
  ].join(" ");
}

/** The model's reply as exactly `n` strings, or null. Pure, for tests. */
export function parseLines(reply: string, n: number): string[] | null {
  const m = /\[[\s\S]*\]/.exec(reply);
  if (!m) return null;
  try {
    const out: unknown = JSON.parse(m[0]);
    return Array.isArray(out) && out.length === n && out.every((x) => typeof x === "string" && x.trim()) ? (out as string[]) : null;
  } catch {
    return null;
  }
}

export async function translate(req: Request, model?: () => LanguageModel): Promise<Response> {
  const body = (await req.json().catch(() => null)) as { lang?: unknown; lines?: unknown } | null;
  const lang = APP_LANGS.find((l) => l === body?.lang);
  const lines = body?.lines;
  if (!lang || lang === "en" || !Array.isArray(lines) || !lines.length || lines.length > MAX_LINES || !lines.every((l) => typeof l === "string" && l.length <= MAX_LINE)) {
    return json({ error: "lang must be one of the app's other languages; lines 1-24 strings of up to 400 characters" }, 400);
  }
  const key = `${lang}\u0000${lines.join("\u0000")}`;
  const hit = cache.get(key);
  if (hit) return json({ lines: hit }, 200);
  if (!limiter.take(clientIp(req.headers)).ok) return json({ error: "too many" }, 429);
  try {
    // Imported here so the route file stays light for tests that pass their own model.
    const m = model?.() ?? (await import("./routes")).defaultModel(undefined, undefined, pickProfile(undefined));
    const { text } = await generateText({ model: m, system: translatePrompt(lang), prompt: JSON.stringify(lines), maxOutputTokens: 2000, abortSignal: req.signal });
    const out = parseLines(text, lines.length);
    if (!out) return json({ error: "the model did not answer with the lines" }, 502);
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
    cache.set(key, out);
    return json({ lines: out }, 200);
  } catch (e) {
    console.warn(`translate: ${(e as Error).message}`);
    return json({ error: "translation failed" }, 502);
  }
}
