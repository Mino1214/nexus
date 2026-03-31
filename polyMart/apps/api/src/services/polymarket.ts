import axios from "axios";
import {
  CATEGORIES,
  type CategoryId,
  getCategoryById,
  type LeaderboardEntry,
  matchMarketToCategory,
  type PaginatedMarketsResponse,
  type PolyMarket,
  type PriceHistoryResponse,
  type PriceResponse,
  type SortOptionId,
  toNumber,
} from "@polywatch/shared";
import { cachedFetch } from "./cache.js";

const gamma = axios.create({
  baseURL: process.env.GAMMA_API_URL ?? "https://gamma-api.polymarket.com",
  timeout: 15_000,
});

const clob = axios.create({
  baseURL: process.env.CLOB_API_URL ?? "https://clob.polymarket.com",
  timeout: 15_000,
});

const dataApi = axios.create({
  baseURL: process.env.DATA_API_URL ?? "https://data-api.polymarket.com",
  timeout: 15_000,
});

function normalizeMarketLinkData<T extends PolyMarket>(market: T): T {
  const eventSlug = typeof market.eventSlug === "string"
    ? market.eventSlug
    : market.events?.[0]?.slug ?? null;

  return {
    ...market,
    eventSlug,
  };
}

function getLeaderboardTimePeriod(window: string) {
  switch (String(window).toLowerCase()) {
    case "daily":
    case "day":
      return "DAY";
    case "monthly":
    case "month":
      return "MONTH";
    case "all":
      return "ALL";
    case "weekly":
    case "week":
    default:
      return "WEEK";
  }
}

