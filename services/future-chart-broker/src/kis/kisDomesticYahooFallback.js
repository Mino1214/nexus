import { fetchYahoo1d1m } from '../ext/yahooStream.js';
import { seedKrxStockChartFromYahoo } from './krxYahooChartSeed.js';
import { normalizeKrxSymbol } from './symbolNormalize.js';

/**
 * KIS API 키 없이도 WS 허브는 떠야 할 때: 국내주식 구독은 Yahoo `XXXXXX.KS`로 히스토리 시드 + 주기 틱 폴링.
 * (실제 한투 체결/호가는 제공하지 않음)
 */
export function startKisDomesticYahooFallback({ hub, defaultSymbol }) {
  let stopped = false;
  /** @type {ReturnType<typeof setInterval> | null} */
  let timer = null;
  let activeSymbol = normalizeKrxSymbol(defaultSymbol) || '005380';
  /** @type {{ price: number; tsMs: number } | null} */
  let lastSent = null;

  const clearTimer = () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  };

  const poll = async () => {
    const sym = activeSymbol;
    const yahooSym = `${sym}.KS`;
    try {
      const { bars, metaTick, lastTick } = await fetchYahoo1d1m(yahooSym);
      if (stopped || activeSymbol !== sym) return;

      let best = metaTick || lastTick;
      if (!best && bars.length) {
        const b = bars[bars.length - 1];
        best = { price: b.close, volume: 0, tsMs: b.time * 1000 };
      }
      if (!best) return;
      if (lastSent && lastSent.price === best.price && lastSent.tsMs === best.tsMs) return;
      lastSent = { price: best.price, tsMs: best.tsMs };

      hub.broadcast({
        type: 'tick',
        provider: 'kis',
        symbol: sym,
        price: best.price,
        volume: best.volume ?? 0,
        hour: null,
        ts: best.tsMs,
      });
    } catch {
      /* 다음 주기 */
    }
  };

  /**
   * @param {string} rawSym
   * @param {'stock' | 'index_futures' | 'overseas_future'} [mode]
   */
  function setSubscription(rawSym, mode = 'stock') {
    if (mode !== 'stock') {
      hub.broadcast({
        type: 'status',
        source: 'kis',
        state: 'disabled',
        message: 'KIS 키가 없어 지수·해외 선물 실시간을 쓸 수 없습니다.',
      });
      return;
    }
    const sym = normalizeKrxSymbol(rawSym);
    if (!sym) {
      hub.broadcast({ type: 'status', source: 'broker', state: 'bad_symbol' });
      return;
    }
    activeSymbol = sym;
    lastSent = null;
    hub.broadcast({ type: 'symbol', provider: 'kis', symbol: sym });
    hub.broadcast({ type: 'status', source: 'kis', state: 'connected' });

    void seedKrxStockChartFromYahoo({
      hub,
      krxSymbol6: sym,
      stillSubscribed: (s) => activeSymbol === s,
    });

    clearTimer();
    timer = setInterval(() => void poll(), 2500);
    void poll();
  }

  setSubscription(activeSymbol, 'stock');

  /** @param {readonly unknown[]} _feeds */
  function syncWatchlistFeeds(_feeds) {
    /* KIS 미사용 폴백: 다종목 한투 WS 없음 — 차트 포커스만 setSubscription으로 유지 */
  }

  return {
    stop() {
      stopped = true;
      clearTimer();
    },
    setSubscription,
    setSymbol: (s) => setSubscription(s, 'stock'),
    syncWatchlistFeeds,
  };
}
