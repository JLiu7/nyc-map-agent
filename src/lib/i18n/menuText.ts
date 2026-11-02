import type { AppLang } from "@/lib/voice/langPref";
import { useAppLang } from "./appLang";

/**
 * The top menu row and its dropdowns (My day, Layers, Filters, Data, City data,
 * Settings), in the same language as the rest of the app's own text. Kept apart
 * from appLang.ts so the agent overlay does not carry the menu's words.
 */
type Key =
  | "myDay" | "layers" | "filters" | "data" | "cityData" | "settings" | "menus" | "moreMenus"
  | "liveTrains" | "liveBuses" | "restrooms" | "moreLayers"
  | "stationsOnly" | "busStops" | "streetNames" | "buildings3d" | "moreFilters"
  | "remembered" | "countOf" | "yourData" | "seeAll" | "nothingKept" | "dataPolicy" | "policyText" | "tapAgain" | "deleted" | "deleteEverything"
  | "rides" | "homeWork" | "chats" | "trips" | "exactLocation"
  | "crashes311" | "dataLayers" | "aboutData"
  | "language" | "thisPhone" | "speakAnswers" | "listenHeyMap" | "theme" | "auto" | "lighting" | "day" | "night"
  | "weather" | "live" | "clear" | "off" | "city3d" | "eco" | "advanced" | "model"
  | "today" | "yourRides" | "lookedUp" | "ridesPaused" | "noUsualLine" | "noNotices" | "checking"
  | "planHomeWork" | "saveHomeWork" | "tripsShowHere" | "tripsPaused" | "home" | "work";

