/**
 * The model profiles (#35). "dev" is the small model we are growing (LFM3 on the Pro, through the
 * INFERHUB_* settings as before). "smart" is a chain of larger hosted models, tried in order and
 * reordered by health (health.ts). The app's menu picks the profile per request.
 *
 * Every smart provider's key is an Octo vault working key (octo_tmp_…): calls go through Octo's
 * relay, which adds the real key, so this server never holds one. A plain key still works and is
 * sent straight to the provider, for local runs.
 */
export type Profile = "smart" | "dev";

export interface Provider {
  id: string;
  /** What the menu and the logs call it. */
  label: string;
  model: string;
  /** The provider's OpenAI-compatible base URL, without /chat/completions. */
  target: string;
  key: string;
}

/** In the order smart tries them. Each model can be changed with its *_MODEL variable. */
const TABLE = [
  { id: "deepseek", label: "DeepSeek (InferHub)", keyEnv: "SMART_DEEPSEEK_KEY", modelEnv: "SMART_DEEPSEEK_MODEL", model: "cb/deepseek-v4.1-flash", target: "https://api.inferhub.dev/v1" },
  { id: "qwen", label: "Qwen (yolo)", keyEnv: "SMART_QWEN_KEY", modelEnv: "SMART_QWEN_MODEL", model: "yolo", target: "https://yolo-auto.com/v1" },
  // WorkBuddy refuses calls that do not stream and calls whose first message is not the system prompt; the agent does both.
  { id: "workbuddy", label: "WorkBuddy", keyEnv: "SMART_WORKBUDDY_KEY", modelEnv: "SMART_WORKBUDDY_MODEL", model: "auto", target: "https://www.workbuddy.ai/v2" },
  // One exact free model, never an auto-router (the vault's rule for this key).
  { id: "openrouter", label: "OpenRouter free", keyEnv: "SMART_OPENROUTER_KEY", modelEnv: "SMART_OPENROUTER_MODEL", model: "nvidia/nemotron-3.5-super-vl:free", target: "https://openrouter.ai/api/v1" },
] as const;

/** The smart providers that have a key set, in order. */
export function smartProviders(env: Record<string, string | undefined> = process.env): Provider[] {
  return TABLE.flatMap((t) => {
    const key = env[t.keyEnv]?.trim();
    return key ? [{ id: t.id, label: t.label, model: env[t.modelEnv]?.trim() || t.model, target: t.target, key }] : [];
  });
}

/** The profile a request gets: the one it asked for, else AGENT_PROFILE, else smart when any smart provider is set. */
export function pickProfile(asked: Profile | undefined, env: Record<string, string | undefined> = process.env): Profile {
  const hasSmart = smartProviders(env).length > 0;
  const want = asked ?? (env.AGENT_PROFILE === "dev" || env.AGENT_PROFILE === "smart" ? env.AGENT_PROFILE : hasSmart ? "smart" : "dev");
  return want === "smart" && hasSmart ? "smart" : "dev";
}

/** Octo's origin. OCTO_BASE_URL is sometimes written with its /api suffix. */
export const octoOrigin = (env: Record<string, string | undefined> = process.env): string =>
  (env.OCTO_BASE_URL ?? "https://octodb.design-bakery.com").replace(/\/+$/, "").replace(/\/api$/, "");

export const isWorkingKey = (key: string): boolean => key.startsWith("octo_tmp_");

/** Where one call to `path` (e.g. "/chat/completions") goes, and the headers that reach it. */
export function routeFor(p: Provider, path: string, env: Record<string, string | undefined> = process.env): { url: string; headers: Record<string, string> } {
  const upstream = `${p.target}${path}`;
  const auth = { authorization: `Bearer ${p.key}` };
  return isWorkingKey(p.key) ? { url: `${octoOrigin(env)}/api/vault/proxy`, headers: { ...auth, "x-octo-target": upstream } } : { url: upstream, headers: auth };
}
