import type { LanguageCode } from "./market.js";

export type AdminAuthSource = "local" | "pandora";
export type AdminSessionRole = "admin" | "master";

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  points: number;
  lang: LanguageCode;
  isAdmin: boolean;
  authSource?: AdminAuthSource;
  adminRole?: AdminSessionRole | null;
  createdAt: string;
  lastLogin?: string | null;
}

export interface UserStats {
  totalBets: number;
  winRate: number;
  totalProfit: number;
  activeBets: number;
}

export interface MeResponse {
  user: AuthUser;
  stats: UserStats;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
  stats: UserStats;
}
