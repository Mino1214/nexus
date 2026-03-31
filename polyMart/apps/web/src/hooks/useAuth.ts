import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AuthResponse, MeResponse } from "@polywatch/shared";
import { api } from "../lib/api";
import { useUserStore } from "../store/userStore";

export function useSessionSync() {
  const token = useUserStore((state) => state.token);
  const setUser = useUserStore((state) => state.setUser);
  const setStats = useUserStore((state) => state.setStats);
  const clearSession = useUserStore((state) => state.clearSession);

  const query = useQuery({
    queryKey: ["me", token],
    enabled: Boolean(token),
    queryFn: async () => {
      const response = await api.get<MeResponse>("/users/me");
      return response.data;
    },
    staleTime: 20_000,
  });

  useEffect(() => {
    if (query.data) {
      setUser(query.data.user);
      setStats(query.data.stats);
    }
  }, [query.data, setStats, setUser]);

  useEffect(() => {
    if (query.isError) {
      clearSession();
    }
  }, [clearSession, query.isError]);

  return query;
}

export function useSignup() {
  const queryClient = useQueryClient();
  const setSession = useUserStore((state) => state.setSession);

  return useMutation({
    mutationFn: async (payload: { username: string; email: string; password: string; lang?: "ko" | "ja" | "zh" | "en" }) => {
      const response = await api.post<AuthResponse>("/auth/signup", payload);
      return response.data;
    },
    onSuccess: (data) => {
      setSession(data);
      void queryClient.invalidateQueries({ queryKey: ["me"] });
      void queryClient.invalidateQueries({ queryKey: ["my-bets"] });
    },
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  const setSession = useUserStore((state) => state.setSession);

  return useMutation({
    mutationFn: async (payload: { email: string; password: string }) => {
      const response = await api.post<AuthResponse>("/auth/login", payload);
      return response.data;
    },
    onSuccess: (data) => {
      setSession(data);
      void queryClient.invalidateQueries({ queryKey: ["me"] });
      void queryClient.invalidateQueries({ queryKey: ["my-bets"] });
    },
  });
}

export function useExternalAdminExchange() {
  const queryClient = useQueryClient();
  const setSession = useUserStore((state) => state.setSession);

  return useMutation({
    mutationFn: async (payload: { token: string }) => {
      const response = await api.post<AuthResponse>("/auth/external/exchange", payload);
      return response.data;
    },
    onSuccess: (data) => {
      setSession(data);
      void queryClient.invalidateQueries({ queryKey: ["me"] });
      void queryClient.invalidateQueries({ queryKey: ["my-bets"] });
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  const clearSession = useUserStore((state) => state.clearSession);

  return useMutation({
    mutationFn: async () => {
      await api.post("/auth/logout");
    },
    onSettled: async () => {
      clearSession();
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      await queryClient.invalidateQueries({ queryKey: ["my-bets"] });
    },
  });
}

export function useDailyLogin() {
  const queryClient = useQueryClient();
  const setUser = useUserStore((state) => state.setUser);

  return useMutation({
    mutationFn: async () => {
      const response = await api.post<{ awarded: number; user: MeResponse["user"] }>("/users/daily-login");
      return response.data;
    },
    onSuccess: async (data) => {
      setUser(data.user);
      await queryClient.invalidateQueries({ queryKey: ["me"] });
    },
  });
}
