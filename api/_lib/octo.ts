/**
 * Minimal client for Octo's workspace SQL endpoint
 * (POST /api/workspaces/<id>/query, Bearer key, body {sql, params, rowLimit}).
 * Octo ships no JS SDK and there is no direct DSN, so this is the only path in.
 * Used by the serverless API and by the scripts in scripts/.
 */
export interface OctoResult<T = Record<string, unknown>> {
  columns: string[];
  rows: T[];
  rowCount: number;
  truncated: boolean;
}

export class OctoError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "OctoError";
  }
}

export interface OctoConfig {
  baseUrl: string;
  workspaceId: string;
  apiKey: string;
}

export function octoConfigFromEnv(env: Record<string, string | undefined> = process.env): OctoConfig {
  const apiKey = env.OCTO_API_KEY;
  const workspaceId = env.OCTO_WORKSPACE_ID;
  if (!apiKey || !workspaceId) {
    throw new OctoError("OCTO_API_KEY and OCTO_WORKSPACE_ID must be set.");
  }
  return {
    apiKey,
    workspaceId,
    baseUrl: (env.OCTO_BASE_URL ?? "https://octodb.design-bakery.com").replace(/\/$/, ""),
  };
}

export async function octoQuery<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
  options: { rowLimit?: number; config?: OctoConfig; signal?: AbortSignal } = {},
): Promise<OctoResult<T>> {
  const config = options.config ?? octoConfigFromEnv();
  const body: Record<string, unknown> = { sql, rowLimit: options.rowLimit ?? 50_000 };
  if (params.length) body.params = params;
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${config.baseUrl}/api/workspaces/${config.workspaceId}/query`, {
      method: "POST",
      headers: { authorization: `Bearer ${config.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: options.signal,
    });
    if (res.ok) return (await res.json()) as OctoResult<T>;
    const text = (await res.text()).slice(0, 500);
    lastError = new OctoError(`Octo query failed (${res.status}): ${text}`, res.status);
    if (res.status < 500 && res.status !== 429) break;
    await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
  }
  throw lastError;
}

/** Octo's origin. OCTO_BASE_URL is sometimes written with its /api suffix, which is not part of the origin. */
export function octoOrigin(env: Record<string, string | undefined> = process.env): string {
  return (env.OCTO_BASE_URL ?? "https://octodb.design-bakery.com").replace(/\/+$/, "").replace(/\/api$/, "");
}

/** A vault working key (octo_tmp_…) is exchanged by Octo's relay for the real one, so this server never holds it. */
export const isWorkingKey = (key: string): boolean => key.startsWith("octo_tmp_");
