import WebSocket from 'ws';
import { recordTick } from '../db/tickStore.js';
import { fetchApprovalKey } from './approval.js';
import { buildSubscribeMessage } from './subscribeMessage.js';
import {
  extractOrderbookFromRow,
  extractTickFromRow,
  parseRealtimeFrame,
} from './parseKisRealtime.js';
import { normalizeKrxSymbol } from './symbolNormalize.js';
import { seedKrxStockChartFromKisRest } from './krxKisChartSeed.js';

const MODES = /** @type {const} */ ({
  stock: { cnt: 'H0STCNT0', ob: 'H0STASP0', normalize: (s) => normalizeKrxSymbol(s) },
  index_futures: { cnt: 'H0IFCNT0', ob: 'H0IFASP0', normalize: (s) => String(s ?? '').trim() || null },
  overseas_future: { cnt: 'HDFFF020', ob: 'HDFFF010', normalize: (s) => String(s ?? '').trim() || null },
});

/** @param {string} p */
function providerToMode(p) {
  if (p === 'kis-index') return 'index_futures';
  if (p === 'kis-overseas') return 'overseas_future';
  if (p === 'kis') return 'stock';
  return null;
}

/**
 * @param {keyof typeof MODES} mode
 * @returns {'kis' | 'kis-index' | 'kis-overseas'}
 */
function providerForMode(mode) {
  if (mode === 'index_futures') return 'kis-index';
  if (mode === 'overseas_future') return 'kis-overseas';
  return 'kis';
}

/** @param {keyof typeof MODES} mode */
function subKey(mode, sym) {
  return `${mode}\t${sym}`;
}

/** @param {string} trId */
function modeForCntTr(trId) {
  if (trId === 'H0STCNT0') return 'stock';
  if (trId === 'H0IFCNT0') return 'index_futures';
  if (trId === 'HDFFF020') return 'overseas_future';
  return null;
}

/** @param {string} trId */
function modeForObTr(trId) {
  if (trId === 'H0STASP0') return 'stock';
  if (trId === 'H0IFASP0') return 'index_futures';
  if (trId === 'HDFFF010') return 'overseas_future';
  return null;
}

/**
 * @param {{ config: { restBase: string, appKey: string, secretKey: string, wsBase: string, symbol: string }, hub: { broadcast: (p: unknown) => void } }} opts
 */
