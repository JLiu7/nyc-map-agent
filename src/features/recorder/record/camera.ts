/**
 * The camera for the recorder page: video only (no microphone). It opens the
 * back camera unless the rider chose another one with the switch control
 * (#223); that choice is kept on the device. Each call asks the browser again;
 * it prompts only while the camera has not been allowed yet.
 */
export type CameraResult = { ok: true; stream: MediaStream; deviceId: string | null } | { ok: false; why: string };
export type Camera = { deviceId: string; label: string };

/** Where the chosen camera's id is kept on this device. */
const CAMERA_KEY = "nma.recorderCamera";
const SIZE = { width: { ideal: 1280 }, height: { ideal: 720 } };

/** The camera after `current` in the device's list, wrapping round; null when there is nothing to switch to. */
export function nextCamera(devices: { deviceId: string }[], current: string | null): string | null {
  if (devices.length < 2) return null;
  const at = devices.findIndex((d) => d.deviceId === current);
  return devices[(at + 1) % devices.length].deviceId;
}

/** What to call the live camera on screen: the browser's name for it without the hardware code, or its place in the list. */
export function cameraName(devices: Camera[], current: string | null): string {
  const at = devices.findIndex((d) => d.deviceId === current);
  if (at < 0) return "";
  return devices[at].label.replace(/\s*\([0-9a-f]{4}:[0-9a-f]{4}\)\s*$/i, "").trim() || `Camera ${at + 1}`;
}

/** The device's cameras. Browsers give ids and names only once the camera is allowed, so call this after a stream has opened. */
export async function listCameras(): Promise<Camera[]> {
  try {
    const all = (await navigator.mediaDevices?.enumerateDevices?.()) ?? [];
    return all.filter((d) => d.kind === "videoinput" && d.deviceId).map((d) => ({ deviceId: d.deviceId, label: d.label }));
  } catch {
    return [];
  }
}

export function rememberedCamera(): string | null {
  try {
    return localStorage.getItem(CAMERA_KEY);
  } catch {
    return null;
  }
}

export function rememberCamera(deviceId: string | null): void {
  try {
    if (deviceId) localStorage.setItem(CAMERA_KEY, deviceId);
    else localStorage.removeItem(CAMERA_KEY);
  } catch {
    // Private browsing: the choice lasts until the page closes.
  }
}

/** Opens the camera with this id, or the back camera when no id is given. `deviceId` in the answer is the camera that is live, when the browser says. */
export async function openCamera(deviceId: string | null = null): Promise<CameraResult> {
  if (!navigator.mediaDevices?.getUserMedia) return { ok: false, why: "This browser cannot open a camera here. Open the page over https in Safari or Chrome." };
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: deviceId ? { deviceId: { exact: deviceId }, ...SIZE } : { facingMode: { ideal: "environment" }, ...SIZE },
      audio: false,
    });
    // An id that was asked for exactly is the one that opened; otherwise the browser says which camera it picked.
    return { ok: true, stream, deviceId: deviceId ?? (stream.getVideoTracks()[0]?.getSettings?.().deviceId || null) };
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
