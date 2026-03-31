import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Pool, type PoolClient } from "pg";
import type { BetRecord, LanguageCode, TranslationListResponse, TranslationSource, UserStats } from "@polywatch/shared";
import { badRequest, notFound } from "../lib/http.js";
import { createDefaultAdminBusinessState, normalizeAdminBusinessState, type AdminBusinessState, type ApiBusinessClientRecord, type ApiBusinessKeyRecord, type ApiBusinessResellerRecord, type ApiBusinessTemplateRecord } from "./businessTypes.js";
import { type AdminDashboardSnapshot, type AdminRecentBet, type AdminTopUser, type PointLogRecord, type StoredUser, type TranslationRecord } from "./types.js";

let pool: Pool | null = null;
let initPromise: Promise<void> | null = null;
const BUSINESS_STATE_ID = "default";

function getDatabaseUrl() {
  const value = process.env.DATABASE_URL?.trim();
  return value ? value : null;
}

function mapUserRow(row: Record<string, unknown>): StoredUser {
  return {
    id: String(row.id),
    username: String(row.username),
    email: String(row.email),
    passwordHash: String(row.password_hash),
    points: Number(row.points ?? 0),
    lang: String(row.lang) as StoredUser["lang"],
    referrerId: row.referrer_id ? String(row.referrer_id) : null,
    lastLogin: row.last_login ? new Date(String(row.last_login)).toISOString() : null,
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}

function mapBetRow(row: Record<string, unknown>): BetRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    marketId: String(row.market_id),
    marketQuestion: String(row.market_question),
    outcome: String(row.outcome),
    pointsBet: Number(row.points_bet ?? 0),
    odds: Number(row.odds ?? 0),
    potentialWin: Number(row.potential_win ?? 0),
    status: String(row.status) as BetRecord["status"],
    marketEndDate: row.market_end_date ? new Date(String(row.market_end_date)).toISOString() : null,
    settledAt: row.settled_at ? new Date(String(row.settled_at)).toISOString() : null,
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}

function mapTranslationRow(row: Record<string, unknown>): TranslationRecord {
  return {
    marketId: String(row.market_id),
    lang: String(row.lang) as LanguageCode,
    question: String(row.question ?? ""),
    description: String(row.description ?? ""),
    source: String(row.source ?? "machine") as TranslationSource,
    translatedAt: new Date(String(row.translated_at)).toISOString(),
  };
}

function getPool() {
  const connectionString = getDatabaseUrl();
  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured.");
  }

  if (!pool) {
    pool = new Pool({
      connectionString,
    });
  }

  return pool;
}

