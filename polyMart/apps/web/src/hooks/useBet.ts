import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { BetResponse, CreateBetRequest } from "@polywatch/shared";
import { api } from "../lib/api";
import { useUserStore } from "../store/userStore";

export function useBet() {
  const queryClient = useQueryClient();
  const user = useUserStore((state) => state.user);
  const setUser = useUserStore((state) => state.setUser);

  return useMutation({
    mutationFn: async (payload: CreateBetRequest) => {
      const response = await api.post<BetResponse>("/bets", payload);
      return response.data;
    },
    onSuccess: async (data) => {
      if (user) {
        setUser({
          ...user,
          points: data.remaining_points,
        });
      }

      await queryClient.invalidateQueries({ queryKey: ["my-bets"] });
      await queryClient.invalidateQueries({ queryKey: ["me"] });
    },
  });
}
