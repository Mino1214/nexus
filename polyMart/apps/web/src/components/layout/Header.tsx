import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import Button from "../ui/Button";
import { useSettingStore } from "../../store/settingStore";
import { useUserStore } from "../../store/userStore";
import { formatPoints } from "../../lib/format";
import { useLogout, useSessionSync } from "../../hooks/useAuth";

const languages = [
  { id: "ko", label: "KR" },
  { id: "ja", label: "JP" },
  { id: "zh", label: "ZH" },
] as const;

export default function Header() {
  const { t, i18n } = useTranslation();
  const language = useSettingStore((state) => state.language);
  const setLanguage = useSettingStore((state) => state.setLanguage);
  const user = useUserStore((state) => state.user);
  const authenticated = useUserStore((state) => state.authenticated);
  useSessionSync();
  const logout = useLogout();

  useEffect(() => {
    void i18n.changeLanguage(language);
    document.documentElement.lang = language;
  }, [i18n, language]);

  return (
    <header className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 pt-6 sm:px-6 lg:px-8">
      <div className="glass-panel flex flex-col gap-4 rounded-[28px] px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <div className="mb-2 flex items-center gap-3">
            <span className="rounded-full border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] px-3 py-1 font-mono text-[11px] tracking-[0.3em] text-[var(--color-accent)]">
              POLYWATCH
            </span>
            <div className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
              <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(74,222,128,0.85)]" />
              <span>{t("common.live")}</span>
              <span className="text-[rgba(150,174,178,0.72)]">{t("common.polling")}</span>
            </div>
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-[var(--color-text)]">{t("market.title")}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-muted)]">{t("market.subtitle")}</p>
        </div>

        <div className="flex flex-col gap-3 sm:items-end">
          <div className="rounded-full border border-[var(--color-border)] bg-[rgba(255,255,255,0.03)] px-4 py-2 text-right">
            <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--color-muted)]">
              {authenticated ? user?.username : t("common.guest")}
            </div>
            <div className="font-display text-xl font-bold text-[var(--color-accent-2)]">{formatPoints(user?.points ?? 0, language)}</div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {languages.map((item) => (
              <Button
                key={item.id}
                type="button"
                variant={language === item.id ? "primary" : "secondary"}
                className="min-w-14"
                onClick={() => setLanguage(item.id)}
              >
                {item.label}
              </Button>
            ))}
            {authenticated ? (
              <Button variant="secondary" onClick={() => logout.mutate()}>
                {t("common.logout")}
              </Button>
            ) : (
              <Link to="/mypage">
                <Button variant="secondary">{t("common.login")}</Button>
              </Link>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
