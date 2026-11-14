import type { FeatureModule } from "@/lib/features/types";

/**
 * Station replay (a demo page, off unless `?flags=+stationReplay`): Friday's
 * real walk out of 14 St-Union Sq, played on the map with its three levels and
 * the same phone's Google Maps. Overlay only; it loads when the flag is on.
 */
const stationReplay: FeatureModule = {
  id: "stationReplay",
  overlay: { load: () => import("./StationReplay") },
  flags: ["stationReplay"],
};

export default stationReplay;
