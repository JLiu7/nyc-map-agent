/**
 * The words for pinning down where someone is inside a station (#143): the tap questions, their
 * answers, and where the answers put them. In the app's eight languages, so they work with no
 * network. Street and line names stay as the map writes them; English is the fallback.
 */
import type { AppLang } from "@/lib/voice/langPref";
import type { Answer, Question, Spot } from "@/lib/map/stationPlace";

type Key =
  | "qWhere" | "platform" | "stair" | "hall" | "gates" | "street"
  | "qDown" | "qUp" | "n0" | "n1" | "n2" | "n2plus" | "n3plus"
  | "qPaid" | "inside" | "outside"
  | "qSign"
  | "atPlatform" | "atStair" | "atHallIn" | "atHallOut" | "atHall" | "atGates" | "atStreet" | "bySign"
  | "likely" | "bestGuess" | "back" | "then" | "showMe" | "notThere" | "noSign" | "noSignNear";

const T: Record<AppLang, Record<Key, string>> = {
  en: {
    qWhere: "Where are you standing?", platform: "Platform", stair: "Stairs", hall: "Passage or hall", gates: "By the turnstiles", street: "Street",
    qDown: "From the train platform, how many flights of stairs have you gone down?", qUp: "And how many flights up?", n0: "None", n1: "One", n2: "Two", n2plus: "Two or more", n3plus: "Three or more",
    qPaid: "Have you gone out through the turnstiles yet?", inside: "No, still inside", outside: "Yes, I'm out",
    qSign: "What does the nearest sign say? Type its words, like the streets on an Exit sign.",
    atPlatform: "on the {l} platform", atStair: "on a stairway", atHallIn: "in a passage inside the turnstiles", atHallOut: "in a passage outside the turnstiles", atHall: "in a passage", atGates: "by the turnstiles", atStreet: "at a street exit", bySign: "near the sign for {w}",
    likely: "You're most likely {p}.", bestGuess: "I can't be sure, but my best guess is you're {p}.", back: "Turn around and walk back about {n} m.", then: "Then:",
    showMe: "Show me", notThere: "Not there", noSign: "I don't know that sign in this station.", noSignNear: "No sign nearby",
  },
  es: {
    qWhere: "¿Dónde estás parado?", platform: "Andén", stair: "Escaleras", hall: "Pasillo o vestíbulo", gates: "Junto a los torniquetes", street: "Calle",
    qDown: "Desde el andén del tren, ¿cuántos tramos de escaleras has bajado?", qUp: "¿Y cuántos has subido?", n0: "Ninguno", n1: "Uno", n2: "Dos", n2plus: "Dos o más", n3plus: "Tres o más",
    qPaid: "¿Ya pasaste por los torniquetes hacia afuera?", inside: "No, sigo adentro", outside: "Sí, ya salí",
    qSign: "¿Qué dice el letrero más cercano? Escribe sus palabras, como las calles de un letrero Exit.",
    atPlatform: "en el andén del {l}", atStair: "en una escalera", atHallIn: "en un pasillo dentro de los torniquetes", atHallOut: "en un pasillo fuera de los torniquetes", atHall: "en un pasillo", atGates: "junto a los torniquetes", atStreet: "en una salida a la calle", bySign: "cerca del letrero de {w}",
    likely: "Lo más probable es que estés {p}.", bestGuess: "No estoy seguro, pero creo que estás {p}.", back: "Date la vuelta y camina unos {n} m hacia atrás.", then: "Luego:",
    showMe: "Muéstrame", notThere: "No estoy ahí", noSign: "No conozco ese letrero en esta estación.", noSignNear: "No hay letreros cerca",
  },
  zh: {
    qWhere: "你现在站在哪里？", platform: "站台", stair: "楼梯", hall: "通道或大厅", gates: "闸机旁", street: "街上",
    qDown: "从列车站台算起，你往下走了几段楼梯？", qUp: "往上走了几段？", n0: "没有", n1: "一段", n2: "两段", n2plus: "两段或更多", n3plus: "三段或更多",
    qPaid: "你已经从闸机出去了吗？", inside: "没有，还在里面", outside: "是，已经出来了",
    qSign: "最近的指示牌上写着什么？输入上面的字，比如 Exit 指示牌上的街名。",
    atPlatform: "在 {l} 站台上", atStair: "在楼梯上", atHallIn: "在闸机内的通道里", atHallOut: "在闸机外的通道里", atHall: "在通道里", atGates: "在闸机旁", atStreet: "在通往街道的出口", bySign: "靠近 {w} 的指示牌",
    likely: "你很可能{p}。", bestGuess: "我不能确定，但我猜你{p}。", back: "转身往回走大约 {n} 米。", then: "然后：",
    showMe: "给我看", notThere: "不在那里", noSign: "我在这个车站找不到这个指示牌。", noSignNear: "附近没有指示牌",
  },
  ru: {
    qWhere: "Где вы стоите?", platform: "Платформа", stair: "Лестница", hall: "Переход или зал", gates: "У турникетов", street: "Улица",
    qDown: "Сколько лестничных пролётов вы спустились от платформы?", qUp: "А сколько поднялись?", n0: "Ни одного", n1: "Один", n2: "Два", n2plus: "Два или больше", n3plus: "Три или больше",
    qPaid: "Вы уже вышли через турникеты?", inside: "Нет, ещё внутри", outside: "Да, вышел",
    qSign: "Что написано на ближайшей табличке? Напишите её слова, например улицы на табличке Exit.",
    atPlatform: "на платформе {l}", atStair: "на лестнице", atHallIn: "в переходе за турникетами", atHallOut: "в переходе перед турникетами", atHall: "в переходе", atGates: "у турникетов", atStreet: "у выхода на улицу", bySign: "рядом с табличкой {w}",
    likely: "Скорее всего, вы {p}.", bestGuess: "Точно не скажу, но, похоже, вы {p}.", back: "Развернитесь и пройдите назад около {n} м.", then: "Потом:",
    showMe: "Показать", notThere: "Я не там", noSign: "Я не знаю такой таблички на этой станции.", noSignNear: "Рядом нет табличек",
  },
  bn: {
    qWhere: "আপনি কোথায় দাঁড়িয়ে আছেন?", platform: "প্ল্যাটফর্ম", stair: "সিঁড়ি", hall: "করিডোর বা হল", gates: "টার্নস্টাইলের পাশে", street: "রাস্তা",
    qDown: "ট্রেনের প্ল্যাটফর্ম থেকে কয় দফা সিঁড়ি নিচে নেমেছেন?", qUp: "আর কয় দফা উপরে উঠেছেন?", n0: "একটাও না", n1: "এক", n2: "দুই", n2plus: "দুই বা বেশি", n3plus: "তিন বা বেশি",
    qPaid: "আপনি কি টার্নস্টাইল দিয়ে বেরিয়ে গেছেন?", inside: "না, এখনো ভেতরে", outside: "হ্যাঁ, বেরিয়েছি",
    qSign: "কাছের সাইনে কী লেখা? লেখাটা টাইপ করুন, যেমন Exit সাইনের রাস্তার নাম।",
    atPlatform: "{l} প্ল্যাটফর্মে", atStair: "সিঁড়িতে", atHallIn: "টার্নস্টাইলের ভেতরের করিডোরে", atHallOut: "টার্নস্টাইলের বাইরের করিডোরে", atHall: "করিডোরে", atGates: "টার্নস্টাইলের পাশে", atStreet: "রাস্তার এক্সিটে", bySign: "{w} সাইনের কাছে",
    likely: "আপনি সম্ভবত {p} আছেন।", bestGuess: "নিশ্চিত নই, তবে মনে হয় আপনি {p} আছেন।", back: "ঘুরে প্রায় {n} মি পেছনে হাঁটুন।", then: "তারপর:",
    showMe: "দেখান", notThere: "ওখানে নেই", noSign: "এই স্টেশনে এই সাইনটা চিনি না।", noSignNear: "কাছে কোনো সাইন নেই",
  },
  ht: {
    qWhere: "Ki kote w kanpe?", platform: "Platfòm", stair: "Eskalye", hall: "Koridò oswa sal", gates: "Bò baryè yo", street: "Lari",
    qDown: "Depi platfòm tren an, konbyen eskalye ou desann?", qUp: "E konbyen ou monte?", n0: "Okenn", n1: "Youn", n2: "De", n2plus: "De oswa plis", n3plus: "Twa oswa plis",
    qPaid: "Èske ou deja pase baryè yo pou soti?", inside: "Non, m toujou anndan", outside: "Wi, m soti",
    qSign: "Kisa pankat ki pi pre a di? Tape mo yo, tankou non lari sou yon pankat Exit.",
    atPlatform: "sou platfòm {l} la", atStair: "nan yon eskalye", atHallIn: "nan yon koridò anndan baryè yo", atHallOut: "nan yon koridò deyò baryè yo", atHall: "nan yon koridò", atGates: "bò baryè yo", atStreet: "bò yon sòti sou lari", bySign: "pre pankat {w} la",
    likely: "Ou plis sanble {p}.", bestGuess: "M pa sèten, men m panse ou {p}.", back: "Vire do w epi mache tounen anviwon {n} m.", then: "Apre:",
    showMe: "Montre m", notThere: "M pa la", noSign: "M pa konnen pankat sa a nan estasyon sa a.", noSignNear: "Pa gen pankat toupre",
  },
  fr: {
    qWhere: "Où êtes-vous ?", platform: "Quai", stair: "Escalier", hall: "Couloir ou hall", gates: "Près des tourniquets", street: "Rue",
    qDown: "Depuis le quai du train, combien de volées d'escalier avez-vous descendues ?", qUp: "Et combien montées ?", n0: "Aucune", n1: "Une", n2: "Deux", n2plus: "Deux ou plus", n3plus: "Trois ou plus",
    qPaid: "Êtes-vous déjà sorti par les tourniquets ?", inside: "Non, encore dedans", outside: "Oui, je suis sorti",
    qSign: "Que dit le panneau le plus proche ? Tapez ses mots, comme les rues d'un panneau Exit.",
    atPlatform: "sur le quai du {l}", atStair: "dans un escalier", atHallIn: "dans un couloir côté quais, avant les tourniquets", atHallOut: "dans un couloir après les tourniquets", atHall: "dans un couloir", atGates: "près des tourniquets", atStreet: "à une sortie sur la rue", bySign: "près du panneau {w}",
    likely: "Vous êtes très probablement {p}.", bestGuess: "Je ne suis pas sûr, mais vous êtes sans doute {p}.", back: "Faites demi-tour et revenez d'environ {n} m.", then: "Ensuite :",
    showMe: "Montrer", notThere: "Pas là", noSign: "Je ne connais pas ce panneau dans cette station.", noSignNear: "Pas de panneau près de moi",
  },
  ko: {
    qWhere: "지금 어디에 서 계세요?", platform: "승강장", stair: "계단", hall: "통로나 홀", gates: "개찰구 옆", street: "거리",
    qDown: "열차 승강장에서 계단을 몇 번 내려가셨어요?", qUp: "그리고 몇 번 올라가셨어요?", n0: "없음", n1: "한 번", n2: "두 번", n2plus: "두 번 이상", n3plus: "세 번 이상",
    qPaid: "개찰구를 이미 나가셨어요?", inside: "아니요, 아직 안이에요", outside: "네, 나왔어요",
    qSign: "가장 가까운 표지판에 뭐라고 쓰여 있나요? Exit 표지판의 거리 이름처럼 그대로 입력해 주세요.",
    atPlatform: "{l} 승강장", atStair: "계단", atHallIn: "개찰구 안쪽 통로", atHallOut: "개찰구 바깥 통로", atHall: "통로", atGates: "개찰구 옆", atStreet: "거리로 나가는 출구", bySign: "{w} 표지판 근처",
    likely: "아마 {p}에 계실 거예요.", bestGuess: "확실하진 않지만 {p}에 계신 것 같아요.", back: "돌아서서 약 {n} m 되돌아가세요.", then: "그다음:",
    showMe: "보여 주기", notThere: "거기 아니에요", noSign: "이 역에서 그 표지판은 모르겠어요.", noSignNear: "근처에 표지판이 없어요",
  },
};

