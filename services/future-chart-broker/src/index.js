import { loadConfig } from './config.js';
import { initTickStore } from './db/tickStore.js';
import { createStreamHub } from './hub/streamHub.js';
import { createBrokerServer } from './http/brokerServer.js';
import { startKisDomesticYahooFallback } from './kis/kisDomesticYahooFallback.js';
import { startKisUpstream } from './kis/kisUpstream.js';

await initTickStore();
const config = loadConfig();
const hub = createStreamHub();

/** @type {{ setSymbol?: (s: string) => void, syncWatchlistFeeds?: (f: unknown[]) => void } | null} */
let upstreamRef = null;
const broker = createBrokerServer({
  port: config.port,
  hub,
  onClientMessage: (data) => {
    if (!(data && typeof data === 'object' && 'op' in data)) return;
    const op = String(/** @type {any} */ (data).op);

    if (op === 'sync_watchlist') {
      const feeds = /** @type {any} */ (data).feeds;
      if (!Array.isArray(feeds)) return;
      const kisFeeds = feeds.filter(
        (f) =>
          f &&
          typeof f === 'object' &&
          ['kis', 'kis-index', 'kis-overseas'].includes(String(/** @type {any} */ (f).provider)),
      );
      upstreamRef?.syncWatchlistFeeds?.(kisFeeds);
      return;
    }

    if (op !== 'subscribe') return;

    const providerRaw = /** @type {any} */ (data).provider;
    const provider = providerRaw ? String(providerRaw) : 'kis';
    const sym = /** @type {any} */ (data).symbol;
    if (sym == null) return;

    if (provider === 'kis-index') {
      upstreamRef?.setSubscription?.(String(sym), 'index_futures');
      return;
    }
    if (provider === 'kis-overseas') {
      upstreamRef?.setSubscription?.(String(sym), 'overseas_future');
      return;
    }

    upstreamRef?.setSubscription?.(String(sym), 'stock');
  },
});

await broker.listen();

const upstream = config.kisEnabled
  ? startKisUpstream({ config, hub })
  : startKisDomesticYahooFallback({ hub, defaultSymbol: config.symbol });

upstreamRef = upstream;

console.log(
  `[broker] HTTP + WS http://127.0.0.1:${config.port} (health: /health) | KIS=${config.kisEnabled ? `on symbol=${config.symbol} paper=${config.paper}` : 'off (키 없음)'}`
);

const shutdown = async () => {
  upstream.stop();
  await broker.close();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
