import { useSyncExternalStore } from "react";
import { APP_LANGS, readLang, useLangPref, type AppLang } from "@/lib/voice/langPref";

/**
 * The app's own text on the first screens (task buttons, the ask bar, the
 * answer card, the station prompt). A language picked in the menu wins;
 * otherwise the app follows the language the person last asked in, so someone
 * who asks in Chinese sees the buttons in Chinese too; before any question,
 * the browser's language. The asked language is kept on this device only.
 */
const ASKED_KEY = "nma.askedLang";
const SUPPORTED = new Set<string>(APP_LANGS);

/** Base language of a BCP 47 tag when the app has text for it ("es-US" → "es"), else null. */
export function appLangOf(tag: string | null | undefined): AppLang | null {
  const b = tag?.split("-")[0].toLowerCase();
  return b && SUPPORTED.has(b) ? (b as AppLang) : null;
}

let asked: AppLang | null = (() => {
  try { return appLangOf(globalThis.localStorage?.getItem(ASKED_KEY)); } catch { return null; }
})();
const listeners = new Set<() => void>();

/** Record the language of a question (only when it is clear from the text). */
export function setAskedLang(lang: AppLang): void {
  if (lang === asked) return;
  asked = lang;
  try { globalThis.localStorage?.setItem(ASKED_KEY, lang); } catch { /* storage blocked */ }
  for (const l of listeners) l();
}

const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };
const browser = () => appLangOf(typeof navigator === "undefined" ? undefined : navigator.language);

/** Picked, else asked, else browser, else English. */
export function resolveAppLang(picked: AppLang | null, askedLang: AppLang | null, browserLang: AppLang | null): AppLang {
  return picked ?? askedLang ?? browserLang ?? "en";
}

export function getAppLang(): AppLang {
  return resolveAppLang(readLang(), asked, browser());
}

export function useAppLang(): AppLang {
  const picked = useLangPref();
  const askedLang = useSyncExternalStore(subscribe, () => asked, () => null);
  return resolveAppLang(picked, askedLang, browser());
}

type Key =
  | "restroom" | "myTrain" | "planTrip" | "findExit"
  | "askAnything" | "askFollowUp" | "askLabel" | "more" | "nearby" | "otherOptions" | "otherRoutes" | "bySubway" | "byBus" | "byWalk" | "lessWalking" | "agentsWorking" | "sendingSoon"
  | "walkMeThere" | "inStation" | "yes" | "no" | "listening" | "stopListening" | "closeAnswer" | "showAnswer"
  | "changeTo" | "skipped"
  | "walk" | "transit" | "drive" | "bus" | "train" | "ferry" | "getOffAt" | "oneStop" | "nStops" | "steps" | "sameTime" | "plannedWork" | "elevators" | "weatherAlerts" | "onTheRoad" | "rain" | "remindMe" | "remindSaved"
  | "useMyLocation" | "findingYou" | "locationBlocked"
  | "askRestroom" | "askLine" | "askLines" | "askExit" | "planPrefix"
  | "arrivedAt" | "atPlace" | "done"
  | "whereAmI" | "typeWhatYouSee";

