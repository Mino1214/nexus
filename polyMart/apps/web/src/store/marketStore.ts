import { create } from "zustand";
import type { PolyMarket } from "@polywatch/shared";

interface MarketState {
  ticker: PolyMarket[];
  selectedMarketId: string | null;
  lastUpdatedAt: string | null;
  setTicker: (markets: PolyMarket[]) => void;
  setSelectedMarketId: (marketId: string | null) => void;
  touchUpdatedAt: () => void;
}

export const useMarketStore = create<MarketState>((set) => ({
  ticker: [],
  selectedMarketId: null,
  lastUpdatedAt: null,
  setTicker: (ticker) => set({ ticker }),
  setSelectedMarketId: (selectedMarketId) => set({ selectedMarketId }),
  touchUpdatedAt: () => set({ lastUpdatedAt: new Date().toISOString() }),
}));
