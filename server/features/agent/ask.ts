/**
 * Ask or plan (#625). The model reads the rider's words, in whatever language they use, into
 * transit_plan's detail fields (timing, access, walking, mode); this file decides in code whether
 * one of them, or the place, is missing or too vague to plan, and which single question to ask.
 * The model also names the rider's language, and the app says the question itself from the phrases
 * below for the eight languages the app speaks; for any other the model words it. The owner rates
 * this agent low stakes: no confirmations, no read-backs, and a detail is asked about at most twice
 * in a row before the defaults apply.
 *
 * After a trip is planned, followUpFor picks one offer from the trip itself: the step-free way when
 * an elevator is out, fewer transfers when an alternative has them, otherwise the return trip. The
 * app says it after the answer, so a small model cannot drop it, label it or reword it.
 */
import type { Trip } from "../../../src/features/agent/schema";

/** What the rider said about each detail, as the model read it. "unclear" means they hinted at it without saying enough. */
export interface TripDetails {
  from: string;
  to: string;
  /** now: leave now or nothing said; set: a time with an hour; vague: a day or part of day only ("tomorrow", "tonight"). */
  timing: "now" | "set" | "vague";
  /** step-free: elevators the whole way; unclear: a hint (a stroller, a wheelchair user, a bad knee, "with my grandma") but not what they need. */
  access: "none" | "step-free" | "unclear";
  /** less: as little walking as possible; unclear: a hint ("not too far", "my feet hurt") without saying how much. */
  walking: "any" | "less" | "unclear";
  /** unclear: they want a particular way to go but did not say which. */
  mode: "any" | "subway" | "bus" | "ferry" | "unclear";
}

type Detail = "destination" | "origin" | "timing" | "access" | "walking" | "mode";
interface Ask { needsAnswer: true; ask: Detail; place: string; question: string; note: string }

/** A sentence the app says itself: a question before planning, or the follow-up after a trip. */
export type Line =
  | { kind: Detail; place: string }
  | { kind: "step-free" }
  | { kind: "fewer"; none: boolean; laterMin: number }
  | { kind: "return" };

/** The languages the app's buttons and phrases are written in (prompt.ts names the buttons in the same ones). */
const LANGS = ["en", "es", "zh", "ru", "bn", "ht", "fr", "ko"] as const;
export type Lang = (typeof LANGS)[number];

