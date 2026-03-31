export const POINT_RULES = {
  signup: 1000,
  daily_login: 100,
  referral: 500,
  weekly_rank_1: 5000,
  weekly_rank_2: 3000,
  weekly_rank_3: 2000,
  weekly_top10: 500,
} as const;

export const BET_RULES = {
  min_bet: 100,
  max_bet: 50000,
  margin: 0.07,
} as const;

export interface CreateBetRequest {
  market_id: string;
  outcome: string;
  points: number;
}

export type BetStatus = "pending" | "won" | "lost" | "cancelled";

export interface BetRecord {
  id: string;
  userId: string;
  marketId: string;
  marketQuestion: string;
  outcome: string;
  pointsBet: number;
  odds: number;
  potentialWin: number;
  status: BetStatus;
  marketEndDate?: string | null;
  settledAt?: string | null;
  createdAt: string;
}

export interface BetResponse {
  bet_id: string;
  odds: number;
  potential_win: number;
  remaining_points: number;
}

export interface MyBetsResponse {
  items: BetRecord[];
  page: number;
  limit: number;
  total: number;
  stats: {
    totalBets: number;
    winRate: number;
    totalProfit: number;
    activeBets: number;
  };
}

export function calcOdds(price: number, margin: number = BET_RULES.margin) {
  if (price <= 0 || price >= 1) {
    return 1;
  }

  const rawOdds = 1 / price;
  return Math.round(rawOdds * (1 - margin) * 100) / 100;
}
