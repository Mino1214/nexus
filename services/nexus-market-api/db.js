/**
 * Pandora와 동일 MariaDB (users, mu_users, market_* 테이블 공유)
 * 환경변수 미설정 시 macroServer 기본값과 동일하게 동작
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
    console.warn(`⚠️ [nexus-market-api] MariaDB fallback: ${err?.message || ''}`);
  }
}

function aggregateAlias(sql, fallback) {
  const text = String(sql || '');
  const match = text.match(/\bAS\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi);
  if (!match || !match.length) return fallback;
  const last = match[match.length - 1].match(/\bAS\s+([a-zA-Z_][a-zA-Z0-9_]*)/i);
  return last && last[1] ? last[1] : fallback;
}

function makeFallbackRows(sql) {
  const normalized = String(sql || '').trim().replace(/\s+/g, ' ').toUpperCase();
  if (normalized.startsWith('SHOW ') || normalized.startsWith('DESCRIBE ') || normalized.startsWith('EXPLAIN ')) {
    return [];
  }
  if (normalized.startsWith('SELECT ')) {
    if (/\bCOUNT\s*\(/i.test(sql)) {
      const alias = aggregateAlias(sql, 'count');
      return [{ [alias]: 0 }];
    }
    if (/\b(COALESCE\s*\(\s*)?MAX\s*\(/i.test(sql)) {
      const alias = aggregateAlias(sql, 'max');
      return [{ [alias]: 0 }];
    }
    if (/\bSUM\s*\(/i.test(sql)) {
      const alias = aggregateAlias(sql, 'sum');
      return [{ [alias]: 0 }];
    }
    return [];
  }
  return [];
}

function makeFallbackResult(sql) {
  const normalized = String(sql || '').trim().replace(/\s+/g, ' ').toUpperCase();
  if (normalized.startsWith('SELECT ') || normalized.startsWith('SHOW ') || normalized.startsWith('DESCRIBE ') || normalized.startsWith('EXPLAIN ')) {
    return [makeFallbackRows(sql), []];
  }
  return [
    {
      insertId: 0,
      affectedRows: 0,
      changedRows: 0,
      warningStatus: 0,
    },
    [],
  ];
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
  if (dbFallback) return makeFallbackResult(sql);
  try {
    return await rawPool.query(sql, params);
  } catch (err) {
    if (DEV_DB_OPTIONAL && isConnectionLikeError(err)) {
      enableFallback(err);
      return makeFallbackResult(sql);
    }
    throw err;
  }
}

const pool = {
  query: safeQuery,
  async getConnection() {
    if (dbFallback) {
      return {
        release() {},
        query: safeQuery,
        async beginTransaction() {},
        async rollback() {},
        async commit() {},
      };
    }
    try {
      return await rawPool.getConnection();
    } catch (err) {
      if (DEV_DB_OPTIONAL && isConnectionLikeError(err)) {
        enableFallback(err);
        return {
          release() {},
          query: safeQuery,
          async beginTransaction() {},
          async rollback() {},
          async commit() {},
        };
      }
      throw err;
    }
  },
  async end() {
    return rawPool.end();
  },
};

rawPool
  .getConnection()
  .then((c) => {
    console.log('✅ [nexus-market-api] MariaDB 연결 OK');
    c.release();
  })
  .catch((err) => {
    if (DEV_DB_OPTIONAL && isConnectionLikeError(err)) {
      enableFallback(err);
      console.warn('⚠️ [nexus-market-api] DB 없이 제한 모드');
      return;
    }
    console.error('❌ [nexus-market-api] MariaDB 실패:', err.message);
    process.exit(1);
  });

module.exports = { pool };
