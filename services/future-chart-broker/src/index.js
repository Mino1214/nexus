import { loadConfig } from './config.js';
import { initTickStore } from './db/tickStore.js';
import { createStreamHub } from './hub/streamHub.js';
import { createBrokerServer } from './http/brokerServer.js';
import { startYahooStream } from './ext/yahooStream.js';
import { startKisDomesticYahooFallback } from './kis/kisDomesticYahooFallback.js';
import { startKisUpstream } from './kis/kisUpstream.js';

await initTickStore();
const config = loadConfig();
const hub = createStreamHub();

/** @type {{ setSymbol?: (s: string) => void, syncWatchlistFeeds?: (f: unknown[]) => void } | null} */
let upstreamRef = null;
/** @type {{ setSymbol?: (s: string) => void, setWatchSymbols?: (s: string[]) => void, stop?: () => void } | null} */
let yahooRef = null;

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
      const yahooSyms = feeds
        .filter((f) => f && typeof f === 'object' && String(/** @type {any} */ (f).provider) === 'yahoo')
        .map((f) => String(/** @type {any} */ (f).symbol ?? '').trim())
        .filter(Boolean);
      yahooRef?.setWatchSymbols?.(yahooSyms);
      return;
    }

    if (op !== 'subscribe') return;

    const providerRaw = /** @type {any} */ (data).provider;
    const provider = providerRaw ? String(providerRaw) : 'kis';
    const sym = /** @type {any} */ (data).symbol;
    if (sym == null) return;

    if (provider === 'yahoo') {
      yahooRef?.setSymbol?.(String(sym));
      return;
    }

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
  `[broker] HTTP + WS http://127.0.0.1:${config.port} (health: /health) | KIS=${config.kisEnabled ? `on symbol=${config.symbol} paper=${config.paper}` : 'off (Yahoo .KS 폴백)'}`
);

const yahoo = startYahooStream({ hub });
yahooRef = yahoo;

const shutdown = async () => {
  upstream.stop();
  yahoo.stop?.();
  await broker.close();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
