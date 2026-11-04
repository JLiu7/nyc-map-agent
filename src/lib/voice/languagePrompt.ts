/**
 * The spoken language question that opens a hands-free conversation (#37, owner
 * request 2026-11-01).
 *
 * Hands-free starts a whole conversation, and until now the only signal for which
 * language to answer in was Whisper's guess at the first thing the rider said. One
 * misheard word then fixed the language for the entire conversation, and on a
 * borrowed voice the answer came out in a language nobody asked for. So each time
 * hands-free is turned on, the app asks first, out loud, naming every language in
 * its own script — the choice itself shows what that voice sounds like.
 *
 * Not once per device: the rider may hand the phone to someone else between
 * sessions, and a stale pick is exactly the failure this prevents.
 */
import { APP_LANGS, LANG_LABELS, type AppLang } from "./langPref";

/** The languages offered, in a stable order. Every supported language is offered. */
export const OFFERED: AppLang[] = [...APP_LANGS];

/**
 * One utterance per language: the language's own name, spoken in that language.
 * The prompt opens by asking, in the language the app is currently showing, so a
 * rider who already picked one hears the question in a language they know.
 *
 * Pure, for tests.
 */
export function languagePrompt(appLang: AppLang): Array<{ text: string; lang: AppLang }> {
  return [
    { text: "Which language?", lang: appLang },
    ...OFFERED.map((l) => ({ text: `${LANG_LABELS[l]}.`, lang: l })),
  ];
}

/**
 * Which language a spoken answer names, or null when it names none or two.
 * The rider answers with the name in their own language ("Español", "русский"),
 * so the match is on the label, case- and accent-insensitive. Pure, for tests.
 */
export function matchSpokenLanguage(heard: string, offered: AppLang[] = OFFERED): AppLang | null {
  const flat = heard
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const hits = offered.filter((l) => flat.includes(LANG_LABELS[l].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")));
  return hits.length === 1 ? hits[0] : null;
}

/** "English", "English or Español", "English, Español or 中文": a readback for a guess. */
export function languageList(langs: AppLang[]): string {
  const names = langs.map((l) => LANG_LABELS[l]);
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} or ${names.at(-1)}`;
}
