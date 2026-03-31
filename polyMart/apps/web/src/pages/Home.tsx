import { useDeferredValue, useState, startTransition } from "react";
import { useNavigate } from "react-router-dom";
import type { CategoryId, PolyMarket, SortOptionId } from "@polywatch/shared";
import { useTranslation } from "react-i18next";
import BetModal from "../components/betting/BetModal";
import MarketFilter from "../components/market/MarketFilter";
import MarketGrid from "../components/market/MarketGrid";
import Button from "../components/ui/Button";
import { useMarkets } from "../hooks/useMarkets";
import { useSettingStore } from "../store/settingStore";

export default function HomePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const language = useSettingStore((state) => state.language);
  const category = useSettingStore((state) => state.category);
  const sort = useSettingStore((state) => state.sort);
  const search = useSettingStore((state) => state.search);
  const setCategory = useSettingStore((state) => state.setCategory);
  const setSort = useSettingStore((state) => state.setSort);
  const setSearch = useSettingStore((state) => state.setSearch);
  const deferredSearch = useDeferredValue(search);
  const [betTarget, setBetTarget] = useState<PolyMarket | null>(null);

  const marketsQuery = useMarkets({
    category,
    sort,
    q: deferredSearch,
    lang: language,
    limit: 18,
  });

  const markets = marketsQuery.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="space-y-6">
      <section className="grid gap-4 lg:grid-cols-[1.7fr_0.9fr]">
        <div className="glass-panel rounded-[30px] p-6 sm:p-7">
          <div className="text-xs uppercase tracking-[0.24em] text-[var(--color-muted)]">{t("market.heroEyebrow")}</div>
          <div className="mt-4 max-w-3xl">
            <h2 className="font-display text-4xl font-bold leading-tight text-[var(--color-text)]">
              {t("market.heroTitle")}
            </h2>
            <p className="mt-4 text-sm leading-7 text-[var(--color-muted)]">
              {t("market.heroBody")}
            </p>
          </div>
        </div>

        <div className="grid gap-4">
          <div className="glass-panel rounded-[28px] p-5">
            <div className="text-xs uppercase tracking-[0.2em] text-[var(--color-muted)]">{t("market.loadedMarkets")}</div>
            <div className="mt-2 font-display text-4xl font-bold text-[var(--color-accent)]">{markets.length}</div>
          </div>
          <div className="glass-panel rounded-[28px] p-5">
            <div className="text-xs uppercase tracking-[0.2em] text-[var(--color-muted)]">{t("market.refreshWindow")}</div>
            <div className="mt-2 font-display text-4xl font-bold text-[var(--color-accent-2)]">30s</div>
          </div>
        </div>
      </section>

      <MarketFilter
        category={category}
        sort={sort}
        search={search}
        language={language}
        onCategoryChange={(next) => startTransition(() => setCategory(next as CategoryId))}
        onSortChange={(next) => startTransition(() => setSort(next as SortOptionId))}
        onSearchChange={(next) => setSearch(next)}
      />

      {marketsQuery.isError ? (
        <div className="glass-panel rounded-[28px] p-5 text-sm text-rose-200">
          {t("common.error")}
        </div>
      ) : null}

      <MarketGrid
        markets={markets}
        loading={marketsQuery.isLoading}
        onBet={(market) => setBetTarget(market)}
        onDetail={(market) => navigate(`/markets/${market.id}`)}
      />

      {!marketsQuery.isLoading && !markets.length ? (
        <div className="glass-panel rounded-[28px] p-6 text-center text-sm text-[var(--color-muted)]">{t("market.empty")}</div>
      ) : null}

      {marketsQuery.hasNextPage ? (
        <div className="flex justify-center">
          <Button variant="secondary" onClick={() => marketsQuery.fetchNextPage()} disabled={marketsQuery.isFetchingNextPage}>
            {marketsQuery.isFetchingNextPage ? t("common.loading") : t("market.loadMore")}
          </Button>
        </div>
      ) : null}

      <BetModal market={betTarget} open={Boolean(betTarget)} onClose={() => setBetTarget(null)} />
    </div>
  );
}
