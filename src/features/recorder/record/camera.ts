/**
 * The camera for the recorder page: the back camera, video only (no
 * microphone). Each call asks the browser again; it prompts only while the
 * camera has not been allowed yet.
 */
export type CameraResult = { ok: true; stream: MediaStream } | { ok: false; why: string };

export async function openBackCamera(): Promise<CameraResult> {
  if (!navigator.mediaDevices?.getUserMedia) return { ok: false, why: "This browser cannot open a camera here. Open the page over https in Safari or Chrome." };
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    return { ok: true, stream };
  } catch (e) {
    const name = e instanceof DOMException ? e.name : "";
    if (name === "NotAllowedError") return { ok: false, why: "The camera is blocked. Allow it for this site, then try again." };
    if (name === "NotFoundError" || name === "OverconstrainedError") return { ok: false, why: "No camera found on this device." };
    return { ok: false, why: "The camera could not start. Close other apps using it, then try again." };
  }
}

export function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((t) => t.stop());
}
