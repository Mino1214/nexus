import { useQuery } from "@tanstack/react-query";
import type { BetRecord, MyBetsResponse } from "@polywatch/shared";
import { api } from "../lib/api";
import { useUserStore } from "../store/userStore";

export function useMyBets(status = "all", page = 1, limit = 20) {
  const authenticated = useUserStore((state) => state.authenticated);

  return useQuery({
    queryKey: ["my-bets", status, page, limit],
    enabled: authenticated,
    queryFn: async () => {
      const response = await api.get<MyBetsResponse>("/bets/me", {
        params: {
          status,
          page,
          limit,
        },
      });
      return response.data;
    },
  });
}

export function useMyMarketBets(marketId: string | undefined) {
  const authenticated = useUserStore((state) => state.authenticated);

  return useQuery({
    queryKey: ["my-market-bets", marketId],
    enabled: authenticated && Boolean(marketId),
    queryFn: async () => {
      const response = await api.get<BetRecord[]>(`/bets/market/${marketId}`);
      return response.data;
    },
  });
}
