import { Router } from "express";
import { BET_RULES, POINT_RULES, type LeaderboardEntry, type PolyMarket } from "@polywatch/shared";
import { getAdminDashboardSnapshot, getDatabaseHealth, getPersistenceMode } from "../db/index.js";
import { getSettlementQueueMode } from "../jobs/settlement.js";
import { getAdminAuthMode, hasExternalAdminSsoConfigured, hasSafeJwtSecret } from "../lib/env.js";
import { getCacheHealth, getCacheMode } from "../services/cache.js";
import { getLeaderboard, getMarkets } from "../services/polymarket.js";

const router = Router();

function safeParseJsonArray<T>(value: unknown, fallback: T[] = []) {
  if (Array.isArray(value)) {
    return value as T[];
  }

  if (typeof value !== "string" || !value.trim()) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : fallback;
  } catch {
    return fallback;
  }
}

function mapHotMarket(market: PolyMarket) {
  const outcomePrices = safeParseJsonArray<number | string>(market.outcomePrices, []);
  const outcomes = safeParseJsonArray<string>(market.outcomes, []);

  return {
    id: market.id,
    question: market.translation?.question ?? market.question,
    yesPrice: Number(outcomePrices[0] ?? 0),
    volume24h: Number(market.volume24hr ?? 0),
    liquidity: Number(market.liquidityNum ?? market.liquidity ?? 0),
    endDate: market.endDate ?? null,
    outcomeCount: outcomes.length || 2,
    slug: market.slug ?? null,
  };
}

function mapLeaderboardItem(item: LeaderboardEntry) {
  return {
    name: item.name ?? null,
    wallet: item.proxyWallet ?? item.address ?? null,
    volume: Number(item.volume ?? 0),
    pnl: Number(item.pnl ?? item.profit ?? 0),
  };
}

router.get("/", async (_req, res, next) => {
  try {
    const [snapshot, hotMarkets, leaderboard, database, cache] = await Promise.all([
      getAdminDashboardSnapshot(),
      getMarkets({
        category: "hot",
        sort: "volume24hr",
        page: 1,
        limit: 5,
        q: "",
      }),
      getLeaderboard("weekly", 5),
      getDatabaseHealth(),
      getCacheHealth(),
    ]);

    const queue = {
      mode: getSettlementQueueMode(),
      ready: getSettlementQueueMode() === "inline" ? true : cache.ready,
    };

    res.json({
      generatedAt: new Date().toISOString(),
      system: {
        database,
        cache: {
          mode: getCacheMode(),
          ready: cache.ready,
          message: cache.message,
        },
        queue,
        persistence: getPersistenceMode(),
        translation: process.env.DEEPL_API_KEY ? "deepl+db" : "manual+db",
        adminAuth: getAdminAuthMode(),
        externalAdminSso: hasExternalAdminSsoConfigured() ? "enabled" : "disabled",
        jwt: hasSafeJwtSecret() ? "custom" : "development-placeholder",
      },
      markets: {
        hot: hotMarkets.items.map(mapHotMarket),
        leaderboard: leaderboard.map(mapLeaderboardItem),
        pulse: {
          trackedMarkets: hotMarkets.items.length,
          top24hVolume: hotMarkets.items.reduce((sum, market) => sum + Number(market.volume24hr ?? 0), 0),
          totalLiquidity: hotMarkets.items.reduce((sum, market) => sum + Number(market.liquidityNum ?? market.liquidity ?? 0), 0),
        },
      },
      rules: {
        points: POINT_RULES,
        betting: BET_RULES,
      },
      dashboard: snapshot,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
