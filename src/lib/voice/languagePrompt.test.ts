import { describe, expect, it } from "vitest";
import { LANG_LABELS } from "./langPref";
import { languageList, languagePrompt, matchSpokenLanguage, OFFERED } from "./languagePrompt";

describe("languagePrompt", () => {
  it("asks first, in the language the app is already showing", () => {
    expect(languagePrompt("es")[0]).toEqual({ text: "Which language?", lang: "es" });
  });

  it("offers every supported language, each spoken in its own voice", () => {
    const rest = languagePrompt("en").slice(1);
    expect(rest.map((r) => r.lang)).toEqual(OFFERED);
    // Each name is spoken by that language's own voice, so the choice demonstrates the voice.
    expect(rest.every((r, i) => r.lang === OFFERED[i])).toBe(true);
    expect(rest[0]).toEqual({ text: "English.", lang: "en" });
  });

  it("speaks the question in the app's own language, then every name in its own", () => {
    expect(languagePrompt("xx" as never)[0].lang).toBe("xx");
    expect(languagePrompt("ko").length).toBe(1 + OFFERED.length);
  });
});

describe("matchSpokenLanguage", () => {
  it("hears a language named in its own script", () => {
    expect(matchSpokenLanguage("Español")).toBe("es");
    expect(matchSpokenLanguage("中文")).toBe("zh");
    expect(matchSpokenLanguage("한국어")).toBe("ko");
  });

  it("ignores case and accents, and a sentence around the name", () => {
    expect(matchSpokenLanguage("espanol please")).toBe("es");
    expect(matchSpokenLanguage("I said FRANÇAIS")).toBe("fr");
  });

  it("returns null when it hears no language, or two", () => {
    expect(matchSpokenLanguage("I want to go to Queens")).toBeNull();
    expect(matchSpokenLanguage("English or Español")).toBeNull();
  });

  it("only offers the languages it was given", () => {
    expect(matchSpokenLanguage("Español", ["en"])).toBeNull();
  });
});

describe("languageList", () => {
  it("reads one, two or many names", () => {
    expect(languageList(["en"])).toBe("English");
    expect(languageList(["en", "es"])).toBe("English or Español");
    expect(languageList(["en", "es", "zh"])).toBe("English, Español or 中文");
  });

  it("covers every label without an undefined", () => {
    for (const l of OFFERED) expect(languageList([l])).toBe(LANG_LABELS[l]);
  });
});
