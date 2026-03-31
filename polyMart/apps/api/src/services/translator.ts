import axios from "axios";
import type { LanguageCode, PolyMarket, TranslationListResponse } from "@polywatch/shared";
import { cachedFetch } from "./cache.js";
import { findTranslation, listTranslations, upsertTranslation } from "../db/index.js";

const CUSTOM_DICT: Record<string, Record<string, string>> = {
  ko: {
    "Federal Reserve": "연준(Fed)",
    "interest rate": "기준금리",
    Bitcoin: "비트코인",
    Ethereum: "이더리움",
    "Donald Trump": "트럼프(Trump)",
    "Joe Biden": "바이든(Biden)",
    "European Union": "유럽연합(EU)",
    GDP: "GDP(국내총생산)",
    inflation: "인플레이션",
    recession: "경기침체",
    IPO: "IPO(기업공개)",
    ETF: "ETF",
    AI: "AI",
    OpenAI: "OpenAI",
  },
  ja: {
    "Federal Reserve": "連邦準備制度(Fed)",
    "interest rate": "政策金利",
    Bitcoin: "ビットコイン",
    Ethereum: "イーサリアム",
    "Donald Trump": "トランプ(Trump)",
    "Joe Biden": "バイデン(Biden)",
    "European Union": "欧州連合(EU)",
    GDP: "GDP(国内総生産)",
    inflation: "インフレ",
    recession: "景気後退",
    IPO: "IPO(新規株式公開)",
    ETF: "ETF",
    AI: "AI",
    OpenAI: "OpenAI",
  },
  zh: {
    "Federal Reserve": "美联储",
    "interest rate": "基准利率",
    Bitcoin: "比特币",
    Ethereum: "以太坊",
    "Donald Trump": "特朗普(Trump)",
    "Joe Biden": "拜登(Biden)",
    "European Union": "欧盟(EU)",
    GDP: "GDP(国内生产总值)",
    inflation: "通胀",
    recession: "经济衰退",
    IPO: "IPO(首次公开募股)",
    ETF: "ETF",
    AI: "AI",
    OpenAI: "OpenAI",
  },
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function applyDictionary(text: string, lang: LanguageCode) {
  let next = text;
  for (const [source, target] of Object.entries(CUSTOM_DICT[lang] ?? {})) {
    next = next.replace(new RegExp(escapeRegExp(source), "gi"), target);
  }
  return next;
}

export async function translateMarket(market: Pick<PolyMarket, "id" | "question" | "description">, lang: LanguageCode) {
  if (lang === "en") {
    return null;
  }

  const cachedTranslation = await findTranslation(market.id, lang);
  if (cachedTranslation) {
    return {
      question: cachedTranslation.question,
      description: cachedTranslation.description,
    };
  }

  const apiKey = process.env.DEEPL_API_KEY;
  if (!apiKey) {
    // DeepL is intentionally optional in local development.
    // Without an API key, the app falls back to DB-backed manual translations from /admin.
    return null;
  }

  return cachedFetch(`deepl:${market.id}:${lang}`, 60 * 60 * 24, async () => {
    const form = new URLSearchParams();
    form.append("target_lang", lang.toUpperCase());
    form.append("text", market.question);
    form.append("text", market.description ?? "");

    const response = await axios.post<{ translations: Array<{ text: string }> }>(
      "https://api-free.deepl.com/v2/translate",
      form,
      {
        headers: {
          Authorization: `DeepL-Auth-Key ${apiKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      },
    );

    const [translatedQuestion, translatedDescription] = response.data.translations;
    const translation = {
      question: applyDictionary(translatedQuestion?.text ?? market.question, lang),
      description: applyDictionary(translatedDescription?.text ?? market.description ?? "", lang),
    };

    await upsertTranslation({
      marketId: market.id,
      lang,
      question: translation.question,
      description: translation.description,
      source: "machine",
    });

    return translation;
  });
}

export async function attachMarketTranslations(markets: PolyMarket[], lang: LanguageCode) {
  if (lang === "en") {
    return markets.map((market) => ({
      ...market,
      translation: null,
    }));
  }

  const results = await Promise.allSettled(
    markets.map(async (market) => ({
      ...market,
      translation: await translateMarket(
        {
          id: market.id,
          question: market.question,
          description: market.description ?? "",
        },
        lang,
      ),
    })),
  );

  return results.map((result, index) => (result.status === "fulfilled"
    ? result.value
    : {
        ...markets[index],
        translation: null,
      }));
}

export async function saveManualTranslation(input: {
  marketId: string;
  lang: LanguageCode;
  question: string;
  description: string;
}) {
  return upsertTranslation({
    marketId: input.marketId,
    lang: input.lang,
    question: input.question,
    description: input.description,
    source: "manual",
  });
}

export async function getTranslationList(params: {
  lang?: LanguageCode;
  page: number;
  limit: number;
}): Promise<TranslationListResponse> {
  return listTranslations(params);
}
