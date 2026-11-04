/**
 * Barge-in detector, used only while an answer is spoken in hands-free mode
 * (which the user turned on by tapping). It opens the mic with the browser's
 * echo cancellation so our own TTS is suppressed, and fires on a sustained
 * burst of speech-level energy. Audio is analysed in memory and never recorded,
 * stored, or sent anywhere; the mic is released as soon as it fires or stops.
 */

/** How long speech has to last before it counts as someone interrupting, in ms. */
export const BARGE_MS = 600;
/** How often the level is sampled, in ms. */
const TICK_MS = 50;

export async function startBargeIn(onSpeech: () => void): Promise<() => void> {
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  } catch {
    return () => {};
  }
  const ctx = new AudioContext();
  const an = ctx.createAnalyser();
  ctx.createMediaStreamSource(stream).connect(an);
  const buf = new Float32Array(an.fftSize);
  let floor = 0.02;
  let run = 0;
  const stop = () => {
    clearInterval(timer);
    stream.getTracks().forEach((t) => t.stop());
    void ctx.close().catch(() => {});
  };
  const timer = setInterval(() => {
    an.getFloatTimeDomainData(buf);
    const rms = Math.sqrt(buf.reduce((s, x) => s + x * x, 0) / buf.length);
    const speaking = isSpeech(rms, floor);
    run = speaking ? run + TICK_MS : 0;
    if (!run) floor = nextFloor(floor, rms); // track the residual noise floor
    if (run >= BARGE_MS) { stop(); onSpeech(); }
  }, TICK_MS);
  return stop;
}

/**
 * Speech-level energy relative to the tracked noise floor.
 *
 * The multiplier is deliberately wide. The mic stays open while our own voice is
 * playing, and echo cancellation leaks some of it back; at 3x the floor that leak
 * counted as speech, so an answer cut itself off mid-sentence (owner report,
 * 2026-11-01). Someone actually interrupting is louder than a leak, so requiring
 * 5x the floor keeps the rider's voice and drops the app's own.
 */
export const isSpeech = (rms: number, floor: number) => rms > Math.max(floor * 5, 0.05);

/**
 * Next background-level estimate, pure for tests. Quiet frames are followed
 * closely; loud ones creep the floor up slowly, so a passing train is absorbed
 * instead of holding the threshold above it forever.
 */
export const nextFloor = (floor: number, rms: number, speaking = false) =>
  speaking ? floor + (rms - floor) * 0.02 : floor * 0.9 + rms * 0.1;
