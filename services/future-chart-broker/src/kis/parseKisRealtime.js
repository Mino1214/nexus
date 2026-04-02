import { H0STCNT0_COLUMNS } from './h0stcnt0Columns.js';
import { H0STASP0_COLUMNS } from './h0stasp0Columns.js';
import { H0IFCNT0_COLUMNS } from './h0ifcnt0Columns.js';
import { H0IFASP0_COLUMNS } from './h0ifasp0Columns.js';
import { HDFFF010_COLUMNS } from './hdfff010Columns.js';
import { HDFFF020_COLUMNS } from './hdfff020Columns.js';

/** @type {Record<string, readonly string[]>} */
const COLUMN_MAP = {
  H0STCNT0: H0STCNT0_COLUMNS,
  H0STASP0: H0STASP0_COLUMNS,
  H0IFCNT0: H0IFCNT0_COLUMNS,
  H0IFASP0: H0IFASP0_COLUMNS,
  HDFFF010: HDFFF010_COLUMNS,
  HDFFF020: HDFFF020_COLUMNS,
};

/**
 * @param {string} raw
 * @returns {{ trId: string, row: Record<string, string> } | null}
 */
export function parseRealtimeFrame(raw) {
  if (!raw || (raw[0] !== '0' && raw[0] !== '1')) {
    return null;
  }

  const parts = raw.split('|');
  if (parts.length < 4) {
    return null;
  }

  const trId = parts[1];
  const cols = COLUMN_MAP[trId];
  const payload = parts[3];
  if (!cols || !payload) {
    return null;
  }

  const cells = payload.split('^');
  /** @type {Record<string, string>} */
  const row = {};
  for (let i = 0; i < cols.length; i++) {
    row[cols[i]] = cells[i] ?? '';
  }
  return { trId, row };
}

/**
 * @param {Record<string, string>} row
 */
export function extractTickFromRow(row) {
  // 국내주식(H0STCNT0)
  if (row.MKSC_SHRN_ISCD) {
    const symbol = row.MKSC_SHRN_ISCD?.trim();
    const priceStr = row.STCK_PRPR?.trim();
    const volStr = row.CNTG_VOL?.trim();
    const hour = row.STCK_CNTG_HOUR?.trim();

    const price = priceStr ? Number(priceStr) : NaN;
    const volume = volStr ? Number(volStr) : 0;
    if (!symbol || !Number.isFinite(price) || price <= 0) return null;

    return {
      symbol,
      price,
      volume: Number.isFinite(volume) ? volume : 0,
      hour: hour || null,
      ts: Date.now(),
    };
  }

  // 지수선물(H0IFCNT0)
  if (row.futs_shrn_iscd) {
    const symbol = row.futs_shrn_iscd?.trim();
    const priceStr = row.futs_prpr?.trim();
    const volStr = row.last_cnqn?.trim() || row.acml_vol?.trim();
    const hour = row.bsop_hour?.trim();

    const price = priceStr ? Number(priceStr) : NaN;
    const volume = volStr ? Number(volStr) : 0;
    if (!symbol || !Number.isFinite(price) || price <= 0) return null;

    return {
      symbol,
      price,
      volume: Number.isFinite(volume) ? volume : 0,
      hour: hour || null,
      ts: Date.now(),
    };
  }

  // 해외선물옵션(HDFFF020)
  if (row.series_cd) {
    const symbol = row.series_cd?.trim();
    const priceStr = row.last_price?.trim();
    const volStr = row.last_qntt?.trim() || row.vol?.trim();
    const hour = row.recv_time?.trim();

    const price = priceStr ? Number(priceStr) : NaN;
    const volume = volStr ? Number(volStr) : 0;
    if (!symbol || !Number.isFinite(price) || price <= 0) return null;

    return {
      symbol,
      price,
      volume: Number.isFinite(volume) ? volume : 0,
      hour: hour || null,
      ts: Date.now(),
    };
  }

  return null;
}

/**
 * @param {Record<string, string>} row
 */
export function extractOrderbookFromRow(row) {
  // 국내주식(H0STASP0)
  if (row.MKSC_SHRN_ISCD) {
    const symbol = row.MKSC_SHRN_ISCD?.trim();
    if (!symbol) return null;
    /** @type {{ price: number; qty: number }[]} */
    const asks = [];
    /** @type {{ price: number; qty: number }[]} */
    const bids = [];
    for (let i = 1; i <= 10; i++) {
      const ap = Number(row[`ASKP${i}`]?.trim());
      const aq = Number(row[`ASKP_RSQN${i}`]?.trim());
      const bp = Number(row[`BIDP${i}`]?.trim());
      const bq = Number(row[`BIDP_RSQN${i}`]?.trim());
      if (Number.isFinite(ap) && ap > 0) asks.push({ price: ap, qty: Number.isFinite(aq) ? aq : 0 });
      if (Number.isFinite(bp) && bp > 0) bids.push({ price: bp, qty: Number.isFinite(bq) ? bq : 0 });
    }
    return { symbol, asks, bids, ts: Date.now() };
  }

  // 지수선물(H0IFASP0) — 1~5단 (체결만 있고 매도1호가가 비는 구간도 있음)
  if (row.futs_shrn_iscd) {
    const symbol = row.futs_shrn_iscd?.trim();
    if (!symbol) return null;
    /** @type {{ price: number; qty: number }[]} */
    const asks = [];
    /** @type {{ price: number; qty: number }[]} */
    const bids = [];
    for (let i = 1; i <= 5; i++) {
      const ap = Number(row[`futs_askp${i}`]?.trim());
      const aq = Number(row[`askp_rsqn${i}`]?.trim());
      const bp = Number(row[`futs_bidp${i}`]?.trim());
      const bq = Number(row[`bidp_rsqn${i}`]?.trim());
      if (Number.isFinite(ap) && ap > 0) asks.push({ price: ap, qty: Number.isFinite(aq) ? aq : 0 });
      if (Number.isFinite(bp) && bp > 0) bids.push({ price: bp, qty: Number.isFinite(bq) ? bq : 0 });
    }
    return { symbol, asks, bids, ts: Date.now() };
  }

  // 해외선물옵션(HDFFF010) — 1~5단
  if (row.series_cd) {
    const symbol = row.series_cd?.trim();
    if (!symbol) return null;
    /** @type {{ price: number; qty: number }[]} */
    const asks = [];
    /** @type {{ price: number; qty: number }[]} */
    const bids = [];
    for (let i = 1; i <= 5; i++) {
      const ap = Number(row[`ask_price_${i}`]?.trim());
      const aq = Number(row[`ask_qntt_${i}`]?.trim());
      const bp = Number(row[`bid_price_${i}`]?.trim());
      const bq = Number(row[`bid_qntt_${i}`]?.trim());
      if (Number.isFinite(ap) && ap > 0) asks.push({ price: ap, qty: Number.isFinite(aq) ? aq : 0 });
      if (Number.isFinite(bp) && bp > 0) bids.push({ price: bp, qty: Number.isFinite(bq) ? bq : 0 });
    }
    return { symbol, asks, bids, ts: Date.now() };
  }

  return null;
}
