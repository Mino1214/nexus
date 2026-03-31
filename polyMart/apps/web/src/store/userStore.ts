import type { AuthUser, UserStats } from "@polywatch/shared";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface UserState {
  token: string | null;
  user: AuthUser | null;
  stats: UserStats | null;
  authenticated: boolean;
  setSession: (payload: { token: string; user: AuthUser; stats: UserStats }) => void;
  setUser: (user: AuthUser) => void;
  setStats: (stats: UserStats) => void;
  clearSession: () => void;
}

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      stats: null,
      authenticated: false,
      setSession: ({ token, user, stats }) =>
        set({
          token,
          user,
          stats,
          authenticated: true,
        }),
      setUser: (user) =>
        set((state) => ({
          user,
          authenticated: Boolean(state.token),
        })),
      setStats: (stats) => set({ stats }),
      clearSession: () =>
        set({
          token: null,
          user: null,
          stats: null,
          authenticated: false,
        }),
    }),
    {
      name: "polywatch-auth",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
