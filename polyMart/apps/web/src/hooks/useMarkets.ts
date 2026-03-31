import { useEffect } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type { LanguageCode, PaginatedMarketsResponse, PolyMarket } from "@polywatch/shared";
import { api } from "../lib/api";
import { useMarketStore } from "../store/marketStore";

interface MarketListParams {
  category: string;
  sort: string;
  q: string;
  lang: LanguageCode;
  limit?: number;
}

export function useMarkets({ category, sort, q, lang, limit = 18 }: MarketListParams) {
  return useInfiniteQuery({
    queryKey: ["markets", category, sort, q, lang, limit],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const response = await api.get<PaginatedMarketsResponse>("/markets", {
        params: {
          category,
          sort,
          q,
          lang,
          page: pageParam,
          limit,
        },
      });
      return response.data;
    },
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.page + 1 : undefined),
    staleTime: 25_000,
    refetchInterval: 30_000,
  });
}

export function useTickerMarkets(lang: LanguageCode) {
  const setTicker = useMarketStore((state) => state.setTicker);
  const touchUpdatedAt = useMarketStore((state) => state.touchUpdatedAt);

  const query = useQuery({
    queryKey: ["ticker", lang],
    queryFn: async () => {
      const response = await api.get<PaginatedMarketsResponse>("/markets", {
        params: {
          category: "hot",
          sort: "volume24hr",
          page: 1,
          limit: 10,
          lang,
        },
      });
      return response.data.items;
    },
    staleTime: 25_000,
    refetchInterval: 30_000,
  });

  useEffect(() => {
    if (query.data) {
      setTicker(query.data);
      touchUpdatedAt();
    }
  }, [query.data, setTicker, touchUpdatedAt]);

  return query;
}

export function useMarket(marketId: string | undefined, lang: LanguageCode) {
  return useQuery({
    queryKey: ["market", marketId, lang],
    enabled: Boolean(marketId),
    queryFn: async () => {
      const response = await api.get<PolyMarket>(`/markets/${marketId}`, {
        params: {
          lang,
        },
      });
      return response.data;
    },
    staleTime: 25_000,
    refetchInterval: 30_000,
  });
}