const later = (n: number, say: (n: number) => string) => (n > 0 ? ` ${say(n)}` : "");
const PHRASES: Record<Lang, (l: Line) => string> = {
  en: (l) => ({
    destination: () => `Where in ${(l as { place: string }).place} are you going? A street, a station or a place is enough.`,
    origin: () => "Where are you starting from? Or tap Use my location.",
    timing: () => "What time do you want to leave, or when do you need to be there?",
    access: () => "Do you need a step-free way, with elevators instead of stairs?",
    walking: () => "How much walking is OK: a few minutes, or as little as possible?",
    mode: () => "Do you prefer the subway, the bus or the ferry?",
    "step-free": () => "Need the step-free way? An elevator on this route is out.",
    fewer: () => { const f = l as Extract<Line, { kind: "fewer" }>; return `Want the route with ${f.none ? "no transfer" : "fewer transfers"}?${later(f.laterMin, (n) => `It arrives about ${n} min later.`)}`; },
    return: () => "Want the return trip?",
  })[l.kind](),
  es: (l) => ({
    destination: () => `¿A qué parte de ${(l as { place: string }).place} vas? Basta con una calle, una estación o un lugar.`,
    origin: () => "¿Desde dónde sales? O toca Usar mi ubicación.",
    timing: () => "¿A qué hora quieres salir, o a qué hora tienes que llegar?",
    access: () => "¿Necesitas una ruta sin escaleras, con ascensores?",
    walking: () => "¿Cuánto puedes caminar: unos minutos, o lo menos posible?",
    mode: () => "¿Prefieres el metro, el autobús o el ferry?",
    "step-free": () => "¿Necesitas la ruta sin escaleras? Un ascensor de esta ruta no funciona.",
    fewer: () => { const f = l as Extract<Line, { kind: "fewer" }>; return `¿Quieres la ruta ${f.none ? "sin transbordo" : "con menos transbordos"}?${later(f.laterMin, (n) => `Llega unos ${n} min más tarde.`)}`; },
    return: () => "¿Quieres el viaje de vuelta?",
  })[l.kind](),
  zh: (l) => ({
    destination: () => `你要去${(l as { place: string }).place}的哪里？说一条街、一个车站或一个地方就行。`,
    origin: () => "你从哪里出发？也可以点“使用我的位置”。",
    timing: () => "你想几点出发，或者需要几点到？",
    access: () => "需要走电梯、不走楼梯的无障碍路线吗？",
    walking: () => "你能走多少路：几分钟可以，还是越少越好？",
    mode: () => "你想坐地铁、公交还是渡轮？",
    "step-free": () => "需要无障碍路线吗？这条路线上有一部电梯停用。",
    fewer: () => { const f = l as Extract<Line, { kind: "fewer" }>; return `要${f.none ? "不用换乘" : "换乘更少"}的路线吗？${f.laterMin > 0 ? `大约晚到${f.laterMin}分钟。` : ""}`; },
    return: () => "要回程路线吗？",
  })[l.kind](),
  ru: (l) => ({
    destination: () => `Куда именно вам нужно в районе ${(l as { place: string }).place}? Хватит улицы, станции или места.`,
    origin: () => "Откуда вы отправляетесь? Или нажмите «Моё местоположение».",
    timing: () => "Во сколько вы хотите выехать или к какому времени нужно быть на месте?",
    access: () => "Нужен маршрут без ступенек, с лифтами вместо лестниц?",
    walking: () => "Сколько можно идти пешком: несколько минут или как можно меньше?",
    mode: () => "Что удобнее: метро, автобус или паром?",
    "step-free": () => "Нужен маршрут без ступенек? На этом маршруте не работает лифт.",
    fewer: () => { const f = l as Extract<Line, { kind: "fewer" }>; return `Показать маршрут ${f.none ? "без пересадок" : "с меньшим числом пересадок"}?${later(f.laterMin, (n) => `Он приходит примерно на ${n} мин позже.`)}`; },
    return: () => "Показать обратный путь?",
  })[l.kind](),
  bn: (l) => ({
    destination: () => `${(l as { place: string }).place}-এর কোথায় যাচ্ছেন? একটি রাস্তা, স্টেশন বা জায়গার নাম বললেই হবে।`,
    origin: () => "কোথা থেকে রওনা দিচ্ছেন? অথবা \"আমার অবস্থান ব্যবহার করুন\" চাপুন।",
    timing: () => "কখন রওনা দিতে চান, নাকি কখনের মধ্যে পৌঁছাতে হবে?",
    access: () => "সিঁড়ির বদলে লিফট আছে এমন সিঁড়িবিহীন পথ লাগবে?",
    walking: () => "কতটা হাঁটা চলবে: কয়েক মিনিট, নাকি যত কম সম্ভব?",
    mode: () => "সাবওয়ে, বাস নাকি ফেরি, কোনটা পছন্দ?",
    "step-free": () => "সিঁড়িবিহীন পথ লাগবে? এই পথের একটি লিফট বন্ধ আছে।",
    fewer: () => { const f = l as Extract<Line, { kind: "fewer" }>; return `${f.none ? "কোনো বদল ছাড়া" : "কম বদলের"} পথটা চান?${later(f.laterMin, (n) => `এটি প্রায় ${n} মিনিট পরে পৌঁছায়।`)}`; },
    return: () => "ফেরার পথটাও চান?",
  })[l.kind](),
  ht: (l) => ({
    destination: () => `Ki kote nan ${(l as { place: string }).place} w ap prale? Yon lari, yon estasyon oswa yon kote ase.`,
    origin: () => "Ki kote w ap pati? Oswa peze Sèvi ak pozisyon mwen.",
    timing: () => "Ki lè ou vle pati, oswa ki lè ou bezwen rive?",
    access: () => "Èske w bezwen yon wout san mach eskalye, ak asansè?",
    walking: () => "Konbyen mache ou ka fè: kèk minit, oswa pi piti posib?",
    mode: () => "Ou pito pran sòbwe a, bis la oswa ferry a?",
    "step-free": () => "Ou bezwen wout san mach eskalye a? Gen yon asansè ki pa mache sou wout sa a.",
    fewer: () => { const f = l as Extract<Line, { kind: "fewer" }>; return `Ou vle wout ${f.none ? "ki pa gen transfè" : "ki gen mwens transfè"} a?${later(f.laterMin, (n) => `Li rive anviwon ${n} minit pita.`)}`; },
    return: () => "Ou vle wout retou a?",
  })[l.kind](),
  fr: (l) => ({
    destination: () => `Où allez-vous exactement à ${(l as { place: string }).place} ? Une rue, une station ou un lieu suffit.`,
    origin: () => "D'où partez-vous ? Ou touchez Utiliser ma position.",
    timing: () => "À quelle heure voulez-vous partir, ou pour quelle heure devez-vous arriver ?",
    access: () => "Avez-vous besoin d'un trajet sans marches, avec des ascenseurs plutôt que des escaliers ?",
    walking: () => "Combien pouvez-vous marcher : quelques minutes, ou le moins possible ?",
    mode: () => "Vous préférez le métro, le bus ou le ferry ?",
    "step-free": () => "Besoin du trajet sans marches ? Un ascenseur de ce trajet est en panne.",
    fewer: () => { const f = l as Extract<Line, { kind: "fewer" }>; return `Vous voulez le trajet ${f.none ? "sans correspondance" : "avec moins de correspondances"} ?${later(f.laterMin, (n) => `Il arrive environ ${n} min plus tard.`)}`; },
    return: () => "Vous voulez le trajet retour ?",
  })[l.kind](),
  ko: (l) => ({
    destination: () => `${(l as { place: string }).place} 어디로 가세요? 거리, 역 또는 장소 이름이면 됩니다.`,
    origin: () => "어디에서 출발하세요? 아니면 내 위치 사용을 누르세요.",
    timing: () => "몇 시에 출발하고 싶으세요, 아니면 몇 시까지 도착해야 하세요?",
    access: () => "계단 대신 엘리베이터로 가는 길이 필요하세요?",
    walking: () => "몇 분 정도 걸어도 괜찮으세요, 아니면 최대한 적게 걸으실래요?",
    mode: () => "지하철, 버스, 페리 중 어느 쪽이 좋으세요?",
    "step-free": () => "계단 없는 길이 필요하세요? 이 경로의 엘리베이터 하나가 고장입니다.",
    fewer: () => { const f = l as Extract<Line, { kind: "fewer" }>; return `${f.none ? "환승 없는" : "환승이 적은"} 경로를 볼까요?${later(f.laterMin, (n) => `약 ${n}분 늦게 도착해요.`)}`; },
    return: () => "돌아오는 길도 볼까요?",
  })[l.kind](),
};

