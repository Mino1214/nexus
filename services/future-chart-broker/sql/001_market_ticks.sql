-- PostgreSQL: 실서버에 적용할 시세 틱 테이블
-- psql "$DATABASE_URL" -f sql/001_market_ticks.sql

CREATE TABLE IF NOT EXISTS market_ticks (
  id BIGSERIAL PRIMARY KEY,
  provider TEXT NOT NULL,
  symbol TEXT NOT NULL,
  ts_ms BIGINT NOT NULL,
  price DOUBLE PRECISION NOT NULL,
  volume DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_market_ticks_symbol_ts ON market_ticks (symbol, ts_ms DESC);
CREATE INDEX IF NOT EXISTS idx_market_ticks_created ON market_ticks (created_at DESC);
