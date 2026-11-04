import { useEffect, useRef } from "react";

export interface HandsFreeState {
  on: boolean;
  supported: boolean;
  listening: boolean;
  busy: boolean;
  speaking: boolean;
  /** Hands-free is holding the spoken language question, so the next turn answers that. */
  asking?: boolean;
  /** Bumped once that question is answered: open the mic again for the real question. */
  languagePicked?: number;
}

/** Listen again only when hands-free is on and nothing else is happening; the mic is never open while the app speaks. */
export function shouldListen(s: HandsFreeState): boolean {
  return s.on && s.supported && !s.listening && !s.busy && !s.speaking;
}

/** Errors that mean the mic will not work, so hands-free turns itself off instead of retrying. */
export const FATAL_MIC = /blocked|no microphone|could not start|isn't available/i;

/** How long after a listen ends with nothing sent before hands-free turns itself off. */
export const QUIET_OFF_MS = 900;

/**
 * Hands-free loop: listen → send → speak → listen. It only runs after the user
 * taps the toggle on. The mic opens again only after a question was sent; a
 * listen that hears nothing ends hands-free instead of reopening the mic
 * forever (owner report, 2026-10-25). Transcripts go straight to `send`;
 * nothing is stored or logged here.
 */
export function useHandsFree(s: HandsFreeState & { error: string | null; start: () => void; stop: () => void; turnOff: () => void }) {
  const listen = shouldListen(s);
  const { start, stop, turnOff, error, on, speaking, listening, busy } = s;
  // Armed: allowed to open the mic once. Turning on arms it; sending a question re-arms it for the reply.
  const armed = useRef(false);
  useEffect(() => { armed.current = on; }, [on]);
  // While the language question plays, or the rider is answering it, hands-free keeps its arm: the
  // answer to "which language?" is one turn and the real question is the next (#42). Re-arming has to
  // happen after the language turn's listen is consumed, so it keys on `asking` still being true once
  // the confirmation speech has finished, not only on the flip.
  const asking = !!s.asking;
  const picked = s.languagePicked ?? 0;
  useEffect(() => {
    if (!picked) return;
    armed.current = true; // the language is chosen; arm once more for the real question
  }, [picked]);
  // One question per tap (owner, 2026-10-25): once the agent takes the request, the mic closes and hands-free ends.
  useEffect(() => { if (busy && on) { stop(); turnOff(); } }, [busy, on, stop, turnOff]);
  useEffect(() => {
    if (!listen || !armed.current) return;
    // A short gap so the tail of the spoken answer is not picked up.
    const t = window.setTimeout(() => { armed.current = false; start(); }, 250);
    return () => window.clearTimeout(t);
  }, [listen, start]);
  // The mic closed and no question went out: nothing was heard, so hands-free ends.
  const wasListening = useRef(listening);
  useEffect(() => {
    const ended = wasListening.current && !listening;
    wasListening.current = listening;
    if (!ended || !on) return;
    // The answer to the language question does not send anything, so it would look like silence and
    // end hands-free before the rider ever asks their question (#42). Stay on while asking.
    const t = window.setTimeout(() => { if (!armed.current && !asking) turnOff(); }, QUIET_OFF_MS);
    return () => window.clearTimeout(t);
  }, [listening, on, turnOff, asking]);
  useEffect(() => {
    if (on && speaking && listening) stop();
  }, [on, speaking, listening, stop]);
  useEffect(() => {
    if (on && error && FATAL_MIC.test(error)) turnOff();
  }, [on, error, turnOff]);
}
