import WebSocket from 'ws';
import { recordTick } from '../db/tickStore.js';
import { saveBars } from '../db/barStore.js';
import { fetchApprovalKey } from './approval.js';
import { buildSubscribeMessage } from './subscribeMessage.js';
import {
  extractOrderbookFromRow,
  extractTickFromRow,
  parseRealtimeFrame,
} from './parseKisRealtime.js';
import { normalizeKrxSymbol } from './symbolNormalize.js';
import { seedKrxStockChartFromKisRest, preSeedWatchlistBg } from './krxKisChartSeed.js';
import { seedOverseasFuturesChart, broadcastOverseasFuturesObSnapshot, startOverseasQuotePoll } from './kisYahooOverseasSeed.js';
import { fetchDomesticOrderbookSnapshot } from './kisOrderbookSnapshot.js';

// 틱(true UTC ms)에서 분봉 버킷(fake-UTC epoch sec) 계산
// 프론트엔드 StreamingChart.tsx 와 동일한 KST_OFFSET_MS 적용
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
/** @param {number} tsMs  true UTC ms */
const toMinBucketSec = (tsMs) => Math.floor((tsMs + KST_OFFSET_MS) / 60000) * 60;

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
  const FOCUS_BOOT_TIMEOUT_MS = 12000;
  const FOCUS_STALL_TIMEOUT_MS = 20000;
  const WATCHDOG_INTERVAL_MS = 5000;
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

  /**
   * Yahoo Finance 시세 폴 전용 해외선물 집합.
   * sync_watchlist의 kis-overseas 항목을 여기 모아서 KIS WS 구독 없이 Yahoo만 폴링.
   * (KIS WS 해외선물 구독은 포커스 1개만 허용 — ALREADY IN SUBSCRIBE 이슈 방지)
   */
  const overseasQuoteWatch = /** @type {Set<string>} */ (new Set());

  /** 차트 포커스 — watch와 합쳐 유효 구독 계산 */
  /** @type {{ mode: keyof typeof MODES, sym: string }} */
  let focus = { mode: 'stock', sym: defaultSym };
  let focusRequestedAt = Date.now();
  let lastFocusedRealtimeAt = 0;
  let focusWatchdogAttempts = 0;
  let lastWatchdogReconnectAt = 0;

  /** Yahoo Finance 해외선물 시세 폴 (startOverseasQuotePoll 반환 핸들) */
  let quotePoll = /** @type {{ stop: () => void; refresh: (c: readonly string[]) => void } | null} */ (null);

  /** 현재 폴 중인 overseas_future 코드 목록 (변경 감지용) */
  let quotePollCodes = /** @type {string[]} */ ([]);

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

  const markFocusRequested = () => {
    focusRequestedAt = Date.now();
    lastFocusedRealtimeAt = 0;
    focusWatchdogAttempts = 0;
  };

  /**
   * @param {keyof typeof MODES} mode
   * @param {string} sym
   */
  const noteFocusedRealtime = (mode, sym) => {
    if (focus.mode !== mode || focus.sym !== sym) return;
    lastFocusedRealtimeAt = Date.now();
    focusWatchdogAttempts = 0;
  };

  /**
   * @param {string} reason
   */
  const triggerWatchdogReconnect = (reason) => {
    if (!socket || socket.readyState !== 1) return;
    const now = Date.now();
    if (now - lastWatchdogReconnectAt < 4000) return;
    lastWatchdogReconnectAt = now;
    console.warn('[kis] watchdog reconnect:', reason);
    hub.broadcast({ type: 'status', source: 'kis', state: 'reconnecting', message: reason });
    try {
      socket.terminate?.();
    } catch {
      try {
        socket.close();
      } catch {
        /* ignore */
      }
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
      registered.delete(k); // 즉시 제거해서 중복 unsubscribe 방지
      const _k = k, _delay = delay;
      setTimeout(() => applyPairForKey(approvalKey, _k, '2'), _delay);
      delay += stagger;
    }

    for (const k of toAdd) {
      registered.add(k); // 즉시 추가해서 중복 subscribe 방지
      const _k = k, _delay = delay;
      setTimeout(() => applyPairForKey(approvalKey, _k, '1'), _delay);
      delay += stagger;
    }

    if (toDrop.length || toAdd.length) {
      console.log('[kis] reconcile', { drop: toDrop.length, add: toAdd.length });
    }
  };

  /**
   * 해외선물 종목 집합이 바뀌면 quote poll을 시작하거나 갱신
   * 처음 호출 시 startOverseasQuotePoll, 이후 변경 시 refresh
   */
  function refreshQuotePoll() {
    const focused = focus.mode === 'overseas_future' ? String(focus.sym ?? '').trim() : '';
    const codes = focused ? [focused, ...overseasQuoteWatch] : [...overseasQuoteWatch];
    const unique = [...new Set(codes.filter(Boolean))];
    quotePollCodes = unique;
    if (quotePoll) {
      quotePoll.refresh(unique);
    } else if (unique.length > 0) {
      quotePoll = startOverseasQuotePoll({ hub, seriesCodes: unique });
    }
  }

  /**
   * @param {readonly { provider: string; symbol: string }[]} feeds
   */
  function syncWatchlistFeeds(feeds) {
    watchSubs.stock.clear();
    watchSubs.index_futures.clear();
    watchSubs.overseas_future.clear();
    overseasQuoteWatch.clear();

    for (const f of feeds) {
      if (f.provider === 'kis-overseas') {
        // 해외선물은 KIS WS 구독 없이 Yahoo 폴 전용
        const sym = String(f.symbol ?? '').trim();
        if (sym) overseasQuoteWatch.add(sym);
        continue;
      }
      const mode = providerToMode(f.provider);
      if (!mode) continue;
      const sym = MODES[mode].normalize(f.symbol);
      if (sym) watchSubs[mode].add(sym);
    }
    bumpDesired();

    if (approvalKeyCached && socket?.readyState === 1) {
      reconcile(approvalKeyCached);
    }

    // DB에 없는 워치리스트 국내주식 심볼 백그라운드 프리시드
    if (watchSubs.stock.size > 0) {
      preSeedWatchlistBg(config, hub, Array.from(watchSubs.stock));
    }

    // 해외선물 시세 폴 갱신
    refreshQuotePoll();
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
    markFocusRequested();

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
      // 호가 REST 스냅샷 — 장 마감 후에도 마지막 호가 표시
      void (async () => {
        try {
          const snap = await fetchDomesticOrderbookSnapshot({
            restBase: config.restBase,
            appKey: config.appKey,
            secretKey: config.secretKey,
            symbol6: sym,
          });
          if (!snap) return;
          if (focus.mode !== 'stock' || focus.sym !== sym) return;
          console.log(`[kis] 호가 스냅샷 ${sym} asks=${snap.asks.length} bids=${snap.bids.length}`);
          hub.broadcast({
            type: 'orderbook',
            provider: 'kis',
            symbol: sym,
            asks: snap.asks,
            bids: snap.bids,
            ts: Date.now(),
          });
        } catch (e) {
          console.warn('[kis] ob snap error', e?.message || e);
        }
      })();
    }

    if (m === 'overseas_future') {
      void seedOverseasFuturesChart({
        hub,
        seriesCd: sym,
        stillSubscribed: (cd) => focus.mode === 'overseas_future' && focus.sym === cd,
      });
      // KIS 실시간 호가(HDFFF010)가 데이터를 안보낼 때를 위한 Yahoo 합성 호가 스냅샷
      void broadcastOverseasFuturesObSnapshot({
        hub,
        seriesCd: sym,
        stillOk: () => focus.mode === 'overseas_future' && focus.sym === sym,
      });
    }

    if (approvalKeyCached && socket?.readyState === 1) {
      reconcile(approvalKeyCached);
    } else {
      hub.broadcast({ type: 'status', source: 'kis', state: 'reconnecting' });
    }

    // 해외선물로 포커스 변경 시 폴 갱신
    refreshQuotePoll();

    console.log('[kis] focus ->', m, sym);
  }

  /**
   * 심볼별 현재 분봉 누적 상태 (버킷 완료 감지용)
   * @type {Map<string, { bucket: number, open: number, high: number, low: number, close: number, volume: number }>}
   */
  const liveBar = new Map();

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
    const tickSym = mode === 'stock' ? norm : sym;
    noteFocusedRealtime(mode, tickSym);
    hub.broadcast({
      type: 'tick',
      provider: prov,
      symbol: tickSym,
      price: tick.price,
      volume: tick.volume,
      hour: tick.hour,
      ts: tick.ts,
    });
    recordTick({
      provider: 'kis',
      symbol: tickSym,
      ts: tick.ts,
      price: tick.price,
      volume: tick.volume,
    });

    // ── 분봉 버킷 완료 감지 → SQLite 저장 (국내주식만)
    if (mode === 'stock') {
      const bucket = toMinBucketSec(tick.ts);
      const prev = liveBar.get(tickSym);
      if (prev && prev.bucket !== bucket) {
        // 이전 버킷 완료 → DB 저장
        saveBars(tickSym, '1m', [{
          time:   prev.bucket,
          open:   prev.open,
          high:   prev.high,
          low:    prev.low,
          close:  prev.close,
          volume: prev.volume,
        }]);
      }
      if (!prev || prev.bucket !== bucket) {
        // 새 버킷 시작
        liveBar.set(tickSym, {
          bucket,
          open:   tick.price,
          high:   tick.price,
          low:    tick.price,
          close:  tick.price,
          volume: tick.volume ?? 0,
        });
      } else {
        // 같은 버킷 업데이트
        prev.high   = Math.max(prev.high, tick.price);
        prev.low    = Math.min(prev.low,  tick.price);
        prev.close  = tick.price;
        prev.volume += tick.volume ?? 0;
      }
    }
  };

  /**
   * @param {string} trId
   * @param {Record<string, string>} row
   */
  let obFirstLog = false;
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
    const key = subKey(mode, mode === 'stock' ? norm : sym);
    if (!eff.has(key)) return;

    // 첫 호가 수신 시 로그
    if (!obFirstLog) {
      obFirstLog = true;
      console.log(`[kis] 첫 호가 수신 trId=${trId} sym=${norm} asks=${ob.asks.length} bids=${ob.bids.length}`);
    }

    const prov = providerForMode(mode);
    noteFocusedRealtime(mode, mode === 'stock' ? norm : sym);
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
      markFocusRequested();
      hub.broadcast({ type: 'status', source: 'kis', state: 'connected' });
      hub.broadcast({ type: 'symbol', provider: providerForMode(focus.mode), symbol: focus.sym });
      reconcile(approvalKey);
    });

    let msgCount = 0;
    let obCount = 0;
    let tickCount = 0;
    const statsTimer = setInterval(() => {
      if (msgCount > 0) {
        console.log(`[kis] 수신 stats: total=${msgCount} tick=${tickCount} ob=${obCount}`);
        msgCount = 0; obCount = 0; tickCount = 0;
      }
    }, 5000);
    const watchdogTimer = setInterval(() => {
      if (!socket || socket.readyState !== 1) return;
      if (focus.mode === 'overseas_future') return;
      const now = Date.now();
      if (lastFocusedRealtimeAt <= 0) {
        if (now - focusRequestedAt > FOCUS_BOOT_TIMEOUT_MS && focusWatchdogAttempts < 1) {
          focusWatchdogAttempts += 1;
          triggerWatchdogReconnect(`no initial realtime for ${focus.mode}:${focus.sym}`);
        }
        return;
      }
      if (now - lastFocusedRealtimeAt > FOCUS_STALL_TIMEOUT_MS && focusWatchdogAttempts < 1) {
        focusWatchdogAttempts += 1;
        focusRequestedAt = now;
        lastFocusedRealtimeAt = 0;
        triggerWatchdogReconnect(`realtime stalled for ${focus.mode}:${focus.sym}`);
      }
    }, WATCHDOG_INTERVAL_MS);

    socket.on('message', (data, isBinary) => {
      if (isBinary) return;
      const raw = data.toString();
      msgCount++;

      if (raw.startsWith('{')) {
        try {
          const j = JSON.parse(raw);
          const trId = j?.header?.tr_id;
          if (trId === 'PINGPONG') {
            socket?.send(raw);
            return;
          }
          // 구독 응답 로그 (tr_id가 있는 경우)
          if (trId && trId !== 'PINGPONG') {
            const rc = j?.body?.rt_cd ?? j?.body?.msg_cd ?? '';
            console.log(`[kis] WS응답 tr_id=${trId} rc=${rc} msg=${j?.body?.msg1 ?? ''}`);
          }
        } catch {
          /* ignore */
        }
        return;
      }

      const parsed = parseRealtimeFrame(raw);
      if (!parsed) return;

      if (modeForCntTr(parsed.trId)) {
        tickCount++;
        dispatchTick(parsed.trId, parsed.row);
        return;
      }
      if (modeForObTr(parsed.trId)) {
        obCount++;
        dispatchOrderbook(parsed.trId, parsed.row);
      }
    });

    socket.on('error', (err) => {
      console.error('[kis] socket error', err.message || err);
    });

    socket.on('close', (code, reason) => {
      clearInterval(statsTimer);
      clearInterval(watchdogTimer);
      const why = reason && Buffer.isBuffer(reason) ? reason.toString('utf8') : String(reason ?? '');
      console.warn('[kis] ws closed', code, why || '(no reason)');
      socket = null;
      approvalKeyCached = null;
      registered.clear();
      if (stopped) return;
      hub.broadcast({ type: 'status', source: 'kis', state: 'disconnected' });
      scheduleReconnect(5000);
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
