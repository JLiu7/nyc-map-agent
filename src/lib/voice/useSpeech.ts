import { useCallback, useEffect, useRef, useState } from "react";
import { isBrave, isPhone, recordTurn, serverSttAvailable, transcribeTurn, type Recording } from "./serverStt";
import { startBargeIn } from "./bargeIn";
import { say } from "./say";

/** Silence after the last heard word that ends a turn. Long enough for mid-sentence pauses. */
const END_OF_TURN_MS = 1300;

/**
 * Minimal Web Speech API surface. The DOM lib does not ship these types
 * consistently, so they are declared locally and accessed defensively.
 */
interface SpeechAlternative {
  transcript: string;
}
interface SpeechResult {
  readonly length: number;
  isFinal: boolean;
  [index: number]: SpeechAlternative;
}
interface SpeechResultList {
  readonly length: number;
  [index: number]: SpeechResult;
}
interface SpeechResultEvent {
  resultIndex: number;
  results: SpeechResultList;
}
interface SpeechErrorEvent {
  error: string;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: ((event: SpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const candidate = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return (
    candidate.SpeechRecognition ?? candidate.webkitSpeechRecognition ?? null
  );
}

export interface UseSpeechOptions {
  onFinalTranscript: (text: string, heardLang?: string) => void;
  /** Recognition and spoken-answer language (BCP 47); default "en-US". */
  lang?: string;
  /** Let the server detect the spoken language (no language picked); the transcript callback gets it. */
  detectLang?: boolean;
}

export interface UseSpeechResult {
  sttSupported: boolean;
  listening: boolean;
  interim: string;
  error: string | null;
  clearError: () => void;
  startListening: () => void;
  stopListening: () => void;
  speak: (text: string, opts?: { bargeIn?: boolean; lang?: string; keep?: boolean }) => void;
  /** Speak several utterances in a row, each in its own language's voice (the language question). */
  speakSequence: (items: Array<{ text: string; lang: string }>) => void;
  stopSpeaking: () => void;
  speaking: boolean;
  muted: boolean;
  setMuted: (muted: boolean) => void;
}

export function useSpeech({
  onFinalTranscript,
  lang = "en-US",
  detectLang = false,
}: UseSpeechOptions): UseSpeechResult {
  const [sttSupported] = useState(() => getRecognitionCtor() !== null || serverSttAvailable());
  // Brave (and any browser whose recognizer fails with "network") records the turn and
  // transcribes it on our server instead.
  // Phones too: their recognizer only hears the app's language, so someone speaking another one got nonsense (2026-10-25).
  const serverModeRef = useRef(serverSttAvailable() && (isBrave() || isPhone() || getRecognitionCtor() === null));
  const recordingRef = useRef<Recording | null>(null);
  const retryOnServerRef = useRef(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const finalRef = useRef("");
  const interimRef = useRef("");
  const silenceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelSpeechRef = useRef<(() => void) | null>(null);
  const stopBargeRef = useRef<(() => void) | null>(null);
  const callbackRef = useRef(onFinalTranscript);
  callbackRef.current = onFinalTranscript;

  const startServerTurn = useCallback(() => {
    if (recordingRef.current) return;
    setError(null);
    setInterim("");
    setListening(true);
    recordTurn(END_OF_TURN_MS).then((rec) => {
      recordingRef.current = rec;
      void rec.done.then(async ({ blob, reason }) => {
        recordingRef.current = null;
        if (!blob) {
          setListening(false);
          if (reason === "no-speech") setError("I didn't catch that. Try again, a little closer to the mic.");
          return;
        }
        setInterim("…");
        const out = await transcribeTurn(blob, detectLang ? null : lang);
        setListening(false);
        setInterim("");
        if ("text" in out) { if (out.text) callbackRef.current(out.text, out.lang); return; }
        setError(out.error === "unavailable" ? "Voice isn't set up on this server yet. Type your question instead."
          : out.error === "busy" ? "Too many voice requests just now. Try again in a minute."
          : "I couldn't make that out. Try again, or type it.");
      });
    }).catch(() => {
      setListening(false);
      setError("Microphone access is blocked. Type your question instead.");
    });
  }, [lang, detectLang]);

  const startListening = useCallback(() => {
    if (serverModeRef.current) { startServerTurn(); return; }
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      setError("Speech recognition isn't available in this browser.");
      return;
    }
    if (recognitionRef.current) return;

    const recognition = new Ctor();
    recognition.lang = lang;
    // Continuous + our own silence window: Chrome's non-continuous mode ends the
    // turn at the first short pause, which cut people off mid-sentence.
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    finalRef.current = "";
    interimRef.current = "";
    setInterim("");
    setError(null);

    recognition.onresult = (event) => {
      let finalText = "";
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const transcript = result[0]?.transcript ?? "";
        if (result.isFinal) finalText += transcript;
        else interimText += transcript;
      }
      if (finalText) finalRef.current = `${finalRef.current} ${finalText}`.trim();
      interimRef.current = interimText.trim();
      const heard = `${finalRef.current} ${interimText}`.trim();
      setInterim(heard);
      if (silenceRef.current) clearTimeout(silenceRef.current);
      if (heard) silenceRef.current = setTimeout(() => recognition.stop(), END_OF_TURN_MS);
    };

    recognition.onerror = (event) => {
      if (event.error === "aborted") return;
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setError("Microphone access is blocked — type your question instead.");
      } else if (event.error === "no-speech") {
        setError("I didn't catch that. Try again, a little closer to the mic.");
      } else if (event.error === "audio-capture") {
        setError("No microphone was found. You can still type your question.");
      } else if (event.error === "network" && serverSttAvailable()) {
        // The browser's speech service is blocked (Brave): switch to our server and retry this turn.
        serverModeRef.current = true;
        retryOnServerRef.current = true;
      } else {
        setError(`Speech recognition failed (${event.error}).`);
      }
    };

    recognition.onend = () => {
      if (silenceRef.current) clearTimeout(silenceRef.current);
      recognitionRef.current = null;
      setListening(false);
      setInterim("");
      // Keep words still marked interim when the engine ends the session.
      const transcript = `${finalRef.current} ${interimRef.current}`.replace(/\s+/g, " ").trim();
      finalRef.current = "";
      interimRef.current = "";
      if (transcript) callbackRef.current(transcript);
      if (retryOnServerRef.current) { retryOnServerRef.current = false; startServerTurn(); }
    };

    recognition.onstart = () => setListening(true);

    try {
      recognition.start();
      recognitionRef.current = recognition;
      setListening(true);
    } catch {
      setError("Could not start the microphone.");
    }
  }, [lang, startServerTurn]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    recordingRef.current?.stop();
  }, []);

  const stopSpeaking = useCallback(() => {
    stopBargeRef.current?.();
    stopBargeRef.current = null;
    cancelSpeechRef.current?.();
    cancelSpeechRef.current = null;
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    setSpeaking(false);
  }, []);

  const speak = useCallback(
    (text: string, opts?: { bargeIn?: boolean; lang?: string; keep?: boolean }) => {
      if (muted) return;
      if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
      stopSpeaking();
      // Never let the recognizer hear our own voice (and drop anything half-heard).
      finalRef.current = "";
      interimRef.current = "";
      recognitionRef.current?.abort();
      setSpeaking(true);
      const end = () => {
        if (cancelSpeechRef.current === cancel) cancelSpeechRef.current = null;
        stopBargeRef.current?.();
        stopBargeRef.current = null;
        setSpeaking(false);
      };
      let inner: () => void = () => undefined;
      const cancel = () => inner();
      inner = say(text, opts?.lang ?? lang, end, opts?.keep);
      cancelSpeechRef.current = cancel;
      if (opts?.bargeIn) {
        // Only in hands-free (tap-started): an echo-cancelled detector so talking over the answer stops it.
        void startBargeIn(() => { if (cancelSpeechRef.current === cancel) stopSpeaking(); }).then((stop) => {
          if (cancelSpeechRef.current === cancel) stopBargeRef.current = stop;
          else stop();
        });
      }
    },
    [muted, stopSpeaking, lang],
  );

  // The language question says each name in that language's own voice, one after another, so the
  // rider hears what each voice sounds like before picking. Silence between names keeps them apart.
  const speakSequence = useCallback(
    (items: Array<{ text: string; lang: string }>) => {
      if (muted) return;
      if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
      stopSpeaking();
      finalRef.current = "";
      interimRef.current = "";
      recognitionRef.current?.abort();
      setSpeaking(true);
      const synth = window.speechSynthesis;
      const voices = synth.getVoices();
      // Hold every utterance: Chrome can GC one mid-speech and never fire onend.
      const held: SpeechSynthesisUtterance[] = [];
      let i = 0;
      const next = () => {
        if (i >= items.length) { setSpeaking(false); cancelSpeechRef.current = null; return; }
        const item = items[i++];
        const u = new SpeechSynthesisUtterance(item.text);
        const voice = voices.find((v) => v.lang.toLowerCase().startsWith(item.lang.toLowerCase()));
        if (voice) u.voice = voice;
        u.lang = voice?.lang ?? item.lang;
        u.rate = 0.98;
        u.onend = () => setTimeout(next, 220);
        u.onerror = () => setTimeout(next, 120);
        held.push(u);
        synth.speak(u);
      };
      cancelSpeechRef.current = () => { i = items.length; synth.cancel(); setSpeaking(false); };
      next();
    },
    [muted, stopSpeaking],
  );

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      recordingRef.current?.stop();
      if (silenceRef.current) clearTimeout(silenceRef.current);
      stopBargeRef.current?.();
      cancelSpeechRef.current?.();
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return {
    sttSupported,
    listening,
    interim,
    error,
    clearError,
    startListening,
    stopListening,
    speak,
    speakSequence,
    stopSpeaking,
    speaking,
    muted,
    setMuted,
  };
}
