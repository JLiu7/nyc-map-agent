import type { AppLang } from "@/lib/voice/langPref";

const API_BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");
/** The server takes this many lines a call. */
const BATCH = 24;
const MAX_LINE = 400;
const done = new Map<string, string>();

/**
 * Short lines in the rider's language, by the agent's model on the server (POST /api/agent/translate,
 * which keeps station, street and line names as written). Returns each line's translation by its
 * English text; a line that could not be translated is left out, so the caller shows it as it is.
 * English asks nothing. Answers are remembered for the page's life.
 */
export async function translateLines(lines: string[], lang: AppLang, signal?: AbortSignal): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (lang === "en") return out;
  const want = [...new Set(lines.map((l) => l.trim()).filter((l) => l && l.length <= MAX_LINE))];
  const ask: string[] = [];
  for (const l of want) {
    const hit = done.get(`${lang}\u0000${l}`);
    if (hit) out.set(l, hit);
    else ask.push(l);
  }
  for (let i = 0; i < ask.length; i += BATCH) {
    const batch = ask.slice(i, i + BATCH);
    try {
      // x-keep: the offline worker (public/sw.js) keeps the answer, so a trip replayed underground still reads in the rider's language (#132).
      const r = await fetch(`${API_BASE}/api/agent/translate`, { method: "POST", headers: { "content-type": "application/json", "x-keep": "1" }, body: JSON.stringify({ lang, lines: batch }), signal });
      if (!r.ok) continue;
      const b = (await r.json()) as { lines?: unknown };
      if (!Array.isArray(b.lines) || b.lines.length !== batch.length) continue;
      batch.forEach((l, k) => {
        const t = (b.lines as unknown[])[k];
        if (typeof t !== "string" || !t.trim()) return;
        done.set(`${lang}\u0000${l}`, t);
        out.set(l, t);
      });
    } catch {
      // Offline, slow or cut short: those lines stay in English.
    }
  }
  return out;
}
