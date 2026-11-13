/**
 * The where-am-I helper's words in the app's languages (#131). Station, line
 * and street names stay as the map writes them. English is the fallback.
 */
import type { AppLang } from "@/lib/voice/langPref";
import type { Guess, Part, Signal } from "./lostGuess";

type Key =
  | "title" | "showOnMap" | "notQuite" | "close"
  | "at" | "off" | "onLine" | "riding" | "waiting" | "walking" | "landmark" | "part" | "exit" | "ago" | "none" | "isThatRight"
  | "noNet" | "weakNet" | "noGps" | "gpsWeak" | "gpsOld"
  | "yesExit" | "yesNoExit" | "notQuiteReply" | "offline" | "offlineExit" | "offlineNoExit" | "sentLater" | "failed"
  | Part;

const T: Record<AppLang, Record<Key, string>> = {
  en: {
    title: "Where you are", showOnMap: "Show on map", notQuite: "Not quite", close: "Close",
    at: "You're probably at {s}.", off: "You're probably at {s}, just off the {l} train.", onLine: "You're probably on the {l} train.", riding: "You're probably on the {l} train, heading to {s}.", waiting: "You're probably at {s}, waiting for the {l} train.", walking: "You're on your walk to {s}.", landmark: "Look for {m}.",
    part: "The stairs to your exit are {p} of the train.", exit: "Your exit: {e}.", ago: "That's from {n} min ago.", none: "I can't tell where you are. Which station are you in, or what does the nearest sign say?", isThatRight: "Is that right?",
    noNet: "No network", weakNet: "Weak network", noGps: "No location", gpsWeak: "Location ±{m} m", gpsOld: "Last fix {n} min ago",
    yesExit: "Good. Follow the Exit signs for {e}.", yesNoExit: "Good. Follow the Exit signs up to the street.", notQuiteReply: "Tell me which station you're in, or type the words on the nearest sign.",
    offline: "No connection here. I'll send this when you're back online.", offlineExit: "Meanwhile, follow the Exit signs for {e}.", offlineNoExit: "Meanwhile, follow the Exit signs up to the street.", sentLater: "Sending now that you're back online.", failed: "That didn't go through. Try again in a moment.",
    front: "at the front", frontMid: "between the middle and the front", middle: "in the middle", backMid: "between the middle and the back", back: "at the back",
  },
  es: {
    title: "Dónde estás", showOnMap: "Ver en el mapa", notQuite: "No exactamente", close: "Cerrar",
    at: "Probablemente estás en {s}.", off: "Probablemente estás en {s}, recién bajado del tren {l}.", onLine: "Probablemente vas en el tren {l}.", riding: "Probablemente vas en el tren {l}, hacia {s}.", waiting: "Probablemente estás en {s}, esperando el tren {l}.", walking: "Vas caminando hacia {s}.", landmark: "Busca {m}.",
    part: "Las escaleras a tu salida están {p} del tren.", exit: "Tu salida: {e}.", ago: "Es de hace {n} min.", none: "No sé dónde estás. ¿En qué estación estás, o qué dice el letrero más cercano?", isThatRight: "¿Es correcto?",
    noNet: "Sin red", weakNet: "Red débil", noGps: "Sin ubicación", gpsWeak: "Ubicación ±{m} m", gpsOld: "Última ubicación hace {n} min",
    yesExit: "Bien. Sigue los letreros de salida (Exit) hacia {e}.", yesNoExit: "Bien. Sigue los letreros de salida (Exit) hasta la calle.", notQuiteReply: "Dime en qué estación estás, o escribe lo que dice el letrero más cercano.",
    offline: "Aquí no hay conexión. Lo enviaré cuando vuelvas a tener señal.", offlineExit: "Mientras tanto, sigue los letreros de salida (Exit) hacia {e}.", offlineNoExit: "Mientras tanto, sigue los letreros de salida (Exit) hasta la calle.", sentLater: "Enviando, ya tienes conexión.", failed: "No se pudo enviar. Inténtalo de nuevo en un momento.",
    front: "en la parte delantera", frontMid: "entre el medio y la parte delantera", middle: "en el medio", backMid: "entre el medio y la parte trasera", back: "en la parte trasera",
  },
  zh: {
    title: "你的位置", showOnMap: "在地图上显示", notQuite: "不太对", close: "关闭",
    at: "你可能在 {s}。", off: "你可能在 {s}，刚下 {l} 线列车。", onLine: "你可能在 {l} 线列车上。", riding: "你可能在 {l} 线列车上，开往 {s}。", waiting: "你可能在 {s}，等候 {l} 线列车。", walking: "你正在步行前往 {s}。", landmark: "找一找 {m}。",
    part: "通往你出口的楼梯在列车的{p}。", exit: "你的出口：{e}。", ago: "这是 {n} 分钟前的信息。", none: "我无法判断你在哪里。你在哪个车站？或者最近的指示牌上写着什么？", isThatRight: "对吗？",
    noNet: "无网络", weakNet: "网络弱", noGps: "无定位", gpsWeak: "定位 ±{m} 米", gpsOld: "上次定位 {n} 分钟前",
    yesExit: "好的。跟着 Exit（出口）指示牌走向 {e}。", yesNoExit: "好的。跟着 Exit（出口）指示牌上到街面。", notQuiteReply: "告诉我你在哪个车站，或者输入最近指示牌上的字。",
    offline: "这里没有网络。恢复连接后我会发送。", offlineExit: "现在先跟着 Exit（出口）指示牌走向 {e}。", offlineNoExit: "现在先跟着 Exit（出口）指示牌上到街面。", sentLater: "已恢复连接，正在发送。", failed: "没有发送成功，请稍后再试。",
    front: "前部", frontMid: "中部偏前", middle: "中部", backMid: "中部偏后", back: "后部",
  },
  ru: {
    title: "Где вы", showOnMap: "Показать на карте", notQuite: "Не совсем", close: "Закрыть",
    at: "Скорее всего, вы на станции {s}.", off: "Скорее всего, вы на станции {s}, только что вышли из поезда {l}.", onLine: "Скорее всего, вы в поезде {l}.", riding: "Скорее всего, вы в поезде {l}, едете к {s}.", waiting: "Скорее всего, вы на станции {s} и ждёте поезд {l}.", walking: "Вы идёте к {s}.", landmark: "Ищите {m}.",
    part: "Лестница к вашему выходу — {p} поезда.", exit: "Ваш выход: {e}.", ago: "Это данные {n} мин назад.", none: "Не могу понять, где вы. На какой вы станции или что написано на ближайшей табличке?", isThatRight: "Верно?",
    noNet: "Нет сети", weakNet: "Слабая сеть", noGps: "Нет местоположения", gpsWeak: "Местоположение ±{m} м", gpsOld: "Последнее определение {n} мин назад",
    yesExit: "Хорошо. Идите по табличкам Exit к {e}.", yesNoExit: "Хорошо. Идите по табличкам Exit наверх, на улицу.", notQuiteReply: "Скажите, на какой вы станции, или напишите, что на ближайшей табличке.",
    offline: "Здесь нет связи. Отправлю, когда связь вернётся.", offlineExit: "А пока идите по табличкам Exit к {e}.", offlineNoExit: "А пока идите по табличкам Exit наверх, на улицу.", sentLater: "Связь есть, отправляю.", failed: "Не отправилось. Попробуйте ещё раз чуть позже.",
    front: "в начале", frontMid: "ближе к началу", middle: "в середине", backMid: "ближе к концу", back: "в конце",
  },
  bn: {
    title: "আপনি কোথায়", showOnMap: "ম্যাপে দেখান", notQuite: "পুরোপুরি না", close: "বন্ধ করুন",
    at: "আপনি সম্ভবত {s}-এ আছেন।", off: "আপনি সম্ভবত {s}-এ আছেন, এইমাত্র {l} ট্রেন থেকে নেমেছেন।", onLine: "আপনি সম্ভবত {l} ট্রেনে আছেন।", riding: "আপনি সম্ভবত {l} ট্রেনে আছেন, {s}-এর দিকে যাচ্ছেন।", waiting: "আপনি সম্ভবত {s}-এ {l} ট্রেনের অপেক্ষায় আছেন।", walking: "আপনি হেঁটে {s}-এর দিকে যাচ্ছেন।", landmark: "{m} খুঁজুন।",
    part: "আপনার এক্সিটের সিঁড়ি ট্রেনের {p}।", exit: "আপনার এক্সিট: {e}।", ago: "এটা {n} মিনিট আগের তথ্য।", none: "আপনি কোথায় বুঝতে পারছি না। আপনি কোন স্টেশনে, বা কাছের সাইনে কী লেখা?", isThatRight: "ঠিক আছে?",
    noNet: "নেটওয়ার্ক নেই", weakNet: "দুর্বল নেটওয়ার্ক", noGps: "লোকেশন নেই", gpsWeak: "লোকেশন ±{m} মি", gpsOld: "শেষ লোকেশন {n} মিনিট আগে",
    yesExit: "ভালো। {e}-এর জন্য Exit সাইন দেখে চলুন।", yesNoExit: "ভালো। Exit সাইন দেখে রাস্তায় উঠে যান।", notQuiteReply: "আপনি কোন স্টেশনে বলুন, বা কাছের সাইনে কী লেখা তা লিখুন।",
    offline: "এখানে সংযোগ নেই। সংযোগ ফিরলে পাঠিয়ে দেব।", offlineExit: "এর মধ্যে {e}-এর জন্য Exit সাইন দেখে চলুন।", offlineNoExit: "এর মধ্যে Exit সাইন দেখে রাস্তায় উঠে যান।", sentLater: "সংযোগ ফিরেছে, পাঠাচ্ছি।", failed: "পাঠানো যায়নি। একটু পরে আবার চেষ্টা করুন।",
    front: "সামনের দিকে", frontMid: "মাঝখান আর সামনের মধ্যে", middle: "মাঝখানে", backMid: "মাঝখান আর পেছনের মধ্যে", back: "পেছনের দিকে",
  },
  ht: {
    title: "Kote ou ye", showOnMap: "Montre sou kat la", notQuite: "Pa egzakteman", close: "Fèmen",
    at: "Ou pwobableman nan {s}.", off: "Ou pwobableman nan {s}, ou fèk desann tren {l} la.", onLine: "Ou pwobableman nan tren {l} la.", riding: "Ou pwobableman nan tren {l} la, w ap ale {s}.", waiting: "Ou pwobableman nan {s}, w ap tann tren {l} la.", walking: "W ap mache pou ale {s}.", landmark: "Chèche {m}.",
    part: "Eskalye pou sòti ou a {p} tren an.", exit: "Sòti ou: {e}.", ago: "Sa se sa k te la {n} min de sa.", none: "M pa ka di kote ou ye. Nan ki estasyon ou ye, oswa kisa pankat ki pi pre a di?", isThatRight: "Se sa?",
    noNet: "Pa gen rezo", weakNet: "Rezo fèb", noGps: "Pa gen pozisyon", gpsWeak: "Pozisyon ±{m} m", gpsOld: "Dènye pozisyon {n} min de sa",
    yesExit: "Bon. Swiv pankat Exit yo pou {e}.", yesNoExit: "Bon. Swiv pankat Exit yo pou monte nan lari a.", notQuiteReply: "Di m nan ki estasyon ou ye, oswa ekri sa ki sou pankat ki pi pre a.",
    offline: "Pa gen koneksyon isit la. M ap voye l lè koneksyon an tounen.", offlineExit: "Pandan tan sa a, swiv pankat Exit yo pou {e}.", offlineNoExit: "Pandan tan sa a, swiv pankat Exit yo pou monte nan lari a.", sentLater: "Koneksyon an tounen, m ap voye l.", failed: "Li pa pase. Eseye ankò nan yon ti moman.",
    front: "devan", frontMid: "ant mitan an ak devan", middle: "nan mitan", backMid: "ant mitan an ak dèyè", back: "dèyè",
  },
  fr: {
    title: "Où vous êtes", showOnMap: "Voir sur la carte", notQuite: "Pas tout à fait", close: "Fermer",
    at: "Vous êtes sans doute à {s}.", off: "Vous êtes sans doute à {s}, tout juste descendu du train {l}.", onLine: "Vous êtes sans doute dans le train {l}.", riding: "Vous êtes sans doute dans le train {l}, en direction de {s}.", waiting: "Vous êtes sans doute à {s}, en attendant le train {l}.", walking: "Vous marchez vers {s}.", landmark: "Cherchez {m}.",
    part: "L'escalier vers votre sortie est {p} du train.", exit: "Votre sortie : {e}.", ago: "Ça date d'il y a {n} min.", none: "Je ne sais pas où vous êtes. Dans quelle station êtes-vous, ou que dit le panneau le plus proche ?", isThatRight: "C'est bien ça ?",
    noNet: "Pas de réseau", weakNet: "Réseau faible", noGps: "Pas de position", gpsWeak: "Position ±{m} m", gpsOld: "Dernière position il y a {n} min",
    yesExit: "Bien. Suivez les panneaux Exit vers {e}.", yesNoExit: "Bien. Suivez les panneaux Exit jusqu'à la rue.", notQuiteReply: "Dites-moi dans quelle station vous êtes, ou écrivez ce que dit le panneau le plus proche.",
    offline: "Pas de connexion ici. J'enverrai le message dès qu'elle revient.", offlineExit: "En attendant, suivez les panneaux Exit vers {e}.", offlineNoExit: "En attendant, suivez les panneaux Exit jusqu'à la rue.", sentLater: "La connexion est revenue, j'envoie.", failed: "Ça n'est pas passé. Réessayez dans un instant.",
    front: "à l'avant", frontMid: "entre le milieu et l'avant", middle: "au milieu", backMid: "entre le milieu et l'arrière", back: "à l'arrière",
  },
  ko: {
    title: "현재 위치", showOnMap: "지도에서 보기", notQuite: "조금 달라요", close: "닫기",
    at: "아마 {s}에 계신 것 같아요.", off: "아마 {s}에서 {l} 열차에서 막 내리신 것 같아요.", onLine: "아마 {l} 열차에 계신 것 같아요.", riding: "아마 {s} 방향 {l} 열차에 계신 것 같아요.", waiting: "아마 {s}에서 {l} 열차를 기다리고 계신 것 같아요.", walking: "{s}까지 걸어가는 중이에요.", landmark: "{m}을(를) 찾아보세요.",
    part: "출구로 가는 계단은 열차 {p}에 있어요.", exit: "출구: {e}.", ago: "{n}분 전 정보예요.", none: "어디에 계신지 알 수 없어요. 어느 역에 계세요? 가장 가까운 표지판에 뭐라고 쓰여 있나요?", isThatRight: "맞나요?",
    noNet: "네트워크 없음", weakNet: "네트워크 약함", noGps: "위치 없음", gpsWeak: "위치 ±{m}m", gpsOld: "마지막 위치 {n}분 전",
    yesExit: "좋아요. {e} 방향 Exit 표지판을 따라가세요.", yesNoExit: "좋아요. Exit 표지판을 따라 지상으로 올라가세요.", notQuiteReply: "어느 역에 계신지 알려 주시거나, 가장 가까운 표지판의 글자를 입력해 주세요.",
    offline: "여기는 연결이 없어요. 다시 연결되면 보낼게요.", offlineExit: "그동안 {e} 방향 Exit 표지판을 따라가세요.", offlineNoExit: "그동안 Exit 표지판을 따라 지상으로 올라가세요.", sentLater: "다시 연결되어 보내는 중이에요.", failed: "전송되지 않았어요. 잠시 후 다시 시도해 주세요.",
    front: "앞쪽", frontMid: "가운데와 앞쪽 사이", middle: "가운데", backMid: "가운데와 뒤쪽 사이", back: "뒤쪽",
  },
};

