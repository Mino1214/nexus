import type { PolyMarket } from "@polywatch/shared";
import MarketCard from "./MarketCard";

interface MarketGridProps {
  markets: PolyMarket[];
  loading: boolean;
  onBet: (market: PolyMarket) => void;
  onDetail: (market: PolyMarket) => void;
}

export default function MarketGrid({ markets, loading, onBet, onDetail }: MarketGridProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {markets.map((market) => (
        <MarketCard key={market.id} market={market} onBet={onBet} onDetail={onDetail} />
      ))}

      {loading
        ? Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="glass-panel animate-pulse rounded-[28px] p-5">
              <div className="mb-4 h-40 rounded-[20px] bg-[rgba(255,255,255,0.06)]" />
              <div className="mb-3 h-5 rounded-full bg-[rgba(255,255,255,0.06)]" />
              <div className="mb-5 h-5 w-3/4 rounded-full bg-[rgba(255,255,255,0.06)]" />
              <div className="h-20 rounded-[20px] bg-[rgba(255,255,255,0.06)]" />
            </div>
          ))
        : null}
    </div>
  );
}
