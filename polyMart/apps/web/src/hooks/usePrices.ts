import { useQuery } from "@tanstack/react-query";
import type { PriceHistoryResponse, PriceResponse } from "@polywatch/shared";
import { api } from "../lib/api";

export function useMarketPrices(tokenIds: string[]) {
  return useQuery({
    queryKey: ["prices", tokenIds],
    enabled: tokenIds.length > 0,
    queryFn: async () => {
      const response = await api.post<Array<{ tokenId: string; data: PriceResponse }>>("/prices/batch", {
        tokenIds,
      });
      return response.data;
    },
    staleTime: 25_000,
    refetchInterval: 30_000,
  });
}

export function usePriceHistory(tokenId: string | undefined, interval: "1m" | "1h" | "1d" | "1w" = "1d") {
  return useQuery({
    queryKey: ["price-history", tokenId, interval],
    enabled: Boolean(tokenId),
    queryFn: async () => {
      const response = await api.get<PriceHistoryResponse>(`/prices/history/${tokenId}`, {
        params: {
          interval,
        },
      });
      return response.data;
    },
    staleTime: 25_000,
    refetchInterval: 30_000,
  });
}
