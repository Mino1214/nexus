import { CATEGORIES, SORT_OPTIONS, type CategoryId, type SortOptionId } from "@polywatch/shared";
import type { ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import Button from "../ui/Button";

interface MarketFilterProps {
  category: CategoryId;
  sort: SortOptionId;
  search: string;
  language: "ko" | "ja" | "zh" | "en";
  onCategoryChange: (category: CategoryId) => void;
  onSortChange: (sort: SortOptionId) => void;
  onSearchChange: (search: string) => void;
}

export default function MarketFilter({
  category,
  sort,
  search,
  language,
  onCategoryChange,
  onSortChange,
  onSearchChange,
}: MarketFilterProps) {
  const { t } = useTranslation();

  return (
    <section className="glass-panel rounded-[28px] p-4 sm:p-5">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((item) => (
            <Button
              key={item.id}
              variant={item.id === category ? "primary" : "secondary"}
              onClick={() => onCategoryChange(item.id)}
            >
              {item.label[language === "en" ? "ko" : language]}
            </Button>
          ))}
        </div>

        <div className="flex flex-col gap-3 md:flex-row">
          <label className="flex-1">
            <span className="mb-2 block text-xs uppercase tracking-[0.16em] text-[var(--color-muted)]">{t("filter.searchPlaceholder")}</span>
            <input
              value={search}
              onChange={(event: ChangeEvent<HTMLInputElement>) => onSearchChange(event.target.value)}
              placeholder={t("filter.searchPlaceholder")}
              className="w-full rounded-2xl border border-[var(--color-border)] bg-[rgba(255,255,255,0.03)] px-4 py-3 text-sm text-[var(--color-text)] outline-none transition focus:border-[rgba(86,212,199,0.36)]"
            />
          </label>

          <label className="md:w-64">
            <span className="mb-2 block text-xs uppercase tracking-[0.16em] text-[var(--color-muted)]">{t("filter.sort")}</span>
            <select
              value={sort}
              onChange={(event) => onSortChange(event.target.value as SortOptionId)}
              className="w-full rounded-2xl border border-[var(--color-border)] bg-[rgba(255,255,255,0.03)] px-4 py-3 text-sm text-[var(--color-text)] outline-none transition focus:border-[rgba(86,212,199,0.36)]"
            >
              {SORT_OPTIONS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label[language === "en" ? "ko" : language]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
    </section>
  );
}
