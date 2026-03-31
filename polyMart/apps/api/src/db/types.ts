import type { BetRecord, BetStatus, LanguageCode, StoredTranslation, TranslationSource, UserStats } from "@polywatch/shared";
import type { AdminBusinessState } from "./businessTypes.js";

export interface StoredUser {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  points: number;
  lang: LanguageCode;
  referrerId: string | null;
  lastLogin: string | null;
  createdAt: string;
}

export interface PointLogRecord {
  id: string;
  userId: string;
  delta: number;
  reason: string;
  refId: string | null;
  createdAt: string;
}

export interface DailyLoginRecord {
  userId: string;
  date: string;
}

export interface TranslationRecord extends StoredTranslation {
  source: TranslationSource;
}

export interface DatabaseState {
  users: StoredUser[];
  bets: BetRecord[];
  pointLogs: PointLogRecord[];
  dailyLogins: DailyLoginRecord[];
  translations: TranslationRecord[];
  business: AdminBusinessState;
}

export type PersistenceMode = "postgres" | "local-file";

export interface AdminTrendPoint {
  date: string;
  bets: number;
  pointsWagered: number;
  uniqueUsers: number;
  settled: number;
}

export interface AdminRecentBet extends BetRecord {
  username: string;
}

export interface AdminTopUser {
  id: string;
  username: string;
  points: number;
  lastLogin: string | null;
}

export interface AdminUsersSnapshot {
  totalUsers: number;
  newUsers24h: number;
  newUsers7d: number;
  totalPointsHeld: number;
  averagePoints: number;
  activeBettors7d: number;
  dailyLogins7d: number;
  topUsers: AdminTopUser[];
}

export interface AdminBettingSnapshot {
  totalBets: number;
  pendingBets: number;
  wonBets: number;
  lostBets: number;
  uniqueBettors: number;
  uniqueBettors7d: number;
  betCount24h: number;
  points24h: number;
  totalPointsWagered: number;
  pendingPotentialPayout: number;
  pendingStake: number;
  platformNetSettled: number;
  pendingOverdue: number;
  recentBets: AdminRecentBet[];
  trend: AdminTrendPoint[];
}

export interface AdminEconomySnapshot {
  signupAwarded: number;
  dailyAwarded: number;
  betPlaced: number;
  betWinsPaid: number;
  netPointFlow: number;
  pointLogCount: number;
}

export interface AdminDashboardSnapshot {
  users: AdminUsersSnapshot;
  betting: AdminBettingSnapshot;
  economy: AdminEconomySnapshot;
}

export function isBetStatus(value: string): value is BetStatus {
  return value === "pending" || value === "won" || value === "lost" || value === "cancelled";
}

export function computeUserStats(bets: BetRecord[]): UserStats {
  const settled = bets.filter((bet) => bet.status === "won" || bet.status === "lost");
  const wins = settled.filter((bet) => bet.status === "won");
  const totalProfit = bets.reduce((sum, bet) => {
    if (bet.status === "won") {
      return sum + (bet.potentialWin - bet.pointsBet);
    }

    if (bet.status === "lost") {
      return sum - bet.pointsBet;
    }

    return sum;
  }, 0);

  return {
    totalBets: bets.length,
    winRate: settled.length ? Number(((wins.length / settled.length) * 100).toFixed(1)) : 0,
    totalProfit,
    activeBets: bets.filter((bet) => bet.status === "pending").length,
  };
}
