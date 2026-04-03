import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
// data/ 는 src/ 두 단계 위 (services/future-chart-broker/data/)
const DEFAULT_DB_PATH = join(__dir, '../../data/bars.db');

/** @type {DatabaseSync | null} */
let db = null;

/**
 * SQLite barStore 초기화. `data/` 디렉토리가 없으면 생성.
 * node:sqlite 는 Node 22.5+ 내장 (Node 23에서 자동 활성화).
 * @param {string} [path] SQLITE_PATH env 또는 기본값
 */
export function initBarStore(path) {
  const dbPath = path?.trim() || DEFAULT_DB_PATH;
  const dir = dirname(dbPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  db = new DatabaseSync(dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS hts_bars (
      symbol   TEXT    NOT NULL,
      tf       TEXT    NOT NULL,
      bar_time INTEGER NOT NULL,
      open     REAL    NOT NULL,
      high     REAL    NOT NULL,
      low      REAL    NOT NULL,
      close    REAL    NOT NULL,
      volume   REAL    NOT NULL DEFAULT 0,
      PRIMARY KEY (symbol, tf, bar_time)
    );
    CREATE INDEX IF NOT EXISTS idx_hts_bars_lookup
      ON hts_bars (symbol, tf, bar_time DESC);
  `);

  console.log(`[barStore] SQLite 준비: ${dbPath}`);
}

/**
 * @typedef {{ time: number, open: number, high: number, low: number, close: number, volume?: number }} Bar
 */

/**
 * DB에서 봉 배열 로드.
 * @param {string} symbol
 * @param {string} tf  '1m' | '1d'
 * @param {number} [fromTime]  inclusive lower bound (bar_time epoch sec)
 * @param {number} [toTime]    inclusive upper bound
 * @returns {Bar[]}
 */
export function loadBars(symbol, tf, fromTime, toTime) {
  if (!db) return [];

  if (fromTime != null && toTime != null) {
    return /** @type {any[]} */ (
      db
        .prepare(
          `SELECT bar_time AS time, open, high, low, close, volume
           FROM hts_bars
           WHERE symbol=? AND tf=? AND bar_time>=? AND bar_time<=?
           ORDER BY bar_time ASC`,
        )
        .all(symbol, tf, fromTime, toTime)
    );
  }
  if (fromTime != null) {
    return /** @type {any[]} */ (
      db
        .prepare(
          `SELECT bar_time AS time, open, high, low, close, volume
           FROM hts_bars
           WHERE symbol=? AND tf=? AND bar_time>=?
           ORDER BY bar_time ASC`,
        )
        .all(symbol, tf, fromTime)
    );
  }
  return /** @type {any[]} */ (
    db
      .prepare(
        `SELECT bar_time AS time, open, high, low, close, volume
         FROM hts_bars
         WHERE symbol=? AND tf=?
         ORDER BY bar_time ASC`,
      )
      .all(symbol, tf)
  );
}

/**
 * DB에서 해당 심볼·timeframe의 가장 최근 bar_time 반환.
 * @param {string} symbol
 * @param {string} tf
 * @returns {number | null}
 */
export function getLatestBarTime(symbol, tf) {
  if (!db) return null;
  const row = /** @type {any} */ (
    db
      .prepare(
        `SELECT MAX(bar_time) AS t FROM hts_bars WHERE symbol=? AND tf=?`,
      )
      .get(symbol, tf)
  );
  return row?.t ?? null;
}

/**
 * 봉 배열을 DB에 upsert (INSERT OR REPLACE).
 * node:sqlite는 db.transaction()이 없으므로 BEGIN/COMMIT 직접 사용.
 * @param {string} symbol
 * @param {string} tf
 * @param {Bar[]} bars
 */
export function saveBars(symbol, tf, bars) {
  if (!db || bars.length === 0) return;
  const stmt = db.prepare(
    `INSERT OR REPLACE INTO hts_bars
       (symbol, tf, bar_time, open, high, low, close, volume)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  db.exec('BEGIN');
  try {
    for (const b of bars) {
      stmt.run(
        symbol,
        tf,
        b.time,
        b.open,
        b.high,
        b.low,
        b.close,
        b.volume ?? 0,
      );
    }
    db.exec('COMMIT');
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch { /* ignore */ }
    console.error('[barStore] saveBars 실패:', e?.message || e);
  }
}

/**
 * 특정 날짜 이후 봉 삭제 (선택적 정리 용도).
 * @param {string} symbol
 * @param {string} tf
 * @param {number} beforeTime  이 시각보다 오래된 봉 삭제
 */
export function pruneOldBars(symbol, tf, beforeTime) {
  if (!db) return;
  db
    .prepare(
      `DELETE FROM hts_bars WHERE symbol=? AND tf=? AND bar_time<?`,
    )
    .run(symbol, tf, beforeTime);
}