const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w)\}/g, (m, k: string) => (k in v ? String(v[k]) : m));

export function lostT(lang: AppLang, key: Key, v: Record<string, string | number> = {}): string {
  return fill(T[lang]?.[key] ?? T.en[key], v);
}

/** The guess as the helper's first message: one to three short sentences, ending in a question when there is a guess. */
export function guessText(g: Guess, lang: AppLang): string {
  const t = (k: Key, v: Record<string, string | number> = {}) => lostT(lang, k, v);
  if (!g.stage || (!g.station && g.stage !== "riding" && !(g.stage === "walking" && g.landmark))) return t("none");
  const s = g.station ?? "?";
  const l = g.line ?? "";
  const head =
    g.stage === "walking" ? [g.station ? t("walking", { s }) : "", g.landmark ? t("landmark", { m: g.landmark }) : ""].filter(Boolean).join(" ")
    : g.stage === "riding" ? t(g.station ? "riding" : "onLine", { l, s })
    : g.stage === "waiting" && l ? t("waiting", { s, l })
    : g.stage === "off" && l ? t("off", { s, l })
    : t("at", { s });
  const parts = [head];
  if (g.part && g.stage !== "waiting" && g.stage !== "walking") parts.push(t("part", { p: t(g.part) }));
  if (g.exit && g.stage !== "walking") parts.push(t("exit", { e: g.exit }));
  if (g.ageMin !== null && g.ageMin >= 2) parts.push(t("ago", { n: g.ageMin }));
  parts.push(t("isThatRight"));
  return parts.join(" ");
}

/** Short signal chips, only for what is poor. */
export function signalChips(s: Signal, lang: AppLang): string[] {
  const out: string[] = [];
  if (s.net === "offline") out.push(lostT(lang, "noNet"));
  else if (s.net === "weak") out.push(lostT(lang, "weakNet"));
  if (s.gps === "none") out.push(lostT(lang, "noGps"));
  else if (s.gps === "weak") out.push(lostT(lang, "gpsWeak", { m: s.accuracyM ?? "?" }));
  else if (s.gps === "old") out.push(lostT(lang, "gpsOld", { n: s.ageMin ?? "?" }));
  return out;
}

/** The signal in English for the agent ("no network, location ±180 m"). */
export function signalForAgent(s: Signal): string | undefined {
  const c = signalChips(s, "en").map((x) => x.toLowerCase());
  return c.length ? c.join(", ") : undefined;
}

/** The answer when offline: the question waits, and the exit signs are the way meanwhile. */
export function offlineReply(exit: string | null, lang: AppLang): string {
  return `${lostT(lang, "offline")} ${exit ? lostT(lang, "offlineExit", { e: exit }) : lostT(lang, "offlineNoExit")}`;
}
