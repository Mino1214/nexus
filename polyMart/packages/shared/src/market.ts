export type LanguageCode = "ko" | "ja" | "zh" | "en";

export interface LocalizedLabel {
  ko: string;
  ja: string;
  zh: string;
}

export interface MarketTag {
  id: string;
  label: string;
  slug: string;
}

export interface MarketEvent {
  id?: string;
  slug?: string;
  title?: string;
}

export interface PolyMarketTranslation {
  question: string;
  description: string;
}

export type TranslationSource = "machine" | "manual";

export interface StoredTranslation extends PolyMarketTranslation {
  marketId: string;
  lang: LanguageCode;
  translatedAt: string;
  source: TranslationSource;
}

export interface PolyMarket {
  id: string;
  question: string;
  description?: string;
  image?: string;
  icon?: string;
  outcomes: string;
  outcomePrices: string;
  clobTokenIds: string;
  volume: number | string;
  volume24hr?: number | string;
  liquidity?: number | string;
  liquidityNum?: number | string;
  startDate?: string;
  endDate?: string;
  active: boolean;
  closed: boolean;
  tags?: MarketTag[];
  slug?: string;
  eventSlug?: string | null;
  events?: MarketEvent[] | null;
  resolution?: string | null;
  translation?: PolyMarketTranslation | null;
}

export interface PricePoint {
  t?: number | string;
  p?: number | string;
  price?: number | string;
}

export interface PriceHistoryResponse {
  history: PricePoint[];
}

export interface PriceResponse {
  price?: string | number;
  asset_id?: string;
  side?: string;
  size?: string | number;
}

export interface LeaderboardEntry {
  name?: string;
  proxyWallet?: string;
  address?: string;
  volume?: number | string;
  pnl?: number | string;
  profit?: number | string;
}

export interface PaginatedMarketsResponse {
  items: PolyMarket[];
  page: number;
  limit: number;
  hasMore: boolean;
  category: CategoryId;
  sort: SortOptionId;
  q: string;
}

export interface TranslationListResponse {
  items: StoredTranslation[];
  page: number;
  limit: number;
  total: number;
}

export const CATEGORIES = [
  {
    id: "hot",
    label: { ko: "🔥 인기", ja: "🔥 人気", zh: "🔥 热门" },
    slugs: [],
    filter: { order: "volume24hr", ascending: false },
  },
  {
    id: "politics",
    label: { ko: "🏛 정치", ja: "🏛 政治", zh: "🏛 政治" },
    slugs: ["politics", "us-politics", "elections", "trump", "global-elections"],
  },
  {
    id: "crypto",
    label: { ko: "💰 크립토", ja: "💰 暗号資産", zh: "💰 加密货币" },
    slugs: ["crypto", "bitcoin", "ethereum", "defi", "nft"],
  },
  {
    id: "sports",
    label: { ko: "⚽ 스포츠", ja: "⚽ スポーツ", zh: "⚽ 体育" },
    slugs: ["sports", "soccer", "nba", "nfl", "mlb", "esports"],
  },
  {
    id: "finance",
    label: { ko: "📈 경제", ja: "📈 経済", zh: "📈 经济" },
    slugs: ["economics", "finance", "stocks", "fed", "macro"],
  },
  {
    id: "science",
    label: { ko: "🔬 과학·AI", ja: "🔬 科学·AI", zh: "🔬 科技·AI" },
    slugs: ["science", "ai", "technology", "space", "climate", "health"],
  },
  {
    id: "entertainment",
    label: { ko: "🎬 엔터", ja: "🎬 エンタメ", zh: "🎬 娱乐" },
    slugs: ["entertainment", "awards", "gaming", "culture", "media"],
  },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]["id"];

export const SORT_OPTIONS = [
  { id: "volume24hr", label: { ko: "24h 거래량", ja: "24h出来高", zh: "24h成交量" } },
  { id: "volume", label: { ko: "총 거래량", ja: "総出来高", zh: "总成交量" } },
  { id: "liquidity", label: { ko: "유동성", ja: "流動性", zh: "流动性" } },
  { id: "endDate", label: { ko: "마감 임박", ja: "締切間近", zh: "即将截止" } },
  { id: "new", label: { ko: "최신", ja: "新着", zh: "最新" } },
] as const;

export type SortOptionId = (typeof SORT_OPTIONS)[number]["id"];

export function getCategoryById(categoryId: CategoryId) {
  return CATEGORIES.find((category) => category.id === categoryId) ?? CATEGORIES[0];
}

export function isCategoryId(value: string): value is CategoryId {
  return CATEGORIES.some((category) => category.id === value);
}

export function isLanguageCode(value: string): value is LanguageCode {
  return value === "ko" || value === "ja" || value === "zh" || value === "en";
}

export function isSortOptionId(value: string): value is SortOptionId {
  return SORT_OPTIONS.some((option) => option.id === value);
}

export function parseJsonArray<T>(value: string | T[] | undefined | null, fallback: T[] = []): T[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return fallback;
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function getOutcomePrices(market: Pick<PolyMarket, "outcomePrices">) {
  return parseJsonArray<string | number>(market.outcomePrices, []).map((value) => Number(value ?? 0));
}

export function getOutcomes(market: Pick<PolyMarket, "outcomes">) {
  return parseJsonArray<string>(market.outcomes, ["Yes", "No"]);
}

export function getTokenIds(market: Pick<PolyMarket, "clobTokenIds">) {
  return parseJsonArray<string>(market.clobTokenIds, []);
}

export function toNumber(value: unknown) {
  const next = Number(value ?? 0);
  return Number.isFinite(next) ? next : 0;
}

export function getPrimaryEventSlug(market: Pick<PolyMarket, "eventSlug" | "events">) {
  const eventSlug = typeof market.eventSlug === "string" ? market.eventSlug.trim() : "";
  if (eventSlug) {
    return eventSlug;
  }

  const nestedEventSlug = typeof market.events?.[0]?.slug === "string" ? market.events[0].slug.trim() : "";
  return nestedEventSlug || null;
}

export function buildPolymarketEventUrl(market: Pick<PolyMarket, "slug" | "eventSlug" | "events">) {
  const marketSlug = typeof market.slug === "string" ? market.slug.trim() : "";
  if (!marketSlug) {
    return null;
  }

  const eventSlug = getPrimaryEventSlug(market);
  if (!eventSlug || eventSlug === marketSlug) {
    return `https://polymarket.com/event/${marketSlug}`;
  }

  return `https://polymarket.com/event/${eventSlug}/${marketSlug}`;
}

export function matchMarketToCategory(market: PolyMarket, categoryId: CategoryId) {
  if (categoryId === "hot") {
    return true;
  }

  const category = getCategoryById(categoryId);
  const marketSlugs = (market.tags ?? []).map((tag) => tag.slug?.toLowerCase?.() ?? "");
  return category.slugs.some((slug) => marketSlugs.includes(slug.toLowerCase()));
}
