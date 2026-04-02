import { normalizeKrxSymbol } from './symbolNormalize.js';

/**
 * KIS 키가 없을 때: WS 허브만 유지(한투 전용 — 외부 시세 미사용).
 */
export function startKisDomesticYahooFallback({ hub, defaultSymbol }) {
  let activeSymbol = normalizeKrxSymbol(defaultSymbol) || '005380';

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
        message: 'KIS_APP_KEY / KIS_APP_SECRET 을 설정해야 한투 시세를 쓸 수 있습니다.',
      });
      return;
    }
    const sym = normalizeKrxSymbol(rawSym);
    if (!sym) {
      hub.broadcast({ type: 'status', source: 'broker', state: 'bad_symbol' });
      return;
    }
    activeSymbol = sym;
    hub.broadcast({ type: 'symbol', provider: 'kis', symbol: sym });
    hub.broadcast({
      type: 'status',
      source: 'kis',
      state: 'disabled',
      message: 'KIS API 키가 없습니다. future-chart-broker .env 에 키를 넣어 주세요.',
    });
  }

  setSubscription(activeSymbol, 'stock');

  /** @param {readonly unknown[]} _feeds */
  function syncWatchlistFeeds(_feeds) {}

  return {
    stop() {},
    setSubscription,
    setSymbol: (s) => setSubscription(s, 'stock'),
    syncWatchlistFeeds,
  };
}
