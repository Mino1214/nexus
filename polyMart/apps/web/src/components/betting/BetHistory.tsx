import type { BetRecord } from "@polywatch/shared";
import { useTranslation } from "react-i18next";
import { formatDate, formatPoints } from "../../lib/format";
import { useSettingStore } from "../../store/settingStore";

interface BetHistoryProps {
  items: BetRecord[];
  loading?: boolean;
}

export default function BetHistory({ items, loading = false }: BetHistoryProps) {
  const { t } = useTranslation();
  const language = useSettingStore((state) => state.language);
  const statusMap: Record<BetRecord["status"], string> = {
    pending: t("mypage.status.pending"),
    won: t("mypage.status.won"),
    lost: t("mypage.status.lost"),
    cancelled: t("mypage.status.cancelled"),
  };

  return (
    <div className="glass-panel rounded-[28px] p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-display text-xl font-bold text-[var(--color-text)]">{t("mypage.history")}</h3>
        <span className="rounded-full bg-[rgba(255,255,255,0.04)] px-3 py-1 text-xs text-[var(--color-muted)]">{items.length} {t("mypage.betCount")}</span>
      </div>

      {loading ? (
        <div className="rounded-[20px] border border-dashed border-[var(--color-border)] p-4 text-sm text-[var(--color-muted)]">{t("common.loading")}</div>
      ) : !items.length ? (
        <div className="rounded-[20px] border border-dashed border-[var(--color-border)] p-4 text-sm text-[var(--color-muted)]">
          {t("mypage.noHistory")}
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((bet) => (
            <div key={bet.id} className="rounded-[22px] border border-[var(--color-border)] bg-[rgba(255,255,255,0.03)] p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="text-sm font-medium text-[var(--color-text)]">{bet.marketQuestion}</div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-[var(--color-muted)]">
                    <span>{bet.outcome}</span>
                    <span>•</span>
                    <span>{formatDate(bet.marketEndDate ?? undefined, language)}</span>
                    <span>•</span>
                    <span>{statusMap[bet.status]}</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-sm text-[var(--color-text)]">{formatPoints(bet.pointsBet, language)}</div>
                  <div className="mt-1 text-xs text-[var(--color-muted)]">x {bet.odds.toFixed(2)}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
