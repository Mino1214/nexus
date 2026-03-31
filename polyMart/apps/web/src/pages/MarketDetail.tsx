import { buildPolymarketEventUrl, getOutcomePrices, getOutcomes, getTokenIds } from "@polywatch/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import BetModal from "../components/betting/BetModal";
import OddsDisplay from "../components/betting/OddsDisplay";
import PriceChart from "../components/market/PriceChart";
import Button from "../components/ui/Button";
import { useMarket } from "../hooks/useMarkets";
import { usePriceHistory, useMarketPrices } from "../hooks/usePrices";
import { useWebSocket } from "../hooks/useWebSocket";
import { displayDescription, displayQuestion, formatCompactUsd, formatDate } from "../lib/format";
import { useSettingStore } from "../store/settingStore";

export default function MarketDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const language = useSettingStore((state) => state.language);
  const [betOpen, setBetOpen] = useState(false);
  const marketQuery = useMarket(id, language);
  const market = marketQuery.data;
  const tokenIds = market ? getTokenIds(market) : [];
  const pricesQuery = useMarketPrices(tokenIds);
  const historyQuery = usePriceHistory(tokenIds[0]);
  const socket = useWebSocket(tokenIds);

  if (marketQuery.isLoading || !market) {
    return <div className="glass-panel rounded-[28px] p-6 text-sm text-[var(--color-muted)]">{t("common.loading")}</div>;
  }

  const marketPrices = getOutcomePrices(market);
  const polledPrices = Object.fromEntries(
    (pricesQuery.data ?? []).map((item) => [item.tokenId, Number(item.data?.price ?? 0)]),
  );
  const prices = tokenIds.length
    ? tokenIds.map((tokenId, index) => socket.livePrices[tokenId] ?? polledPrices[tokenId] ?? marketPrices[index] ?? 0)
    : marketPrices;
  const outcomes = getOutcomes(market);
  const yesOdds = prices[0] ? Math.round((1 / prices[0]) * 0.93 * 100) / 100 : 1;
  const polymarketUrl = buildPolymarketEventUrl(market);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <Link to="/">
          <Button variant="secondary">{t("market.back")}</Button>
        </Link>
        <div className="rounded-full border border-[var(--color-border)] px-4 py-2 text-xs uppercase tracking-[0.18em] text-[var(--color-muted)]">
          {t(`market.socketStatus.${socket.status}`)}
        </div>
      </div>

      <section className="grid gap-6 lg:grid-cols-[1.55fr_0.85fr]">
        <div className="space-y-6">
          <div className="glass-panel rounded-[30px] p-6 sm:p-7">
            {market.image ? (
              <img src={market.image} alt="" className="mb-5 h-60 w-full rounded-[24px] object-cover" />
            ) : null}
            <div className="flex flex-wrap gap-2">
              {(market.tags ?? []).slice(0, 3).map((tag) => (
                <span key={tag.id} className="rounded-full bg-[rgba(86,212,199,0.1)] px-3 py-1 text-xs text-[var(--color-accent)]">
                  {tag.label}
                </span>
              ))}
            </div>
            <h2 className="mt-4 font-display text-3xl font-bold leading-tight text-[var(--color-text)]">{displayQuestion(market)}</h2>
            <p className="mt-4 text-sm leading-7 text-[var(--color-muted)]">{displayDescription(market) || t("market.descriptionUnavailable")}</p>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-[22px] bg-[rgba(255,255,255,0.03)] p-4">
                <div className="text-xs uppercase tracking-[0.16em] text-[var(--color-muted)]">{t("market.volume24h")}</div>
                <div className="mt-2 font-mono text-lg text-[var(--color-text)]">{formatCompactUsd(market.volume24hr ?? 0, language)}</div>
              </div>
              <div className="rounded-[22px] bg-[rgba(255,255,255,0.03)] p-4">
                <div className="text-xs uppercase tracking-[0.16em] text-[var(--color-muted)]">{t("market.liquidity")}</div>
                <div className="mt-2 font-mono text-lg text-[var(--color-text)]">
                  {formatCompactUsd(market.liquidityNum ?? market.liquidity ?? 0, language)}
                </div>
              </div>
              <div className="rounded-[22px] bg-[rgba(255,255,255,0.03)] p-4">
                <div className="text-xs uppercase tracking-[0.16em] text-[var(--color-muted)]">{t("market.deadline")}</div>
                <div className="mt-2 font-mono text-lg text-[var(--color-text)]">{formatDate(market.endDate, language)}</div>
              </div>
            </div>
          </div>

          <PriceChart history={historyQuery.data?.history ?? []} />
        </div>

        <aside className="space-y-6">
          <div className="glass-panel rounded-[30px] p-6">
            <div className="text-xs uppercase tracking-[0.16em] text-[var(--color-muted)]">{t("market.currentOutcomes")}</div>
            <div className="mt-4 space-y-3">
              {outcomes.map((outcome, index) => (
                <div key={outcome} className="rounded-[22px] bg-[rgba(255,255,255,0.03)] p-4">
                  <div className="text-sm text-[var(--color-muted)]">{outcome}</div>
                  <div className="mt-2 font-display text-3xl font-bold text-[var(--color-text)]">{((prices[index] ?? 0) * 100).toFixed(1)}%</div>
                </div>
              ))}
            </div>
            <div className="mt-5">
              <Button fullWidth onClick={() => setBetOpen(true)}>
                {t("market.bet")}
              </Button>
            </div>
          </div>

          <div className="glass-panel rounded-[30px] p-6">
            <OddsDisplay odds={yesOdds} potentialWin={Math.floor(1000 * yesOdds)} netProfit={Math.floor(1000 * yesOdds) - 1000} />
          </div>

          <div className="glass-panel rounded-[30px] p-6">
            <div className="text-xs uppercase tracking-[0.16em] text-[var(--color-muted)]">{t("market.liveData")}</div>
            <div className="mt-3 space-y-2 text-sm text-[var(--color-muted)]">
              <div>{t("market.priceEndpoint")}: {pricesQuery.data ? t("common.ready") : t("common.idle")}</div>
              <div>{t("market.historyEndpoint")}: {historyQuery.data ? t("common.ready") : t("common.idle")}</div>
              <div>{t("market.streaming")}: {t(`market.socketMessage.${socket.message}`, { defaultValue: socket.message })}</div>
            </div>
            {polymarketUrl ? (
              <a
                href={polymarketUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-5 inline-flex text-sm font-medium text-[var(--color-accent)]"
              >
                {t("market.viewOnPolymarket")} →
              </a>
            ) : null}
          </div>
        </aside>
      </section>

      <BetModal market={market} open={betOpen} onClose={() => setBetOpen(false)} />
    </div>
  );
}
