/**
 * POST /api/agent/see-sign {image, signs}: which of a short list of station
 * signs a rider's photo shows. The walk guide sends one camera frame and the
 * words on the signs of the station it is in, nearest first. A model that can
 * see reads the words in the photo, and the words are matched here to the
 * list; the answer is a sign's id and what was read, or a null id. Asking the
 * model to pick from the list instead gave a wrong sign on 3 of 10 frames that
 * showed none of them; reading gave none wrong on the same frames. The on-phone text reader could not
 * read our own sign frames (#88), so this asks a hosted model that can see.
 *
 * The photo leaves the phone for this, which nothing else in the app does: it
 * goes to the vision model through the key relay, is not stored here, and is
 * not logged. Only OpenRouter's entry in the smart providers is a model that
 * takes pictures, so it is the only one asked.
 */
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText, type LanguageModel } from "ai";
import { clientIp } from "../../lib/clientIp";
import { createLimiter } from "./fair-use";
import { routeFor, smartProviders } from "./providers";

const MAX_SIGNS = 30;
const MAX_WORDS = 160;
/** About 600 kB of JPEG once decoded: a 960 px frame is a quarter of that. */
const MAX_IMAGE = 800_000;
const limiter = createLimiter({ windowMax: 120, windowMs: 3_600_000, burstMax: 8, burstMs: 60_000 });

const json = (body: unknown, status: number) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

interface SignChoice { id: string; sign: string }

/** The request put to the model: read the signs, nothing else. Pure, for tests. */
export const READ_PROMPT =
  "Read the words on the subway station signs in this photo. Reply with only the words you can read on the signs, on one line. If no sign's words are readable, reply NONE. Do not describe the photo.";

const SAME: Record<string, string> = { street: "st", avenue: "av", ave: "av", square: "sq" };
/** A sign's words as plain lower-case tokens: "Street" and "St" are one word, and "&" is dropped. */
export function signTokens(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").split(" ").filter(Boolean).map((w) => SAME[w] ?? w);
}

/**
 * Which listed sign the words read off a photo belong to, or null. A sign is a
 * candidate when at least two of its words were read and at least 60% of them;
 * a cut-off word counts ("Co" for "Corner"). The one with most words read
 * wins, so "Exit 14 St & 4 Av SW Co" is the SW corner sign and not the plainer
 * exit sign beside it. Equal candidates go to the earliest in the list, which
 * the caller orders nearest the rider's last place first. Pure, for tests.
 */
export function matchRead(read: string, signs: readonly SignChoice[]): number | null {
  if (/^\s*none\b/i.test(read)) return null;
  const got = signTokens(read);
  const has = (w: string) => got.some((g) => g === w || (g.length >= 2 && w.length > g.length && w.startsWith(g)));
  let best: { i: number; hit: number; share: number } | null = null;
  signs.forEach((s, i) => {
    const want = [...new Set(signTokens(s.sign))];
    const hit = want.filter(has).length;
    const share = want.length ? hit / want.length : 0;
    if (hit < Math.min(2, want.length) || share < 0.6) return;
    if (!best || hit > best.hit || (hit === best.hit && share > best.share + 0.05)) best = { i, hit, share };
  });
  return best ? (best as { i: number }).i : null;
}

/** The JPEG's base64, from a data URL or bare; null when it is not one or is too big. */
export function jpegBase64(image: unknown): string | null {
  if (typeof image !== "string") return null;
  const b64 = image.replace(/^data:image\/jpeg;base64,/, "");
  return b64.length > 100 && b64.length <= MAX_IMAGE && /^[A-Za-z0-9+/]+=*$/.test(b64) && b64.startsWith("/9j/") ? b64 : null;
}

/** The one smart provider that takes pictures, or null when its key is not set. */
function visionModel(): LanguageModel | null {
  const p = smartProviders().find((x) => x.id === "openrouter");
  if (!p) return null;
  const route = routeFor(p, "/chat/completions");
  const relay: typeof fetch = (_url, init) => fetch(route.url, { ...init, headers: { ...(init?.headers as Record<string, string> | undefined), ...route.headers } });
  return createOpenAICompatible({ name: "seesign", baseURL: p.target, apiKey: "relay", fetch: relay })(p.model);
}

export async function seeSign(req: Request, model?: () => LanguageModel | null): Promise<Response> {
  const body = (await req.json().catch(() => null)) as { image?: unknown; signs?: unknown } | null;
  const image = jpegBase64(body?.image);
  const signs = Array.isArray(body?.signs) ? (body.signs as unknown[]) : [];
  const ok = signs.length > 0 && signs.length <= MAX_SIGNS && signs.every((s): s is SignChoice => {
    const x = s as Partial<SignChoice> | null;
    return !!x && typeof x.id === "string" && /^[\w-]{1,60}$/.test(x.id) && typeof x.sign === "string" && x.sign.length > 0 && x.sign.length <= MAX_WORDS;
  });
  if (!image || !ok) return json({ error: "image must be a JPEG of up to about 600 kB; signs 1-30 of {id, sign}" }, 400);
  if (!limiter.take(clientIp(req.headers)).ok) return json({ error: "too many" }, 429);
  const m = (model ?? visionModel)();
  if (!m) return json({ error: "no model here can look at a photo" }, 503);
  try {
    const { text } = await generateText({
      model: m,
      messages: [{ role: "user", content: [{ type: "text", text: READ_PROMPT }, { type: "file", data: image, mediaType: "image/jpeg" }] }],
      // The free model thinks before it answers. On a frame with nothing to read it can think until this runs out, which comes back as no words: the safe answer.
      maxOutputTokens: 1500,
      providerOptions: { seesign: { reasoning: { effort: "low" } } },
      abortSignal: req.signal,
    });
    const read = text.replace(/\s+/g, " ").trim().slice(0, 200);
    const i = matchRead(read, signs);
    return json({ id: i === null ? null : signs[i].id, read }, 200);
  } catch (e) {
    console.warn(`see-sign: ${(e as Error).message}`);
    return json({ error: "the model could not look at the photo" }, 502);
  }
}
