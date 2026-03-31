import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LanguageCode, StoredTranslation, TranslationListResponse } from "@polywatch/shared";
import { api } from "../lib/api";

export function useAdminTranslations(lang: LanguageCode, page = 1, limit = 20, enabled = true) {
  return useQuery({
    queryKey: ["admin-translations", lang, page, limit],
    queryFn: async () => {
      const response = await api.get<TranslationListResponse>("/admin/translations", {
        params: {
          lang,
          page,
          limit,
        },
      });
      return response.data;
    },
    enabled: enabled && lang !== "en",
    staleTime: 10_000,
  });
}

export function useSaveTranslation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      marketId: string;
      lang: LanguageCode;
      question: string;
      description: string;
    }) => {
      const response = await api.put<StoredTranslation>(
        `/admin/translations/${payload.marketId}/${payload.lang}`,
        {
          question: payload.question,
          description: payload.description,
        },
      );
      return response.data;
    },
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: ["admin-translations", variables.lang] });
      await queryClient.invalidateQueries({ queryKey: ["markets"] });
      await queryClient.invalidateQueries({ queryKey: ["ticker"] });
      await queryClient.invalidateQueries({ queryKey: ["market"] });
    },
  });
}
