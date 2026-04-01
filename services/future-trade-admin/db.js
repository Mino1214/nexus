/**
 * nexus-market-api 와 동일 풀 설정(공용 DB).
 */
const mysql = require('mysql2/promise');
require('dotenv').config();

const DEV_DB_OPTIONAL = (() => {
  const raw = String(process.env.DEV_DB_OPTIONAL || '').trim().toLowerCase();
  if (raw) return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
  return process.env.NODE_ENV !== 'production';
})();

let dbFallback = false;

function isConnectionLikeError(err) {
  const code = err && err.code ? String(err.code) : '';
  return [
    'ECONNREFUSED',
    'ETIMEDOUT',
    'ENOTFOUND',
    'EHOSTUNREACH',
    'PROTOCOL_CONNECTION_LOST',
    'PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR',
    'ER_ACCESS_DENIED_ERROR',
    'ER_BAD_DB_ERROR',
    'ER_CON_COUNT_ERROR',
  ].includes(code);
}

function enableFallback(err) {
  if (!dbFallback) {
    dbFallback = true;
    console.warn(`⚠️ [future-trade-admin] MariaDB fallback: ${err?.message || ''}`);
  }
}

function makeFallbackResult() {
  return [[], []];
}

const rawPool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'mynolab_user',
  password: process.env.DB_PASSWORD || 'mynolab2026',
  database: process.env.DB_NAME || 'mynolab',
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL_LIMIT || 10),
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
});

async function safeQuery(sql, params) {
  if (dbFallback) return makeFallbackResult();
  try {
    return await rawPool.query(sql, params);
  } catch (err) {
    if (DEV_DB_OPTIONAL && isConnectionLikeError(err)) {
      enableFallback(err);
      return makeFallbackResult();
    }
    throw err;
  }
}

const pool = {
  query: safeQuery,
};

rawPool
  .getConnection()
  .then((c) => {
    console.log('✅ [future-trade-admin] MariaDB 연결 OK');
    c.release();
  })
  .catch((err) => {
    if (DEV_DB_OPTIONAL && isConnectionLikeError(err)) {
      enableFallback(err);
      console.warn('⚠️ [future-trade-admin] DB 없이 제한 모드');
      return;
    }
    console.error('❌ [future-trade-admin] MariaDB 실패:', err.message);
    process.exit(1);
  });

module.exports = { pool };
