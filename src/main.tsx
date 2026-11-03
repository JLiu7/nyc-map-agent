import { removeShell } from "@/lib/shellDraft";
import { watchStaleBuild } from "@/lib/staleBuild";

watchStaleBuild();
// On the VPS the trip planner sleeps when idle (#44): wake it while the person looks at the map.
// One request per page load; the server sends at most one wake a minute, and an open tab sends nothing more.
void fetch(`${(import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "")}/api/v1/agent/warm`).catch(() => undefined);
// The real chat bar removes the static one from index.html; this covers the agent being off.
window.setTimeout(removeShell, 30_000);

// Let the static chat bar in index.html paint before the app's large script runs: run straight
// away, that script holds the screen blank for seconds on a slow phone. The app's files are
// already downloading (modulepreload in index.html), so this waits one frame, not a download.
// The timeout covers a background tab, where animation frames do not run.
let started = false;
const start = () => {
  if (started) return;
  started = true;
  void import("./boot");
};
requestAnimationFrame(() => window.setTimeout(start, 0));
window.setTimeout(start, 200);
