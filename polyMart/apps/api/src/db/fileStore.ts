import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import type { BetRecord, LanguageCode, TranslationListResponse, TranslationSource, UserStats } from "@polywatch/shared";
import { badRequest, notFound } from "../lib/http.js";
import { createDefaultAdminBusinessState, normalizeAdminBusinessState, type AdminBusinessState, type ApiBusinessClientRecord, type ApiBusinessKeyRecord, type ApiBusinessResellerRecord, type ApiBusinessTemplateRecord } from "./businessTypes.js";
import { computeUserStats, type AdminDashboardSnapshot, type AdminRecentBet, type DatabaseState, type PointLogRecord, type StoredUser, type TranslationRecord } from "./types.js";

const dataFile = fileURLToPath(new URL("../../data/local.json", import.meta.url));

const emptyState: DatabaseState = {
  users: [],
  bets: [],
  pointLogs: [],
  dailyLogins: [],
  translations: [],
  business: createDefaultAdminBusinessState(),
};

let writeQueue = Promise.resolve();

async function ensureFile() {
  await mkdir(dirname(dataFile), { recursive: true });

  try {
    await readFile(dataFile, "utf8");
  } catch {
    await writeFile(dataFile, JSON.stringify(emptyState, null, 2), "utf8");
  }
}

async function readData(): Promise<DatabaseState> {
  await ensureFile();
  const raw = await readFile(dataFile, "utf8");
  const parsed = JSON.parse(raw) as Partial<DatabaseState>;
  return {
    users: Array.isArray(parsed.users) ? parsed.users : [],
    bets: Array.isArray(parsed.bets) ? parsed.bets : [],
    pointLogs: Array.isArray(parsed.pointLogs) ? parsed.pointLogs : [],
    dailyLogins: Array.isArray(parsed.dailyLogins) ? parsed.dailyLogins : [],
    translations: Array.isArray(parsed.translations) ? parsed.translations : [],
    business: normalizeAdminBusinessState(parsed.business),
  };
}

