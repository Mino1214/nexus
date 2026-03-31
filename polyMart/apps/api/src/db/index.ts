import type { BetRecord, UserStats } from "@polywatch/shared";
import type { StoredTranslation, TranslationSource } from "@polywatch/shared";
import type { AdminBusinessState, ApiBusinessClientRecord, ApiBusinessKeyRecord, ApiBusinessResellerRecord, ApiBusinessTemplateRecord } from "./businessTypes.js";
import * as fileStore from "./fileStore.js";
import * as postgresStore from "./postgresStore.js";
import type { AdminDashboardSnapshot, PersistenceMode, PointLogRecord, StoredUser, TranslationRecord } from "./types.js";
export type { DatabaseState, DailyLoginRecord, PersistenceMode, PointLogRecord, StoredUser, TranslationRecord } from "./types.js";
export { isBetStatus } from "./types.js";

function isPostgresConfigured() {
  return Boolean(process.env.DATABASE_URL?.trim());
}

export function getPersistenceMode(): PersistenceMode {
  return isPostgresConfigured() ? "postgres" : "local-file";
}

export async function initDatabase() {
  if (isPostgresConfigured()) {
    await postgresStore.initPostgresStore();
    return;
  }

  await fileStore.initFileStore();
}

export async function getDatabaseHealth() {
  if (isPostgresConfigured()) {
    try {
      await postgresStore.pingPostgres();
      return {
        mode: "postgres" as const,
        ready: true,
      };
    } catch (error) {
      return {
        mode: "postgres" as const,
        ready: false,
        message: error instanceof Error ? error.message : "PostgreSQL ping failed.",
      };
    }
  }

  return {
    mode: "local-file" as const,
    ready: true,
  };
}

export async function closeDatabase() {
  if (isPostgresConfigured()) {
    await postgresStore.closePostgresPool();
  }
}

export async function findUserById(userId: string) {
  return isPostgresConfigured() ? postgresStore.findUserById(userId) : fileStore.findUserById(userId);
}

export async function findUserByEmail(email: string) {
  return isPostgresConfigured() ? postgresStore.findUserByEmail(email) : fileStore.findUserByEmail(email);
}

export async function findUserByUsername(username: string) {
  return isPostgresConfigured() ? postgresStore.findUserByUsername(username) : fileStore.findUserByUsername(username);
}

export async function insertUserWithPointLog(user: StoredUser, pointLog: PointLogRecord) {
  return isPostgresConfigured()
    ? postgresStore.insertUserWithPointLog(user, pointLog)
    : fileStore.insertUserWithPointLog(user, pointLog);
}

export async function awardDailyLogin(userId: string, date: string, amount: number) {
  return isPostgresConfigured()
    ? postgresStore.awardDailyLogin(userId, date, amount)
    : fileStore.awardDailyLogin(userId, date, amount);
}

export async function listUserBets(userId: string): Promise<BetRecord[]> {
  return isPostgresConfigured() ? postgresStore.listUserBets(userId) : fileStore.listUserBets(userId);
}

export async function listMarketBetsForUser(userId: string, marketId: string): Promise<BetRecord[]> {
  return isPostgresConfigured()
    ? postgresStore.listMarketBetsForUser(userId, marketId)
    : fileStore.listMarketBetsForUser(userId, marketId);
}

export async function getUserStats(userId: string): Promise<UserStats> {
  return isPostgresConfigured() ? postgresStore.getUserStats(userId) : fileStore.getUserStats(userId);
}

export async function listPendingBets(): Promise<BetRecord[]> {
  return isPostgresConfigured() ? postgresStore.listPendingBets() : fileStore.listPendingBets();
}

export async function placeBet(userId: string, bet: BetRecord, pointLog: PointLogRecord) {
  return isPostgresConfigured()
    ? postgresStore.placeBet(userId, bet, pointLog)
    : fileStore.placeBet(userId, bet, pointLog);
}

export async function settleMarketBets(marketId: string, winningOutcome: string, settledAt: string) {
  return isPostgresConfigured()
    ? postgresStore.settleMarketBets(marketId, winningOutcome, settledAt)
    : fileStore.settleMarketBets(marketId, winningOutcome, settledAt);
}

export async function findTranslation(marketId: string, lang: StoredTranslation["lang"]) {
  return isPostgresConfigured()
    ? postgresStore.findTranslation(marketId, lang)
    : fileStore.findTranslation(marketId, lang);
}

export async function upsertTranslation(translation: {
  marketId: string;
  lang: StoredTranslation["lang"];
  question: string;
  description: string;
  source: TranslationSource;
}) {
  return isPostgresConfigured()
    ? postgresStore.upsertTranslation(translation)
    : fileStore.upsertTranslation(translation);
}

export async function listTranslations(params: {
  lang?: StoredTranslation["lang"];
  page: number;
  limit: number;
}) {
  return isPostgresConfigured()
    ? postgresStore.listTranslations(params)
    : fileStore.listTranslations(params);
}

export async function getAdminDashboardSnapshot(): Promise<AdminDashboardSnapshot> {
  return isPostgresConfigured()
    ? postgresStore.getAdminDashboardSnapshot()
    : fileStore.getAdminDashboardSnapshot();
}

export async function getAdminBusinessState(): Promise<AdminBusinessState> {
  return isPostgresConfigured()
    ? postgresStore.getAdminBusinessState()
    : fileStore.getAdminBusinessState();
}

export async function createAdminBusinessClient(client: ApiBusinessClientRecord) {
  return isPostgresConfigured()
    ? postgresStore.createAdminBusinessClient(client)
    : fileStore.createAdminBusinessClient(client);
}

export async function createAdminBusinessApiKey(apiKey: ApiBusinessKeyRecord) {
  return isPostgresConfigured()
    ? postgresStore.createAdminBusinessApiKey(apiKey)
    : fileStore.createAdminBusinessApiKey(apiKey);
}

export async function createAdminBusinessReseller(reseller: ApiBusinessResellerRecord) {
  return isPostgresConfigured()
    ? postgresStore.createAdminBusinessReseller(reseller)
    : fileStore.createAdminBusinessReseller(reseller);
}

export async function createAdminBusinessTemplate(template: ApiBusinessTemplateRecord) {
  return isPostgresConfigured()
    ? postgresStore.createAdminBusinessTemplate(template)
    : fileStore.createAdminBusinessTemplate(template);
}
