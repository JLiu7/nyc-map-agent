import { BarChart3 } from "lucide-react";
import { Link } from "react-router-dom";
import { useAdvancedMode } from "@/lib/flags";
import { useMenuT } from "@/lib/i18n/menuText";

/**
 * The way into the tracker health page (#11), in Settings, for technical users:
 * it shows only while Advanced is on. The page also opens by its address.
 */
export function TrackerHealthLink() {
  const [advanced] = useAdvancedMode();
  const t = useMenuT();
  if (!advanced) return null;
  return (
    <Link to="/tracker-health" data-testid="open-tracker-health"
      className="flex min-h-12 items-center gap-3 rounded-lg px-2 text-[14px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60a5fa]">
      <BarChart3 className="h-5 w-5 shrink-0" aria-hidden />
      <span className="flex-1">{t("trackerHealth")}</span>
      <span aria-hidden>→</span>
    </Link>
  );
}
