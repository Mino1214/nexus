import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { CategoryId, LanguageCode, SortOptionId } from "@polywatch/shared";

interface SettingState {
  language: LanguageCode;
  category: CategoryId;
  sort: SortOptionId;
  search: string;
  setLanguage: (language: LanguageCode) => void;
  setCategory: (category: CategoryId) => void;
  setSort: (sort: SortOptionId) => void;
  setSearch: (search: string) => void;
}

export const useSettingStore = create<SettingState>()(
  persist(
    (set) => ({
      language: "ko",
      category: "hot",
      sort: "volume24hr",
      search: "",
      setLanguage: (language) => set({ language }),
      setCategory: (category) => set({ category }),
      setSort: (sort) => set({ sort }),
      setSearch: (search) => set({ search }),
    }),
    {
      name: "polywatch-settings",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        language: state.language,
        category: state.category,
        sort: state.sort,
        search: state.search,
      }),
    },
  ),
);
