import type { LanguageCode, PolyMarket } from "@polywatch/shared";

const LOCALE_BY_LANGUAGE: Record<LanguageCode, string> = {
  ko: "ko-KR",
  ja: "ja-JP",
  zh: "zh-CN",
  en: "en-US",
};

export function languageToLocale(language: LanguageCode = "en") {
  return LOCALE_BY_LANGUAGE[language] ?? LOCALE_BY_LANGUAGE.en;
}

export function formatPercent(value: number) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`;
}

export function formatCompactUsd(value: number | string, language: LanguageCode = "en") {
  const number = Number(value || 0);
  return new Intl.NumberFormat(languageToLocale(language), {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(number);
}

export function formatPoints(value: number | string, language: LanguageCode = "ko") {
  return `${new Intl.NumberFormat(languageToLocale(language)).format(Number(value || 0))}P`;
}

export function formatDate(value?: string, language: LanguageCode = "ko") {
  if (!value) {
    return "—";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat(languageToLocale(language), {
    month: "short",
    day: "numeric",
  }).format(date);
}

export function formatOdds(value: number) {
  return `${value.toFixed(2)}x`;
}

export function displayQuestion(market: PolyMarket) {
  return market.translation?.question ?? market.question;
}

export function displayDescription(market: PolyMarket) {
  return market.translation?.description ?? market.description ?? "";
}

export function cx(...classNames: Array<string | false | null | undefined>) {
  return classNames.filter(Boolean).join(" ");
}