const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w)\}/g, (m, k: string) => (k in v ? String(v[k]) : m));
export function placeT(lang: AppLang, key: Key, v: Record<string, string | number> = {}): string {
  return fill(T[lang]?.[key] ?? T.en[key], v);
}

/** The question in words. */
export function questionText(q: Question, lang: AppLang): string {
  return placeT(lang, q === "where" ? "qWhere" : q === "down" ? "qDown" : q === "up" ? "qUp" : q === "paid" ? "qPaid" : "qSign");
}

/** A tap answer's button label. */
export function answerLabel(a: Exclude<Answer, { q: "sign" }>, lang: AppLang): string {
  if (a.q === "where") return placeT(lang, a.a);
  if (a.q === "paid") return placeT(lang, a.a ? "inside" : "outside");
  if (a.a === 0) return placeT(lang, "n0");
  if (a.a === 1) return placeT(lang, "n1");
  if (a.q === "down") return placeT(lang, "n2plus");
  return placeT(lang, a.a === 2 ? "n2" : "n3plus");
}

/** Where a spot is, in words: "on the 4 5 platform, near the sign for Fulton St & Broadway". */
export function spotText(spot: Spot, signWords: string | null, lines: string, lang: AppLang): string {
  const at =
    spot.kind === "platform" ? placeT(lang, "atPlatform", { l: lines })
    : spot.kind === "stair" ? placeT(lang, "atStair")
    : spot.kind === "street" ? placeT(lang, "atStreet")
    : spot.gates ? placeT(lang, "atGates")
    : spot.paid === true ? placeT(lang, "atHallIn")
    : spot.paid === false ? placeT(lang, "atHallOut")
    : placeT(lang, "atHall");
  return signWords ? `${at}, ${placeT(lang, "bySign", { w: signWords })}` : at;
}
