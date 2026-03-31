import { formatOdds, formatPoints } from "../../lib/format";
import { useTranslation } from "react-i18next";
import { useSettingStore } from "../../store/settingStore";

interface OddsDisplayProps {
  odds: number;
  potentialWin: number;
  netProfit: number;
}

export default function OddsDisplay({ odds, potentialWin, netProfit }: OddsDisplayProps) {
  const { t } = useTranslation();
  const language = useSettingStore((state) => state.language);

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-[22px] bg-[rgba(255,255,255,0.03)] p-4">
        <div className="text-xs uppercase tracking-[0.16em] text-[var(--color-muted)]">{t("bet.odds")}</div>
        <div className="mt-2 font-display text-2xl font-bold text-[var(--color-accent)]">{formatOdds(odds)}</div>
      </div>
      <div className="rounded-[22px] bg-[rgba(255,255,255,0.03)] p-4">
        <div className="text-xs uppercase tracking-[0.16em] text-[var(--color-muted)]">{t("bet.potential")}</div>
        <div className="mt-2 font-display text-2xl font-bold text-[var(--color-text)]">{formatPoints(potentialWin, language)}</div>
      </div>
      <div className="rounded-[22px] bg-[rgba(255,255,255,0.03)] p-4">
        <div className="text-xs uppercase tracking-[0.16em] text-[var(--color-muted)]">{t("bet.net")}</div>
        <div className="mt-2 font-display text-2xl font-bold text-[var(--color-accent-2)]">{formatPoints(netProfit, language)}</div>
      </div>
    </div>
  );
}