function sortMarkets(markets: PolyMarket[], sort: SortOptionId) {
  return [...markets].sort((left, right) => {
    if (sort === "endDate") {
      return new Date(left.endDate ?? 0).getTime() - new Date(right.endDate ?? 0).getTime();
    }

    if (sort === "new") {
      return new Date(right.startDate ?? 0).getTime() - new Date(left.startDate ?? 0).getTime();
    }

    return toNumber(right[sort]) - toNumber(left[sort]);
  });
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

function createPage(
  items: PolyMarket[],
  page: number,
  limit: number,
  category: CategoryId,
  sort: SortOptionId,
  q: string,
  hasMore: boolean,
): PaginatedMarketsResponse {
  return {
    items,
    page,
    limit,
    hasMore,
    category,
    sort,
    q,
  };
}

function getOrder(sort: SortOptionId) {
  if (sort === "new") {
    return "startDate";
  }

  if (sort === "endDate") {
    return "endDate";
  }

  return sort;
}

async function fetchMarketsByTag(tagSlug: string, sort: SortOptionId, limit: number) {
  return cachedFetch(`gamma:markets:${tagSlug}:${sort}:${limit}`, 30, async () => {
    const response = await gamma.get<PolyMarket[]>("/markets", {
      params: {
        active: true,
        closed: false,
        limit,
        offset: 0,
        order: getOrder(sort),
        ascending: sort === "endDate",
        tag_slug: tagSlug,
      },
    });

    return response.data.map((market) => normalizeMarketLinkData(market));
  });
}

export async function getMarkets(params: {
  category: CategoryId;
  sort: SortOptionId;
  page: number;
  limit: number;
  q: string;
}): Promise<PaginatedMarketsResponse> {
  const { category, sort, page, limit, q } = params;
  const normalizedQuery = q.trim();
  const pageSize = Math.min(Math.max(limit, 1), 40);
  const pageOffset = (Math.max(page, 1) - 1) * pageSize;

  if (normalizedQuery) {
    const result = await cachedFetch(
      `gamma:search:${normalizedQuery}:${sort}:${page}:${pageSize}`,
      30,
      async () => {
        const response = await gamma.get<PolyMarket[]>("/markets", {
          params: {
            active: true,
            closed: false,
            limit: pageSize * 3,
            offset: 0,
            order: getOrder(sort),
            ascending: sort === "endDate",
            _c: normalizedQuery,
          },
        });

        return response.data.map((market) => normalizeMarketLinkData(market));
      },
    );

    const filtered = category === "hot" ? result : result.filter((market) => matchMarketToCategory(market, category));
    const sorted = sortMarkets(uniqueMarkets(filtered), sort);
    return createPage(
      sorted.slice(pageOffset, pageOffset + pageSize),
      page,
      pageSize,
      category,
      sort,
      normalizedQuery,
      sorted.length > pageOffset + pageSize,
    );
  }

  if (category === "hot") {
    const result = await cachedFetch(`gamma:hot:${sort}:${page}:${pageSize}`, 30, async () => {
      const response = await gamma.get<PolyMarket[]>("/markets", {
        params: {
          active: true,
          closed: false,
          limit: pageSize + 1,
          offset: pageOffset,
          order: getOrder(sort),
          ascending: sort === "endDate",
        },
      });

      return response.data.map((market) => normalizeMarketLinkData(market));
    });

    return {
      items: result.slice(0, pageSize),
      page,
      limit: pageSize,
      hasMore: result.length > pageSize,
      category,
      sort,
      q: normalizedQuery,
    };
  }

  const categoryConfig = getCategoryById(category);
  const needed = pageOffset + pageSize + 1;
  const resultSets = await Promise.all(
    categoryConfig.slugs.map((slug) => fetchMarketsByTag(slug, sort, needed)),
  );
  const merged = uniqueMarkets(resultSets.flat()).filter((market) => matchMarketToCategory(market, category));
  const sorted = sortMarkets(merged, sort);

  return {
    items: sorted.slice(pageOffset, pageOffset + pageSize),
    page,
    limit: pageSize,
    hasMore: sorted.length > pageOffset + pageSize,
    category,
    sort,
    q: normalizedQuery,
  };
}

export async function searchMarkets(q: string, page = 1, limit = 20) {
  return getMarkets({
    category: CATEGORIES[0].id,
    sort: "volume24hr",
    page,
    limit,
    q,
  });
}

export async function getMarket(marketId: string) {
  return cachedFetch(`gamma:market:${marketId}`, 30, async () => {
    const response = await gamma.get<PolyMarket>(`/markets/${marketId}`);
    const market = normalizeMarketLinkData(response.data);

    if (market.eventSlug || !market.slug) {
      return market;
    }

    const linked = await cachedFetch(`gamma:market-link:${market.slug}`, 30, async () => {
      const linkedResponse = await gamma.get<PolyMarket[]>("/markets", {
        params: {
          slug: market.slug,
        },
      });

      return linkedResponse.data.map((item) => normalizeMarketLinkData(item));
    });

    const matched = linked.find((item) => item.id === market.id) ?? linked[0];
    if (!matched) {
      return market;
    }

    return {
      ...market,
      eventSlug: matched.eventSlug ?? market.eventSlug ?? null,
      events: matched.events ?? market.events ?? null,
    };
  });
}

export async function getPrice(tokenId: string) {
  return cachedFetch(`clob:price:${tokenId}`, 5, async () => {
    try {
      const response = await clob.get<{ mid?: string | number; mid_price?: string | number }>("/midpoint", {
        params: {
          token_id: tokenId,
        },
      });

      return {
        price: response.data.mid ?? response.data.mid_price ?? 0,
      } satisfies PriceResponse;
    } catch (error) {
      if (axios.isAxiosError(error) && (error.response?.status === 400 || error.response?.status === 404)) {
        return {
          price: 0,
        } satisfies PriceResponse;
      }

      throw error;
    }
  });
}

export async function getPricesBatch(tokenIds: string[]) {
  const unique = [...new Set(tokenIds.filter(Boolean))];
  const results = await Promise.all(
    unique.map(async (tokenId) => ({
      tokenId,
      data: await getPrice(tokenId),
    })),
  );

  return results;
}

export async function getPriceHistory(tokenId: string, interval: "1m" | "1h" | "1d" | "1w" = "1d") {
  return cachedFetch(`clob:history:${tokenId}:${interval}`, 30, async () => {
    try {
      const response = await clob.get<PriceHistoryResponse>("/prices-history", {
        params: {
          market: tokenId,
          interval,
        },
      });
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && (error.response?.status === 400 || error.response?.status === 404)) {
        return {
          history: [],
        };
      }

      throw error;
    }
  });
}

export async function getLeaderboard(window = "weekly", limit = 20) {
  return cachedFetch(`data:leaderboard:${window}:${limit}`, 30, async () => {
    type LeaderboardApiEntry = LeaderboardEntry & {
      userName?: string;
      vol?: number | string;
    };

    const response = await dataApi.get<LeaderboardApiEntry[] | { data?: LeaderboardApiEntry[] }>("/v1/leaderboard", {
      params: {
        timePeriod: getLeaderboardTimePeriod(window),
        limit,
      },
    });

    const items = Array.isArray(response.data) ? response.data : response.data.data ?? [];
    return items.map((item) => ({
      ...item,
      name: item.name ?? item.userName,
      volume: item.volume ?? item.vol,
    }));
  });
}
