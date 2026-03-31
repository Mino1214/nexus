import { calcOdds, getOutcomePrices, getOutcomes, getTokenIds, matchMarketToCategory, type PolyMarket } from "@polywatch/shared";
import { getMarkets, getPriceHistory, searchMarkets } from "./polymarket.js";

export interface AutomatedTemplateOutcome {
  label: string;
  probability: number;
  odds: number;
}

export interface AutomatedTemplateSuggestion {
  marketId: string;
  marketQuestion: string;
  marketSlug: string | null;
  marketType: "yes-no" | "multi-candidate";
  category: string;
  templateName: string;
  titlePattern: string;
  description: string;
  outcomes: AutomatedTemplateOutcome[];
  suggestedMargin: number;
  trendDirection: "up" | "down" | "flat";
  trendDeltaPercent: number;
  volume24h: number;
  liquidity: number;
  query: string;
  refreshSeconds: number;
}

function round(value: number, decimals = 2) {
  return Number(value.toFixed(decimals));
}

function normalizeKeywordQuery(rawQuery: string, marketType: "yes-no" | "multi-candidate") {
  const trimmed = rawQuery.trim();
  if (trimmed) {
    let mapped = trimmed
      .replace(/대통령\s*선거/gi, "president election")
      .replace(/대선/gi, "president election")
      .replace(/정치/gi, "politics")
      .replace(/승자|당선|우승/gi, "winner")
      .replace(/후보/gi, "candidate")
      .replace(/한국|대한민국/gi, "korea")
      .replace(/여론조사/gi, "poll")
      .replace(/지지율/gi, "approval")
      .replace(/\s+/g, " ")
      .trim();

    if (marketType === "multi-candidate" && !/[,/]/.test(trimmed) && !/\b(winner|candidate|nominee|primary)\b/i.test(mapped)) {
      mapped = `${mapped} winner`;
    }

    return mapped || trimmed;
  }

  return marketType === "multi-candidate"
    ? "president election winner"
    : "president approval election politics";
}

function getSuggestedMargin(market: PolyMarket) {
  const liquidity = Number(market.liquidityNum ?? market.liquidity ?? 0);
  const volume24h = Number(market.volume24hr ?? 0);

  if (volume24h >= 10_000_000 || liquidity >= 2_000_000) {
    return 0.05;
  }

  if (volume24h >= 1_000_000 || liquidity >= 500_000) {
    return 0.06;
  }

  if (volume24h >= 100_000 || liquidity >= 100_000) {
    return 0.07;
  }

  return 0.09;
}

function uniqueMarkets(markets: PolyMarket[]) {
  const seen = new Set<string>();
  return markets.filter((market) => {
    if (seen.has(market.id)) {
      return false;
    }
    seen.add(market.id);
    return true;
  });
}

function buildQueryVariants(query: string, marketType: "yes-no" | "multi-candidate") {
  const seeds = marketType === "multi-candidate"
    ? [
        query,
        `${query} winner`,
        `${query} candidate`,
        `${query} election winner`,
        "president election winner",
        "who will win election",
      ]
    : [
        query,
        `${query} yes no`,
        `${query} approval`,
        `${query} politics`,
        "president election",
      ];

  return [...new Set(seeds.map((item) => item.replace(/\s+/g, " ").trim()).filter(Boolean))];
}

async function getTrend(market: PolyMarket, preferredIndex = 0) {
  const tokenIds = getTokenIds(market);
  const tokenId = tokenIds[preferredIndex] ?? tokenIds[0] ?? null;
  if (!tokenId) {
    return { trendDirection: "flat" as const, trendDeltaPercent: 0 };
  }

  const history = await getPriceHistory(tokenId, "1d");
  const points = Array.isArray(history.history) ? history.history : [];
  if (points.length < 2) {
    return { trendDirection: "flat" as const, trendDeltaPercent: 0 };
  }

  const first = Number(points[0]?.p ?? points[0]?.price ?? 0);
  const last = Number(points[points.length - 1]?.p ?? points[points.length - 1]?.price ?? 0);
  const deltaPercent = round((last - first) * 100, 1);

  return {
    trendDirection: deltaPercent > 0.4 ? "up" as const : deltaPercent < -0.4 ? "down" as const : "flat" as const,
    trendDeltaPercent: deltaPercent,
  };
}

function buildDescription(market: PolyMarket, marketType: "yes-no" | "multi-candidate", margin: number) {
  const base = market.translation?.question ?? market.question;
  if (marketType === "multi-candidate") {
    return `${base} 시장을 기준으로 다중 후보 자동 배당을 구성합니다. 서버가 실시간 가격과 거래량을 기준으로 배당을 다시 계산합니다. 기본 마진 ${Math.round(margin * 100)}%.`;
  }

  return `${base} 시장을 기준으로 YES/NO 자동 배당을 구성합니다. 서버가 실시간 가격과 거래량을 기준으로 배당을 다시 계산합니다. 기본 마진 ${Math.round(margin * 100)}%.`;
}

