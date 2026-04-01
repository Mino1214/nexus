/**
 * 선택적 PostgreSQL 적재. DATABASE_URL 없으면 no-op.
 */

/** @type {import('pg').Pool | null} */
let pool = null;

/**
 * @returns {Promise<void>}
 */
export async function initTickStore() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    console.log('[db] DATABASE_URL 없음 — 틱 DB 적재 비활성');
    return;
  }
  try {
    const { default: pg } = await import('pg');
    pool = new pg.Pool({ connectionString: url, max: 6 });
    await pool.query(`
    CREATE TABLE IF NOT EXISTS market_ticks (
      id BIGSERIAL PRIMARY KEY,
      provider TEXT NOT NULL,
      symbol TEXT NOT NULL,
      ts_ms BIGINT NOT NULL,
      price DOUBLE PRECISION NOT NULL,
      volume DOUBLE PRECISION NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
    await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_market_ticks_symbol_ts ON market_ticks (symbol, ts_ms DESC)
  `);
    await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_market_ticks_created ON market_ticks (created_at DESC)
  `);
    console.log('[db] market_ticks 준비 완료');
  } catch (e) {
    console.error('[db] 초기화 실패 — 틱 적재 비활성:', e?.message || e);
    pool = null;
  }
}

/**
 * @param {{ provider: string, symbol: string, ts: number, price: number, volume?: number }} p
 */
export function recordTick(p) {
  if (!pool) return;
  const vol = Number.isFinite(p.volume) ? p.volume : 0;
  pool
    .query(
      `INSERT INTO market_ticks (provider, symbol, ts_ms, price, volume) VALUES ($1,$2,$3,$4,$5)`,
      [p.provider, p.symbol, Math.floor(p.ts), p.price, vol]
    )
    .catch((e) => console.error('[db] insert tick:', e.message || e));
}