const T: Record<AppLang, Record<Key, string>> = {
  en: {
    myDay: "My day", layers: "Layers", filters: "Filters", data: "Data", cityData: "City data", settings: "Settings", menus: "Menus", moreMenus: "More menus",
    liveTrains: "Live trains", liveBuses: "Live buses", restrooms: "Restrooms", moreLayers: "More layers",
    stationsOnly: "Stations only", busStops: "Bus stops", streetNames: "Street names", buildings3d: "3D buildings", moreFilters: "More filters",
    remembered: "Remembered", countOf: "{n} of {m}", yourData: "Your data", seeAll: "See all", nothingKept: "Nothing kept", dataPolicy: "Data policy",
    policyText: "What you save stays on this phone. Your location goes with a question only while you share it, and the AI model never gets it as numbers. Delete everything clears it all.", tapAgain: "Tap again to delete everything", deleted: "Deleted", deleteEverything: "Delete everything",
    rides: "Daily rides", homeWork: "Home & Work", chats: "Chats · 30 days", trips: "Trips looked up", exactLocation: "Exact location",
    crashes311: "311 and crashes", dataLayers: "Data layers", aboutData: "About the data",
    language: "Language", thisPhone: "This phone", speakAnswers: "Speak answers", listenHeyMap: "Listen for “Hey map”", theme: "Theme", auto: "Auto", lighting: "Lighting", day: "Day", night: "Night",
    weather: "Weather", live: "Live", clear: "Clear", off: "Off", city3d: "Textured 3D city", eco: "Eco mode", advanced: "Advanced", model: "Model",
    today: "Today", yourRides: "Your rides", lookedUp: "Looked up", ridesPaused: "Daily rides are paused", noUsualLine: "No usual line yet", noNotices: "No notices", checking: "Checking…",
    planHomeWork: "Plan a trip between Home and Work", saveHomeWork: "Save Home and Work to see them here", tripsShowHere: "Trips you plan show here", tripsPaused: "Trips looked up are paused",
    home: "Home", work: "Work",
  },
  es: {
    myDay: "Mi día", layers: "Capas", filters: "Filtros", data: "Datos", cityData: "Datos de la ciudad", settings: "Ajustes", menus: "Menús", moreMenus: "Más menús",
    liveTrains: "Trenes en vivo", liveBuses: "Autobuses en vivo", restrooms: "Baños", moreLayers: "Más capas",
    stationsOnly: "Solo estaciones", busStops: "Paradas de autobús", streetNames: "Nombres de calles", buildings3d: "Edificios 3D", moreFilters: "Más filtros",
    remembered: "Recordado", countOf: "{n} de {m}", yourData: "Tus datos", seeAll: "Ver todo", nothingKept: "Nada guardado", dataPolicy: "Política de datos",
    policyText: "Lo que guardas se queda en este teléfono. Tu ubicación va con una pregunta solo mientras la compartes, y el modelo de IA nunca la recibe en números. Borrar todo lo elimina todo.", tapAgain: "Toca otra vez para borrar todo", deleted: "Borrado", deleteEverything: "Borrar todo",
    rides: "Viajes diarios", homeWork: "Casa y trabajo", chats: "Chats · 30 días", trips: "Viajes buscados", exactLocation: "Ubicación exacta",
    crashes311: "311 y choques", dataLayers: "Capas de datos", aboutData: "Sobre los datos",
    language: "Idioma", thisPhone: "Este teléfono", speakAnswers: "Leer respuestas en voz alta", listenHeyMap: "Escuchar “Oye mapa”", theme: "Tema", auto: "Automático", lighting: "Luz", day: "Día", night: "Noche",
    weather: "Clima", live: "En vivo", clear: "Despejado", off: "Apagado", city3d: "Ciudad 3D con texturas", eco: "Modo ahorro", advanced: "Avanzado", model: "Modelo",
    today: "Hoy", yourRides: "Tus viajes", lookedUp: "Buscado", ridesPaused: "Viajes diarios en pausa", noUsualLine: "Aún no hay línea habitual", noNotices: "Sin avisos", checking: "Revisando…",
    planHomeWork: "Planea un viaje entre casa y trabajo", saveHomeWork: "Guarda casa y trabajo para verlos aquí", tripsShowHere: "Aquí aparecen los viajes que planees", tripsPaused: "Viajes buscados en pausa",
    home: "Casa", work: "Trabajo",
  },
  zh: {
    myDay: "我的一天", layers: "图层", filters: "筛选", data: "数据", cityData: "城市数据", settings: "设置", menus: "菜单", moreMenus: "更多菜单",
    liveTrains: "实时列车", liveBuses: "实时公交", restrooms: "厕所", moreLayers: "更多图层",
    stationsOnly: "只看车站", busStops: "公交站", streetNames: "街道名", buildings3d: "3D 建筑", moreFilters: "更多筛选",
    remembered: "已记住", countOf: "{n} / {m}", yourData: "你的数据", seeAll: "全部查看", nothingKept: "没有保存任何内容", dataPolicy: "数据政策",
    policyText: "你保存的内容只留在这部手机上。只有在你分享位置时，位置才会随问题发送，AI 模型永远拿不到具体坐标。“删除全部”会清除所有内容。", tapAgain: "再点一次删除全部", deleted: "已删除", deleteEverything: "删除全部",
    rides: "日常乘车", homeWork: "家和公司", chats: "对话 · 30 天", trips: "查过的行程", exactLocation: "精确位置",
    crashes311: "311 和交通事故", dataLayers: "数据图层", aboutData: "关于数据",
    language: "语言", thisPhone: "跟随手机", speakAnswers: "朗读回答", listenHeyMap: "听“嘿地图”", theme: "主题", auto: "自动", lighting: "光线", day: "白天", night: "夜晚",
    weather: "天气", live: "实时", clear: "晴天", off: "关闭", city3d: "带纹理的 3D 城市", eco: "省电模式", advanced: "高级", model: "模型",
    today: "今天", yourRides: "你的乘车", lookedUp: "查过的", ridesPaused: "日常乘车已暂停", noUsualLine: "还没有常坐的线路", noNotices: "没有通知", checking: "正在检查…",
    planHomeWork: "规划家和公司之间的行程", saveHomeWork: "保存家和公司后会显示在这里", tripsShowHere: "你规划的行程会显示在这里", tripsPaused: "查过的行程已暂停",
    home: "家", work: "公司",
  },
  ru: {
    myDay: "Мой день", layers: "Слои", filters: "Фильтры", data: "Данные", cityData: "Данные города", settings: "Настройки", menus: "Меню", moreMenus: "Другие меню",
    liveTrains: "Поезда сейчас", liveBuses: "Автобусы сейчас", restrooms: "Туалеты", moreLayers: "Ещё слои",
    stationsOnly: "Только станции", busStops: "Остановки автобусов", streetNames: "Названия улиц", buildings3d: "3D-здания", moreFilters: "Ещё фильтры",
    remembered: "Запомнено", countOf: "{n} из {m}", yourData: "Ваши данные", seeAll: "Показать всё", nothingKept: "Ничего не сохранено", dataPolicy: "Политика данных",
    policyText: "Сохранённое остаётся на этом телефоне. Ваше местоположение отправляется с вопросом, только пока вы им делитесь, а модель ИИ никогда не получает его координаты. «Удалить всё» стирает всё.", tapAgain: "Нажмите ещё раз, чтобы удалить всё", deleted: "Удалено", deleteEverything: "Удалить всё",
    rides: "Ежедневные поездки", homeWork: "Дом и работа", chats: "Чаты · 30 дней", trips: "Найденные маршруты", exactLocation: "Точное место",
    crashes311: "311 и аварии", dataLayers: "Слои данных", aboutData: "О данных",
    language: "Язык", thisPhone: "Как на телефоне", speakAnswers: "Озвучивать ответы", listenHeyMap: "Слушать «Эй, карта»", theme: "Тема", auto: "Авто", lighting: "Освещение", day: "День", night: "Ночь",
    weather: "Погода", live: "Сейчас", clear: "Ясно", off: "Выкл.", city3d: "3D-город с текстурами", eco: "Эко-режим", advanced: "Расширенные", model: "Модель",
    today: "Сегодня", yourRides: "Ваши поездки", lookedUp: "Вы искали", ridesPaused: "Ежедневные поездки на паузе", noUsualLine: "Пока нет обычной линии", noNotices: "Нет уведомлений", checking: "Проверяю…",
    planHomeWork: "Маршрут между домом и работой", saveHomeWork: "Сохраните дом и работу, чтобы видеть их здесь", tripsShowHere: "Здесь будут ваши маршруты", tripsPaused: "Найденные маршруты на паузе",
    home: "Дом", work: "Работа",
  },
  bn: {
    myDay: "আমার দিন", layers: "স্তর", filters: "ফিল্টার", data: "ডেটা", cityData: "শহরের ডেটা", settings: "সেটিংস", menus: "মেনু", moreMenus: "আরও মেনু",
    liveTrains: "লাইভ ট্রেন", liveBuses: "লাইভ বাস", restrooms: "টয়লেট", moreLayers: "আরও স্তর",
    stationsOnly: "শুধু স্টেশন", busStops: "বাস স্টপ", streetNames: "রাস্তার নাম", buildings3d: "3D ভবন", moreFilters: "আরও ফিল্টার",
    remembered: "মনে রাখা", countOf: "{m}টির মধ্যে {n}", yourData: "আপনার ডেটা", seeAll: "সব দেখুন", nothingKept: "কিছুই রাখা নেই", dataPolicy: "ডেটা নীতি",
    policyText: "আপনি যা সংরক্ষণ করেন তা এই ফোনেই থাকে। আপনি অবস্থান শেয়ার করলেই কেবল তা প্রশ্নের সঙ্গে যায়, আর AI মডেল কখনও এর স্থানাঙ্ক পায় না। “সব মুছুন” চাপলে সব মুছে যায়।", tapAgain: "সব মুছতে আবার চাপুন", deleted: "মুছে ফেলা হয়েছে", deleteEverything: "সব মুছুন",
    rides: "প্রতিদিনের যাত্রা", homeWork: "বাসা ও কাজ", chats: "চ্যাট · ৩০ দিন", trips: "খোঁজা যাত্রা", exactLocation: "সঠিক অবস্থান",
    crashes311: "311 ও দুর্ঘটনা", dataLayers: "ডেটা স্তর", aboutData: "ডেটা সম্পর্কে",
    language: "ভাষা", thisPhone: "এই ফোনের মতো", speakAnswers: "উত্তর বলে শোনান", listenHeyMap: "“হেই ম্যাপ” শুনুন", theme: "থিম", auto: "স্বয়ংক্রিয়", lighting: "আলো", day: "দিন", night: "রাত",
    weather: "আবহাওয়া", live: "লাইভ", clear: "পরিষ্কার", off: "বন্ধ", city3d: "টেক্সচারসহ 3D শহর", eco: "ইকো মোড", advanced: "উন্নত", model: "মডেল",
    today: "আজ", yourRides: "আপনার যাত্রা", lookedUp: "খোঁজা হয়েছে", ridesPaused: "প্রতিদিনের যাত্রা বিরত", noUsualLine: "এখনও নিয়মিত লাইন নেই", noNotices: "কোনো নোটিশ নেই", checking: "দেখছি…",
    planHomeWork: "বাসা ও কাজের মধ্যে যাত্রা পরিকল্পনা করুন", saveHomeWork: "এখানে দেখতে বাসা ও কাজ সংরক্ষণ করুন", tripsShowHere: "আপনার পরিকল্পিত যাত্রা এখানে দেখাবে", tripsPaused: "খোঁজা যাত্রা বিরত",
    home: "বাড়ি", work: "কাজ",
  },
  ht: {
    myDay: "Jounen mwen", layers: "Kouch", filters: "Filt", data: "Done", cityData: "Done vil la", settings: "Paramèt", menus: "Meni", moreMenus: "Plis meni",
    liveTrains: "Tren an dirèk", liveBuses: "Bis an dirèk", restrooms: "Twalèt", moreLayers: "Plis kouch",
    stationsOnly: "Estasyon sèlman", busStops: "Arè bis", streetNames: "Non lari", buildings3d: "Bilding 3D", moreFilters: "Plis filt",
    remembered: "Sa m sonje", countOf: "{n} sou {m}", yourData: "Done ou", seeAll: "Wè tout", nothingKept: "Pa gen anyen ki sere", dataPolicy: "Règ sou done",
    policyText: "Sa ou sere rete sou telefòn sa a. Pozisyon ou ale ak yon kesyon sèlman pandan w ap pataje l, e modèl AI a pa janm resevwa l an chif. \"Efase tout\" efase tout bagay.", tapAgain: "Peze ankò pou efase tout", deleted: "Efase", deleteEverything: "Efase tout",
    rides: "Vwayaj chak jou", homeWork: "Kay ak travay", chats: "Chat · 30 jou", trips: "Vwayaj ou chèche", exactLocation: "Kote egzak",
    crashes311: "311 ak aksidan", dataLayers: "Kouch done", aboutData: "Sou done yo",
    language: "Lang", thisPhone: "Menm jan ak telefòn nan", speakAnswers: "Li repons yo fò", listenHeyMap: "Koute “Hé kat”", theme: "Tèm", auto: "Otomatik", lighting: "Limyè", day: "Jou", night: "Nwit",
    weather: "Tan an", live: "An dirèk", clear: "Klè", off: "Etenn", city3d: "Vil 3D ak teksti", eco: "Mòd ekonomi", advanced: "Avanse", model: "Modèl",
    today: "Jodi a", yourRides: "Vwayaj ou", lookedUp: "Ou te chèche", ridesPaused: "Vwayaj chak jou an poz", noUsualLine: "Poko gen liy abityèl", noNotices: "Pa gen avi", checking: "M ap tcheke…",
    planHomeWork: "Planifye yon vwayaj ant kay ak travay", saveHomeWork: "Sere kay ak travay pou wè yo isit la", tripsShowHere: "Vwayaj ou planifye ap parèt isit la", tripsPaused: "Vwayaj ou chèche an poz",
    home: "Lakay", work: "Travay",
  },
  fr: {
    myDay: "Ma journée", layers: "Calques", filters: "Filtres", data: "Données", cityData: "Données de la ville", settings: "Réglages", menus: "Menus", moreMenus: "Plus de menus",
    liveTrains: "Trains en direct", liveBuses: "Bus en direct", restrooms: "Toilettes", moreLayers: "Plus de calques",
    stationsOnly: "Stations seulement", busStops: "Arrêts de bus", streetNames: "Noms de rues", buildings3d: "Bâtiments 3D", moreFilters: "Plus de filtres",
    remembered: "Mémorisé", countOf: "{n} sur {m}", yourData: "Vos données", seeAll: "Tout voir", nothingKept: "Rien de gardé", dataPolicy: "Politique des données",
    policyText: "Ce que vous enregistrez reste sur ce téléphone. Votre position part avec une question seulement tant que vous la partagez, et le modèle d’IA ne reçoit jamais ses coordonnées. « Tout effacer » supprime tout.", tapAgain: "Touchez encore pour tout effacer", deleted: "Effacé", deleteEverything: "Tout effacer",
    rides: "Trajets quotidiens", homeWork: "Maison et travail", chats: "Discussions · 30 jours", trips: "Trajets recherchés", exactLocation: "Position exacte",
    crashes311: "311 et accidents", dataLayers: "Calques de données", aboutData: "À propos des données",
    language: "Langue", thisPhone: "Comme le téléphone", speakAnswers: "Lire les réponses", listenHeyMap: "Écouter « Hé carte »", theme: "Thème", auto: "Auto", lighting: "Éclairage", day: "Jour", night: "Nuit",
    weather: "Météo", live: "En direct", clear: "Dégagé", off: "Désactivé", city3d: "Ville 3D texturée", eco: "Mode éco", advanced: "Avancé", model: "Modèle",
    today: "Aujourd'hui", yourRides: "Vos trajets", lookedUp: "Recherché", ridesPaused: "Trajets quotidiens en pause", noUsualLine: "Pas encore de ligne habituelle", noNotices: "Aucun avis", checking: "Vérification…",
    planHomeWork: "Planifier un trajet entre maison et travail", saveHomeWork: "Enregistrez maison et travail pour les voir ici", tripsShowHere: "Vos trajets planifiés apparaissent ici", tripsPaused: "Trajets recherchés en pause",
    home: "Domicile", work: "Travail",
  },
  ko: {
    myDay: "나의 하루", layers: "레이어", filters: "필터", data: "데이터", cityData: "도시 데이터", settings: "설정", menus: "메뉴", moreMenus: "더 많은 메뉴",
    liveTrains: "실시간 열차", liveBuses: "실시간 버스", restrooms: "화장실", moreLayers: "레이어 더 보기",
    stationsOnly: "역만 보기", busStops: "버스 정류장", streetNames: "거리 이름", buildings3d: "3D 건물", moreFilters: "필터 더 보기",
    remembered: "기억한 항목", countOf: "{m}개 중 {n}개", yourData: "내 데이터", seeAll: "모두 보기", nothingKept: "저장된 것 없음", dataPolicy: "데이터 정책",
    policyText: "저장한 내용은 이 휴대폰에만 남습니다. 위치는 공유하는 동안에만 질문과 함께 전송되며, AI 모델은 좌표를 받지 않습니다. '모두 삭제'를 누르면 전부 지워집니다.", tapAgain: "한 번 더 누르면 모두 삭제", deleted: "삭제됨", deleteEverything: "모두 삭제",
    rides: "매일 타는 노선", homeWork: "집과 직장", chats: "대화 · 30일", trips: "찾아본 경로", exactLocation: "정확한 위치",
    crashes311: "311 및 사고", dataLayers: "데이터 레이어", aboutData: "데이터 안내",
    language: "언어", thisPhone: "휴대폰 설정", speakAnswers: "답변 읽어 주기", listenHeyMap: "“헤이 맵” 듣기", theme: "테마", auto: "자동", lighting: "조명", day: "낮", night: "밤",
    weather: "날씨", live: "실시간", clear: "맑음", off: "끄기", city3d: "질감 있는 3D 도시", eco: "절약 모드", advanced: "고급", model: "모델",
    today: "오늘", yourRides: "내 노선", lookedUp: "찾아본 것", ridesPaused: "매일 타는 노선 기록 일시정지", noUsualLine: "아직 자주 타는 노선 없음", noNotices: "알림 없음", checking: "확인 중…",
    planHomeWork: "집과 직장 사이 경로 찾기", saveHomeWork: "집과 직장을 저장하면 여기에 보여요", tripsShowHere: "찾은 경로가 여기에 보여요", tripsPaused: "찾아본 경로 기록 일시정지",
    home: "집", work: "직장",
  },
};

export type MenuKey = Key;

/** The menu's text for a key; `{n}`-style holes are filled from `vars`. */
export function menuText(lang: AppLang, key: Key, vars?: Record<string, string | number>): string {
  const s = T[lang][key] ?? T.en[key];
  return vars ? s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? "")) : s;
}

/** The menu's text in the current app language, re-rendering when it changes. */
export function useMenuT(): (key: Key, vars?: Record<string, string | number>) => string {
  const lang = useAppLang();
  return (key, vars) => menuText(lang, key, vars);
}
