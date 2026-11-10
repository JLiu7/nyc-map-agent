type Ctor = { requestPermission?: () => Promise<"granted" | "denied"> };
type Turn = DeviceOrientationEvent & { webkitCompassHeading?: number };

/**
 * The phone's compass, degrees clockwise from north, or null when it has none
 * or was refused. iOS asks first and only inside a tap, so call this from one.
 * Below the street the steel pulls the needle; the sign camera only uses it to
 * tell the two sides of a hanging sign apart and to follow turns after a read.
 */
export async function watchCompass(on: (deg: number) => void): Promise<(() => void) | null> {
  if (typeof window === "undefined" || !("DeviceOrientationEvent" in window)) return null;
  const C = window.DeviceOrientationEvent as unknown as Ctor;
  try {
    if (typeof C.requestPermission === "function" && (await C.requestPermission()) !== "granted") return null;
  } catch {
    return null;
  }
  const type = "ondeviceorientationabsolute" in window ? "deviceorientationabsolute" : "deviceorientation";
  const fn = (e: Event) => {
    const t = e as Turn;
    const deg = typeof t.webkitCompassHeading === "number" ? t.webkitCompassHeading : t.absolute && typeof t.alpha === "number" ? 360 - t.alpha : null;
    if (deg !== null && Number.isFinite(deg)) on(((deg % 360) + 360) % 360);
  };
  window.addEventListener(type, fn);
  return () => window.removeEventListener(type, fn);
}