function mapSuggestion(market: PolyMarket, marketType: "yes-no" | "multi-candidate", query: string, trend: { trendDirection: "up" | "down" | "flat"; trendDeltaPercent: number }) {
  const outcomes = getOutcomes(market);
  const outcomePrices = getOutcomePrices(market);
  const margin = getSuggestedMargin(market);
  const normalizedOutcomes = outcomes
    .map((label, index) => ({
      label,
      probability: round(Number(outcomePrices[index] ?? 0), 4),
      odds: calcOdds(Number(outcomePrices[index] ?? 0), margin),
    }))
    .filter((item) => item.probability > 0)
    .sort((left, right) => right.probability - left.probability);

  return {
    marketId: market.id,
    marketQuestion: market.translation?.question ?? market.question,
    marketSlug: market.slug ?? null,
    marketType,
    category: matchMarketToCategory(market, "politics") ? "politics" : "hot",
    templateName: marketType === "multi-candidate" ? "자동 다중후보 템플릿" : "자동 YES/NO 템플릿",
    titlePattern: marketType === "multi-candidate" ? "다중 후보 자동 배당" : "YES/NO 자동 배당",
    description: buildDescription(market, marketType, margin),
    outcomes: normalizedOutcomes,
    suggestedMargin: margin,
    trendDirection: trend.trendDirection,
    trendDeltaPercent: trend.trendDeltaPercent,
    volume24h: Number(market.volume24hr ?? 0),
    liquidity: Number(market.liquidityNum ?? market.liquidity ?? 0),
    query,
    refreshSeconds: 30,
  } satisfies AutomatedTemplateSuggestion;
}

function filterCandidateMarkets(markets: PolyMarket[], marketType: "yes-no" | "multi-candidate") {
  return markets.filter((market) => {
    const outcomes = getOutcomes(market);
    if (marketType === "yes-no") {
      return outcomes.length === 2;
    }
    return outcomes.length > 2;
  });
}

function extractCandidateLabels(query: string) {
  return query
    .split(/[,/]/)
    .map((item) => item.trim())
    .filter((item) => item && item.length <= 20)
    .slice(0, 5);
}

function buildSyntheticMultiSuggestion(query: string): AutomatedTemplateSuggestion {
  const labels = extractCandidateLabels(query);
  const candidates = labels.length >= 3 ? labels : ["후보 1", "후보 2", "후보 3"];
  const weights = candidates.length === 3
    ? [0.42, 0.33, 0.25]
    : candidates.map((_item, index) => round(Math.max(0.1, 1 / (index + 2)), 4));
  const total = weights.reduce((sum, value) => sum + value, 0);
  const margin = 0.09;
  const normalized = weights.map((value) => round(value / total, 4));

  return {
    marketId: `synthetic-${query.replace(/\s+/g, "-").toLowerCase() || "candidate-board"}`,
    marketQuestion: `${query || "후보형 질문"} 자동 다중선택`,
    marketSlug: null,
    marketType: "multi-candidate",
    category: "politics",
    templateName: "후보형 자동 보드",
    titlePattern: "후보 선택 자동 배당",
    description: `${query || "정치 질문"} 기준으로 후보형 자동 배당 보드를 만듭니다. 서버가 입력된 후보 목록을 기준으로 기본 배당을 구성하고 이후 실시간으로 조정할 수 있습니다.`,
    outcomes: candidates.map((label, index) => ({
      label,
      probability: normalized[index],
      odds: calcOdds(normalized[index], margin),
    })),
    suggestedMargin: margin,
    trendDirection: "flat",
    trendDeltaPercent: 0,
    volume24h: 0,
    liquidity: 0,
    query,
    refreshSeconds: 30,
  };
}

export async function getAutomatedTemplateSuggestions(input: {
  q?: string;
  marketType: "yes-no" | "multi-candidate";
  limit?: number;
}) {
  const marketType = input.marketType;
  const query = normalizeKeywordQuery(input.q ?? "", marketType);
  const limit = Math.min(6, Math.max(1, input.limit ?? 4));

  const queryVariants = buildQueryVariants(query, marketType);
  const searchResults = await Promise.all(queryVariants.map((variant) => searchMarkets(variant, 1, 24)));
  let sourceMarkets = filterCandidateMarkets(uniqueMarkets(searchResults.flatMap((result) => result.items)), marketType);

  if (sourceMarkets.length < limit) {
    const politicsResults = await Promise.all([1, 2, 3].map((page) => getMarkets({
      category: "politics",
      sort: "volume24hr",
      page,
      limit: 40,
      q: "",
    })));
    const fallbackMarkets = filterCandidateMarkets(uniqueMarkets(politicsResults.flatMap((result) => result.items)), marketType)
      .filter((market) => !sourceMarkets.some((existing) => existing.id === market.id));
    sourceMarkets = sourceMarkets.concat(fallbackMarkets);
  }

  if (sourceMarkets.length < limit) {
    const hotResults = await Promise.all([1, 2, 3].map((page) => getMarkets({
      category: "hot",
      sort: "volume24hr",
      page,
      limit: 40,
      q: "",
    })));
    const fallbackMarkets = filterCandidateMarkets(uniqueMarkets(hotResults.flatMap((result) => result.items)), marketType)
      .filter((market) => !sourceMarkets.some((existing) => existing.id === market.id));
    sourceMarkets = sourceMarkets.concat(fallbackMarkets);
  }

  const selected = sourceMarkets.slice(0, limit);
  if (!selected.length && marketType === "multi-candidate") {
    return {
      query,
      marketType,
      generatedAt: new Date().toISOString(),
      refreshSeconds: 30,
      suggestions: [buildSyntheticMultiSuggestion(query)],
    };
  }

  const suggestions = await Promise.all(selected.map(async (market) => {
    const prices = getOutcomePrices(market);
    const preferredIndex = prices.reduce((bestIndex, value, index, array) => (
      Number(value) > Number(array[bestIndex] ?? 0) ? index : bestIndex
    ), 0);
    const trend = await getTrend(market, preferredIndex);
    return mapSuggestion(market, marketType, query, trend);
  }));

  return {
    query,
    marketType,
    generatedAt: new Date().toISOString(),
    refreshSeconds: 30,
    suggestions,
  };
}
