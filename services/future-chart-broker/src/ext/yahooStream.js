/**
 * Yahoo Finance v8 chart — 거래소식 배치: 마켓워치 다종목 폴링 + 포커스 종목은 초기 히스토리(1d/1m) 송신.
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
export async function fetchYahoo1d1m(symbol) {
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
  /** @type {string[]} */
  let watchSymbols = [];
  /** @type {string | null} */
  let focusSymbol = null;
  /** @type {ReturnType<typeof setInterval> | null} */
  let timer = null;
  /** @type {Map<string, { price: number, volume: number, tsMs: number }>} */
  const lastSent = new Map();

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
    if (stopped) return null;
    const best = mergeYahooTicks(chartData.metaTick, chartData.lastTick, quote);
    return { chart: chartData, best };
  }

  /**
   * @param {string} sym
   * @param {{ sendHistory?: boolean }} [opts]
   */
  async function pollOne(sym, opts = {}) {
    const { sendHistory = false } = opts;
    try {
      const resolved = await resolveBestTick(sym);
      if (stopped || !resolved) return;

      const { chart, best } = resolved;

      if (sendHistory && chart.bars.length) {
        hub.broadcast({ type: 'history', provider: 'yahoo', symbol: sym, bars: chart.bars });
      }

      if (best) {
        const prev = lastSent.get(sym);
        if (!prev || !tickEquals(prev, best)) {
          lastSent.set(sym, best);
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
      }
    } catch {
      /* 다음 주기 */
    }
  }

  const pollAllTicks = async () => {
    if (stopped || watchSymbols.length === 0) return;
    await Promise.all(watchSymbols.map((s) => pollOne(s, { sendHistory: false })));
  };

  const restartTimer = () => {
    clear();
    if (watchSymbols.length === 0) return;
    timer = setInterval(() => void pollAllTicks(), pollMs);
  };

  /**
   * 마켓워치 Yahoo 심볼 일괄 등록(교체). 포커스 심볼은 목록에 없어도 유지 폴링.
   * @param {readonly string[]} symbols
   */
  const setWatchSymbols = (symbols) => {
    const next = [...new Set(symbols.map((s) => String(s || '').trim()).filter(Boolean))];
    if (focusSymbol && !next.includes(focusSymbol)) {
      next.push(focusSymbol);
    }
    watchSymbols = next;
    for (const k of [...lastSent.keys()]) {
      if (!watchSymbols.includes(k)) lastSent.delete(k);
    }
    restartTimer();
    void pollAllTicks();
  };

  /**
   * 차트 포커스(Yahoo). 히스토리 1회 + 폴링 집합에 포함.
   * @param {string} symbol
   */
  const setSymbol = async (symbol) => {
    const sym = String(symbol || '').trim();
    if (!sym) return;

    focusSymbol = sym;
    if (!watchSymbols.includes(sym)) {
      watchSymbols = [...watchSymbols, sym];
    }

    hub.broadcast({ type: 'symbol', provider: 'yahoo', symbol: sym });
    hub.broadcast({ type: 'status', source: 'yahoo', state: 'connecting' });

    try {
      await pollOne(sym, { sendHistory: true });
      if (!stopped) {
        hub.broadcast({ type: 'status', source: 'yahoo', state: 'connected' });
      }
    } catch (e) {
      if (!stopped) {
        hub.broadcast({
          type: 'status',
          source: 'yahoo',
          state: 'error',
          message: String(e?.message || e),
        });
      }
    }

    restartTimer();
  };

  return { setSymbol, setWatchSymbols, stop };
}
