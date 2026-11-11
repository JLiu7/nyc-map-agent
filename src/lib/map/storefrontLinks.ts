/**
 * Where a shop's card links out: Google's street photos facing the shop, and
 * its Google Maps page (photos, hours, address). Plain links, no key. Pure.
 */
interface Shop { name: string; lng: number; lat: number; brg: number; fl: number; kind?: string; cat?: string }

const r6 = (v: number) => v.toFixed(6);

/**
 * Google's street photo from the roadway in front of the shop, looking at it.
 * The sign's own point is on the wall, where the nearest photo is as likely to
 * be on the street behind the building, and with no heading the camera faced
 * wherever the photo car was driving: step 8 m out from the wall and turn round.
 */
export function streetPhotoUrl(s: Shop): string {
  const b = (s.brg * Math.PI) / 180, kx = 111_320 * Math.cos((s.lat * Math.PI) / 180);
  const lat = s.lat + (Math.cos(b) * 8) / 111_320, lng = s.lng + (Math.sin(b) * 8) / kx;
  const heading = Math.round((((s.brg + 180) % 360) + 360) % 360);
  return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${r6(lat)},${r6(lng)}&heading=${heading}&pitch=5`;
}

/** The shop's place on Google Maps: a search for its name, centred on its door. */
export function placeUrl(s: Shop): string {
  return `https://www.google.com/maps/search/${encodeURIComponent(s.name)}/@${r6(s.lat)},${r6(s.lng)},19z`;
}

const GROUPS: Record<string, string> = { food: "Food and drink", shop: "Shop", health: "Health", money: "Bank", service: "Service", mall: "Shops" };

/** One short line under the name: what kind of place it is, and whether it is off the street floor. */
export function shopLine(s: Shop): string {
  const kind = (s.kind ?? "").replace(/_/g, " ").trim();
  const what = kind && kind !== "yes" ? kind.charAt(0).toUpperCase() + kind.slice(1) : GROUPS[s.cat ?? ""] ?? "";
  const floor = s.fl > 0 ? "Upstairs" : s.fl < 0 ? "Downstairs" : "";
  return [what, floor].filter(Boolean).join(" · ");
}
