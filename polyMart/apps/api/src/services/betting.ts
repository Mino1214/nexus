import { randomUUID } from "node:crypto";
import { BET_RULES, calcOdds, getOutcomePrices, getOutcomes, type BetRecord, type BetResponse } from "@polywatch/shared";
import { findUserById, getUserStats, listMarketBetsForUser, listUserBets, placeBet, type PointLogRecord } from "../db/index.js";
import { badRequest, notFound } from "../lib/http.js";
import { getMarket } from "./polymarket.js";

export async function createBet(input: {
  userId: string;
  marketId: string;
  outcome: string;
  points: number;
}): Promise<{ response: BetResponse; bet: BetRecord }> {
  const user = await findUserById(input.userId);
  if (!user) {
    throw notFound("User not found.");
  }

  if (input.points < BET_RULES.min_bet || input.points > BET_RULES.max_bet) {
    throw badRequest(`Bet points must be between ${BET_RULES.min_bet} and ${BET_RULES.max_bet}.`);
  }

  if (user.points < input.points) {
    throw badRequest("Insufficient points.");
  }

  const market = await getMarket(input.marketId);
  if (!market || !market.active || market.closed) {
    throw badRequest("This market is no longer open.");
  }

  if (market.endDate && new Date(market.endDate).getTime() <= Date.now()) {
    throw badRequest("This market is already at or past its deadline.");
  }

  const outcomes = getOutcomes(market);
  const prices = getOutcomePrices(market);
  const outcomeIndex = outcomes.findIndex((outcome) => outcome === input.outcome);
  if (outcomeIndex < 0) {
    throw badRequest("Selected outcome does not exist on this market.");
  }

  const price = prices[outcomeIndex] ?? 0;
  const odds = calcOdds(price);
  const potentialWin = Math.floor(input.points * odds);
  const timestamp = new Date().toISOString();

  const bet: BetRecord = {
    id: randomUUID(),
    userId: input.userId,
    marketId: market.id,
    marketQuestion: market.question,
    outcome: input.outcome,
    pointsBet: input.points,
    odds,
    potentialWin,
    status: "pending",
    marketEndDate: market.endDate ?? null,
    settledAt: null,
    createdAt: timestamp,
  };

  const pointLog: PointLogRecord = {
    id: randomUUID(),
    userId: input.userId,
    delta: -input.points,
    reason: "bet_place",
    refId: bet.id,
    createdAt: timestamp,
  };

  const updatedUser = await placeBet(input.userId, bet, pointLog);

  return {
    bet,
    response: {
      bet_id: bet.id,
      odds,
      potential_win: potentialWin,
      remaining_points: updatedUser.points,
    },
  };
}

export async function getMyBets(userId: string, options: { status?: string; page: number; limit: number }) {
  const bets = await listUserBets(userId);
  const filtered = options.status && options.status !== "all" ? bets.filter((bet) => bet.status === options.status) : bets;
  const page = Math.max(1, options.page);
  const limit = Math.min(50, Math.max(1, options.limit));
  const offset = (page - 1) * limit;

  return {
    items: filtered.slice(offset, offset + limit),
    page,
    limit,
    total: filtered.length,
    stats: await getUserStats(userId),
  };
}

export async function getMyMarketBets(userId: string, marketId: string) {
  return listMarketBetsForUser(userId, marketId);
}
