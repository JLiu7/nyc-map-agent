import type { FeatureModule } from "@/lib/features/types";

/**
 * Station replay (a demo page, off unless `?flags=+stationReplay`): the film of
 * the step-free trip from Cortlandt St to 14 St-Union Sq, and the map with a
 * dot that moves along the walk as the film plays. Overlay only; it loads when
 * the flag is on.
 */
const stationReplay: FeatureModule = {
  id: "stationReplay",
  overlay: { load: () => import("./StationReplay") },
  flags: ["stationReplay"],
};

export default stationReplay;
