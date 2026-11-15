/**
 * The live "follow a phone" demo (#186): a phone posts where it thinks it is, by steps and compass, under a
 * short code, and any screen that knows the code watches it. Everything is in memory: nothing is written to
 * disk, and a code is forgotten half an hour after the phone last posted.
 */
export const CODE = /^[A-HJ-NP-Z2-9]{4,8}$/;
const MAX_SESSIONS = 300;
const MAX_WATCHERS = 20;
const IDLE_MS = 30 * 60_000;

type Send = (line: string) => void;
interface Session { state: Record<string, unknown> | null; at: number; watchers: Set<Send> }

export function createSessions(now: () => number = Date.now) {
  const sessions = new Map<string, Session>();

  const sweep = () => {
    const t = now();
    for (const [code, s] of sessions) if (t - s.at > IDLE_MS && s.watchers.size === 0) sessions.delete(code);
  };
  /** The code's session, made if there is room for one more. */
  const open = (code: string): Session | null => {
    const had = sessions.get(code);
    if (had) return had;
    sweep();
    if (sessions.size >= MAX_SESSIONS) return null;
    const made: Session = { state: null, at: now(), watchers: new Set() };
    sessions.set(code, made);
    return made;
  };

  return {
    /** Keep the phone's newest state and hand it to everyone watching. False when the server is full. */
    post(code: string, state: Record<string, unknown>): boolean {
      const s = open(code);
      if (!s) return false;
      s.at = now();
      s.state = { ...state, at: s.at };
      const line = `data: ${JSON.stringify(s.state)}\n\n`;
      for (const send of s.watchers) send(line);
      return true;
    },
    /** Start watching a code. Returns the way to stop, or why not. */
    watch(code: string, send: Send): (() => void) | "full" | "busy" {
      const s = open(code);
      if (!s) return "full";
      if (s.watchers.size >= MAX_WATCHERS) return "busy";
      // A state older than the idle limit is a walk that ended: a new watcher starts clean.
      if (s.state && now() - s.at > IDLE_MS) s.state = null;
      if (s.state) send(`data: ${JSON.stringify(s.state)}\n\n`);
      s.watchers.add(send);
      return () => { s.watchers.delete(send); };
    },
    size: () => sessions.size,
  };
}
