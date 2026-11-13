/**
 * Feature flags: one typed registry, so every module can be switched off.
 *
 * Resolution, last wins:
 *   1. `default` below
 *   2. build env  VITE_FLAGS="-restrooms,+feedHealth"
 *   3. URL        ?flags=-restrooms,+feedHealth   (QA / support links)
 * Then the tier gate: a flag with tier "advanced" is on only when the user's
 * persisted `advancedMode` setting is on (simple by default).
 */
export type FlagTier = "basic" | "advanced";

export interface FlagMeta {
  tier: FlagTier;
  default: boolean;
  label: string;
  /** Who decides when this flag goes away (GitHub handle or team). */
  owner: string;
  /** ISO date (YYYY-MM-DD). After it, the flag must be removed or renewed; a test fails. */
  expires: string;
}

export const FLAGS = {
  agent: { tier: "basic", default: true, label: "Smart mode (voice + text assistant)", owner: "@Pukujan", expires: "2027-04-30" },
  agentDrive: { tier: "basic", default: true, label: "Smart mode: driving trips", owner: "@Pukujan", expires: "2027-04-30" },
  // The main UI (#370): the owner approved the chat-first design, so it is on by default.
  agentHome: { tier: "basic", default: true, label: "Smart mode: chat bar, task buttons, voice orb and answer card", owner: "@Pukujan", expires: "2027-04-30" },
  search: { tier: "basic", default: true, label: "Search", owner: "@Pukujan", expires: "2027-04-30" },
  directions: { tier: "basic", default: true, label: "Walking directions", owner: "@Pukujan", expires: "2027-04-30" },
  liveview: { tier: "basic", default: true, label: "Navigation arrows and Live View", owner: "@Pukujan", expires: "2027-04-30" },
  liveviewAr: { tier: "basic", default: false, label: "Live View (Beta): route drawn over the camera", owner: "@Pukujan", expires: "2027-03-31" },
  transit: { tier: "basic", default: true, label: "Live transit", owner: "@Pukujan", expires: "2027-04-30" },
  places: { tier: "basic", default: true, label: "Places", owner: "@Pukujan", expires: "2027-04-30" },
  restrooms: { tier: "basic", default: true, label: "Public restrooms", owner: "@Pukujan", expires: "2027-04-30" },
  placeToilets: { tier: "basic", default: true, label: "Restrooms: shops & cafés with toilets (chip off until chosen)", owner: "@Pukujan", expires: "2027-04-30" },
  storefronts: { tier: "basic", default: true, label: "Storefront signs", owner: "@Pukujan", expires: "2027-04-30" },
  schools: { tier: "basic", default: true, label: "School buildings", owner: "@Pukujan", expires: "2027-04-30" },
  signs: { tier: "basic", default: true, label: "Street signs", owner: "@Pukujan", expires: "2027-04-30" },
  streetLevel: { tier: "basic", default: true, label: "Street level", owner: "@Pukujan", expires: "2027-04-30" },
  city3d: { tier: "basic", default: true, label: "Textured 3D city", owner: "@Pukujan", expires: "2027-04-30" },
  detailedCity: { tier: "advanced", default: false, label: "Detailed 3D city above street level (textured buildings, skyline, landmark models)", owner: "@Pukujan", expires: "2027-04-30" },
  noise: { tier: "advanced", default: true, label: "Noise layer", owner: "@Pukujan", expires: "2027-04-30" },
  blockDensity: { tier: "basic", default: true, label: "Shade blocks per hectare", owner: "@Pukujan", expires: "2027-04-30" },
  daylight: { tier: "basic", default: true, label: "Time-of-day lighting", owner: "@Pukujan", expires: "2027-04-30" },
  weather: { tier: "basic", default: true, label: "Live weather", owner: "@Pukujan", expires: "2027-04-30" },
  streetWeather: { tier: "basic", default: false, label: "Street weather: rain or snow in street view and a trip heads-up (in review)", owner: "@Pukujan", expires: "2027-04-30" },
  traffic: { tier: "basic", default: true, label: "Live traffic (DOT sensor corridors)", owner: "@Pukujan", expires: "2027-04-30" },
  parking: { tier: "basic", default: false, label: "Parking garages and street rules", owner: "@Pukujan", expires: "2027-04-30" },
  hazards: { tier: "advanced", default: true, label: "Weather alerts and street flooding", owner: "@Pukujan", expires: "2027-04-30" },
  crashes: { tier: "advanced", default: true, label: "Classic crashes layer", owner: "@Pukujan", expires: "2027-04-30" },
  combined: { tier: "advanced", default: true, label: "Noise + crashes", owner: "@Pukujan", expires: "2027-04-30" },
  dataLayers: { tier: "advanced", default: true, label: "Data / analytics layers", owner: "@Pukujan", expires: "2027-04-30" },
  feedHealth: { tier: "advanced", default: true, label: "Feed health", owner: "@Pukujan", expires: "2027-04-30" },
  ferry: { tier: "basic", default: true, label: "Ferries (NYC Ferry and Staten Island Ferry; layer off until chosen)", owner: "@Pukujan", expires: "2027-04-30" },
  events: { tier: "basic", default: true, label: "Events (street fairs, markets, pop-ups; layer off until chosen)", owner: "@Pukujan", expires: "2027-04-30" },
  underground: { tier: "basic", default: true, label: "Underground help: station exits and the walk out, saved for when there is no signal", owner: "@Pukujan", expires: "2027-04-30" },
  signCamera: { tier: "basic", default: false, label: "Sign camera (prototype)", owner: "@Pukujan", expires: "2027-03-31" },
  dollhouseWalk: { tier: "basic", default: true, label: "Dollhouse view of the walk out of Fulton St (a figure seen from above; off = first person)", owner: "@Pukujan", expires: "2027-04-30" },
  contextClean: { tier: "basic", default: false, label: "Clean map by context (show only your line, trip or street; landmarks always)", owner: "@Pukujan", expires: "2027-04-30" },
} as const satisfies Record<string, FlagMeta>;

