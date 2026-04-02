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

/** @type {{ setSymbol?: (s: string) => void } | null} */
let upstreamRef = null;
/** @type {{ setSymbol?: (s: string) => void, stop?: () => void } | null} */
let yahooRef = null;

const broker = createBrokerServer({
  port: config.port,
  hub,
  onClientMessage: (data) => {
    if (!(data && typeof data === 'object' && 'op' in data)) return;
    if (/** @type {any} */ (data).op !== 'subscribe') return;

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
