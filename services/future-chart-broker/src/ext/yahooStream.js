/**
 * Yahoo Finance v8 chart 스트리밍.
 * - chart: 1일/1분 히스토리 + meta.regularMarketPrice(실시간에 가까운 현재가)
 * - (선택) v7 quote — 일부 환경에서 Unauthorized → 무시하고 chart/meta만 사용
 *
 * 이전 버그: 1분 봉 timestamp만 보고 중복 제거하면 같은 분 안에서 가격이 바뀌어도 틱이 안 나가 차트가 멈춘 것처럼 보임.
 */

import { recordTick } from '../db/tickStore.js';

/**
 * @typedef {{ time: number, open: number, high: number, low: number, close: number }} Bar
 */

/**
 * @param {unknown} v
 */
function isFiniteNum(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * @param {string} symbol
 * @returns {Promise<{ bars: Bar[], lastTick: { price: number, volume: number, tsMs: number } | null, metaTick: { price: number, volume: number, tsMs: number } | null }>}
 */
async function fetchYahoo1d1m(symbol) {
  const url =
    'https://query1.finance.yahoo.com/v8/finance/chart/' +
    encodeURIComponent(symbol) +
    '?interval=1m&range=1d&includePrePost=false';

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; future-chart-broker/0.1)',
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    throw new Error(`yahoo_fetch_failed ${res.status}`);
  }
  /** @type {any} */
  const data = await res.json();
  const result = data?.chart?.result?.[0];
  const meta = result?.meta;
  const ts = /** @type {number[] | undefined} */ (result?.timestamp);
  const quote = result?.indicators?.quote?.[0];
  const opens = /** @type {number[] | undefined} */ (quote?.open);
  const highs = /** @type {number[] | undefined} */ (quote?.high);
  const lows = /** @type {number[] | undefined} */ (quote?.low);
  const closes = /** @type {number[] | undefined} */ (quote?.close);
  const vols = /** @type {number[] | undefined} */ (quote?.volume);

  /** @type {{ price: number, volume: number, tsMs: number } | null} */
  let metaTick = null;
  if (meta && isFiniteNum(meta.regularMarketPrice)) {
    const tSec = meta.regularMarketTime ?? Math.floor(Date.now() / 1000);
    const vol = isFiniteNum(meta.regularMarketVolume) ? meta.regularMarketVolume : 0;
    metaTick = { price: meta.regularMarketPrice, volume: vol, tsMs: tSec * 1000 };
  }

  /** @type {Bar[]} */
  const bars = [];
  if (Array.isArray(ts) && Array.isArray(opens) && Array.isArray(highs) && Array.isArray(lows) && Array.isArray(closes)) {
    const n = Math.min(ts.length, opens.length, highs.length, lows.length, closes.length);
    for (let i = 0; i < n; i++) {
      const time = ts[i];
      const open = opens[i];
      const high = highs[i];
      const low = lows[i];
      const close = closes[i];
      if (!isFiniteNum(time) || !isFiniteNum(open) || !isFiniteNum(high) || !isFiniteNum(low) || !isFiniteNum(close)) continue;
      bars.push({ time, open, high, low, close });
    }
  }

  let lastTick = null;
  for (let i = bars.length - 1; i >= 0; i--) {
    const b = bars[i];
    if (isFiniteNum(b.close)) {
      const vol = Array.isArray(vols) && isFiniteNum(vols[i]) ? vols[i] : 0;
      lastTick = { price: b.close, volume: vol, tsMs: b.time * 1000 };
      break;
    }
  }

  return { bars, lastTick, metaTick };
}

/**
 * @param {string} symbol
 * @returns {Promise<{ price: number, volume: number, tsMs: number } | null>}
 */
async function fetchYahooQuote(symbol) {
  try {
    const url =
      'https://query1.finance.yahoo.com/v7/finance/quote?symbols=' + encodeURIComponent(symbol);
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; future-chart-broker/0.1)',
        Accept: 'application/json',
      },
    });
    if (!res.ok) return null;
    /** @type {any} */
    const data = await res.json();
    const q = data?.quoteResponse?.result?.[0];
    if (!q) return null;
    const price =
      q.regularMarketPrice ?? q.postMarketPrice ?? q.preMarketPrice ?? q.bid ?? q.ask;
    if (!isFiniteNum(price)) return null;
    const tSec = q.regularMarketTime || q.postMarketTime || q.preMarketTime || Math.floor(Date.now() / 1000);
    const vol = isFiniteNum(q.regularMarketVolume) ? q.regularMarketVolume : 0;
    return { price, volume: vol, tsMs: tSec * 1000 };
  } catch {
    return null;
  }
}

