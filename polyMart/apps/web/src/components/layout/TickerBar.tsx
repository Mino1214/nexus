import { getOutcomePrices } from "@polywatch/shared";
import { useSettingStore } from "../../store/settingStore";
import { useTickerMarkets } from "../../hooks/useMarkets";
import { displayQuestion, formatPercent } from "../../lib/format";

export default function TickerBar() {
  const language = useSettingStore((state) => state.language);
  const { data } = useTickerMarkets(language);
  const items = data ?? [];

  return (
    <div className="relative z-10 overflow-hidden border-b border-[var(--color-border)] bg-[rgba(5,17,26,0.82)]">
      <div className="ticker-track flex min-w-max items-center py-2">
        {[...items, ...items].map((market, index) => {
          const price = getOutcomePrices(market)[0] ?? 0;
          return (
            <div key={`${market.id}-${index}`} className="flex items-center gap-3 px-4 text-sm">
              <span className="max-w-[14rem] truncate text-[var(--color-muted)]">{displayQuestion(market)}</span>
              <span className="font-mono font-bold text-[var(--color-accent)]">{formatPercent(price)}</span>
              <span className="text-[rgba(150,174,178,0.36)]">/</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
