import type { FeatureModule } from "@/lib/features/types";

/**
 * Sign camera (a prototype, off unless `?flags=+signCamera`): point the phone at
 * a station sign and the app says which of its own signs that is, so where you
 * are and which way you face come from the sign, not from GPS. Overlay only;
 * the camera and the text reader load when it opens.
 */
const signCamera: FeatureModule = {
  id: "signCamera",
  overlay: { load: () => import("./SignCamera") },
  flags: ["signCamera"],
};

export default signCamera;
