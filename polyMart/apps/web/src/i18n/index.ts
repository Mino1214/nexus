import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import type { LanguageCode } from "@polywatch/shared";
import ko from "./locales/ko.json";
import ja from "./locales/ja.json";
import zh from "./locales/zh.json";

function getInitialLanguage(): LanguageCode {
  if (typeof window === "undefined") {
    return "ko";
  }

  try {
    const raw = window.localStorage.getItem("polywatch-settings");
    if (!raw) {
      return "ko";
    }

    const parsed = JSON.parse(raw) as { state?: { language?: LanguageCode } };
    const language = parsed.state?.language;
    return language === "ja" || language === "zh" || language === "en" || language === "ko" ? language : "ko";
  } catch {
    return "ko";
  }
}

const initialLanguage = getInitialLanguage();

if (typeof document !== "undefined") {
  document.documentElement.lang = initialLanguage;
}

i18n.use(initReactI18next).init({
  resources: {
    ko: { translation: ko },
    ja: { translation: ja },
    zh: { translation: zh },
  },
  lng: initialLanguage,
  fallbackLng: "ko",
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
