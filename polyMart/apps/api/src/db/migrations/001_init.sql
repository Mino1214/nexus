CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  points BIGINT NOT NULL DEFAULT 1000,
  lang VARCHAR(5) NOT NULL DEFAULT 'ko',
  referrer_id TEXT REFERENCES users(id),
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS point_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) NOT NULL,
  delta BIGINT NOT NULL,
  reason VARCHAR(50) NOT NULL,
  ref_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bets (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) NOT NULL,
  market_id VARCHAR(100) NOT NULL,
  market_question TEXT NOT NULL,
  outcome VARCHAR(100) NOT NULL,
  points_bet BIGINT NOT NULL,
  odds NUMERIC(10, 2) NOT NULL,
  potential_win BIGINT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  market_end_date TIMESTAMPTZ,
  settled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bets_user_id ON bets(user_id);
CREATE INDEX IF NOT EXISTS idx_bets_market_id ON bets(market_id);
CREATE INDEX IF NOT EXISTS idx_bets_status ON bets(status);

CREATE TABLE IF NOT EXISTS translations (
  market_id VARCHAR(100) NOT NULL,
  lang VARCHAR(5) NOT NULL,
  question TEXT,
  description TEXT,
  translated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (market_id, lang)
);

CREATE TABLE IF NOT EXISTS daily_logins (
  user_id TEXT REFERENCES users(id),
  date DATE NOT NULL,
  PRIMARY KEY (user_id, date)
);