export function startKisUpstream({ config, hub }) {
  let stopped = false;
  let socket = /** @type {WebSocket | null} */ (null);
  let reconnectTimer = /** @type {ReturnType<typeof setTimeout> | null} */ (null);
  /** @type {string | null} */
  let approvalKeyCached = null;

  const defaultSym = MODES.stock.normalize(config.symbol) || '005930';
  config.symbol = defaultSym;

  /** 마켓워치 등에서 온 구독 집합(클라이언트 sync_watchlist) */
  const watchSubs = {
    stock: /** @type {Set<string>} */ (new Set()),
    index_futures: new Set(),
    overseas_future: new Set(),
  };

  /** 차트 포커스 — watch와 합쳐 유효 구독 계산 */
  /** @type {{ mode: keyof typeof MODES, sym: string }} */
  let focus = { mode: 'stock', sym: defaultSym };

  /** 현재 KIS 소켓에 tr_type=1로 올려둔 키 */
  const registered = /** @type {Set<string>} */ (new Set());

  /** @type {Set<string> | null} */
  let desiredCached = null;

  const getDesired = () => {
    if (!desiredCached) {
      desiredCached = desiredSubKeys();
    }
    return desiredCached;
  };

  const bumpDesired = () => {
    desiredCached = null;
  };

  const clearTimer = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  const scheduleReconnect = (delayMs) => {
    clearTimer();
    reconnectTimer = setTimeout(() => {
      if (!stopped) connect();
    }, delayMs);
  };

  /**
   * @param {string} key
   * @param {string} sym
   * @param {string} trId
   * @param {string} trType
   */
  const sendSub = (key, sym, trId, trType) => {
    const msg = buildSubscribeMessage({
      approvalKey: key,
      trId,
      trKey: sym,
      trType,
    });
    socket?.send(JSON.stringify(msg));
  };

  /**
   * @param {string} key
   * @param {string} sym
   * @param {keyof typeof MODES} mode
   * @param {string} trType
   */
  const sendPair = (key, sym, mode, trType) => {
    const trCnt = MODES[mode].cnt;
    const trOb = MODES[mode].ob;
    sendSub(key, sym, trCnt, trType);
    setTimeout(() => sendSub(key, sym, trOb, trType), 60);
  };

  /** @returns {Set<string>} */
  function desiredSubKeys() {
    const eff = {
      stock: new Set(watchSubs.stock),
      index_futures: new Set(watchSubs.index_futures),
      overseas_future: new Set(watchSubs.overseas_future),
    };
    eff[focus.mode].add(focus.sym);
    const out = new Set();
    for (const mode of /** @type {(keyof typeof MODES)[]} */ (['stock', 'index_futures', 'overseas_future'])) {
      for (const sym of eff[mode]) {
        out.add(subKey(mode, sym));
      }
    }
    return out;
  }

  /**
   * @param {string} approvalKey
   * @param {string} key
   * @param {'1' | '2'} trType
   */
  const applyPairForKey = (approvalKey, key, trType) => {
    const tab = key.indexOf('\t');
    if (tab < 0) return;
    const mode = /** @type {keyof typeof MODES} */ (key.slice(0, tab));
    const sym = key.slice(tab + 1);
    if (!MODES[mode] || !sym) return;
    sendPair(approvalKey, sym, mode, trType);
  };

  /**
   * @param {string} approvalKey
   */
  const reconcile = (approvalKey) => {
    if (!socket || socket.readyState !== 1) return;

    const want = desiredSubKeys();
    const toDrop = [...registered].filter((k) => !want.has(k));
    const toAdd = [...want].filter((k) => !registered.has(k));

    let delay = 0;
    const stagger = 120;

    for (const k of toDrop) {
      setTimeout(() => {
        applyPairForKey(approvalKey, k, '2');
        registered.delete(k);
      }, delay);
      delay += stagger;
    }

    for (const k of toAdd) {
      setTimeout(() => {
        applyPairForKey(approvalKey, k, '1');
        registered.add(k);
      }, delay);
      delay += stagger;
    }

    if (toDrop.length || toAdd.length) {
      console.log('[kis] reconcile', { drop: toDrop.length, add: toAdd.length });
    }
  };

  /**
   * @param {readonly { provider: string; symbol: string }[]} feeds
   */
  function syncWatchlistFeeds(feeds) {
    watchSubs.stock.clear();
    watchSubs.index_futures.clear();
    watchSubs.overseas_future.clear();

    for (const f of feeds) {
      const mode = providerToMode(f.provider);
      if (!mode) continue;
      const sym = MODES[mode].normalize(f.symbol);
      if (sym) watchSubs[mode].add(sym);
    }
    bumpDesired();

    if (approvalKeyCached && socket?.readyState === 1) {
      reconcile(approvalKeyCached);
    }
  }

  /**
   * @param {string} rawSym
   * @param {keyof typeof MODES} [mode]
   */
  function setSubscription(rawSym, mode = 'stock') {
    const m = MODES[mode] ? mode : 'stock';
    const sym = MODES[m].normalize(rawSym);
    if (!sym) {
      hub.broadcast({ type: 'status', source: 'broker', state: 'bad_symbol' });
      return;
    }

    focus = { mode: m, sym };
    config.symbol = sym;
    bumpDesired();

    hub.broadcast({ type: 'symbol', provider: providerForMode(m), symbol: sym });

    if (m === 'stock') {
      void seedKrxStockChartFromKisRest({
        hub,
        restBase: config.restBase,
        appKey: config.appKey,
        secretKey: config.secretKey,
        paper: config.paper,
        krxSymbol6: sym,
        stillSubscribed: (s) => focus.mode === 'stock' && focus.sym === s,
      });
    }

    if (approvalKeyCached && socket?.readyState === 1) {
      reconcile(approvalKeyCached);
    } else {
      hub.broadcast({ type: 'status', source: 'kis', state: 'reconnecting' });
    }

    console.log('[kis] focus ->', m, sym);
  }

  /**
   * @param {string} trId
   * @param {Record<string, string>} row
   */
  const dispatchTick = (trId, row) => {
    const mode = modeForCntTr(trId);
    if (!mode) return;
    const tick = extractTickFromRow(row);
    if (!tick) return;

    const sym = tick.symbol.trim();
    let norm = sym;
    if (mode === 'stock') {
      const n = normalizeKrxSymbol(sym);
      if (!n) return;
      norm = n;
    }

    const eff = getDesired();
    if (!eff.has(subKey(mode, mode === 'stock' ? norm : sym))) return;

    const prov = providerForMode(mode);
    hub.broadcast({
      type: 'tick',
      provider: prov,
      symbol: mode === 'stock' ? norm : sym,
      price: tick.price,
      volume: tick.volume,
      hour: tick.hour,
      ts: tick.ts,
    });
    recordTick({
      provider: 'kis',
      symbol: mode === 'stock' ? norm : sym,
      ts: tick.ts,
      price: tick.price,
      volume: tick.volume,
    });
  };

  /**
   * @param {string} trId
   * @param {Record<string, string>} row
   */
  const dispatchOrderbook = (trId, row) => {
    const mode = modeForObTr(trId);
    if (!mode) return;
    const ob = extractOrderbookFromRow(row);
    if (!ob) return;

    const sym = ob.symbol.trim();
    let norm = sym;
    if (mode === 'stock') {
      const n = normalizeKrxSymbol(sym);
      if (!n) return;
      norm = n;
    }

    const eff = getDesired();
    if (!eff.has(subKey(mode, mode === 'stock' ? norm : sym))) return;

    const prov = providerForMode(mode);
    hub.broadcast({
      type: 'orderbook',
      provider: prov,
      symbol: mode === 'stock' ? norm : sym,
      asks: ob.asks,
      bids: ob.bids,
      ts: ob.ts,
    });
  };

  const connect = async () => {
    if (stopped) return;

    let approvalKey;
    try {
      approvalKey = await fetchApprovalKey({
        restBase: config.restBase,
        appKey: config.appKey,
        secretKey: config.secretKey,
      });
    } catch (e) {
      console.error('[kis] approval 실패:', e.message || e);
      hub.broadcast({
        type: 'status',
        source: 'kis',
        state: 'approval_error',
        message: String(e.message || e),
      });
      scheduleReconnect(5000);
      return;
    }

    approvalKeyCached = approvalKey;
    registered.clear();
    const url = config.wsBase;
    console.log('[kis] upstream connecting', url, 'focus', focus.mode, focus.sym);

    socket = new WebSocket(url);

    socket.on('open', () => {
      hub.broadcast({ type: 'status', source: 'kis', state: 'connected' });
      hub.broadcast({ type: 'symbol', provider: providerForMode(focus.mode), symbol: focus.sym });
      reconcile(approvalKey);
    });

    socket.on('message', (data, isBinary) => {
      if (isBinary) return;
      const raw = data.toString();

      if (raw.startsWith('{')) {
        try {
          const j = JSON.parse(raw);
          const trId = j?.header?.tr_id;
          if (trId === 'PINGPONG') {
            socket?.send(raw);
            return;
          }
        } catch {
          /* ignore */
        }
        return;
      }

      const parsed = parseRealtimeFrame(raw);
      if (!parsed) return;

      if (modeForCntTr(parsed.trId)) {
        dispatchTick(parsed.trId, parsed.row);
        return;
      }
      if (modeForObTr(parsed.trId)) {
        dispatchOrderbook(parsed.trId, parsed.row);
      }
    });

    socket.on('error', (err) => {
      console.error('[kis] socket error', err.message || err);
    });

    socket.on('close', () => {
      socket = null;
      approvalKeyCached = null;
      registered.clear();
      if (stopped) return;
      hub.broadcast({ type: 'status', source: 'kis', state: 'disconnected' });
      scheduleReconnect(3000);
    });
  };

  connect();

  return {
    stop() {
      stopped = true;
      clearTimer();
      if (socket) {
        try {
          socket.close();
        } catch {
          /* ignore */
        }
        socket = null;
      }
    },
    setSymbol: (s) => setSubscription(s, 'stock'),
    setSubscription,
    syncWatchlistFeeds,
    getSymbol: () => focus.sym,
  };
}