async function mutateData<T>(mutator: (data: DatabaseState) => Promise<T> | T): Promise<T> {
  const run = async () => {
    const data = await readData();
    const result = await mutator(data);
    await writeFile(dataFile, JSON.stringify(data, null, 2), "utf8");
    return result;
  };

  const next = writeQueue.then(run, run);
  writeQueue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

export async function initFileStore() {
  await ensureFile();
}

export async function findUserById(userId: string) {
  const data = await readData();
  return data.users.find((user) => user.id === userId) ?? null;
}

export async function findUserByEmail(email: string) {
  const normalized = email.toLowerCase();
  const data = await readData();
  return data.users.find((user) => user.email.toLowerCase() === normalized) ?? null;
}

export async function findUserByUsername(username: string) {
  const normalized = username.toLowerCase();
  const data = await readData();
  return data.users.find((user) => user.username.toLowerCase() === normalized) ?? null;
}

export async function insertUserWithPointLog(user: StoredUser, pointLog: PointLogRecord) {
  await mutateData((data) => {
    data.users.push(user);
    data.pointLogs.unshift(pointLog);
  });
}

export async function awardDailyLogin(userId: string, date: string, amount: number) {
  return mutateData((data) => {
    const user = data.users.find((item) => item.id === userId);
    if (!user) {
      throw notFound("User not found.");
    }

    const alreadyClaimed = data.dailyLogins.some((entry) => entry.userId === userId && entry.date === date);
    if (alreadyClaimed) {
      return {
        awarded: 0,
        user,
      };
    }

    user.points += amount;
    user.lastLogin = new Date().toISOString();
    data.dailyLogins.push({ userId, date });
    data.pointLogs.unshift({
      id: randomUUID(),
      userId,
      delta: amount,
      reason: "daily",
      refId: null,
      createdAt: user.lastLogin,
    });

    return {
      awarded: amount,
      user,
    };
  });
}

export async function listUserBets(userId: string) {
  const data = await readData();
  return data.bets
    .filter((bet) => bet.userId === userId)
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}

export async function listMarketBetsForUser(userId: string, marketId: string) {
  const bets = await listUserBets(userId);
  return bets.filter((bet) => bet.marketId === marketId);
}

export async function getUserStats(userId: string): Promise<UserStats> {
  const bets = await listUserBets(userId);
  return computeUserStats(bets);
}

export async function listPendingBets() {
  const data = await readData();
  return data.bets.filter((bet) => bet.status === "pending");
}

export async function placeBet(userId: string, bet: BetRecord, pointLog: PointLogRecord) {
  return mutateData((data) => {
    const user = data.users.find((item) => item.id === userId);
    if (!user) {
      throw notFound("User not found.");
    }

    if (user.points < bet.pointsBet) {
      throw badRequest("Insufficient points.");
    }

    user.points -= bet.pointsBet;
    data.bets.unshift(bet);
    data.pointLogs.unshift(pointLog);
    return user;
  });
}

export async function settleMarketBets(marketId: string, winningOutcome: string, settledAt: string) {
  return mutateData((data) => {
    let settled = 0;

    for (const bet of data.bets) {
      if (bet.marketId !== marketId || bet.status !== "pending") {
        continue;
      }

      const won = bet.outcome === winningOutcome;
      bet.status = won ? "won" : "lost";
      bet.settledAt = settledAt;

      if (won) {
        const user = data.users.find((item) => item.id === bet.userId);
        if (user) {
          user.points += bet.potentialWin;
          data.pointLogs.unshift({
            id: randomUUID(),
            userId: user.id,
            delta: bet.potentialWin,
            reason: "bet_win",
            refId: bet.id,
            createdAt: settledAt,
          });
        }
      }

      settled += 1;
    }

    return settled;
  });
}

export async function findTranslation(marketId: string, lang: LanguageCode) {
  const data = await readData();
  return data.translations.find((item) => item.marketId === marketId && item.lang === lang) ?? null;
}

export async function upsertTranslation(translation: {
  marketId: string;
  lang: LanguageCode;
  question: string;
  description: string;
  source: TranslationSource;
}) {
  return mutateData((data) => {
    const timestamp = new Date().toISOString();
    const next: TranslationRecord = {
      marketId: translation.marketId,
      lang: translation.lang,
      question: translation.question,
      description: translation.description,
      source: translation.source,
      translatedAt: timestamp,
    };

    const existingIndex = data.translations.findIndex(
      (item) => item.marketId === translation.marketId && item.lang === translation.lang,
    );

    if (existingIndex >= 0) {
      data.translations[existingIndex] = next;
    } else {
      data.translations.unshift(next);
    }

    return next;
  });
}

export async function listTranslations(params: {
  lang?: LanguageCode;
  page: number;
  limit: number;
}): Promise<TranslationListResponse> {
  const data = await readData();
  const filtered = params.lang ? data.translations.filter((item) => item.lang === params.lang) : data.translations;
  const sorted = [...filtered].sort(
    (left, right) => new Date(right.translatedAt).getTime() - new Date(left.translatedAt).getTime(),
  );
  const page = Math.max(1, params.page);
  const limit = Math.min(100, Math.max(1, params.limit));
  const offset = (page - 1) * limit;

  return {
    items: sorted.slice(offset, offset + limit),
    page,
    limit,
    total: sorted.length,
  };
}

export async function getAdminBusinessState(): Promise<AdminBusinessState> {
  const data = await readData();
  return normalizeAdminBusinessState(data.business);
}

export async function createAdminBusinessClient(client: ApiBusinessClientRecord) {
  return mutateData((data) => {
    data.business = normalizeAdminBusinessState(data.business);
    data.business.clients.unshift(client);
    return client;
  });
}

export async function createAdminBusinessApiKey(apiKey: ApiBusinessKeyRecord) {
  return mutateData((data) => {
    data.business = normalizeAdminBusinessState(data.business);
    data.business.apiKeys.unshift(apiKey);
    return apiKey;
  });
}

export async function createAdminBusinessReseller(reseller: ApiBusinessResellerRecord) {
  return mutateData((data) => {
    data.business = normalizeAdminBusinessState(data.business);
    data.business.resellers.push(reseller);
    return reseller;
  });
}

export async function createAdminBusinessTemplate(template: ApiBusinessTemplateRecord) {
  return mutateData((data) => {
    data.business = normalizeAdminBusinessState(data.business);
    data.business.templates.unshift(template);
    return template;
  });
}

export async function getAdminDashboardSnapshot(): Promise<AdminDashboardSnapshot> {
  const data = await readData();
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const sevenDaysAgo = now - dayMs * 7;
  const last24h = now - dayMs;

  const users = [...data.users];
  const bets = [...data.bets];
  const pointLogs = [...data.pointLogs];
  const dailyLogins = [...data.dailyLogins];

  const totalPointsHeld = users.reduce((sum, user) => sum + Number(user.points ?? 0), 0);
  const newUsers24h = users.filter((user) => new Date(user.createdAt).getTime() >= last24h).length;
  const newUsers7d = users.filter((user) => new Date(user.createdAt).getTime() >= sevenDaysAgo).length;
  const activeBettors7d = new Set(
    bets
      .filter((bet) => new Date(bet.createdAt).getTime() >= sevenDaysAgo)
      .map((bet) => bet.userId),
  ).size;
  const dailyLogins7d = dailyLogins.filter((entry) => new Date(entry.date).getTime() >= now - dayMs * 6.5).length;

  const totalBets = bets.length;
  const pendingBets = bets.filter((bet) => bet.status === "pending").length;
  const wonBets = bets.filter((bet) => bet.status === "won").length;
  const lostBets = bets.filter((bet) => bet.status === "lost").length;
  const uniqueBettors = new Set(bets.map((bet) => bet.userId)).size;
  const uniqueBettors7d = new Set(
    bets.filter((bet) => new Date(bet.createdAt).getTime() >= sevenDaysAgo).map((bet) => bet.userId),
  ).size;
  const betCount24h = bets.filter((bet) => new Date(bet.createdAt).getTime() >= last24h).length;
  const points24h = bets
    .filter((bet) => new Date(bet.createdAt).getTime() >= last24h)
    .reduce((sum, bet) => sum + bet.pointsBet, 0);
  const totalPointsWagered = bets.reduce((sum, bet) => sum + bet.pointsBet, 0);
  const pendingPotentialPayout = bets
    .filter((bet) => bet.status === "pending")
    .reduce((sum, bet) => sum + bet.potentialWin, 0);
  const pendingStake = bets
    .filter((bet) => bet.status === "pending")
    .reduce((sum, bet) => sum + bet.pointsBet, 0);
  const platformNetSettled = bets.reduce((sum, bet) => {
    if (bet.status === "lost") {
      return sum + bet.pointsBet;
    }
    if (bet.status === "won") {
      return sum - (bet.potentialWin - bet.pointsBet);
    }
    return sum;
  }, 0);
  const pendingOverdue = bets.filter((bet) => bet.status === "pending" && bet.marketEndDate && new Date(bet.marketEndDate).getTime() < now).length;

  const todayBase = new Date();
  todayBase.setHours(0, 0, 0, 0);
  const trend = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(todayBase);
    day.setDate(day.getDate() - (6 - index));
    const nextDay = new Date(day);
    nextDay.setDate(nextDay.getDate() + 1);
    const dayStart = day.getTime();
    const dayEnd = nextDay.getTime();
    const dayBets = bets.filter((bet) => {
      const createdAt = new Date(bet.createdAt).getTime();
      return createdAt >= dayStart && createdAt < dayEnd;
    });

    return {
      date: day.toISOString().slice(0, 10),
      bets: dayBets.length,
      pointsWagered: dayBets.reduce((sum, bet) => sum + bet.pointsBet, 0),
      uniqueUsers: new Set(dayBets.map((bet) => bet.userId)).size,
      settled: dayBets.filter((bet) => bet.status === "won" || bet.status === "lost").length,
    };
  });

  const userMap = new Map(users.map((user) => [user.id, user]));
  const recentBets: AdminRecentBet[] = [...bets]
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, 8)
    .map((bet) => ({
      ...bet,
      username: userMap.get(bet.userId)?.username ?? "unknown",
    }));

  return {
    users: {
      totalUsers: users.length,
      newUsers24h,
      newUsers7d,
      totalPointsHeld,
      averagePoints: users.length ? Number((totalPointsHeld / users.length).toFixed(2)) : 0,
      activeBettors7d,
      dailyLogins7d,
      topUsers: [...users]
        .sort((left, right) => right.points - left.points || new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())
        .slice(0, 5)
        .map((user) => ({
          id: user.id,
          username: user.username,
          points: user.points,
          lastLogin: user.lastLogin ?? null,
        })),
    },
    betting: {
      totalBets,
      pendingBets,
      wonBets,
      lostBets,
      uniqueBettors,
      uniqueBettors7d,
      betCount24h,
      points24h,
      totalPointsWagered,
      pendingPotentialPayout,
      pendingStake,
      platformNetSettled,
      pendingOverdue,
      recentBets,
      trend,
    },
    economy: {
      signupAwarded: pointLogs.filter((log) => log.reason === "signup").reduce((sum, log) => sum + log.delta, 0),
      dailyAwarded: pointLogs.filter((log) => log.reason === "daily").reduce((sum, log) => sum + log.delta, 0),
      betPlaced: pointLogs.filter((log) => log.reason === "bet_place").reduce((sum, log) => sum + Math.abs(log.delta), 0),
      betWinsPaid: pointLogs.filter((log) => log.reason === "bet_win").reduce((sum, log) => sum + log.delta, 0),
      netPointFlow: pointLogs.reduce((sum, log) => sum + log.delta, 0),
      pointLogCount: pointLogs.length,
    },
  };
}
