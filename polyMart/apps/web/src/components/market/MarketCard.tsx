import { buildPolymarketEventUrl, calcOdds, getOutcomePrices, getOutcomes, type PolyMarket } from "@polywatch/shared";
import { useTranslation } from "react-i18next";
import Badge from "../ui/Badge";
import Button from "../ui/Button";
import ProbabilityBar from "./ProbabilityBar";
import { displayQuestion, formatCompactUsd, formatDate, formatOdds } from "../../lib/format";
import { useSettingStore } from "../../store/settingStore";

interface MarketCardProps {
  market: PolyMarket;
  onBet: (market: PolyMarket) => void;
  onDetail: (market: PolyMarket) => void;
}

export default function MarketCard({ market, onBet, onDetail }: MarketCardProps) {
  const { t } = useTranslation();
  const language = useSettingStore((state) => state.language);
  const prices = getOutcomePrices(market);
  const outcomes = getOutcomes(market);
  const bestOdds = calcOdds(prices[0] ?? 0);
  const tag = market.tags?.[0];
  const polymarketUrl = buildPolymarketEventUrl(market);

  return (
    <article className="glass-panel group overflow-hidden rounded-[28px] transition hover:-translate-y-1">
      {market.image ? (
        <div className="relative h-40 overflow-hidden">
          <img src={market.image} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent,rgba(7,17,26,0.94))]" />
        </div>
      ) : null}

      <div className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          {tag ? <Badge>{tag.label}</Badge> : <Badge>Live</Badge>}
          <div className="flex flex-col items-end gap-2">
            <div className="rounded-full bg-[rgba(255,201,120,0.12)] px-3 py-1 text-xs font-mono text-[var(--color-accent-2)]">
              max {formatOdds(bestOdds)}
            </div>
            {polymarketUrl ? (
              <a
                href={polymarketUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-medium text-[var(--color-accent)] transition hover:text-[var(--color-accent-2)]"
                aria-label={t("market.viewOnPolymarket")}
                title={t("market.viewOnPolymarket")}
              >
                {t("market.viewOnPolymarket")} ↗
              </a>
            ) : null}
          </div>
        </div>

        <div className="min-h-[4.8rem]">
          <h3 className="text-lg font-semibold leading-7 text-[var(--color-text)]">{displayQuestion(market)}</h3>
        </div>

        <ProbabilityBar outcomes={outcomes} prices={prices} />

        <div className="grid grid-cols-3 gap-2 text-sm">
          <div className="rounded-2xl bg-[rgba(255,255,255,0.03)] px-3 py-3">
            <div className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-muted)]">{t("market.volume24h")}</div>
            <div className="mt-1 font-mono text-[var(--color-text)]">{formatCompactUsd(market.volume24hr ?? 0, language)}</div>
          </div>
          <div className="rounded-2xl bg-[rgba(255,255,255,0.03)] px-3 py-3">
            <div className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-muted)]">{t("market.liquidity")}</div>
            <div className="mt-1 font-mono text-[var(--color-text)]">
              {formatCompactUsd(market.liquidityNum ?? market.liquidity ?? 0, language)}
            </div>
          </div>
          <div className="rounded-2xl bg-[rgba(255,255,255,0.03)] px-3 py-3">
            <div className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-muted)]">{t("market.deadline")}</div>
            <div className="mt-1 font-mono text-[var(--color-text)]">{formatDate(market.endDate, language)}</div>
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="secondary" fullWidth onClick={() => onDetail(market)}>
            {t("market.details")}
          </Button>
          <Button fullWidth onClick={() => onBet(market)}>
            {t("market.bet")}
          </Button>
        </div>
      </div>
    </article>
  );
}
