/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type HtmlTagDescriptor, type Plugin, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import { assetManifest } from "./scripts/asset-manifest";

// `URL.pathname` is percent-encoded, so a project under a path with a space
// (e.g. "Application Support") would otherwise resolve to a missing directory.
const srcDir = decodeURIComponent(new URL("./src", import.meta.url).pathname);

/**
 * Dev only: serves the same Hono API (server/app.ts) that `pnpm start` runs,
 * inside the Vite dev server, so `pnpm dev` needs no second process. Set
 * API_PROXY_TARGET to proxy /api to another running instance instead.
 */
function devApi(env: Record<string, string>): Plugin {
  return {
    name: "dev-api",
    apply: "serve",
    configureServer(server: ViteDevServer) {
      for (const [k, v] of Object.entries(env)) if (k.startsWith("OCTO_") || k.startsWith("INFERHUB_") || k === "MTA_BUSTIME_KEY") process.env[k] ??= v;
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/api/")) return next();
        try {
          const { app } = (await server.ssrLoadModule("/server/app.ts")) as {
            app: { fetch: (r: Request) => Response | Promise<Response> };
          };
          const headers = new Headers();
          for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
          const chunks: Buffer[] = [];
          if (req.method !== "GET" && req.method !== "HEAD") for await (const c of req) chunks.push(c as Buffer);
          const response = await app.fetch(
            new Request(new URL(req.url, "http://localhost"), {
              method: req.method,
              headers,
              body: chunks.length ? Buffer.concat(chunks) : undefined,
            }),
          );
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          // Stream (the agent route is NDJSON); other routes are one chunk anyway.
          if (!response.body) return res.end();
          const reader = response.body.getReader();
          for (let r = await reader.read(); !r.done; r = await reader.read()) res.write(r.value);
          res.end();
        } catch (err) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: String(err) }));
        }
      });
    },
  };
}

/**
 * Build only: main.tsx loads the app (src/boot.tsx) after the first paint, so nothing in
 * index.html points at the app's files and they would not start downloading until then.
 * This adds a modulepreload for the app and every file it imports, and a preload for its
 * styles (crossorigin, like Vite's own stylesheet links, or the browser fetches them twice),
 * so they download alongside the page without holding up the first paint.
 */
function preloadBoot(): Plugin {
  return {
    name: "preload-boot",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler(_html, ctx) {
        const bundle = ctx.bundle;
        if (!bundle) return;
        const boot = Object.values(bundle).find((c) => c.type === "chunk" && c.moduleIds.some((id) => id.endsWith("/src/boot.tsx")));
        if (!boot || boot.type !== "chunk") return;
        const scripts = new Set<string>();
        const styles = new Set<string>();
        const visit = (file: string) => {
          const chunk = bundle[file];
          if (!chunk || chunk.type !== "chunk" || chunk.isEntry || scripts.has(file)) return;
          scripts.add(file);
          chunk.viteMetadata?.importedCss.forEach((css) => styles.add(css));
          chunk.imports.forEach(visit);
        };
        visit(boot.fileName);
        const tags: HtmlTagDescriptor[] = [];
        for (const css of styles) tags.push({ tag: "link", attrs: { rel: "preload", as: "style", crossorigin: true, href: `/${css}` }, injectTo: "head" });
        for (const js of scripts) tags.push({ tag: "link", attrs: { rel: "modulepreload", crossorigin: true, href: `/${js}` }, injectTo: "head" });
        return tags;
      },
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const proxyTarget = env.API_PROXY_TARGET;
  return {
    plugins: [react(), assetManifest(), preloadBoot(), ...(proxyTarget ? [] : [devApi(env)])],
    // `MAPILLARY_` is exposed so a plain `MAPILLARY_TOKEN` (the name Mapillary's
    // own docs use) works as well as `VITE_MAPILLARY_TOKEN`. Mapillary client
    // tokens are browser tokens by design. Server secrets such as
    // INFERHUB_API_KEY and OCTO_API_KEY match neither prefix and stay out of the bundle.
    envPrefix: ["VITE_", "MAPILLARY_"],
    resolve: {
      alias: [{ find: /^@\//, replacement: `${srcDir}/` }],
    },
    worker: {
      format: "es",
    },
    build: {
      rollupOptions: {
        output: {
          // The map library is half the first download and changes far less often than the app,
          // so it gets its own file that phones keep cached across our deploys.
          // The sign reader gets its own name: left alone it is emitted as index-*.js and counted against the app entry's size limit.
          manualChunks: (id) => (id.includes("/node_modules/maplibre-gl/") ? "maplibre" : /\/node_modules\/(tesseract\.js|regenerator-runtime|is-url|node-fetch|bmp-js|idb-keyval|wasm-feature-detect|zlibjs)\//.test(id) ? "signReader" : undefined),
        },
      },
    },
    server: {
      host: true,
      proxy: proxyTarget ? { "/api": { target: proxyTarget, changeOrigin: true } } : undefined,
    },
    // Route tests share one client address; the live 5-second cooldown would refuse their back-to-back questions.
    // Tests that check the limits build their own limiter.
    test: { env: { AGENT_RATE_BURST_MAX: "0" } },
  };
});