async function withClient<T>(fn: (client: PoolClient) => Promise<T>) {
  const client = await getPool().connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

async function runMigrations(client: PoolClient) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      run_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const migrationsDir = await resolveMigrationsDir();
  const files = (await readdir(migrationsDir)).filter((file) => file.endsWith(".sql")).sort();
  const appliedResult = await client.query<{ id: string }>("SELECT id FROM schema_migrations");
  const applied = new Set(appliedResult.rows.map((row: { id: string }) => row.id));

  for (const file of files) {
    if (applied.has(file)) {
      continue;
    }

    const sql = await readFile(fileURLToPath(new URL(`./migrations/${file}`, import.meta.url)), "utf8");
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (id) VALUES ($1)", [file]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
}

async function resolveMigrationsDir() {
  const candidates = [
    fileURLToPath(new URL("./migrations", import.meta.url)),
    fileURLToPath(new URL("../../src/db/migrations", import.meta.url)),
  ];

  for (const candidate of candidates) {
    try {
      await readdir(candidate);
      return candidate;
    } catch {
      continue;
    }
  }

  throw new Error("Could not locate SQL migrations directory.");
}

async function ensureAdminBusinessStateRow(client: PoolClient) {
  await client.query(
    `
      INSERT INTO admin_business_state (id, payload)
      VALUES ($1, $2::jsonb)
      ON CONFLICT (id) DO NOTHING
    `,
    [BUSINESS_STATE_ID, JSON.stringify(createDefaultAdminBusinessState())],
  );
}

function parseBusinessPayload(row: Record<string, unknown> | undefined | null): AdminBusinessState {
  return normalizeAdminBusinessState(row?.payload ?? null);
}

async function updateAdminBusinessState<T>(mutator: (state: AdminBusinessState) => Promise<T> | T) {
  return withClient(async (client) => {
    await client.query("BEGIN");
    try {
      await ensureAdminBusinessStateRow(client);
      const result = await client.query(
        "SELECT payload FROM admin_business_state WHERE id = $1 FOR UPDATE",
        [BUSINESS_STATE_ID],
      );
      const state = parseBusinessPayload(result.rows[0]);
      const value = await mutator(state);
      await client.query(
        `
          UPDATE admin_business_state
          SET payload = $2::jsonb, updated_at = NOW()
          WHERE id = $1
        `,
        [BUSINESS_STATE_ID, JSON.stringify(normalizeAdminBusinessState(state))],
      );
      await client.query("COMMIT");
      return value;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

export async function initPostgresStore() {
  if (!initPromise) {
    initPromise = withClient(async (client) => {
      await runMigrations(client);
      await ensureAdminBusinessStateRow(client);
    });
  }

  await initPromise;
}

export async function findUserById(userId: string) {
  const result = await getPool().query("SELECT * FROM users WHERE id = $1", [userId]);
  return result.rows[0] ? mapUserRow(result.rows[0]) : null;
}

export async function findUserByEmail(email: string) {
  const result = await getPool().query("SELECT * FROM users WHERE lower(email) = lower($1)", [email]);
  return result.rows[0] ? mapUserRow(result.rows[0]) : null;
}

export async function findUserByUsername(username: string) {
  const result = await getPool().query("SELECT * FROM users WHERE lower(username) = lower($1)", [username]);
  return result.rows[0] ? mapUserRow(result.rows[0]) : null;
}

export async function insertUserWithPointLog(user: StoredUser, pointLog: PointLogRecord) {
  await withClient(async (client) => {
    await client.query("BEGIN");
    try {
      await client.query(
        `
          INSERT INTO users (id, username, email, password_hash, points, lang, referrer_id, last_login, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `,
        [user.id, user.username, user.email, user.passwordHash, user.points, user.lang, user.referrerId, user.lastLogin, user.createdAt],
      );
      await client.query(
        `
          INSERT INTO point_logs (id, user_id, delta, reason, ref_id, created_at)
          VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [pointLog.id, pointLog.userId, pointLog.delta, pointLog.reason, pointLog.refId, pointLog.createdAt],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

export async function awardDailyLogin(userId: string, date: string, amount: number) {
  return withClient(async (client) => {
    await client.query("BEGIN");
    try {
      const insertDaily = await client.query(
        `
          INSERT INTO daily_logins (user_id, date)
          VALUES ($1, $2::date)
          ON CONFLICT DO NOTHING
          RETURNING user_id
        `,
        [userId, date],
      );

      if (!insertDaily.rowCount) {
        const existingUser = await client.query("SELECT * FROM users WHERE id = $1", [userId]);
        await client.query("COMMIT");
        if (!existingUser.rows[0]) {
          throw notFound("User not found.");
        }
        return {
          awarded: 0,
          user: mapUserRow(existingUser.rows[0]),
        };
      }

      const awardedAt = new Date().toISOString();
      const updatedUser = await client.query(
        `
          UPDATE users
          SET points = points + $1, last_login = $2
          WHERE id = $3
          RETURNING *
        `,
        [amount, awardedAt, userId],
      );

      if (!updatedUser.rows[0]) {
        throw notFound("User not found.");
      }

      await client.query(
        `
          INSERT INTO point_logs (id, user_id, delta, reason, ref_id, created_at)
          VALUES ($1, $2, $3, 'daily', NULL, $4)
        `,
        [randomUUID(), userId, amount, awardedAt],
      );

      await client.query("COMMIT");
      return {
        awarded: amount,
        user: mapUserRow(updatedUser.rows[0]),
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

export async function listUserBets(userId: string) {
  const result = await getPool().query(
    "SELECT * FROM bets WHERE user_id = $1 ORDER BY created_at DESC",
    [userId],
  );
  return result.rows.map((row: Record<string, unknown>) => mapBetRow(row));
}

export async function listMarketBetsForUser(userId: string, marketId: string) {
  const result = await getPool().query(
    "SELECT * FROM bets WHERE user_id = $1 AND market_id = $2 ORDER BY created_at DESC",
    [userId, marketId],
  );
  return result.rows.map((row: Record<string, unknown>) => mapBetRow(row));
}

export async function getUserStats(userId: string): Promise<UserStats> {
  const result = await getPool().query(
    `
      SELECT
        COUNT(*)::int AS total_bets,
        COUNT(*) FILTER (WHERE status IN ('won', 'lost'))::int AS settled_count,
        COUNT(*) FILTER (WHERE status = 'won')::int AS win_count,
        COUNT(*) FILTER (WHERE status = 'pending')::int AS active_bets,
        COALESCE(SUM(
          CASE
            WHEN status = 'won' THEN potential_win - points_bet
            WHEN status = 'lost' THEN -points_bet
            ELSE 0
          END
        ), 0)::bigint AS total_profit
      FROM bets
      WHERE user_id = $1
    `,
    [userId],
  );

  const row = result.rows[0];
  const totalBets = Number(row?.total_bets ?? 0);
  const settledCount = Number(row?.settled_count ?? 0);
  const winCount = Number(row?.win_count ?? 0);

  return {
    totalBets,
    winRate: settledCount ? Number(((winCount / settledCount) * 100).toFixed(1)) : 0,
    totalProfit: Number(row?.total_profit ?? 0),
    activeBets: Number(row?.active_bets ?? 0),
  };
}

export async function listPendingBets() {
  const result = await getPool().query("SELECT * FROM bets WHERE status = 'pending'");
  return result.rows.map((row: Record<string, unknown>) => mapBetRow(row));
}

export async function placeBet(userId: string, bet: BetRecord, pointLog: PointLogRecord) {
  return withClient(async (client) => {
    await client.query("BEGIN");
    try {
      const userResult = await client.query("SELECT * FROM users WHERE id = $1 FOR UPDATE", [userId]);
      const row = userResult.rows[0];
      if (!row) {
        throw notFound("User not found.");
      }

      if (Number(row.points) < bet.pointsBet) {
        throw badRequest("Insufficient points.");
      }

      const updatedUser = await client.query(
        "UPDATE users SET points = points - $1 WHERE id = $2 RETURNING *",
        [bet.pointsBet, userId],
      );

      await client.query(
        `
          INSERT INTO bets (id, user_id, market_id, market_question, outcome, points_bet, odds, potential_win, status, market_end_date, settled_at, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        `,
        [
          bet.id,
          bet.userId,
          bet.marketId,
          bet.marketQuestion,
          bet.outcome,
          bet.pointsBet,
          bet.odds,
          bet.potentialWin,
          bet.status,
          bet.marketEndDate,
          bet.settledAt,
          bet.createdAt,
        ],
      );

      await client.query(
        `
          INSERT INTO point_logs (id, user_id, delta, reason, ref_id, created_at)
          VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [pointLog.id, pointLog.userId, pointLog.delta, pointLog.reason, pointLog.refId, pointLog.createdAt],
      );

      await client.query("COMMIT");
      return mapUserRow(updatedUser.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

export async function settleMarketBets(marketId: string, winningOutcome: string, settledAt: string) {
  return withClient(async (client) => {
    await client.query("BEGIN");
    try {
      const betsResult = await client.query(
        "SELECT * FROM bets WHERE market_id = $1 AND status = 'pending' FOR UPDATE",
        [marketId],
      );

      let settled = 0;

      for (const row of betsResult.rows) {
        const bet = mapBetRow(row);
        const won = bet.outcome === winningOutcome;

        await client.query(
          "UPDATE bets SET status = $1, settled_at = $2 WHERE id = $3",
          [won ? "won" : "lost", settledAt, bet.id],
        );

        if (won) {
          await client.query(
            "UPDATE users SET points = points + $1 WHERE id = $2",
            [bet.potentialWin, bet.userId],
          );
          await client.query(
            `
              INSERT INTO point_logs (id, user_id, delta, reason, ref_id, created_at)
              VALUES ($1, $2, $3, 'bet_win', $4, $5)
            `,
            [randomUUID(), bet.userId, bet.potentialWin, bet.id, settledAt],
          );
        }

        settled += 1;
      }

      await client.query("COMMIT");
      return settled;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

export async function closePostgresPool() {
  if (pool) {
    await pool.end();
    pool = null;
    initPromise = null;
  }
}

export async function pingPostgres() {
  const result = await getPool().query("SELECT 1 AS ok");
  return Number(result.rows[0]?.ok ?? 0) === 1;
}

export async function findTranslation(marketId: string, lang: LanguageCode) {
  const result = await getPool().query(
    "SELECT market_id, lang, question, description, source, translated_at FROM translations WHERE market_id = $1 AND lang = $2",
    [marketId, lang],
  );
  return result.rows[0] ? mapTranslationRow(result.rows[0]) : null;
}

export async function getAdminBusinessState(): Promise<AdminBusinessState> {
  const result = await getPool().query(
    "SELECT payload FROM admin_business_state WHERE id = $1",
    [BUSINESS_STATE_ID],
  );

  if (!result.rows[0]) {
    await withClient(async (client) => {
      await ensureAdminBusinessStateRow(client);
    });

    const seeded = await getPool().query(
      "SELECT payload FROM admin_business_state WHERE id = $1",
      [BUSINESS_STATE_ID],
    );
    return parseBusinessPayload(seeded.rows[0]);
  }

  return parseBusinessPayload(result.rows[0]);
}

export async function createAdminBusinessClient(client: ApiBusinessClientRecord) {
  return updateAdminBusinessState((state) => {
    state.clients.unshift(client);
    return client;
  });
}

export async function createAdminBusinessApiKey(apiKey: ApiBusinessKeyRecord) {
  return updateAdminBusinessState((state) => {
    state.apiKeys.unshift(apiKey);
    return apiKey;
  });
}

export async function createAdminBusinessReseller(reseller: ApiBusinessResellerRecord) {
  return updateAdminBusinessState((state) => {
    state.resellers.push(reseller);
    return reseller;
  });
}

export async function createAdminBusinessTemplate(template: ApiBusinessTemplateRecord) {
  return updateAdminBusinessState((state) => {
    state.templates.unshift(template);
    return template;
  });
}

export async function upsertTranslation(translation: {
  marketId: string;
  lang: LanguageCode;
  question: string;
  description: string;
  source: TranslationSource;
}) {
  const result = await getPool().query(
    `
      INSERT INTO translations (market_id, lang, question, description, source, translated_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (market_id, lang)
      DO UPDATE SET
        question = EXCLUDED.question,
        description = EXCLUDED.description,
        source = EXCLUDED.source,
        translated_at = NOW()
      RETURNING market_id, lang, question, description, source, translated_at
    `,
    [translation.marketId, translation.lang, translation.question, translation.description, translation.source],
  );

  return mapTranslationRow(result.rows[0]);
}

export async function listTranslations(params: {
  lang?: LanguageCode;
  page: number;
  limit: number;
}): Promise<TranslationListResponse> {
  const page = Math.max(1, params.page);
  const limit = Math.min(100, Math.max(1, params.limit));
  const offset = (page - 1) * limit;

  const whereClause = params.lang ? "WHERE lang = $1" : "";
  const valueParams = params.lang ? [params.lang] : [];
  const itemParams = [...valueParams, limit, offset];

  const [countResult, itemsResult] = await Promise.all([
    getPool().query<{ total: string }>(`SELECT COUNT(*)::text AS total FROM translations ${whereClause}`, valueParams),
    getPool().query(
      `
        SELECT market_id, lang, question, description, source, translated_at
        FROM translations
        ${whereClause}
        ORDER BY translated_at DESC
        LIMIT $${valueParams.length + 1}
        OFFSET $${valueParams.length + 2}
      `,
      itemParams,
    ),
  ]);

  return {
    items: itemsResult.rows.map((row: Record<string, unknown>) => mapTranslationRow(row)),
    page,
    limit,
    total: Number(countResult.rows[0]?.total ?? 0),
  };
}

export async function getAdminDashboardSnapshot(): Promise<AdminDashboardSnapshot> {
  const [usersSummaryResult, activeBettorsResult, dailyLoginsResult, topUsersResult, bettingSummaryResult, recentBetsResult, trendResult, economyResult] = await Promise.all([
    getPool().query(`
      SELECT
        COUNT(*)::int AS total_users,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours')::int AS new_users_24h,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int AS new_users_7d,
        COALESCE(SUM(points), 0)::bigint AS total_points_held,
        COALESCE(AVG(points), 0)::numeric(12,2) AS average_points
      FROM users
    `),
    getPool().query(`
      SELECT COUNT(DISTINCT user_id)::int AS active_bettors_7d
      FROM bets
      WHERE created_at >= NOW() - INTERVAL '7 days'
    `),
    getPool().query(`
      SELECT COUNT(*)::int AS daily_logins_7d
      FROM daily_logins
      WHERE date >= CURRENT_DATE - INTERVAL '6 days'
    `),
    getPool().query(`
      SELECT id, username, points, last_login
      FROM users
      ORDER BY points DESC, created_at ASC
      LIMIT 5
    `),
    getPool().query(`
      SELECT
        COUNT(*)::int AS total_bets,
        COUNT(*) FILTER (WHERE status = 'pending')::int AS pending_bets,
        COUNT(*) FILTER (WHERE status = 'won')::int AS won_bets,
        COUNT(*) FILTER (WHERE status = 'lost')::int AS lost_bets,
        COUNT(DISTINCT user_id)::int AS unique_bettors,
        COUNT(DISTINCT user_id) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int AS unique_bettors_7d,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours')::int AS bet_count_24h,
        COALESCE(SUM(points_bet) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours'), 0)::bigint AS points_24h,
        COALESCE(SUM(points_bet), 0)::bigint AS total_points_wagered,
        COALESCE(SUM(potential_win) FILTER (WHERE status = 'pending'), 0)::bigint AS pending_potential_payout,
        COALESCE(SUM(points_bet) FILTER (WHERE status = 'pending'), 0)::bigint AS pending_stake,
        COALESCE(SUM(
          CASE
            WHEN status = 'lost' THEN points_bet
            WHEN status = 'won' THEN -(potential_win - points_bet)
            ELSE 0
          END
        ), 0)::bigint AS platform_net_settled,
        COUNT(*) FILTER (
          WHERE status = 'pending'
            AND market_end_date IS NOT NULL
            AND market_end_date < NOW()
        )::int AS pending_overdue
      FROM bets
    `),
    getPool().query(`
      SELECT
        b.*,
        u.username
      FROM bets b
      JOIN users u ON u.id = b.user_id
      ORDER BY b.created_at DESC
      LIMIT 8
    `),
    getPool().query(`
      SELECT
        TO_CHAR(day_bucket.day, 'YYYY-MM-DD') AS date,
        COALESCE(COUNT(b.id), 0)::int AS bets,
        COALESCE(SUM(b.points_bet), 0)::bigint AS points_wagered,
        COALESCE(COUNT(DISTINCT b.user_id), 0)::int AS unique_users,
        COALESCE(COUNT(*) FILTER (WHERE b.status IN ('won', 'lost')), 0)::int AS settled
      FROM generate_series(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, INTERVAL '1 day') AS day_bucket(day)
      LEFT JOIN bets b
        ON b.created_at >= day_bucket.day
       AND b.created_at < day_bucket.day + INTERVAL '1 day'
      GROUP BY day_bucket.day
      ORDER BY day_bucket.day ASC
    `),
    getPool().query(`
      SELECT
        COALESCE(SUM(CASE WHEN reason = 'signup' THEN delta ELSE 0 END), 0)::bigint AS signup_awarded,
        COALESCE(SUM(CASE WHEN reason = 'daily' THEN delta ELSE 0 END), 0)::bigint AS daily_awarded,
        COALESCE(SUM(CASE WHEN reason = 'bet_place' THEN ABS(delta) ELSE 0 END), 0)::bigint AS bet_placed,
        COALESCE(SUM(CASE WHEN reason = 'bet_win' THEN delta ELSE 0 END), 0)::bigint AS bet_wins_paid,
        COALESCE(SUM(delta), 0)::bigint AS net_point_flow,
        COUNT(*)::int AS point_log_count
      FROM point_logs
    `),
  ]);

  const usersRow = usersSummaryResult.rows[0] ?? {};
  const bettingRow = bettingSummaryResult.rows[0] ?? {};
  const economyRow = economyResult.rows[0] ?? {};

  return {
    users: {
      totalUsers: Number(usersRow.total_users ?? 0),
      newUsers24h: Number(usersRow.new_users_24h ?? 0),
      newUsers7d: Number(usersRow.new_users_7d ?? 0),
      totalPointsHeld: Number(usersRow.total_points_held ?? 0),
      averagePoints: Number(usersRow.average_points ?? 0),
      activeBettors7d: Number(activeBettorsResult.rows[0]?.active_bettors_7d ?? 0),
      dailyLogins7d: Number(dailyLoginsResult.rows[0]?.daily_logins_7d ?? 0),
      topUsers: topUsersResult.rows.map((row): AdminTopUser => ({
        id: String(row.id),
        username: String(row.username),
        points: Number(row.points ?? 0),
        lastLogin: row.last_login ? new Date(String(row.last_login)).toISOString() : null,
      })),
    },
    betting: {
      totalBets: Number(bettingRow.total_bets ?? 0),
      pendingBets: Number(bettingRow.pending_bets ?? 0),
      wonBets: Number(bettingRow.won_bets ?? 0),
      lostBets: Number(bettingRow.lost_bets ?? 0),
      uniqueBettors: Number(bettingRow.unique_bettors ?? 0),
      uniqueBettors7d: Number(bettingRow.unique_bettors_7d ?? 0),
      betCount24h: Number(bettingRow.bet_count_24h ?? 0),
      points24h: Number(bettingRow.points_24h ?? 0),
      totalPointsWagered: Number(bettingRow.total_points_wagered ?? 0),
      pendingPotentialPayout: Number(bettingRow.pending_potential_payout ?? 0),
      pendingStake: Number(bettingRow.pending_stake ?? 0),
      platformNetSettled: Number(bettingRow.platform_net_settled ?? 0),
      pendingOverdue: Number(bettingRow.pending_overdue ?? 0),
      recentBets: recentBetsResult.rows.map((row): AdminRecentBet => ({
        ...mapBetRow(row),
        username: String(row.username ?? "unknown"),
      })),
      trend: trendResult.rows.map((row) => ({
        date: String(row.date),
        bets: Number(row.bets ?? 0),
        pointsWagered: Number(row.points_wagered ?? 0),
        uniqueUsers: Number(row.unique_users ?? 0),
        settled: Number(row.settled ?? 0),
      })),
    },
    economy: {
      signupAwarded: Number(economyRow.signup_awarded ?? 0),
      dailyAwarded: Number(economyRow.daily_awarded ?? 0),
      betPlaced: Number(economyRow.bet_placed ?? 0),
      betWinsPaid: Number(economyRow.bet_wins_paid ?? 0),
      netPointFlow: Number(economyRow.net_point_flow ?? 0),
      pointLogCount: Number(economyRow.point_log_count ?? 0),
    },
  };
}
