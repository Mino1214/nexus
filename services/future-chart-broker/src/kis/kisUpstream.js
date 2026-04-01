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

const MODES = /** @type {const} */ ({
  stock: { cnt: 'H0STCNT0', ob: 'H0STASP0', normalize: (s) => normalizeKrxSymbol(s) },
  index_futures: { cnt: 'H0IFCNT0', ob: 'H0IFASP0', normalize: (s) => String(s ?? '').trim() || null },
  overseas_future: { cnt: 'HDFFF020', ob: 'HDFFF010', normalize: (s) => String(s ?? '').trim() || null },
});

/**
 * @param {keyof typeof MODES} mode
 * @returns {'kis' | 'kis-index' | 'kis-overseas'}
 */
function providerForMode(mode) {
  if (mode === 'index_futures') return 'kis-index';
  if (mode === 'overseas_future') return 'kis-overseas';
  return 'kis';
}

/** @param {{ config: { restBase: string, appKey: string, secretKey: string, wsBase: string, symbol: string }, hub: { broadcast: (p: unknown) => void } }} opts */
export function startKisUpstream({ config, hub }) {
  let stopped = false;
  let socket = /** @type {WebSocket | null} */ (null);
  let reconnectTimer = /** @type {ReturnType<typeof setTimeout> | null} */ (null);
  /** @type {string | null} */
  let approvalKeyCached = null;
  /** @type {keyof typeof MODES} */
  let activeMode = 'stock';
  let activeSymbol = config.symbol;

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
   * @param {string} trType "1" 등록 "2" 해제
   */
  const sendPair = (key, sym, mode, trType) => {
    const trCnt = MODES[mode].cnt;
    const trOb = MODES[mode].ob;
    sendSub(key, sym, trCnt, trType);
    setTimeout(() => sendSub(key, sym, trOb, trType), 60);
  };

  const subscribeSymbol = (key, sym, mode) => {
    sendPair(key, sym, mode, '1');
    hub.broadcast({ type: 'symbol', provider: providerForMode(mode), symbol: sym });
  };

  const unsubscribeSymbol = (key, sym, mode) => {
    sendPair(key, sym, mode, '2');
  };

  /**
   * @param {string} rawSym
   */
  function setSubscription(rawSym, mode = 'stock') {
    const m = MODES[mode] ? mode : 'stock';
    const sym = MODES[m].normalize(rawSym);
    if (!sym) {
      hub.broadcast({ type: 'status', source: 'broker', state: 'bad_symbol' });
      return;
    }

    if (sym === activeSymbol && m === activeMode && socket?.readyState === 1) {
      hub.broadcast({ type: 'symbol', provider: providerForMode(m), symbol: sym });
      return;
    }

    config.symbol = sym;

    if (!socket || socket.readyState !== 1 || !approvalKeyCached) {
      activeMode = m;
      activeSymbol = sym;
      hub.broadcast({ type: 'symbol', provider: providerForMode(m), symbol: sym });
      return;
    }

    const key = approvalKeyCached;
    const prev = activeSymbol;
    const prevMode = activeMode;
    if (prev !== sym || prevMode !== m) {
      unsubscribeSymbol(key, prev, prevMode);
    }
    activeMode = m;
    activeSymbol = sym;
    subscribeSymbol(key, sym, m);
    console.log('[kis] sub ->', m, sym);
  }

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
    const url = config.wsBase;
    activeSymbol = config.symbol;
    console.log('[kis] upstream connecting', url, 'symbol', activeSymbol);

    socket = new WebSocket(url);

    socket.on('open', () => {
      hub.broadcast({ type: 'status', source: 'kis', state: 'connected' });
      subscribeSymbol(approvalKey, activeSymbol, activeMode);
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

      if (parsed.trId === MODES[activeMode].cnt) {
        const tick = extractTickFromRow(parsed.row);
        if (!tick) return;
        hub.broadcast({
          type: 'tick',
          provider: providerForMode(activeMode),
          symbol: tick.symbol,
          price: tick.price,
          volume: tick.volume,
          hour: tick.hour,
          ts: tick.ts,
        });
        recordTick({
          provider: 'kis',
          symbol: tick.symbol,
          ts: tick.ts,
          price: tick.price,
          volume: tick.volume,
        });
        return;
      }

      if (parsed.trId === MODES[activeMode].ob) {
        const ob = extractOrderbookFromRow(parsed.row);
        if (!ob) return;
        hub.broadcast({
          type: 'orderbook',
          provider: providerForMode(activeMode),
          symbol: ob.symbol,
          asks: ob.asks,
          bids: ob.bids,
          ts: ob.ts,
        });
      }
    });

    socket.on('error', (err) => {
      console.error('[kis] socket error', err.message || err);
    });

    socket.on('close', () => {
      socket = null;
      approvalKeyCached = null;
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
    getSymbol: () => activeSymbol,
  };
}
