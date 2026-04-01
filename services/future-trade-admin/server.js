/**
 * FutureTrade HTS 운영용 경량 API — admin.html 계열 화면이 붙는 백엔드 스텁.
 * nexus-market-api 와 동일 DB; market_* 행은 module_code 로 서비스 구분.
 */
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const db = require('./db');
const { runMarketMigrations } = require('../nexus-market-api/market/dbMigrate');

const PORT = Number(process.env.PORT || 3020);
const MODULE_CODE = String(process.env.MODULE_CODE || process.env.HTS_MODULE_CODE || 'hts_future_trade').trim();

const corsOrigins = process.env.CORS_ORIGINS;
const app = express();
app.set('trust proxy', 1);
app.use(
  cors({
    origin:
      corsOrigins === '*'
        ? true
        : corsOrigins
          ? corsOrigins.split(',').map((s) => s.trim()).filter(Boolean)
          : true,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    optionsSuccessStatus: 204,
  }),
);
app.use(express.json({ limit: '10mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'future-trade-admin', moduleCode: MODULE_CODE, port: PORT });
});

app.get('/api/config', (_req, res) => {
  res.json({ moduleCode: MODULE_CODE });
});

/**
 * 공용 ledger 샘플 — 운영 시 module_code 필터·권한·JWT 를 붙일 것.
 * module_code 가 NULL 인 행은 마이그레이션 전 레거시로 동일 MODULE 로 취급.
 */
app.get('/api/hts/cash-ledger', async (req, res) => {
  const mod = String(req.query.module_code || MODULE_CODE).trim();
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
  try {
    const [rows] = await db.pool.query(
      `SELECT id, user_id, amount, type, description, module_code, created_at
       FROM market_cash_transactions
       WHERE module_code <=> ? OR module_code IS NULL
       ORDER BY created_at DESC
       LIMIT ?`,
      [mod === '' ? null : mod, limit],
    );
    res.json({ moduleCode: MODULE_CODE, filter: mod || MODULE_CODE, rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

async function start() {
  try {
    await runMarketMigrations(db.pool);
  } catch (e) {
    console.warn('[future-trade-admin] 마이그레이션:', e.message);
  }
  app.listen(PORT, () => {
    console.log(`[future-trade-admin] http://127.0.0.1:${PORT}  module=${MODULE_CODE}`);
  });
}

start();
