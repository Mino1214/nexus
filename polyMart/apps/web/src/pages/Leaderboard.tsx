import { useTranslation } from "react-i18next";
import { useLeaderboard } from "../hooks/useLeaderboard";
import { formatCompactUsd } from "../lib/format";
import { useSettingStore } from "../store/settingStore";

export default function LeaderboardPage() {
  const { t } = useTranslation();
  const language = useSettingStore((state) => state.language);
  const query = useLeaderboard();

  return (
    <section className="glass-panel rounded-[30px] p-6 sm:p-7">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-[var(--color-muted)]">{t("leaderboard.eyebrow")}</div>
          <h2 className="mt-2 font-display text-3xl font-bold text-[var(--color-text)]">{t("leaderboard.title")}</h2>
        </div>
        <div className="rounded-full border border-[var(--color-border)] px-4 py-2 text-xs text-[var(--color-muted)]">{t("leaderboard.windowWeekly")}</div>
      </div>

      {query.isLoading ? (
        <div className="text-sm text-[var(--color-muted)]">{t("common.loading")}</div>
      ) : (
        <div className="overflow-hidden rounded-[24px] border border-[var(--color-border)]">
          <div className="grid grid-cols-[80px_1.5fr_1fr_1fr] bg-[rgba(255,255,255,0.04)] px-4 py-3 text-xs uppercase tracking-[0.16em] text-[var(--color-muted)]">
            <span>#</span>
            <span>{t("leaderboard.wallet")}</span>
            <span>{t("leaderboard.pnl")}</span>
            <span>{t("leaderboard.volume")}</span>
          </div>

          {(query.data ?? []).map((user, index) => {
            const wallet = user.name || user.proxyWallet || user.address || "—";
            const pnl = Number(user.pnl ?? user.profit ?? 0);

            return (
              <div
                key={`${wallet}-${index}`}
                className="grid grid-cols-[80px_1.5fr_1fr_1fr] items-center border-t border-[var(--color-border)] px-4 py-4 text-sm"
              >
                <span className="font-display text-lg font-bold text-[var(--color-accent)]">{index + 1}</span>
                <span className="font-mono text-[var(--color-text)]">{wallet.length > 18 ? `${wallet.slice(0, 18)}...` : wallet}</span>
                <span className={pnl >= 0 ? "text-emerald-300" : "text-rose-300"}>{formatCompactUsd(pnl, language)}</span>
                <span className="text-[var(--color-muted)]">{formatCompactUsd(user.volume ?? 0, language)}</span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
