/**
 * pnpm licenses:check — glue over `pnpm licenses list --json` (pnpm's own
 * resolver, so it sees the real pnpm tree). Fails on anything outside the
 * allowlist, e.g. GPL / AGPL / LGPL / SSPL / any -NC licence / unknown.
 * SPDX "A OR B" passes if any side is allowed; "A AND B" needs all.
 */
import { execFileSync } from "node:child_process";

const ALLOWED = new Set([
  "MIT", "ISC", "0BSD", "BSD-2-Clause", "BSD-3-Clause", "Apache-2.0", "Apache2", "Apache-2",
  "CC0-1.0", "Unlicense", "Zlib", "WTFPL", "BlueOak-1.0.0", "Python-2.0",
]);
/** Reviewed per-package exceptions: name -> reason. Keep this short. */
const EXCEPTIONS: Record<string, string> = {
  mapshaper: "MPL-2.0, dev-only CLI (scripts/load-areas.ts), file-level copyleft, unmodified",
  "@resvg/resvg-wasm": "MPL-2.0, transitive dev dependency, unmodified",
  "caniuse-lite": "CC-BY-4.0 browser-support data used by the build only",
  suncalc: "BSD-2-Clause per its LICENSE file; package.json has no license field",
  "axe-core": "MPL-2.0, dev-only via eslint-plugin-jsx-a11y, unmodified",
  "@react-three/rapier": "MIT per its repository (pmndrs/react-three-rapier); package.json has no license field",
  "gtfs-realtime-bindings": "Apache-2.0 (package.json spells it \"Apache 2.0\"), MTA's official GTFS-rt bindings",
};

function allowed(expr: string): boolean {
  const e = expr.replace(/[()]/g, " ").trim();
  if (/\s+OR\s+/i.test(e)) return e.split(/\s+OR\s+/i).some(allowed);
  if (/\s+AND\s+/i.test(e)) return e.split(/\s+AND\s+/i).every(allowed);
  return ALLOWED.has(e);
}

const out = execFileSync("pnpm", ["licenses", "list", "--json"], { encoding: "utf8", maxBuffer: 64 << 20 });
const byLicense = JSON.parse(out) as Record<string, Array<{ name: string; versions: string[] }>>;
const bad: string[] = [];
let n = 0;
for (const [license, pkgs] of Object.entries(byLicense)) {
  for (const p of pkgs) {
    n++;
    if (!allowed(license) && !EXCEPTIONS[p.name]) bad.push(`${p.name}@${p.versions.join(",")}: ${license}`);
  }
}
console.log(`${n} packages checked, ${Object.keys(EXCEPTIONS).length} reviewed exceptions`);
if (bad.length) {
  console.error(`Disallowed licences:\n  ${bad.join("\n  ")}`);
  process.exit(1);
}
