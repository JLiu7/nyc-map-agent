/**
 * Wakes the trip planner and the walking-route server on the VPS (#44). The VPS's one Sablier
 * (server-management komodo/resources/platform.toml) stops nyc-map-otp and nyc-map-valhalla
 * after 10 idle minutes. Every call here starts them if they sleep and restarts that clock, so
 * only page opens, questions and searches keep them up; health checks never come through here.
 * Without SABLIER_URL (local dev, tests, e2e) nothing is called and searches go straight out.
 */

export const OTP_CONTAINER = "nyc-map-otp";
export const VALHALLA_CONTAINER = "nyc-map-valhalla";

/** At most one start-without-waiting per minute, however many pages open or questions come in. */
const POKE_EVERY_MS = 60_000;
/** A container seen ready this recently is still up: its idle clock runs for 10 minutes. */
const READY_FOR_MS = 30_000;

type Deps = { url?: string; fetch?: typeof fetch; now?: () => number };

export function createWaker({ url = process.env.SABLIER_URL ?? "", fetch: get = fetch, now = Date.now }: Deps = {}) {
  const base = url.replace(/\/$/, "");
  const query = (names: string[], extra = "") => names.map((n) => `names=${encodeURIComponent(n)}`).join("&") + extra;
  let poked = -Infinity;
  const seen = new Map<string, number>();
  const waiting = new Map<string, Promise<boolean>>();

  return {
    /** Starts them without waiting (page open, start of a question). Never throws. */
    poke(names: string[]): void {
      if (!base || now() - poked < POKE_EVERY_MS) return;
      poked = now();
      void get(`${base}/api/strategies/poke?${query(names)}`, { signal: AbortSignal.timeout(5000) }).catch(() => undefined);
    },

    /**
     * Starts one if it sleeps and waits until its health check passes, up to timeoutS. True when it
     * is ready or there is no Sablier to ask; false when it did not get ready, and the caller's
     * own fallback answers (built-in router for trips, public OSRM for walks).
     */
    ready(name: string, timeoutS: number): Promise<boolean> {
      if (!base) return Promise.resolve(true);
      if (now() - (seen.get(name) ?? -Infinity) < READY_FOR_MS) return Promise.resolve(true);
      const pending = waiting.get(name);
      if (pending) return pending;
      const p = get(`${base}/api/strategies/blocking?${query([name], `&timeout=${timeoutS}s`)}`, { signal: AbortSignal.timeout((timeoutS + 5) * 1000) })
        .then((res) => {
          if (res.ok) seen.set(name, now());
          return res.ok;
        })
        .catch(() => false)
        .finally(() => waiting.delete(name));
      waiting.set(name, p);
      return p;
    },
  };
}

export const waker = createWaker();
