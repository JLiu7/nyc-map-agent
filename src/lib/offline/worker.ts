/**
 * Registers the offline service worker (public/sw.js) for every visit in production builds (#132):
 * below the street the signal drops, and a station seen once should work there without the server.
 * Vite's dev server is left alone (a worker must not pin its modules). Then the worker is handed the
 * JS/CSS this page already loaded, since those requests happened before it was in control.
 */
export function registerOfflineWorker(): void {
  if (!import.meta.env.PROD || typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  navigator.serviceWorker
    .register("/sw.js")
    .then(() => navigator.serviceWorker.ready)
    .then((reg) => {
      const urls = new Set<string>();
      for (const e of performance.getEntriesByType("resource")) urls.add(e.name);
      document.querySelectorAll<HTMLScriptElement>("script[src]").forEach((s) => urls.add(s.src));
      reg.active?.postMessage({ type: "warm", urls: [...urls] });
    })
    .catch(() => {
      /* no worker (private mode, unsupported): the page still keeps its own copies */
    });
}
