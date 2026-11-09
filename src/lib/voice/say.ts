import { formatStationName } from "@/lib/streetName";
import { kokoroLang, kokoroUp, speakKokoro } from "./kokoro";
import { speakQueued } from "./tts";

/**
 * Says `text` once and returns cancel; `onEnd` fires once, after the last sound, on cancel or on failure.
 * Station and street shorthand is read in full ("Times Square-42 Street"), then Kokoro speaks it where it
 * has a voice (#37); the browser voice takes every other language and any failure.
 */
export function say(text: string, lang: string, onEnd: () => void): () => void {
  const said = formatStationName(text);
  let inner: () => void = () => undefined;
  const browser = () => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) inner = speakQueued(window.speechSynthesis, said, onEnd, lang);
    else onEnd();
  };
  const k = kokoroUp() ? kokoroLang(said, lang) : null;
  if (k) inner = speakKokoro(said, k, onEnd, browser);
  else browser();
  return () => inner();
}
