import type { FeatureModule } from "@/lib/features/types";

/**
 * Walk guide (a prototype, off unless `?flags=+walkGuide`): a step-free walk we
 * filmed, sign by sign, from the street elevator at Cortlandt St to the street
 * at 14 St-Union Sq. Overlay only; it loads when the flag is on.
 */
const walkGuide: FeatureModule = {
  id: "walkGuide",
  overlay: { load: () => import("./WalkGuide") },
  flags: ["walkGuide"],
};

export default walkGuide;
