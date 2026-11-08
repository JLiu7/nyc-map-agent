import { useState } from "react";
import { Settings, X } from "lucide-react";
import { PullSheet } from "@/components/PullSheet";
import { SettingsBody } from "@/components/SettingsBody";
import { LiveLayerRows } from "@/components/LiveLayerRows";
import type { SheetLevel } from "@/components/sheetSwipe";
import { useMenuT } from "@/lib/i18n/menuText";

/**
 * On a phone's home, the model and the QR code come up from behind the chat
 * from the Settings chip (owner, 2026-10-25); language is here too, and also
 * the rail's chip (#54). Swiping it all the way down closes it.
 */
export default function SettingsSheet({ onClose }: { onClose: () => void }) {
  const t = useMenuT();
  const [level, setLevel] = useState<SheetLevel>(1);
  return (
    <PullSheet testId="settings-sheet" label={t("settings")} level={level} onLevel={(l) => (l ? setLevel(l) : onClose())}
      header={
        <div className="flex min-h-12 items-center gap-3 px-1">
          <Settings className="h-5 w-5 shrink-0 text-slate-300" aria-hidden />
          <span className="flex-1 text-[15px] font-semibold text-slate-100">{t("settings")}</span>
          <button type="button" aria-label={`Close ${t("settings")}`} onClick={onClose} className="task-action task-close">
            <X className="h-[18px] w-[18px]" strokeWidth={2.5} aria-hidden />
          </button>
        </div>
      }>
      <div className="pull-sheet-body flex flex-col gap-2">
        {/* Phones have no Layers menu: live trains and buses, with the bus route chooser, open the sheet. */}
        <div data-testid="phone-layers" className="text-[#f1f5f9]"><LiveLayerRows /></div>
        <div className="mx-2 h-px bg-[#263449]" />
        <SettingsBody />
      </div>
    </PullSheet>
  );
}
