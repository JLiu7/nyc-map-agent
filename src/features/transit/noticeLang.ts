import { useEffect, useState } from "react";
import type { AppLang } from "@/lib/voice/langPref";
import { SESSION_ID } from "@/lib/sessionId";

const API_BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");
const done = new Map<string, string[]>();

/**
 * A notice's lines in the rider's language (#55), translated by the agent's model on the server.
 * English, or a failed call, keeps the lines as they are; `ready` turns true either way, so the
 * walk never waits on it for long.
 */
export function useNoticeLines(lines: string[], lang: AppLang): { lines: string[]; ready: boolean; failed: boolean } {
  const key = `${lang}\u0000${lines.join("\u0000")}`;
  const [state, setState] = useState<{ key: string; lines: string[]; failed: boolean } | null>(null);
  useEffect(() => {
    if (lang === "en" || !lines.length || done.has(key)) return;
    const ctl = new AbortController();
    // Long enough for a cold model, short enough that the rider still hears the notice soon.
    const timer = setTimeout(() => ctl.abort(), 8000);
    fetch(`${API_BASE}/api/agent/translate`, { method: "POST", headers: { "content-type": "application/json", "x-session-id": SESSION_ID }, body: JSON.stringify({ lang, lines }), signal: ctl.signal })
      .then((r) => (r.ok ? (r.json() as Promise<{ lines?: unknown }>) : Promise.reject(new Error(String(r.status)))))
      .then((b) => {
        if (!Array.isArray(b.lines) || b.lines.length !== lines.length) throw new Error("shape");
        done.set(key, b.lines as string[]);
        setState({ key, lines: b.lines as string[], failed: false });
      })
      .catch(() => setState({ key, lines, failed: true }))
      .finally(() => clearTimeout(timer));
    return () => { clearTimeout(timer); ctl.abort(); };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  if (lang === "en" || !lines.length) return { lines, ready: true, failed: false };
  const cached = done.get(key);
  if (cached) return { lines: cached, ready: true, failed: false };
  if (state?.key === key) return { lines: state.lines, ready: true, failed: state.failed };
  return { lines, ready: false, failed: false };
}
