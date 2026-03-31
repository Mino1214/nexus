import { useQuery } from "@tanstack/react-query";
import type { LeaderboardEntry } from "@polywatch/shared";
import { api } from "../lib/api";

export function useLeaderboard(window = "weekly", limit = 20) {
  return useQuery({
    queryKey: ["leaderboard", window, limit],
    queryFn: async () => {
      const response = await api.get<LeaderboardEntry[]>("/leaderboard", {
        params: {
          window,
          limit,
        },
      });
      return response.data;
    },
    staleTime: 25_000,
    refetchInterval: 30_000,
  });
}
