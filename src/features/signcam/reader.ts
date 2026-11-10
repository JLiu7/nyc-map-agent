/**
 * Reads the words in a camera frame, on the phone. The browser's own text
 * detector where it exists (Chrome, behind a flag today); otherwise
 * Tesseract.js, fetched the first time the camera opens. Nothing is sent
 * anywhere: the frame stays in memory and only the words come back.
 *
 * Prototype limit: Tesseract.js fetches its worker, engine and English data
 * (about 4.5 MB) from its CDN, so the first read needs signal. Saving them with
 * the station is the next step before this is any use below the street.
 */
export interface SignReader {
  kind: "built-in" | "tesseract";
  read(frame: HTMLCanvasElement): Promise<string>;
  stop(): void;
}

type Detector = { detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>> };

export async function openReader(): Promise<SignReader> {
  const Built = (globalThis as { TextDetector?: new () => Detector }).TextDetector;
  if (Built) {
    const d = new Built();
    return { kind: "built-in", read: async (frame) => (await d.detect(frame)).map((b) => b.rawValue).join(" "), stop: () => {} };
  }
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");
  return {
    kind: "tesseract",
    read: async (frame) => (await worker.recognize(frame)).data.text.replace(/\s+/g, " ").trim(),
    stop: () => void worker.terminate(),
  };
}

/** The frame is drawn no wider than this before it is read: wider only slows the read. */
export const FRAME_W = 960;