/**
 * meta(현재가) > v7 quote > 1분 봉 마지막 — 같은 초(ts)면 우선순위로 결정
 * @param {{ price: number, volume: number, tsMs: number } | null} metaTick
 * @param {{ price: number, volume: number, tsMs: number } | null} lastTick
 * @param {{ price: number, volume: number, tsMs: number } | null} quote
 */
function mergeYahooTicks(metaTick, lastTick, quote) {
  /** @type {Array<{ price: number, volume: number, tsMs: number, prio: number }>} */
  const parts = [];
  if (metaTick) parts.push({ ...metaTick, prio: 3 });
  if (quote) parts.push({ ...quote, prio: 2 });
  if (lastTick) parts.push({ ...lastTick, prio: 1 });
  if (!parts.length) return null;
  const maxTs = Math.max(...parts.map((p) => p.tsMs));
  const top = parts.filter((p) => p.tsMs === maxTs);
  top.sort((a, b) => b.prio - a.prio);
  const { prio: _p, ...rest } = top[0];
  return rest;
}

/**
 * @param {{ price: number, volume: number, tsMs: number }} a
 * @param {{ price: number, volume: number, tsMs: number }} b
 */
function tickEquals(a, b) {
  return a.price === b.price && a.volume === b.volume && a.tsMs === b.tsMs;
}

/**
 * @param {{
 *   hub: { broadcast: (p: unknown) => void },
 *   pollMs?: number,
 * }} opts
 */
export function startYahooStream({ hub, pollMs = 2500 }) {
  let stopped = false;
  /** @type {string | null} */
  let activeSymbol = null;
  /** @type {ReturnType<typeof setInterval> | null} */
  let timer = null;
  /** @type {{ price: number, volume: number, tsMs: number } | null} */
  let lastSent = null;

  const clear = () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  };

  const stop = () => {
    stopped = true;
    clear();
  };

  /**
   * @param {string} sym
   */
  async function resolveBestTick(sym) {
    const [chartData, quote] = await Promise.all([fetchYahoo1d1m(sym), fetchYahooQuote(sym)]);
    if (stopped || activeSymbol !== sym) return null;

    const best = mergeYahooTicks(chartData.metaTick, chartData.lastTick, quote);
    return { chart: chartData, best };
  }

  /**
   * @param {string} symbol
   */
  const setSymbol = async (symbol) => {
    const sym = String(symbol || '').trim();
    if (!sym) return;
    activeSymbol = sym;
    lastSent = null;

    hub.broadcast({ type: 'symbol', provider: 'yahoo', symbol: sym });
    hub.broadcast({ type: 'status', source: 'yahoo', state: 'connecting' });

    try {
      const resolved = await resolveBestTick(sym);
      if (stopped || activeSymbol !== sym || !resolved) return;
      const { chart, best } = resolved;

      if (chart.bars.length) {
        hub.broadcast({ type: 'history', provider: 'yahoo', symbol: sym, bars: chart.bars });
      }
      if (best) {
        lastSent = best;
        hub.broadcast({
          type: 'tick',
          provider: 'yahoo',
          symbol: sym,
          price: best.price,
          volume: best.volume,
          hour: null,
          ts: best.tsMs,
        });
        recordTick({ provider: 'yahoo', symbol: sym, ts: best.tsMs, price: best.price, volume: best.volume });
      }
      hub.broadcast({ type: 'status', source: 'yahoo', state: 'connected' });
    } catch (e) {
      if (stopped || activeSymbol !== sym) return;
      hub.broadcast({
        type: 'status',
        source: 'yahoo',
        state: 'error',
        message: String(e?.message || e),
      });
    }

    clear();
    timer = setInterval(async () => {
      const cur = activeSymbol;
      if (stopped || !cur) return;
      try {
        const resolved = await resolveBestTick(cur);
        if (stopped || activeSymbol !== cur || !resolved?.best) return;
        const { best } = resolved;
        if (lastSent && tickEquals(lastSent, best)) return;
        lastSent = best;
        hub.broadcast({
          type: 'tick',
          provider: 'yahoo',
          symbol: cur,
          price: best.price,
          volume: best.volume,
          hour: null,
          ts: best.tsMs,
        });
        recordTick({ provider: 'yahoo', symbol: cur, ts: best.tsMs, price: best.price, volume: best.volume });
      } catch {
        /* 다음 주기 */
      }
    }, pollMs);
  };

  return { setSymbol, stop };
}