const T: Record<AppLang, Record<Key, string>> = {
  en: {
    restroom: "Restroom", myTrain: "My train", planTrip: "Plan trip", findExit: "Find exit",
    askAnything: "Ask anything…", askFollowUp: "Ask a follow-up…", askLabel: "Ask the assistant", more: "More", nearby: "What's nearby", otherOptions: "Other options", otherRoutes: "Other routes", bySubway: "Subway", byBus: "Bus", byWalk: "Walk", lessWalking: "Least walking", agentsWorking: "Agents working", sendingSoon: "Sending in a moment",
    walkMeThere: "Walk me there", inStation: "Are you in the station?", yes: "Yes", no: "No", listening: "Listening", stopListening: "Stop listening", closeAnswer: "Close answer", showAnswer: "Show the answer",
    changeTo: "Change to the {r}", skipped: "Skipped",
    walk: "Walk", transit: "Transit", drive: "Drive", bus: "Bus", train: "Train", ferry: "Ferry", getOffAt: "Get off at {s}", oneStop: "1 stop", nStops: "{n} stops", steps: "Steps", sameTime: "same time", plannedWork: "Planned work", elevators: "Elevators", weatherAlerts: "Weather alerts", onTheRoad: "On the road", rain: "rain", remindMe: "Remind me", remindSaved: "Saved to your calendar. It will remind you at {t}, 10 minutes before you leave.", useMyLocation: "Use my location", findingYou: "Finding you…", locationBlocked: "Can't get your location. Type a street, a place or a station instead.", askRestroom: "Where's the nearest public restroom that's open now?", askLine: "How is the {r} train running right now?", askLines: "How are the subway lines running right now?", askExit: "Which exit should I take at the nearest subway station?", planPrefix: "Plan a trip to ",
    arrivedAt: "You've arrived at {p}", atPlace: "At {p}", done: "Done", whereAmI: "Where am I?", typeWhatYouSee: "Type what you see, like a sign…",
  },
  es: {
    restroom: "Baño", myTrain: "Mi tren", planTrip: "Planear viaje", findExit: "Buscar salida",
    askAnything: "Pregunta lo que quieras…", askFollowUp: "Haz otra pregunta…", askLabel: "Pregúntale al asistente", more: "Más", nearby: "Qué hay cerca", otherOptions: "Otras opciones", otherRoutes: "Otras rutas", bySubway: "Metro", byBus: "Autobús", byWalk: "A pie", lessWalking: "Caminar menos", agentsWorking: "Trabajando", sendingSoon: "Enviando en un momento",
    walkMeThere: "Llévame caminando", inStation: "¿Estás en la estación?", yes: "Sí", no: "No", listening: "Escuchando", stopListening: "Dejar de escuchar", closeAnswer: "Cerrar respuesta", showAnswer: "Ver la respuesta",
    changeTo: "Cambia al {r}", skipped: "No para aquí",
    walk: "Caminar", transit: "Transporte", drive: "Auto", bus: "Autobús", train: "Tren", ferry: "Ferry", getOffAt: "Bájate en {s}", oneStop: "1 parada", nStops: "{n} paradas", steps: "Pasos", sameTime: "misma hora", plannedWork: "Obras programadas", elevators: "Ascensores", weatherAlerts: "Alertas del clima", onTheRoad: "En la vía", rain: "lluvia", remindMe: "Recuérdame", remindSaved: "Guardado en tu calendario. Te avisará a las {t}, 10 minutos antes de salir.", useMyLocation: "Usar mi ubicación", findingYou: "Buscándote…", locationBlocked: "No se pudo obtener tu ubicación. Escribe una calle, un lugar o una estación.", askRestroom: "¿Dónde está el baño público abierto más cercano?", askLine: "¿Cómo está funcionando el tren {r} ahora mismo?", askLines: "¿Cómo están funcionando las líneas del metro ahora mismo?", askExit: "¿Qué salida debo tomar en la estación de metro más cercana?", planPrefix: "Planear un viaje a ",
    arrivedAt: "Has llegado a {p}", atPlace: "En {p}", done: "Listo", whereAmI: "¿Dónde estoy?", typeWhatYouSee: "Escribe lo que ves, como un letrero…",
  },
  zh: {
    restroom: "厕所", myTrain: "我的列车", planTrip: "规划行程", findExit: "找出口",
    askAnything: "想问什么都可以…", askFollowUp: "继续提问…", askLabel: "问助手", more: "更多", nearby: "附近有什么", otherOptions: "其他选择", otherRoutes: "其他路线", bySubway: "地铁", byBus: "公交", byWalk: "步行", lessWalking: "少走路", agentsWorking: "正在处理", sendingSoon: "马上发送",
    walkMeThere: "带我走过去", inStation: "你在车站里吗？", yes: "是", no: "不是", listening: "正在听", stopListening: "停止听", closeAnswer: "关闭回答", showAnswer: "显示回答",
    changeTo: "换乘 {r} 线", skipped: "不停靠",
    walk: "步行", transit: "公共交通", drive: "开车", bus: "公交", train: "地铁", ferry: "渡轮", getOffAt: "在 {s} 下车", oneStop: "1 站", nStops: "{n} 站", steps: "步骤", sameTime: "同一时间", plannedWork: "计划施工", elevators: "电梯", weatherAlerts: "天气警报", onTheRoad: "路况", rain: "降雨", remindMe: "提醒我", remindSaved: "已存到你的日历。会在 {t} 提醒你，出发前 10 分钟。", useMyLocation: "使用我的位置", findingYou: "正在定位…", locationBlocked: "无法获取你的位置。请输入街道、地点或车站。", askRestroom: "最近的、现在开放的公共厕所在哪里？", askLine: "{r} 线现在运行情况如何？", askLines: "地铁各线路现在运行情况如何？", askExit: "在最近的地铁站我应该走哪个出口？", planPrefix: "规划行程到 ",
    arrivedAt: "您已到达 {p}", atPlace: "已到 {p}", done: "完成", whereAmI: "我在哪？", typeWhatYouSee: "输入你看到的，比如指示牌…",
  },
  ru: {
    restroom: "Туалет", myTrain: "Мой поезд", planTrip: "Маршрут", findExit: "Найти выход",
    askAnything: "Спросите что угодно…", askFollowUp: "Задайте ещё вопрос…", askLabel: "Спросить помощника", more: "Ещё", nearby: "Что рядом", otherOptions: "Другие варианты", otherRoutes: "Другие маршруты", bySubway: "Метро", byBus: "Автобус", byWalk: "Пешком", lessWalking: "Меньше пешком", agentsWorking: "Работаю", sendingSoon: "Отправляю через мгновение",
    walkMeThere: "Проводите меня", inStation: "Вы на станции?", yes: "Да", no: "Нет", listening: "Слушаю", stopListening: "Перестать слушать", closeAnswer: "Закрыть ответ", showAnswer: "Показать ответ",
    changeTo: "Пересадка на {r}", skipped: "Без остановки",
    walk: "Пешком", transit: "Транспорт", drive: "На машине", bus: "Автобус", train: "Поезд", ferry: "Паром", getOffAt: "Выйти на {s}", oneStop: "1 остановка", nStops: "Остановок: {n}", steps: "Шаги", sameTime: "в то же время", plannedWork: "Плановые работы", elevators: "Лифты", weatherAlerts: "Погодные предупреждения", onTheRoad: "На дороге", rain: "дождь", remindMe: "Напомнить", remindSaved: "Сохранено в календаре. Напомнит в {t}, за 10 минут до выхода.", useMyLocation: "Моё местоположение", findingYou: "Ищу вас…", locationBlocked: "Не удалось определить ваше местоположение. Напишите улицу, место или станцию.", askRestroom: "Где ближайший общественный туалет, который сейчас открыт?", askLine: "Как сейчас ходит поезд {r}?", askLines: "Как сейчас работают линии метро?", askExit: "Какой выход выбрать на ближайшей станции метро?", planPrefix: "Маршрут до ",
    arrivedAt: "Вы прибыли: {p}", atPlace: "Вы на месте: {p}", done: "Готово", whereAmI: "Где я?", typeWhatYouSee: "Напишите, что видите, например табличку…",
  },
  bn: {
    restroom: "টয়লেট", myTrain: "আমার ট্রেন", planTrip: "যাত্রা পরিকল্পনা", findExit: "বের হওয়ার পথ",
    askAnything: "যা খুশি জিজ্ঞেস করুন…", askFollowUp: "আরেকটি প্রশ্ন করুন…", askLabel: "সহকারীকে জিজ্ঞেস করুন", more: "আরও", nearby: "কাছে কী আছে", otherOptions: "অন্য উপায়", otherRoutes: "অন্য পথ", bySubway: "সাবওয়ে", byBus: "বাস", byWalk: "হেঁটে", lessWalking: "কম হাঁটা", agentsWorking: "কাজ চলছে", sendingSoon: "একটু পরেই পাঠানো হচ্ছে",
    walkMeThere: "হেঁটে নিয়ে চলুন", inStation: "আপনি কি স্টেশনের ভেতরে?", yes: "হ্যাঁ", no: "না", listening: "শুনছি", stopListening: "শোনা বন্ধ করুন", closeAnswer: "উত্তর বন্ধ করুন", showAnswer: "উত্তর দেখান",
    changeTo: "{r} ট্রেনে বদলান", skipped: "থামবে না",
    walk: "হাঁটা", transit: "গণপরিবহন", drive: "গাড়ি", bus: "বাস", train: "ট্রেন", ferry: "ফেরি", getOffAt: "{s}-এ নামুন", oneStop: "1 স্টপ", nStops: "{n} স্টপ", steps: "ধাপ", sameTime: "একই সময়", plannedWork: "পরিকল্পিত কাজ", elevators: "লিফট", weatherAlerts: "আবহাওয়া সতর্কতা", onTheRoad: "রাস্তায়", rain: "বৃষ্টি", remindMe: "মনে করিয়ে দিন", remindSaved: "আপনার ক্যালেন্ডারে রাখা হয়েছে। {t}-এ মনে করিয়ে দেবে, বের হওয়ার 10 মিনিট আগে।", useMyLocation: "আমার অবস্থান ব্যবহার করুন", findingYou: "আপনাকে খুঁজছি…", locationBlocked: "আপনার অবস্থান পাওয়া যাচ্ছে না। একটি রাস্তা, জায়গা বা স্টেশনের নাম লিখুন।", askRestroom: "এখন খোলা সবচেয়ে কাছের পাবলিক টয়লেট কোথায়?", askLine: "{r} ট্রেন এখন কেমন চলছে?", askLines: "সাবওয়ের লাইনগুলো এখন কেমন চলছে?", askExit: "সবচেয়ে কাছের সাবওয়ে স্টেশনে কোন এক্সিট দিয়ে বের হব?", planPrefix: "যাত্রার পরিকল্পনা: ",
    arrivedAt: "আপনি {p}-এ পৌঁছেছেন", atPlace: "{p}-এ", done: "শেষ", whereAmI: "আমি কোথায়?", typeWhatYouSee: "যা দেখছেন লিখুন, যেমন একটা সাইন…",
  },
  ht: {
    restroom: "Twalèt", myTrain: "Tren mwen", planTrip: "Planifye vwayaj", findExit: "Jwenn sòti",
    askAnything: "Mande nenpòt bagay…", askFollowUp: "Poze yon lòt kesyon…", askLabel: "Mande asistan an", more: "Plis", nearby: "Sa ki toupre", otherOptions: "Lòt chwa", otherRoutes: "Lòt wout", bySubway: "Tren", byBus: "Bis", byWalk: "A pye", lessWalking: "Mache mwens", agentsWorking: "M ap travay", sendingSoon: "M ap voye l nan yon ti moman",
    walkMeThere: "Mennen m a pye", inStation: "Èske ou nan estasyon an?", yes: "Wi", no: "Non", listening: "M ap koute", stopListening: "Sispann koute", closeAnswer: "Fèmen repons lan", showAnswer: "Montre repons lan",
    changeTo: "Chanje pou {r} la", skipped: "Pa kanpe la",
    walk: "Mache", transit: "Transpò", drive: "Machin", bus: "Bis", train: "Tren", ferry: "Ferry", getOffAt: "Desann nan {s}", oneStop: "1 arè", nStops: "{n} arè", steps: "Etap", sameTime: "menm lè", plannedWork: "Travay planifye", elevators: "Asansè", weatherAlerts: "Alèt move tan", onTheRoad: "Sou wout la", rain: "lapli", remindMe: "Raple m", remindSaved: "Li nan kalandriye w. L ap raple w a {t}, 10 minit anvan ou soti.", useMyLocation: "Sèvi ak pozisyon mwen", findingYou: "M ap chèche w…", locationBlocked: "Nou pa ka jwenn pozisyon w. Ekri yon lari, yon kote oswa yon estasyon pito.", askRestroom: "Ki kote twalèt piblik ki pi pre a ki louvri kounye a?", askLine: "Kijan tren {r} a ap mache kounye a?", askLines: "Kijan liy metro yo ap mache kounye a?", askExit: "Ki sòti pou m pran nan estasyon metro ki pi pre a?", planPrefix: "Planifye yon vwayaj pou ",
    arrivedAt: "Ou rive nan {p}", atPlace: "Nan {p}", done: "Fini", whereAmI: "Kote m ye?", typeWhatYouSee: "Ekri sa ou wè, tankou yon pankat…",
  },
  fr: {
    restroom: "Toilettes", myTrain: "Mon train", planTrip: "Itinéraire", findExit: "Trouver la sortie",
    askAnything: "Posez votre question…", askFollowUp: "Une autre question…", askLabel: "Demander à l'assistant", more: "Plus", nearby: "À proximité", otherOptions: "Autres options", otherRoutes: "Autres itinéraires", bySubway: "Métro", byBus: "Bus", byWalk: "À pied", lessWalking: "Moins de marche", agentsWorking: "En cours", sendingSoon: "Envoi dans un instant",
    walkMeThere: "Guidez-moi à pied", inStation: "Êtes-vous dans la station ?", yes: "Oui", no: "Non", listening: "J'écoute", stopListening: "Arrêter l'écoute", closeAnswer: "Fermer la réponse", showAnswer: "Voir la réponse",
    changeTo: "Changez pour le {r}", skipped: "Ne s'arrête pas",
    walk: "À pied", transit: "Transports", drive: "Voiture", bus: "Bus", train: "Train", ferry: "Ferry", getOffAt: "Descendez à {s}", oneStop: "1 arrêt", nStops: "{n} arrêts", steps: "Étapes", sameTime: "même heure", plannedWork: "Travaux prévus", elevators: "Ascenseurs", weatherAlerts: "Alertes météo", onTheRoad: "Sur la route", rain: "pluie", remindMe: "Me rappeler", remindSaved: "Ajouté à votre calendrier. Rappel à {t}, 10 minutes avant le départ.", useMyLocation: "Utiliser ma position", findingYou: "Je vous cherche…", locationBlocked: "Impossible de trouver votre position. Écrivez une rue, un lieu ou une station.", askRestroom: "Où sont les toilettes publiques ouvertes les plus proches ?", askLine: "Comment circule le métro {r} en ce moment ?", askLines: "Comment circulent les lignes de métro en ce moment ?", askExit: "Quelle sortie prendre à la station de métro la plus proche ?", planPrefix: "Planifier un trajet vers ",
    arrivedAt: "Vous êtes arrivé à {p}", atPlace: "À {p}", done: "Terminé", whereAmI: "Où suis-je ?", typeWhatYouSee: "Écrivez ce que vous voyez, un panneau…",
  },
  ko: {
    restroom: "화장실", myTrain: "내 열차", planTrip: "경로 찾기", findExit: "출구 찾기",
    askAnything: "무엇이든 물어보세요…", askFollowUp: "이어서 물어보세요…", askLabel: "도우미에게 묻기", more: "더 보기", nearby: "근처 장소", otherOptions: "다른 방법", otherRoutes: "다른 경로", bySubway: "지하철", byBus: "버스", byWalk: "도보", lessWalking: "덜 걷기", agentsWorking: "처리 중", sendingSoon: "곧 보냅니다",
    walkMeThere: "걸어서 안내", inStation: "역 안에 계세요?", yes: "네", no: "아니요", listening: "듣고 있어요", stopListening: "듣기 중지", closeAnswer: "답변 닫기", showAnswer: "답변 보기",
    changeTo: "{r} 호선으로 환승", skipped: "정차 안 함",
    walk: "도보", transit: "대중교통", drive: "자동차", bus: "버스", train: "지하철", ferry: "페리", getOffAt: "{s}에서 내리기", oneStop: "1개 역", nStops: "{n}개 역", steps: "단계", sameTime: "같은 시간", plannedWork: "예정 공사", elevators: "엘리베이터", weatherAlerts: "기상 특보", onTheRoad: "도로 상황", rain: "비", remindMe: "알림 받기", remindSaved: "캘린더에 저장했어요. 출발 10분 전인 {t}에 알려 드려요.", useMyLocation: "내 위치 사용", findingYou: "위치 찾는 중…", locationBlocked: "위치를 가져올 수 없어요. 거리, 장소 또는 역 이름을 입력하세요.", askRestroom: "지금 열려 있는 가장 가까운 공중화장실이 어디예요?", askLine: "{r} 열차는 지금 어떻게 운행 중이에요?", askLines: "지하철 노선들은 지금 어떻게 운행 중이에요?", askExit: "가장 가까운 지하철역에서 어느 출구로 나가야 해요?", planPrefix: "길찾기: ",
    arrivedAt: "{p}에 도착했습니다", atPlace: "{p}", done: "완료", whereAmI: "여기가 어디예요?", typeWhatYouSee: "보이는 것을 입력하세요 (표지판 등)…",
  },
};

/** The app's text for a key in a language (English when missing). */
export function tr(lang: AppLang, key: Key): string {
  return T[lang][key] ?? T.en[key];
}

/** The app's text in the current language, re-rendering when it changes. */
export function useT(): (key: Key) => string {
  const lang = useAppLang();
  return (key) => tr(lang, key);
}
