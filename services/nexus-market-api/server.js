/**
 * Nexus Market API — 총마켓 + Pandora 마켓 JWT API (macroServer에서 분리)
 */
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const db = require('./db');
const { runMarketMigrations } = require('./market/dbMigrate');
const { mountMarketApi } = require('./market');

const PORT = Number(process.env.PORT || 3001);
const app = express();
app.set('trust proxy', 1);

const corsOptions = {
  origin:
    process.env.CORS_ORIGINS === '*'
      ? true
      : process.env.CORS_ORIGINS
        ? process.env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)
        : true,
  credentials: true,
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Operator-Id',
    'X-Forwarded-Host',
    'X-Requested-With',
  ],
  optionsSuccessStatus: 204,
};
app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'nexus-market-api', port: PORT });
});

mountMarketApi(app);

async function start() {
  try {
    await runMarketMigrations(db.pool);
  } catch (e) {
    console.error('[nexus-market-api] 마이그레이션 실패:', e.message);
  }
  app.listen(PORT, () => {
    console.log(`[nexus-market-api] listening on ${PORT}`);
    console.log('  /api/market/*  및  /market/*  (Nginx 스트립 대비)');
  });
}

start();
