import { QrButton } from "@/components/MapChrome";
import { TrackerHealthLink } from "@/components/TrackerHealthLink";
import { useMenuT } from "@/lib/i18n/menuText";
import { setStepFreePref, useStepFreePref } from "@/lib/stepFreePref";
import { healthLine, setProfilePref, useProfilePref, useSmartHealth } from "@/lib/modelProfile";
import { APP_LANGS, LANG_LABELS, setLangPref, useLangPref, type AppLang } from "@/lib/voice/langPref";

/** Language, Elevators only (#133), the model (#35) and the app's QR code: what a phone's sheets keep behind the chat. */
export function SettingsBody() {
  const t = useMenuT();
  const lang = useLangPref();
  const profile = useProfilePref();
  const line = healthLine(useSmartHealth());
  const stepFree = useStepFreePref();
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
      <div className="flex min-h-11 items-center justify-between gap-3 px-1 text-sm font-semibold">
        <span id="elevators-only-label">{t("elevatorsOnly")}</span>
        <button type="button" role="switch" aria-checked={stepFree} aria-labelledby="elevators-only-label" data-testid="elevators-only" onClick={() => setStepFreePref(!stepFree)}
          className={`relative h-7 w-12 shrink-0 rounded-full border border-slate-400/30 transition-colors ${stepFree ? "bg-sky-500" : "bg-slate-700"}`}>
          <span aria-hidden className={`absolute top-0.5 h-5.5 w-5.5 rounded-full bg-white shadow transition-[left] ${stepFree ? "left-[1.4rem]" : "left-0.5"}`} style={{ height: 22, width: 22 }} />
        </button>
      </div>
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
      <TrackerHealthLink />
      <QrButton wide />
    </>
  );
}