export type FlagId = keyof typeof FLAGS;

export function isFlagId(id: string): id is FlagId {
  return Object.prototype.hasOwnProperty.call(FLAGS, id);
}

/** Parse "-a,+b,c" into overrides; unknown ids are ignored. */
export function parseOverrides(spec: string | null | undefined): Partial<Record<FlagId, boolean>> {
  const out: Partial<Record<FlagId, boolean>> = {};
  for (const raw of (spec ?? "").split(",")) {
    const t = raw.trim();
    if (!t) continue;
    const id = t.replace(/^[+-]/, "");
    if (isFlagId(id)) out[id] = !t.startsWith("-");
  }
  return out;
}

export interface FlagInputs {
  env?: string;
  url?: string | null;
  advancedMode: boolean;
  /**
   * A saved link that names an analytics view (`view=src:noise`, `layer=…`):
   * the noise / crash / data layers it needs are honoured in simple mode too.
   */
  analyticsLink?: boolean;
}

/** Analytics flags a saved `view=` link may switch on without Advanced. */
const ANALYTICS: ReadonlySet<string> = new Set(["noise", "crashes", "combined", "dataLayers"]);

export function resolveFlags({ env, url, advancedMode, analyticsLink = false }: FlagInputs): Record<FlagId, boolean> {
  const envO = parseOverrides(env);
  const urlO = parseOverrides(url);
  const out = {} as Record<FlagId, boolean>;
  for (const id of Object.keys(FLAGS) as FlagId[]) {
    const meta: FlagMeta = FLAGS[id];
    const on = urlO[id] ?? envO[id] ?? meta.default;
    out[id] = on && (meta.tier === "basic" || advancedMode || (analyticsLink && ANALYTICS.has(id)));
  }
  return out;
}
