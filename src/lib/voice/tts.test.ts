import { describe, expect, it, vi } from "vitest";
import { chunkText, pickVoice, speakQueued, spokenSummary, voiceFor } from "./tts";
import { isSpeech } from "./bargeIn";

describe("chunkText", () => {
  it("splits per sentence and caps chunk length", () => {
    const long = "Take the 1 train uptown, transfer at 72 St, walk two blocks west along a very long avenue that keeps going and going for quite a while past many shops and cafés, then turn right onto the side street.";
    const chunks = chunkText(`Hi there. ${long} Done!`, 80);
    expect(chunks[0]).toBe("Hi there.");
    expect(chunks.at(-1)).toBe("Done!");
    expect(chunks.every((c) => c.length <= 81)).toBe(true);
    expect(chunks.join(" ").replace(/\s+/g, " ")).toContain("turn right onto the side street.");
  });
  it("handles empty input", () => expect(chunkText("  ")).toEqual([]));
});

describe("spokenSummary", () => {
  it("keeps short answers whole", () => expect(spokenSummary("Use the stairs at 7 Av.")).toBe("Use the stairs at 7 Av."));
  it("shortens long answers and points to the screen", () => {
    const s = spokenSummary("First sentence here is fairly long and useful. " + "More detail follows. ".repeat(30));
    expect(s.length).toBeLessThan(300);
    expect(s).toMatch(/details are on screen\.$/);
  });
  it("does not end a Nepali answer in English", () => {
    const s = spokenSummary("सबैभन्दा नजिकको शौचालय यहाँ छ। " + "थप विवरण यहाँ छ। ".repeat(30));
    expect(s).not.toMatch(/details are on screen/);
    expect(s.length).toBeLessThan(300);
  });
  it("strips markdown", () => expect(spokenSummary("**Take** the [A](http://x) train.")).toBe("Take the A train."));
});

describe("pickVoice", () => {
  it("prefers a natural en-US voice", () => {
    const v = [{ lang: "fr-FR", name: "Amelie" }, { lang: "en-US", name: "Fred" }, { lang: "en-US", name: "Google US English" }] as SpeechSynthesisVoice[];
    expect(pickVoice(v)?.name).toBe("Google US English");
  });
  it("picks a voice in the browser's language, region first (#370)", () => {
    const v = [{ lang: "en-US", name: "Fred" }, { lang: "es-ES", name: "Monica" }, { lang: "es-MX", name: "Paulina" }] as SpeechSynthesisVoice[];
    expect(pickVoice(v, "es-MX")?.name).toBe("Paulina");
    expect(pickVoice(v, "es-US")?.name).toBe("Monica");
    expect(pickVoice(v, "zh-CN")).toBeUndefined();
  });
});

describe("voiceFor", () => {
  const v = [{ lang: "en-US", name: "Samantha" }, { lang: "hi-IN", name: "Lekha" }, { lang: "es-ES", name: "Monica" }] as SpeechSynthesisVoice[];
  const nepali = "तपाईं कहाँबाट हिँड्नुहुन्छ?";
  it("reads a Nepali answer in a Hindi voice, not the English one", () => {
    expect(voiceFor(v, nepali, "en-US")).toEqual({ voice: v[1], lang: "hi-IN" });
  });
  it("borrows the Hindi voice when Nepali was heard but no Nepali voice exists", () => {
    expect(voiceFor(v, nepali, "ne")).toEqual({ voice: v[1], lang: "hi-IN" });
  });
  it("keeps the asked language when the text is in its letters", () => {
    expect(voiceFor(v, "Toma el tren A.", "es-ES").voice?.name).toBe("Monica");
    expect(voiceFor(v, "Take the A train.").voice?.name).toBe("Samantha");
  });
  it("reads an English answer that names a Chinese button in the English voice", () => {
    expect(voiceFor(v, "I need a starting point. Tap 使用我的位置 under my reply.", "en-US")).toEqual({ voice: v[0], lang: "en-US" });
  });
});

describe("speakQueued", () => {
  it("speaks every chunk in order, waits for voices, and ends once", async () => {
    vi.useFakeTimers();
    const said: string[] = [];
    const listeners: Array<() => void> = [];
    let voices: SpeechSynthesisVoice[] = [];
    const synth = {
      speaking: false, paused: false,
      cancel: vi.fn(), pause: vi.fn(), resume: vi.fn(),
      getVoices: () => voices,
      addEventListener: (_: string, f: () => void) => listeners.push(f),
      removeEventListener: () => {},
      speak: (u: { text: string; onend?: () => void }) => { said.push(u.text); setTimeout(() => u.onend?.(), 10); },
    } as unknown as SpeechSynthesis;
    globalThis.SpeechSynthesisUtterance = class { text: string; constructor(t: string) { this.text = t; } } as unknown as typeof SpeechSynthesisUtterance;
    const onEnd = vi.fn();
    speakQueued(synth, "One. Two. Three.", onEnd);
    expect(said).toEqual([]); // voices not loaded yet
    voices = [{ lang: "en-US", name: "Samantha" } as SpeechSynthesisVoice];
    listeners.forEach((f) => f());
    await vi.advanceTimersByTimeAsync(100);
    expect(said).toEqual(["One.", "Two.", "Three."]);
    expect(onEnd).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
  it("cancel stops the queue", async () => {
    const said: string[] = [];
    const synth = { speaking: true, paused: false, cancel: vi.fn(), pause() {}, resume() {}, getVoices: () => [{ lang: "en-US", name: "x" }], speak: (u: { text: string }) => said.push(u.text) } as unknown as SpeechSynthesis;
    const onEnd = vi.fn();
    const cancel = speakQueued(synth, "A. B.", onEnd);
    await Promise.resolve();
    cancel();
    expect(said).toEqual(["A."]);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });
});

describe("barge-in VAD", () => {
  it("accumulates only above the noise floor", () => {
    expect(isSpeech(0.02, 0.01)).toBe(false);
    expect(isSpeech(0.08, 0.01)).toBe(true);
    expect(isSpeech(0.08, 0.05)).toBe(false);
  });
});
