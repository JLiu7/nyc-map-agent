import { lazy } from "react";
import type { FeatureModule } from "@/lib/features/types";
import TransitMenu from "./TransitMenu";

/** Live MTA transit: subway, LIRR, Metro-North (GTFS-rt, no key) and Bus Time buses (MTA_BUSTIME_KEY). */
const transit: FeatureModule = {
  id: "transit",
  layers: () => import("./layers"),
  MapLayer: lazy(() => import("./layers")),
  LayersMenu: TransitMenu,
  HomeSection: lazy(() => import("./TransitHome")),
  overlay: { load: () => import("./Overlays") },
  clickLayers: ["transit-skip", "transit-alert-skipped", "transit-bus-badge-follow", "transit-bullet", "transit-bus-badge", "transit-bus-badge-full", "transit-bus-badge-selected", "transit-vehicle-2d", "transit-vehicle-hit", "transit-vehicle-hit-stop", "transit-vehicle-hit-raised", "transit-access", "transit-entrance", "transit-station-label", "transit-station-raised", "transit-station"],
  panel: { idPrefix: "transit:" },
  chips: ["transit"],
  search: ["transit-stations"],
  flags: ["transit"],
  routes: ["/api/transit", "/api/transit/:system", "/api/transit-live"],
};

export default transit;