const DETAILS: readonly string[] = ["destination", "origin", "timing", "access", "walking", "mode"];
/** A question before planning, rather than a follow-up after it. */
export const isQuestion = (l: Line) => DETAILS.includes(l.kind);

/** The sentence in the rider's language, or null when the app has no phrases for it. */
export const say = (l: Line, lang: Lang | null): string | null => (lang ? PHRASES[lang](l) : null);

/**
 * The rider's language: the writing system first, which no model can get wrong (Chinese, Korean,
 * Russian, Bengali), then the language the model named while reading the trip. Null for a language
 * the app has no phrases for, so the model words the sentence itself.
 */
export function riderLanguage(text: string, named: string | undefined): Lang | null {
  if (/[\u3040-\u30ff]/.test(text)) return null; // Japanese kana: not one of ours
  if (/[\uac00-\ud7af]/.test(text)) return "ko";
  if (/[\u4e00-\u9fff]/.test(text)) return "zh";
  if (/[\u0400-\u04ff]/.test(text)) return "ru";
  if (/[\u0980-\u09ff]/.test(text)) return "bn";
  const code = (named ?? "en").toLowerCase().split(/[-_]/)[0];
  return (LANGS as readonly string[]).includes(code) ? (code as Lang) : null;
}

/** A tool result that asks the rider a question instead of answering. */
const needsAnswer = (output: unknown) => !!output && typeof output === "object" && (output as { needsAnswer?: unknown }).needsAnswer === true;

/** The first tool result in a step that asks the rider a question, or undefined. */
export const askIn = (results: ReadonlyArray<{ output?: unknown } | undefined>): Ask | undefined =>
  results.map((r) => r?.output).find(needsAnswer) as Ask | undefined;

/**
 * The prompt for the step that asks, in a language the phrases below do not cover: just the
 * question and the conversation, no rules or tools. Given the full prompt, a small model answers in
 * English and adds a second question; this way it only says one sentence.
 */
export function sayPrompt(sentence: string, lang?: string): string {
  return [
    "You ask a rider one short question before planning their New York trip.",
    `Write this question in the language of the rider's latest message${lang ? ` (if unclear, ${lang})` : ""}, as one sentence, and nothing else: no greeting, no reason, no second question, and do not repeat their words back as a question.`,
    `The question: ${sentence}`,
  ].join("\n");
}

/** The model's own closing offer, which the app's follow-up replaces on a transit trip. */
const OWN_CLOSE = "Want to start?";

