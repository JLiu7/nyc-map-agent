import { QrButton } from "@/components/MapChrome";
import { useMenuT } from "@/lib/i18n/menuText";
import { healthLine, setProfilePref, useProfilePref, useSmartHealth } from "@/lib/modelProfile";
import { APP_LANGS, LANG_LABELS, setLangPref, useLangPref, type AppLang } from "@/lib/voice/langPref";

/** Language, the model (#35) and the app's QR code: what a phone's sheets keep behind the chat. */
export function SettingsBody() {
  const t = useMenuT();
  const lang = useLangPref();
  const profile = useProfilePref();
  const line = healthLine(useSmartHealth());
  return (
    <>
      <label className="flex min-h-11 items-center justify-between gap-3 px-1 text-sm font-semibold">
        {t("language")}
        <select value={lang ?? ""} aria-label={t("language")} onChange={(e) => setLangPref((e.target.value || null) as AppLang | null)}
          className="min-h-11 rounded-full border border-slate-400/30 bg-slate-900 px-3 text-sm font-medium text-slate-100">
          <option value="">{t("thisPhone")}</option>
          {APP_LANGS.map((code) => <option key={code} value={code}>{LANG_LABELS[code]}</option>)}
        </select>
      </label>
      <label className="flex min-h-11 items-center justify-between gap-3 px-1 text-sm font-semibold">
        {t("model")}
        <select value={profile ?? ""} aria-label={t("model")} onChange={(e) => setProfilePref(e.target.value === "smart" || e.target.value === "dev" ? e.target.value : null)}
          className="min-h-11 rounded-full border border-slate-400/30 bg-slate-900 px-3 text-sm font-medium text-slate-100">
          <option value="">{t("auto")}</option>
          <option value="smart">Smart</option>
          <option value="dev">Dev</option>
        </select>
      </label>
      {line && profile !== "dev" ? <p data-testid="model-health" className="px-1 text-[12px] text-slate-300">{line}</p> : null}
      <QrButton wide />
    </>
  );
}