/**
 * Passes the answer's text through as it streams, except a tail that could still turn out to be the
 * model's own "Want to start?". At the end, `rest(true)` drops that phrase when the app adds its
 * follow-up instead, and `rest(false)` lets it through.
 */
export class CloseHold {
  private held = "";
  push(delta: string): string {
    const all = this.held + delta;
    for (let k = Math.min(all.length, OWN_CLOSE.length + 1); k > 0; k--) {
      const tail = all.slice(-k);
      if (tail.trim() && OWN_CLOSE.startsWith(tail.trim())) {
        this.held = tail;
        return all.slice(0, -k);
      }
    }
    this.held = "";
    return all;
  }
  rest(dropOwnClose: boolean): string {
    const r = dropOwnClose && this.held.trim() === OWN_CLOSE ? "" : this.held;
    this.held = "";
    return r;
  }
}

/** A whole borough or a part of town: too big to route to. Names, so they read the same in any language. */
const AREAS = /^(?:the\s+)?(?:brooklyn|queens|manhattan|the bronx|bronx|staten island|nyc|new york|new york city|the city|downtown|uptown|midtown|lower manhattan|upper manhattan)(?:,?\s*(?:ny|nyc|new york))?$/i;
export const isArea = (place: string) => AREAS.test(place.trim().replace(/[.!?]+$/, ""));

const NOTE = "Ask the rider this one question, in their language, in one short sentence, and stop. Do not plan the trip or call another tool until they answer.";

/**
 * How many questions in a row the rider has just answered: each trailing pair of an assistant
 * message ending in a question mark and the rider's reply. Question marks are the same in the
 * languages the app speaks (? ？ ؟), so this needs no wording.
 */
export function questionsAnswered(messages: readonly { role: string; content: string }[]): number {
  let n = 0;
  for (let i = messages.length - 1; i > 0; i -= 2) {
    if (messages[i].role !== "user" || messages[i - 1].role !== "assistant" || !/[?？؟]\s*$/.test(messages[i - 1].content.trim())) break;
    n += 1;
  }
  return n;
}

/** Soft details (everything but where from) are asked while fewer than this many questions were just answered. */
const MAX_IN_A_ROW = 2;

/** The one question to ask before planning, or null to plan now. */
export function askFor(d: TripDetails, opts: { hasLocation: boolean; answered: number }): Ask | null {
  const place = d.to.trim();
  const ask = (detail: Detail): Ask => ({ needsAnswer: true, ask: detail, place, question: PHRASES.en({ kind: detail, place }), note: NOTE });
  // With no start and no shared location there is nothing to plan from, however many questions came before.
  if (!opts.hasLocation && /^(here|my location|current location|me)$/i.test(d.from.trim())) return ask("origin");
  if (opts.answered >= MAX_IN_A_ROW) return null;
  if (isArea(d.to)) return ask("destination");
  if (d.timing === "vague") return ask("timing");
  if (d.access === "unclear") return ask("access");
  if (d.walking === "unclear") return ask("walking");
  if (d.mode === "unclear") return ask("mode");
  return null;
}

/** The planner's preference from the details: a named way to go first, then less walking. */
export function preferFrom(d: TripDetails, prefer: "fastest" | "subway" | "bus" | "ferry" | "less-walking"): "fastest" | "subway" | "bus" | "ferry" | "less-walking" {
  if (prefer !== "fastest") return prefer;
  if (d.mode === "subway" || d.mode === "bus" || d.mode === "ferry") return d.mode;
  return d.walking === "less" ? "less-walking" : "fastest";
}

const transfers = (t: Pick<Trip, "legs">) => Math.max(0, t.legs.filter((l) => l.kind === "ride").length - 1);
const minutes = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 60000);

/**
 * The one follow-up a trip answer ends with. Never a time to leave (docs/DESIGN_RULES.md: riders
 * plan their own day), so a route with fewer transfers is offered as a route, not as "leave later".
 */
export function followUpFor(t: Trip, d: Pick<TripDetails, "access">): Line {
  if (d.access !== "step-free" && t.elevators.length) return { kind: "step-free" };
  const fewer = t.alternatives.filter((a) => !a.impacts.some((i) => i.blocks) && transfers(a) < transfers(t)).sort((a, b) => transfers(a) - transfers(b))[0];
  if (transfers(t) >= 1 && fewer) return { kind: "fewer", none: transfers(fewer) === 0, laterMin: minutes(t.arriveIso, fewer.arriveIso) };
  return { kind: "return" };
}
