import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  type CandlestickData,
  type SeriesMarker,
  type UTCTimestamp,
} from 'lightweight-charts';
import type { AdminSession } from './admin/types';
import {
  chartFetchUserMe,
  chartListPaperTrades,
  chartPaperOrder,
  chartSubmitChargeRequest,
  type HtsPaperTradeRow,
} from './chartTradingApi';
import { getMarketApiBase } from './config/marketApiEnv';
import { OrderBookPanel, type BookLevel } from './OrderBookPanel';
import {
  DEFAULT_BROKER_SYNC_FEEDS,
  FUTURES_WATCHLIST,
  type BrokerSyncFeed,
  type WatchInstrument,
  watchInstrumentIdsForBrokerTick,
} from './watchlistData';
import { WatchlistPanel } from './WatchlistPanel';
import './htsWorkspace.css';
import './StreamingChart.css';

/** TradingView 상용 Charting Library(위젯)는 별도 계약이 필요합니다. 동일 제작사의 오픈소스 lightweight-charts로 동일 계열 캔들 차트를 그립니다. */

/** future-chart-broker WebSocket. VITE_BROKER_WS_URL: explicit URL, or "auto"/empty → same host as the page + :8787 (wss if https). */
function getBrokerWebSocketUrl(): string {
  const raw = import.meta.env.VITE_BROKER_WS_URL;
  const trimmed = raw != null ? String(raw).trim() : '';
  if (trimmed !== '' && trimmed !== 'auto') return trimmed;

  if (typeof window === 'undefined') return 'ws://127.0.0.1:8787';

  const { protocol, hostname } = window.location;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'ws://127.0.0.1:8787';
  }
  const wsProto = protocol === 'https:' ? 'wss:' : 'ws:';
  return `${wsProto}//${hostname}:8787`;
}

type KisFeedProvider = 'kis' | 'kis-index' | 'kis-overseas';

type TickPayload = {
  type: 'tick';
  provider?: KisFeedProvider;
  symbol: string;
  price: number;
  volume: number;
  hour: string | null;
  ts: number;
};

type OrderbookPayload = {
  type: 'orderbook';
  provider?: 'kis' | 'kis-index' | 'kis-overseas';
  symbol: string;
  asks: BookLevel[];
  bids: BookLevel[];
  ts: number;
  /** Yahoo Finance 현재가 기반 합성 호가 (실시간 아님) */
  synthetic?: boolean;
};

type StatusPayload = {
  type: 'status';
  source: string;
  state: string;
  message?: string;
};

type SymbolPayload = {
  type: 'symbol';
  provider?: KisFeedProvider;
  symbol: string;
};

type HistoryPayload = {
  type: 'history';
  provider?: KisFeedProvider;
  symbol: string;
  bars: Array<{ time: number; open: number; high: number; low: number; close: number }>;
};

type TapeSide = 'buy' | 'sell';

type TapeTrade = {
  id: string;
  price: number;
  volume: number;
  ts: number;
  side: TapeSide;
};

type MobileTab = 'positions' | 'orders' | 'watchlist';

/** lightweight-charts 캔들 간격(분봉·시간·일·주) */
type ChartTf = '1' | '5' | '15' | '30' | '60' | '240' | 'D' | 'W';

const CHART_TF_OPTIONS: { id: ChartTf; label: string }[] = [
  { id: '1', label: '1분' },
  { id: '5', label: '5분' },
  { id: '15', label: '15분' },
  { id: '30', label: '30분' },
  { id: '60', label: '1시간' },
  { id: '240', label: '4시간' },
  { id: 'D', label: '1일' },
  { id: 'W', label: '1주' },
];

const TF_MINUTES: Record<ChartTf, number | null> = {
  '1': 1,
  '5': 5,
  '15': 15,
  '30': 30,
  '60': 60,
  '240': 240,
  D: null,
  W: null,
};

const TAPE_LIMIT = 12;

function bucketUtcSecForTf(ms: number, tf: ChartTf): number {
  const sec = Math.floor(ms / 1000);
  const mult = TF_MINUTES[tf];
  if (mult != null) {
    return Math.floor(sec / 60 / mult) * 60 * mult;
  }
  if (tf === 'D') {
    const d = new Date(ms);
    return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 1000);
  }
  const d = new Date(ms);
  const day = d.getUTCDay();
  const diff = (day + 6) % 7;
  const startMs = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - diff * 86400000;
  return Math.floor(startMs / 1000);
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function markerTimeForTrade(executedAtMs: number, tf: ChartTf, provider: KisFeedProvider): UTCTimestamp {
  const isOverseas = provider === 'kis-overseas';
  const ms = isOverseas ? executedAtMs : executedAtMs + KST_OFFSET_MS;
  return bucketUtcSecForTf(ms, tf) as UTCTimestamp;
}

function readHtmlTheme(): 'light' | 'dark' {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

function chartLayoutTheme(isDark: boolean) {
  return {
    background: {
      type: ColorType.Solid,
      color: isDark ? '#0f1115' : '#ffffff',
    } as const,
    textColor: isDark ? '#9aa3b5' : '#64748b',
    grid: {
      vertLines: { color: isDark ? '#252830' : '#e5e7eb' },
      horzLines: { color: isDark ? '#252830' : '#e5e7eb' },
    },
  };
}

function normalizeSymbol(raw: string): string | null {
  const d = raw.replace(/\D/g, '');
  if (!d) return null;
  if (d.length > 6) return d.slice(0, 6);
  return d.padStart(6, '0');
}

/** WS 메시지 심볼과 현재 구독 심볼 매칭(KIS는 6자리 정규화, 선물·해외는 trim 일치) */
function messageMatchesFeed(
  msgProvider: string,
  msgSymbol: string,
  curProvider: KisFeedProvider,
  curSymbol: string,
): boolean {
  if (msgProvider !== curProvider) return false;
  if (curProvider === 'kis') {
    const a = normalizeSymbol(msgSymbol);
    const b = normalizeSymbol(curSymbol);
    return a != null && b != null && a === b;
  }
  return msgSymbol.trim() === curSymbol.trim();
}

function statusDotClass(ws: string, kis: string | null): string {
  if (ws === 'error') return 'htsStatusDot--err';
  if (ws === 'closed') return 'htsStatusDot--warn';
  if (ws === 'open' && kis === 'connected') return 'htsStatusDot--ok';
  if (ws === 'open') return 'htsStatusDot--warn';
  return '';
}

function formatLivePrice(n: number, decimals: number) {
  const d = Number.isFinite(decimals) ? Math.min(8, Math.max(0, Math.floor(decimals))) : 2;
  return n.toLocaleString('ko-KR', {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
}

function formatTapeVolume(n: number) {
  if (!Number.isFinite(n) || n <= 0) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString('ko-KR');
}

function formatOrderInputPrice(n: number, decimals: number) {
  const d = Number.isFinite(decimals) ? Math.min(8, Math.max(0, Math.floor(decimals))) : 2;
  return d <= 0 ? String(Math.round(n)) : n.toFixed(d).replace(/\.?0+$/, '');
}

function inferTapeSide(
  price: number,
  lastPrice: number | null,
  asks: readonly BookLevel[],
  bids: readonly BookLevel[],
  fallback: TapeSide,
): TapeSide {
  const bestAsk = asks.length > 0 ? Math.min(...asks.map((level) => level.price)) : null;
  const bestBid = bids.length > 0 ? Math.max(...bids.map((level) => level.price)) : null;
  const spread = bestAsk != null && bestBid != null ? Math.abs(bestAsk - bestBid) : 0;
  const epsilon = Math.max(spread * 0.18, 1e-9);

  if (bestAsk != null && price >= bestAsk - epsilon) return 'buy';
  if (bestBid != null && price <= bestBid + epsilon) return 'sell';

  if (lastPrice != null) {
    if (price > lastPrice) return 'buy';
    if (price < lastPrice) return 'sell';
  }

  if (bestAsk != null && bestBid != null) {
    return price >= (bestAsk + bestBid) / 2 ? 'buy' : 'sell';
  }

  return fallback;
}

function appendTapeTrade(prev: TapeTrade[], next: TapeTrade) {
  const head = prev[0];
  if (head && head.price === next.price && Math.abs(head.ts - next.ts) < 900) {
    return [{ ...head, id: next.id, ts: next.ts, volume: head.volume + next.volume }, ...prev.slice(1, TAPE_LIMIT)];
  }
  return [next, ...prev].slice(0, TAPE_LIMIT);
}

function summarizePaperPosition(trades: readonly HtsPaperTradeRow[], markPrice: number | null) {
  let netQty = 0;
  let avgPrice = 0;

  for (const trade of [...trades].sort((a, b) => a.executed_at_ms - b.executed_at_ms)) {
    const qty = Math.max(0, Number(trade.qty) || 0);
    const price = Number(trade.price) || 0;
    if (qty <= 0 || price <= 0) continue;

    if (trade.side === 'buy') {
      if (netQty >= 0) {
        avgPrice = netQty === 0 ? price : (avgPrice * netQty + price * qty) / (netQty + qty);
        netQty += qty;
      } else {
        const coverQty = Math.min(qty, -netQty);
        netQty += coverQty;
        const remainQty = qty - coverQty;
        if (netQty === 0) avgPrice = 0;
        if (remainQty > 0) {
          avgPrice = price;
          netQty = remainQty;
        }
      }
      continue;
    }

    if (netQty <= 0) {
      const absQty = Math.abs(netQty);
      avgPrice = absQty === 0 ? price : (avgPrice * absQty + price * qty) / (absQty + qty);
      netQty -= qty;
    } else {
      const closeQty = Math.min(qty, netQty);
      netQty -= closeQty;
      const remainQty = qty - closeQty;
      if (netQty === 0) avgPrice = 0;
      if (remainQty > 0) {
        avgPrice = price;
        netQty = -remainQty;
      }
    }
  }

  const side = netQty > 0 ? 'long' : netQty < 0 ? 'short' : 'flat';
  const absQty = Math.abs(netQty);
  const avg = absQty > 0 ? avgPrice : null;
  const markValue = markPrice != null ? absQty * markPrice : null;
  const unrealized =
    avg != null && markPrice != null
      ? side === 'long'
        ? (markPrice - avg) * absQty
        : side === 'short'
          ? (avg - markPrice) * absQty
          : 0
      : null;

  return { side, netQty, avgPrice: avg, markValue, unrealized };
}

export function StreamingChart({ session = null }: { session?: AdminSession | null } = {}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null);
  const seriesRef = useRef<ReturnType<
    ReturnType<typeof createChart>['addSeries']
  > | null>(null);
  const markersPluginRef = useRef<{ setMarkers: (m: SeriesMarker<UTCTimestamp>[]) => void; detach: () => void } | null>(
    null,
  );
  const bucketRef = useRef<number | null>(null);
  const barRef = useRef<CandlestickData<UTCTimestamp> | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const feedRef = useRef<{ provider: KisFeedProvider; symbol: string }>({
    provider: 'kis-overseas',
    symbol: 'CNQM26',
  });
  const lastBookRef = useRef<Record<string, { asks: BookLevel[]; bids: BookLevel[] }>>({});
  /** 마지막 실시간 호가 수신 시각(ms) — 호가 TR은 체결보다 드물어 스냅샷만 보이는 현상 방지 */
  const lastObReceivedAtRef = useRef<number>(0);
  const liveBookRef = useRef<{ asks: BookLevel[]; bids: BookLevel[] }>({ asks: [], bids: [] });
  const tapeRef = useRef<{ lastPrice: number | null; lastSide: TapeSide }>({ lastPrice: null, lastSide: 'buy' });

  const [feedProvider, setFeedProvider] = useState<KisFeedProvider>('kis-overseas');
  const [feedSymbol, setFeedSymbol] = useState('CNQM26');
  const [symbolInput, setSymbolInput] = useState('CNQM26');
  const [wsState, setWsState] = useState<'idle' | 'open' | 'closed' | 'error'>('idle');
  const [lastTick, setLastTick] = useState<string | null>(null);
  const [kisState, setKisState] = useState<string | null>(null);
  const [bookAsks, setBookAsks] = useState<BookLevel[]>([]);
  const [bookBids, setBookBids] = useState<BookLevel[]>([]);
  /** 현재 호가창이 합성(Yahoo) 데이터인지 ref로 추적 (클로저 stale 방지) */
  const obIsSyntheticRef = useRef(false);
  const [lastTradePx, setLastTradePx] = useState<number | null>(null);
  const [obRev, setObRev] = useState(0);
  const [tickRev, setTickRev] = useState(0);
  const [obIsSynthetic, setObIsSynthetic] = useState(false);
  const [buyTape, setBuyTape] = useState<TapeTrade[]>([]);
  const [sellTape, setSellTape] = useState<TapeTrade[]>([]);
  /** 마켓워치 행별 브로커 틱 (거래소식 멀티 구독 → 틱 매핑) */
  const [liveById, setLiveById] = useState<Record<string, { lastPrice: number; volume: number; changePct: number }>>(
    {},
  );
  const [now, setNow] = useState(() => new Date());
  /** 나스닥을 기본 선택, 없으면 첫 번째 항목 */
  const [selectedWatchId, setSelectedWatchId] = useState(
    FUTURES_WATCHLIST.find((w) => w.kisOverseasSeriesCode)?.id ??
    FUTURES_WATCHLIST.find((w) => w.krxSubscribeCode)?.id ??
    FUTURES_WATCHLIST[0]?.id ?? '',
  );
  const [chartUiTheme, setChartUiTheme] = useState<'light' | 'dark'>(readHtmlTheme);
  const [timeframe, setTimeframe] = useState<ChartTf>('1');
  const tfRef = useRef<ChartTf>('1');
  tfRef.current = timeframe;

  const tradingApiEnabled = Boolean(session?.accessToken && getMarketApiBase());
  const [cashBalance, setCashBalance] = useState<number | null>(null);
  const [paperTrades, setPaperTrades] = useState<HtsPaperTradeRow[]>([]);
  const [tradeMsg, setTradeMsg] = useState<string | null>(null);
  const [tradeBusy, setTradeBusy] = useState(false);
  const [orderKind, setOrderKind] = useState<'limit' | 'market'>('market');
  const [orderPriceStr, setOrderPriceStr] = useState('');
  const [orderQtyStr, setOrderQtyStr] = useState('1');
  const [chargeOpen, setChargeOpen] = useState(false);
  const [chargeAmountStr, setChargeAmountStr] = useState('');
  const [chargeMemo, setChargeMemo] = useState('');
  const [chargeErr, setChargeErr] = useState<string | null>(null);
  const [chargeBusy, setChargeBusy] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>('positions');
  const [mobileLeverage, setMobileLeverage] = useState(5);
  const [mobileSizePct, setMobileSizePct] = useState(50);
  const [isMobileViewport, setIsMobileViewport] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 960px)').matches,
  );

  const wsUrl = getBrokerWebSocketUrl();

  feedRef.current = { provider: feedProvider, symbol: feedSymbol };

  useEffect(() => {
    const el = document.documentElement;
    const sync = () => setChartUiTheme(readHtmlTheme());
    const mo = new MutationObserver(sync);
    mo.observe(el, { attributes: true, attributeFilter: ['data-theme'] });
    sync();
    return () => mo.disconnect();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 960px)');
    const sync = () => setIsMobileViewport(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const selectedWatchInstrument = useMemo(
    () => FUTURES_WATCHLIST.find((w) => w.id === selectedWatchId) ?? null,
    [selectedWatchId],
  );

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  /** 봉 간격 변경 등 완전 초기화 — 차트 데이터까지 비움 */
  const hardReset = useCallback(() => {
    bucketRef.current = null;
    barRef.current = null;
    seriesRef.current?.setData([]);
    markersPluginRef.current?.setMarkers([]);
    lastObReceivedAtRef.current = 0;
    setBookAsks([]);
    setBookBids([]);
    setLastTradePx(null);
    setBuyTape([]);
    setSellTape([]);
    liveBookRef.current = { asks: [], bids: [] };
    tapeRef.current = { lastPrice: null, lastSide: 'buy' };
  }, []);

  /** 심볼 변경 시 — 호가·틱만 초기화, 차트 봉은 유지(새 history 도착 전 공백 방지) */
  const softReset = useCallback(() => {
    bucketRef.current = null;
    barRef.current = null;
    lastObReceivedAtRef.current = 0;
    setBookAsks([]);
    setBookBids([]);
    setLastTradePx(null);
    setObIsSynthetic(false);
    obIsSyntheticRef.current = false;
    setBuyTape([]);
    setSellTape([]);
    liveBookRef.current = { asks: [], bids: [] };
    tapeRef.current = { lastPrice: null, lastSide: 'buy' };
  }, []);

  const applyHistory = useCallback((bars: HistoryPayload['bars']) => {
    const series = seriesRef.current;
    if (!series) return;
    // 1) 분 버킷으로 내림 후 dedup (같은 분에 여러 봉 방지)
    const bucketMap = new Map<number, CandlestickData<UTCTimestamp>>();
    for (const b of bars) {
      if (
        !Number.isFinite(b.time) ||
        !Number.isFinite(b.open) ||
        !Number.isFinite(b.high) ||
        !Number.isFinite(b.low) ||
        !Number.isFinite(b.close)
      ) continue;
      const t = (Math.floor(b.time / 60) * 60) as UTCTimestamp;
      const ex = bucketMap.get(t);
      if (ex) {
        bucketMap.set(t, {
          time: t,
          open: ex.open,
          high: Math.max(ex.high, b.high),
          low: Math.min(ex.low, b.low),
          close: b.close,
        });
      } else {
        bucketMap.set(t, { time: t, open: b.open, high: b.high, low: b.low, close: b.close });
      }
    }
    const out = Array.from(bucketMap.values()).sort((a, b) => (a.time as number) - (b.time as number));
    series.setData(out);
    // 마지막 봉을 ref에 저장 → 같은 분에 오는 첫 틱이 새 봉 대신 이어서 업데이트됨
    bucketRef.current = out.length > 0 ? (out[out.length - 1].time as number) : null;
    barRef.current = out.length > 0 ? out[out.length - 1] : null;
  }, []);

  const refreshBalance = useCallback(async () => {
    if (!session?.accessToken || !getMarketApiBase()) return;
    try {
      const me = await chartFetchUserMe(session);
      setCashBalance(me.cashBalance);
    } catch {
      setCashBalance(null);
    }
  }, [session]);

  const refreshTrades = useCallback(async () => {
    if (!session?.accessToken || !getMarketApiBase()) return;
    try {
      const rows = await chartListPaperTrades(session, feedProvider, feedSymbol);
      setPaperTrades(rows);
    } catch {
      setPaperTrades([]);
    }
  }, [session, feedProvider, feedSymbol]);

  useEffect(() => {
    if (!tradingApiEnabled) {
      setCashBalance(null);
      return;
    }
    void refreshBalance();
    const id = window.setInterval(() => void refreshBalance(), 45000);
    return () => window.clearInterval(id);
  }, [tradingApiEnabled, refreshBalance]);

  useEffect(() => {
    if (!tradingApiEnabled) {
      setPaperTrades([]);
      return;
    }
    void refreshTrades();
  }, [tradingApiEnabled, refreshTrades]);

  useEffect(() => {
    const api = markersPluginRef.current;
    if (!api) return;
    const markers: SeriesMarker<UTCTimestamp>[] = [];
    for (const t of paperTrades) {
      if (t.provider !== feedProvider || t.symbol !== feedSymbol) continue;
      const time = markerTimeForTrade(t.executed_at_ms, timeframe, feedProvider);
      const isBuy = t.side === 'buy';
      markers.push({
        time,
        position: isBuy ? 'belowBar' : 'aboveBar',
        shape: isBuy ? 'arrowUp' : 'arrowDown',
        color: isBuy ? '#3fb68b' : '#ef5350',
        text: `${isBuy ? 'B' : 'S'}${t.qty}`,
      });
    }
    markers.sort((a, b) => (a.time as number) - (b.time as number));
    api.setMarkers(markers);
  }, [paperTrades, timeframe, feedProvider, feedSymbol]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    const isDark = readHtmlTheme() === 'dark';
    const th = chartLayoutTheme(isDark);

    const chart = createChart(el, {
      layout: {
        background: th.background,
        textColor: th.textColor,
      },
      grid: th.grid,
      width: el.clientWidth,
      height: el.clientHeight,
      timeScale: { timeVisible: true, secondsVisible: false },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#3fb68b',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#3fb68b',
      wickDownColor: '#ef5350',
    });

    chartRef.current = chart;
    seriesRef.current = series;
    markersPluginRef.current = createSeriesMarkers(series, []) as {
      setMarkers: (m: SeriesMarker<UTCTimestamp>[]) => void;
      detach: () => void;
    };

    const ro = new ResizeObserver(() => {
      if (!wrapRef.current) return;
      chart.applyOptions({
        width: wrapRef.current.clientWidth,
        height: wrapRef.current.clientHeight,
      });
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      markersPluginRef.current?.detach();
      markersPluginRef.current = null;
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      bucketRef.current = null;
      barRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const isDark = chartUiTheme === 'dark';
    const th = chartLayoutTheme(isDark);
    chart.applyOptions({
      layout: { background: th.background, textColor: th.textColor },
      grid: th.grid,
    });
  }, [chartUiTheme]);

  useEffect(() => {
    hardReset();
  }, [timeframe, hardReset]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    let stopped = false;
    let retry = 0;
    let timer: number | null = null;
    let ws: WebSocket | null = null;

    const onTick = (t: TickPayload) => {
      // 해외선물(kis-overseas)은 Yahoo Finance 타임스탬프와 동일하게 진짜 UTC 사용
      // 국내주식(kis)·지수선물(kis-index)은 KST fake-UTC 유지
      const isOverseas = feedRef.current.provider === 'kis-overseas';
      const bucket = bucketUtcSecForTf(isOverseas ? t.ts : t.ts + KST_OFFSET_MS, tfRef.current);
      const time = bucket as UTCTimestamp;
      const price = t.price;

      if (bucketRef.current !== bucket) {
        bucketRef.current = bucket;
        const bar: CandlestickData<UTCTimestamp> = {
          time,
          open: price,
          high: price,
          low: price,
          close: price,
        };
        barRef.current = bar;
        series.update(bar);
      } else {
        const prev = barRef.current;
        if (!prev) return;
        const bar: CandlestickData<UTCTimestamp> = {
          time,
          open: prev.open,
          high: Math.max(prev.high, price),
          low: Math.min(prev.low, price),
          close: price,
        };
        barRef.current = bar;
        series.update(bar);
      }

      setLastTick(`${t.symbol} ${price.toLocaleString('ko-KR')} · 체결`);
      setLastTradePx(price);
      setTickRev((r) => r + 1);

      const inferredSide = inferTapeSide(
        price,
        tapeRef.current.lastPrice,
        liveBookRef.current.asks,
        liveBookRef.current.bids,
        tapeRef.current.lastSide,
      );
      tapeRef.current = { lastPrice: price, lastSide: inferredSide };
      const tapeTrade: TapeTrade = {
        id: `${t.ts}-${Math.random().toString(36).slice(2, 8)}`,
        price,
        volume: Number.isFinite(t.volume) ? t.volume : 0,
        ts: t.ts,
        side: inferredSide,
      };
      if (inferredSide === 'buy') {
        setBuyTape((prev) => appendTapeTrade(prev, tapeTrade));
      } else {
        setSellTape((prev) => appendTapeTrade(prev, tapeTrade));
      }
    };

    const schedule = (ms: number) => {
      if (timer != null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        connect();
      }, ms);
    };

    const connect = () => {
      if (stopped) return;
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

      try {
        ws = new WebSocket(wsUrl);
      } catch (e) {
        setWsState('error');
        setLastTick(String(e));
        schedule(2000);
        return;
      }

      wsRef.current = ws;

      ws.onopen = () => {
        retry = 0;
        setWsState('open');
        ws?.send(JSON.stringify({ op: 'sync_watchlist', feeds: DEFAULT_BROKER_SYNC_FEEDS }));
        const cur = feedRef.current;
        ws?.send(JSON.stringify({ op: 'subscribe', provider: cur.provider, symbol: cur.symbol }));
      };

      ws.onclose = () => {
        wsRef.current = null;
        setWsState('closed');
        if (stopped) return;
        retry = Math.min(8, retry + 1);
        schedule(300 * 2 ** retry);
      };

      ws.onerror = () => {
        setWsState('error');
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data as string) as
            | TickPayload
            | OrderbookPayload
            | StatusPayload
            | SymbolPayload
            | HistoryPayload
            | { type: string };

          const cur = feedRef.current;
          const msgProvider =
            'provider' in msg && (msg as any).provider ? String((msg as any).provider) : 'kis';
          const msgSymbol = 'symbol' in msg ? String((msg as any).symbol) : '';
          const isForCurrent =
            !!msgSymbol && messageMatchesFeed(msgProvider, msgSymbol, cur.provider, cur.symbol);

          if (msg.type === 'tick' && 'price' in msg && msgSymbol) {
            const t = msg as TickPayload;
            const p = (t.provider ?? 'kis') as BrokerSyncFeed['provider'];
            if (p === 'kis' || p === 'kis-index' || p === 'kis-overseas') {
              const ids = watchInstrumentIdsForBrokerTick(FUTURES_WATCHLIST, p, t.symbol);
              if (ids.length > 0) {
                setLiveById((prev) => {
                  const next = { ...prev };
                  for (const id of ids) {
                    const row = FUTURES_WATCHLIST.find((w) => w.id === id);
                    const ref = row?.lastPrice ?? t.price;
                    const changePct = ref !== 0 && Number.isFinite(ref) ? ((t.price - ref) / ref) * 100 : 0;
                    next[id] = { lastPrice: t.price, volume: t.volume, changePct };
                  }
                  return next;
                });
              }
            }
          }

          // Yahoo Finance 30초 주기 시세 배치 (해외선물 마켓워치 업데이트)
          if (msg.type === 'quote_batch' && 'quotes' in msg) {
            const quotes = (msg as any).quotes as Array<{
              provider: string;
              symbol: string;
              price: number;
              changePct: number;
              volume: number;
            }>;
            setLiveById((prev) => {
              const next = { ...prev };
              for (const q of quotes) {
                const p = q.provider as BrokerSyncFeed['provider'];
                const ids = watchInstrumentIdsForBrokerTick(FUTURES_WATCHLIST, p, q.symbol);
                for (const id of ids) {
                  next[id] = { lastPrice: q.price, volume: q.volume, changePct: q.changePct };
                }
              }
              return next;
            });
            // 현재 포커스 심볼의 최신가 → 호가 현재가 표시 갱신
            const cur = feedRef.current;
            for (const q of quotes) {
              if (q.provider === cur.provider && q.symbol === cur.symbol && Number.isFinite(q.price)) {
                setLastTradePx(q.price);
                break;
              }
            }
          }

          if (msg.type === 'history' && 'bars' in msg && isForCurrent) {
            applyHistory((msg as HistoryPayload).bars);
          }
          if (msg.type === 'tick' && 'price' in msg && isForCurrent) {
            onTick(msg as TickPayload);
          }
          if (msg.type === 'orderbook' && 'asks' in msg && isForCurrent) {
            const ob = msg as OrderbookPayload;
            const isSynth = ob.synthetic === true;
            // 합성 호가는 현재 실시간 호가가 없을 때만 폴백으로 사용
            // 실시간 호가가 도착하면 합성 호가를 덮어씀
            const hasLiveBook = !obIsSyntheticRef.current && (bookAsks.length > 0 || bookBids.length > 0);
            if (isSynth && hasLiveBook) return; // 실시간 있으면 합성으로 덮어쓰지 않음

            lastObReceivedAtRef.current = isSynth ? 0 : Date.now();
            setBookAsks(ob.asks);
            setBookBids(ob.bids);
            liveBookRef.current = { asks: ob.asks, bids: ob.bids };
            obIsSyntheticRef.current = isSynth;
            setObIsSynthetic(isSynth);
            setObRev((r) => r + 1);
            if (!isSynth) {
              lastBookRef.current[`${cur.provider}:${cur.symbol}`] = { asks: ob.asks, bids: ob.bids };
            }
          }
          if (msg.type === 'status' && 'state' in msg) {
            setKisState((msg as StatusPayload).state);
          }
          if (msg.type === 'symbol' && 'symbol' in msg) {
            const s = (msg as SymbolPayload).symbol;
            const p = (msg as SymbolPayload).provider ?? 'kis';
            if (p === 'kis' || p === 'kis-index' || p === 'kis-overseas') {
              setFeedProvider(p);
              setFeedSymbol(s);
              if (p === 'kis') setSymbolInput(s);
            }
          }
        } catch {
          /* ignore */
        }
      };
    };

    connect();

    return () => {
      stopped = true;
      if (timer != null) window.clearTimeout(timer);
      wsRef.current = null;
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
    };
  }, [wsUrl]);

  useEffect(() => {
    const w = wsRef.current;
    if (w?.readyState === 1) {
      w.send(JSON.stringify({ op: 'subscribe', provider: feedProvider, symbol: feedSymbol }));
    }
    // 심볼 변경 시 호가·틱만 초기화, 차트 봉은 new history 도착 전까지 유지
    softReset();
  }, [feedProvider, feedSymbol, softReset]);

  const applySymbol = () => {
    const n = normalizeSymbol(symbolInput);
    if (!n) return;
    setFeedProvider('kis');
    setFeedSymbol(n);
    // applySymbol은 명시적 입력이므로 차트도 초기화
    hardReset();
  };

  const handleWatchSelect = useCallback((item: WatchInstrument) => {
    setSelectedWatchId(item.id);
    const k = item.krxSubscribeCode?.trim();
    if (k) {
      const n = normalizeSymbol(k);
      if (n) {
        setSymbolInput(k);
        setFeedProvider('kis');
        setFeedSymbol(n);
      }
      return;
    }
    const kisIndex = (item as any).kisIndexFuturesCode?.trim?.() as string | undefined;
    if (kisIndex) {
      setFeedProvider('kis-index');
      setFeedSymbol(kisIndex);
      return;
    }
    const kisOverseas = (item as any).kisOverseasSeriesCode?.trim?.() as string | undefined;
    if (kisOverseas) {
      setFeedProvider('kis-overseas');
      setFeedSymbol(kisOverseas);
      return;
    }
  }, []);

  const timeStr = now.toLocaleTimeString('ko-KR', { hour12: false });
  const dotClass = statusDotClass(wsState, kisState);

  const obSymbol = selectedWatchInstrument?.code ?? feedSymbol;
  const cached = lastBookRef.current[`${feedProvider}:${feedSymbol}`];
  const liveRow = selectedWatchId ? liveById[selectedWatchId] : undefined;

  // 실제 KIS 호가만 표시 — 합성(fake) 호가 없음
  const hasKisBook = bookAsks.length > 0 || bookBids.length > 0;
  const OB_STALE_MS = 5000;
  // now(1초 갱신 state)로 매 초 stale 재판정
  const obRecentlyUpdated =
    lastObReceivedAtRef.current > 0 && now.getTime() - lastObReceivedAtRef.current < OB_STALE_MS;
  const obIsStale = hasKisBook && !obRecentlyUpdated;

  const obAsks = hasKisBook ? bookAsks : (cached?.asks ?? []);
  const obBids = hasKisBook ? bookBids : (cached?.bids ?? []);

  const obLastPx = lastTradePx ?? liveRow?.lastPrice ?? null;

  const obPriceDecimals = selectedWatchInstrument?.priceDecimals ?? (feedProvider === 'kis' ? 0 : 5);
  const sellTapeRows = sellTape.slice(0, TAPE_LIMIT);
  const buyTapeRows = buyTape.slice(0, TAPE_LIMIT);
  const watchStripItems = useMemo(
    () =>
      FUTURES_WATCHLIST.map((item) => {
        const live = liveById[item.id];
        const price = live?.lastPrice ?? item.lastPrice;
        const changePct = live?.changePct ?? item.changePct;
        return { item, price, changePct };
      }),
    [liveById],
  );

  const netPaperQty = useMemo(() => {
    let n = 0;
    for (const t of paperTrades) {
      if (t.provider !== feedProvider || t.symbol !== feedSymbol) continue;
      n += t.side === 'buy' ? t.qty : -t.qty;
    }
    return n;
  }, [paperTrades, feedProvider, feedSymbol]);

  const recentPaperTrades = useMemo(
    () => [...paperTrades].sort((a, b) => b.executed_at_ms - a.executed_at_ms).slice(0, 10),
    [paperTrades],
  );

  const positionSnapshot = useMemo(
    () => summarizePaperPosition(paperTrades, obLastPx),
    [paperTrades, obLastPx],
  );

  const mobileMaxQty = useMemo(() => {
    if (!tradingApiEnabled || cashBalance == null || obLastPx == null || obLastPx <= 0) return null;
    const qty = Math.floor((cashBalance * mobileLeverage) / obLastPx);
    return Number.isFinite(qty) && qty > 0 ? qty : null;
  }, [tradingApiEnabled, cashBalance, obLastPx, mobileLeverage]);

  const applyMobileSizing = useCallback(
    (pct: number) => {
      setMobileSizePct(pct);
      if (mobileMaxQty == null) return;
      setOrderQtyStr(String(Math.max(1, Math.floor((mobileMaxQty * pct) / 100))));
    },
    [mobileMaxQty],
  );

  const applyMobileLeverage = useCallback(
    (nextLeverage: number) => {
      setMobileLeverage(nextLeverage);
      if (!tradingApiEnabled || cashBalance == null || obLastPx == null || obLastPx <= 0) return;
      const nextMaxQty = Math.floor((cashBalance * nextLeverage) / obLastPx);
      if (!Number.isFinite(nextMaxQty) || nextMaxQty <= 0) return;
      setOrderQtyStr(String(Math.max(1, Math.floor((nextMaxQty * mobileSizePct) / 100))));
    },
    [tradingApiEnabled, cashBalance, obLastPx, mobileSizePct],
  );

  const handleOrderbookPriceSelect = useCallback(
    (price: number) => {
      setOrderKind('limit');
      setOrderPriceStr(formatOrderInputPrice(price, obPriceDecimals));
    },
    [obPriceDecimals],
  );

  const fillPositionQty = useCallback(() => {
    if (positionSnapshot.side === 'flat') return;
    setOrderQtyStr(String(Math.abs(positionSnapshot.netQty)));
  }, [positionSnapshot]);

  const effectiveOrderPrice = useMemo(() => {
    if (orderKind === 'market') return obLastPx;
    const p = parseFloat(String(orderPriceStr).replace(/,/g, ''));
    return Number.isFinite(p) && p > 0 ? p : null;
  }, [orderKind, orderPriceStr, obLastPx]);

  const runPaperOrder = async (side: 'buy' | 'sell') => {
    if (!session?.accessToken || !getMarketApiBase()) {
      setTradeMsg('마켓 API URL과 로그인(JWT)이 필요합니다.');
      return;
    }
    const qty = parseInt(orderQtyStr.replace(/\D/g, ''), 10);
    const px = effectiveOrderPrice;
    if (px == null || !Number.isFinite(px) || px <= 0) {
      setTradeMsg(
        orderKind === 'market' ? '현재가를 알 수 없어 시장가 주문을 넣을 수 없습니다.' : '유효한 가격을 입력하세요.',
      );
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      setTradeMsg('수량을 입력하세요.');
      return;
    }
    setTradeBusy(true);
    setTradeMsg(null);
    try {
      const r = await chartPaperOrder(session, {
        side,
        provider: feedProvider,
        symbol: feedSymbol,
        price: px,
        qty,
      });
      setCashBalance(r.balance);
      setTradeMsg(
        side === 'buy'
          ? `모의 매수 체결 · 약 ${r.notional.toLocaleString('ko-KR')}원 차감`
          : `모의 매도 체결 · 약 ${r.notional.toLocaleString('ko-KR')}원 입금`,
      );
      await refreshTrades();
    } catch (e) {
      const ex = e as Error & { code?: string; notional?: number };
      if (ex.code === 'insufficient_cash') {
        setTradeMsg('거래 자금이 부족합니다. 충전 신청을 해 주세요.');
        setChargeOpen(true);
        if (ex.notional != null) setChargeAmountStr(String(ex.notional));
      } else {
        setTradeMsg(ex.message || String(e));
      }
    } finally {
      setTradeBusy(false);
    }
  };

  const submitCharge = async () => {
    if (!session?.accessToken || !getMarketApiBase()) return;
    const n = parseInt(chargeAmountStr.replace(/\D/g, ''), 10);
    if (!Number.isFinite(n) || n <= 0) {
      setChargeErr('충전 금액을 입력하세요.');
      return;
    }
    setChargeBusy(true);
    setChargeErr(null);
    try {
      await chartSubmitChargeRequest(session, n, chargeMemo.trim());
      setChargeOpen(false);
      setChargeMemo('');
      setChargeAmountStr('');
      setTradeMsg('충전 신청이 접수되었습니다. 운영자(마스터) 승인 후 잔고에 반영됩니다.');
      await refreshBalance();
    } catch (e) {
      setChargeErr(e instanceof Error ? e.message : String(e));
    } finally {
      setChargeBusy(false);
    }
  };

  const chargeModal = chargeOpen ? (
    <div
      className="fcChargeModalRoot"
      role="dialog"
      aria-modal="true"
      aria-labelledby="fc-charge-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setChargeOpen(false);
      }}
    >
      <div className="fcChargeModal">
        <h2 id="fc-charge-title" className="fcChargeModalTitle">
          거래 자금 충전 신청
        </h2>
        <p className="htsMuted">
          신청 후 마스터·운영자가 HTS 운영 화면에서 승인하면 동일 계정의 캐시 잔고에 반영됩니다.
        </p>
        <label className="fcChargeLabel" htmlFor="fc-charge-amt">
          금액 (원)
        </label>
        <input
          id="fc-charge-amt"
          className="fcChargeInput"
          inputMode="numeric"
          value={chargeAmountStr}
          onChange={(e) => setChargeAmountStr(e.target.value)}
          placeholder="예: 100000"
        />
        <label className="fcChargeLabel" htmlFor="fc-charge-memo">
          메모 (선택)
        </label>
        <input
          id="fc-charge-memo"
          className="fcChargeInput"
          value={chargeMemo}
          onChange={(e) => setChargeMemo(e.target.value)}
          placeholder="입금자명 등"
        />
        {chargeErr ? <p className="fcChargeErr">{chargeErr}</p> : null}
        <div className="fcChargeActions">
          <button type="button" className="btn-ghost btn-sm" onClick={() => setChargeOpen(false)}>
            취소
          </button>
          <button type="button" className="symBtn" disabled={chargeBusy} onClick={() => void submitCharge()}>
            {chargeBusy ? '전송 중…' : '신청'}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  if (isMobileViewport) {
    return (
      <section className="htsWorkspace htsWorkspace--mobile" aria-label="모바일 HTS 작업 영역">
        <div className="htsMobileTop">
          <div className="htsMobileTopBar">
            <div>
              <p className="htsPanelTitle">심볼 선택</p>
              <p className="htsMuted">
                {selectedWatchInstrument?.name ?? '관심 종목'}
                {lastTick ? ` · ${lastTick}` : ''}
              </p>
            </div>
            <div className="htsMobileStatus">
              <span className={`htsStatusDot ${dotClass}`} aria-hidden />
              <span>{kisState ? `KIS ${kisState}` : `WS ${wsState}`}</span>
            </div>
          </div>
          <div className="htsMobileWatchStrip" role="tablist" aria-label="간편 종목 선택">
            {watchStripItems.map(({ item, price, changePct }) => {
              const active = selectedWatchId === item.id;
              const dirCls = changePct > 0 ? ' htsMobileWatchChip--up' : changePct < 0 ? ' htsMobileWatchChip--down' : '';
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`htsMobileWatchChip${active ? ' htsMobileWatchChip--active' : ''}${dirCls}`}
                  onClick={() => handleWatchSelect(item)}
                >
                  <span className="htsMobileWatchCode">{item.code}</span>
                  <span className="htsMobileWatchPrice">{formatLivePrice(price, item.priceDecimals)}</span>
                  <span className="htsMobileWatchPct">
                    {changePct > 0 ? '+' : ''}
                    {changePct.toFixed(2)}%
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="htsMobileMain">
          <div className="htsMobileOrderbookPane">
            <OrderBookPanel
              asks={obAsks}
              bids={obBids}
              symbol={obSymbol}
              lastTradePrice={obLastPx}
              obRevision={obRev}
              tickRevision={tickRev}
              priceDecimals={obPriceDecimals}
              isStale={obIsStale}
              isSynthetic={obIsSynthetic}
              onPriceSelect={handleOrderbookPriceSelect}
            />
          </div>

          <div className="htsMobileTradePane" aria-label="모바일 주문 패널">
            <div className="htsMobileTradeHead">
              <span className="htsMobilePaneLabel">주문</span>
              <strong className="htsTapeMidPrice">
                {obLastPx != null ? formatLivePrice(obLastPx, obPriceDecimals) : '—'}
              </strong>
            </div>

            <div className="htsMobileControlGroup">
              <span className="htsMobilePaneLabel">레버리지</span>
              <div className="htsMobileSliderHead">
                <strong>x{mobileLeverage}</strong>
                <span>최대 x125</span>
              </div>
              <input
                className="htsLeverageSlider"
                type="range"
                min="1"
                max="125"
                step="1"
                value={mobileLeverage}
                onChange={(e) => applyMobileLeverage(Number(e.target.value))}
                aria-label="레버리지"
              />
              <div className="htsMobileSegmentRow">
                {[1, 10, 25, 50, 125].map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={`htsMobileSegmentBtn${mobileLeverage === value ? ' htsMobileSegmentBtn--active' : ''}`}
                    onClick={() => applyMobileLeverage(value)}
                  >
                    x{value}
                  </button>
                ))}
              </div>
            </div>

            <div className="htsMobileControlGroup">
              <span className="htsMobilePaneLabel">사이징</span>
              <div className="htsMobileSegmentRow">
                {[25, 50, 75, 100].map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={`htsMobileSegmentBtn${mobileSizePct === value ? ' htsMobileSegmentBtn--active' : ''}`}
                    onClick={() => applyMobileSizing(value)}
                    disabled={mobileMaxQty == null}
                  >
                    {value}%
                  </button>
                ))}
              </div>
              <p className="htsMuted htsMobileHint">
                {mobileMaxQty != null
                  ? `추정 최대 수량 ${mobileMaxQty.toLocaleString('ko-KR')} · 현재 입력 ${orderQtyStr || '0'}`
                  : '로그인/잔고가 있으면 사이징 버튼으로 수량을 바로 채울 수 있습니다.'}
              </p>
            </div>

            <div className="htsMobileFormGrid">
              <label className="htsMobileField">
                <span>주문유형</span>
                <select
                  value={orderKind}
                  onChange={(e) => setOrderKind(e.target.value === 'limit' ? 'limit' : 'market')}
                >
                  <option value="limit">지정가</option>
                  <option value="market">시장가</option>
                </select>
              </label>
              <label className="htsMobileField">
                <span>가격</span>
                <input
                  placeholder={orderKind === 'market' ? '현재가 사용' : '가격'}
                  inputMode="decimal"
                  disabled={orderKind === 'market'}
                  value={orderKind === 'market' ? (obLastPx != null ? String(obLastPx) : '') : orderPriceStr}
                  onChange={(e) => setOrderPriceStr(e.target.value)}
                />
              </label>
              <label className="htsMobileField">
                <span>수량</span>
                <input
                  placeholder="수량"
                  inputMode="numeric"
                  value={orderQtyStr}
                  onChange={(e) => setOrderQtyStr(e.target.value)}
                />
              </label>
            </div>

            <div className="htsMobileTradeButtons">
              <button
                type="button"
                className="htsOrderBtn htsOrderBtn--buy"
                disabled={tradeBusy}
                onClick={() => void runPaperOrder('buy')}
              >
                매수
              </button>
              <button
                type="button"
                className="htsOrderBtn htsOrderBtn--sell"
                disabled={tradeBusy}
                onClick={() => void runPaperOrder('sell')}
              >
                매도
              </button>
            </div>

            <p className="htsMobileBalance" aria-live="polite">
              잔고{' '}
              <strong>
                {tradingApiEnabled
                  ? cashBalance != null
                    ? `${cashBalance.toLocaleString('ko-KR')}원`
                    : '…'
                  : '—'}
              </strong>
            </p>
            {tradeMsg ? <p className="htsOrderTradeMsg">{tradeMsg}</p> : null}
            {tradingApiEnabled ? (
              <button type="button" className="htsOrderChargeOpen" onClick={() => setChargeOpen(true)}>
                거래 자금 충전 신청
              </button>
            ) : null}
          </div>
        </div>

        <div className="htsMobileBottom">
          <div className="htsMobileBottomHead">
            <p className="htsPanelTitle">
              {mobileTab === 'positions' ? '포지션' : mobileTab === 'orders' ? '주문내역' : '관심 종목'}
            </p>
            <p className="htsMuted">
              {mobileTab === 'positions'
                ? '현재 선택한 심볼 기준 모의 포지션 요약'
                : mobileTab === 'orders'
                  ? '최근 체결 순서대로 확인'
                  : '전체 관심 종목을 빠르게 훑어보기'}
            </p>
          </div>

          <div className="htsMobileTabBody">
            {mobileTab === 'positions' ? (
              positionSnapshot.side === 'flat' ? (
                <div className="htsMobileEmpty">보유 포지션이 없습니다.</div>
              ) : (
                <article className={`htsMobilePositionCard htsMobilePositionCard--${positionSnapshot.side}`}>
                  <div className="htsMobilePositionHead">
                    <strong>{positionSnapshot.side === 'long' ? 'LONG' : 'SHORT'}</strong>
                    <button type="button" className="htsPositionActionBtn" onClick={fillPositionQty}>
                      전량 청산 수량 채우기
                    </button>
                  </div>
                  <div className="htsMobilePositionRow">
                    <span>포지션</span>
                    <strong>{positionSnapshot.side === 'long' ? 'LONG' : 'SHORT'}</strong>
                  </div>
                  <div className="htsMobilePositionRow">
                    <span>수량</span>
                    <strong>{Math.abs(positionSnapshot.netQty).toLocaleString('ko-KR')}</strong>
                  </div>
                  <div className="htsMobilePositionRow">
                    <span>평균가</span>
                    <strong>
                      {positionSnapshot.avgPrice != null ? formatLivePrice(positionSnapshot.avgPrice, obPriceDecimals) : '—'}
                    </strong>
                  </div>
                  <div className="htsMobilePositionRow">
                    <span>평가금액</span>
                    <strong>
                      {positionSnapshot.markValue != null ? `${Math.round(positionSnapshot.markValue).toLocaleString('ko-KR')}원` : '—'}
                    </strong>
                  </div>
                  <div className="htsMobilePositionRow">
                    <span>미실현손익</span>
                    <strong
                      className={
                        positionSnapshot.unrealized != null && positionSnapshot.unrealized > 0
                          ? 'wlNum--up'
                          : positionSnapshot.unrealized != null && positionSnapshot.unrealized < 0
                            ? 'wlNum--down'
                            : 'wlNum--flat'
                      }
                    >
                      {positionSnapshot.unrealized != null
                        ? `${positionSnapshot.unrealized > 0 ? '+' : ''}${Math.round(positionSnapshot.unrealized).toLocaleString('ko-KR')}원`
                        : '—'}
                    </strong>
                  </div>
                  <p className="htsMuted htsMobilePositionHint">
                    {positionSnapshot.side === 'long'
                      ? '롱 포지션 청산은 아래 주문 영역에서 매도 버튼을 누르면 됩니다.'
                      : '숏 포지션 청산은 아래 주문 영역에서 매수 버튼을 누르면 됩니다.'}
                  </p>
                </article>
              )
            ) : mobileTab === 'orders' ? (
              recentPaperTrades.length > 0 ? (
                <div className="htsMobileOrderList">
                  {recentPaperTrades.map((trade) => (
                    <article key={trade.id} className="htsMobileOrderItem">
                      <div className="htsMobileOrderTop">
                        <strong className={trade.side === 'buy' ? 'wlNum--up' : 'wlNum--down'}>
                          {trade.side === 'buy' ? '매수' : '매도'}
                        </strong>
                        <span>{new Date(trade.executed_at_ms).toLocaleTimeString('ko-KR', { hour12: false })}</span>
                      </div>
                      <div className="htsMobileOrderMeta">
                        <span>{trade.symbol}</span>
                        <span>수량 {trade.qty.toLocaleString('ko-KR')}</span>
                        <span>{formatLivePrice(trade.price, obPriceDecimals)}</span>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="htsMobileEmpty">아직 주문 체결 내역이 없습니다.</div>
              )
            ) : (
              <div className="htsMobileWatchList">
                {watchStripItems.map(({ item, price, changePct }) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`htsMobileWatchRow${selectedWatchId === item.id ? ' htsMobileWatchRow--active' : ''}`}
                    onClick={() => handleWatchSelect(item)}
                  >
                    <span className="htsMobileWatchRowSym">
                      <strong>{item.code}</strong>
                      <small>{item.name}</small>
                    </span>
                    <span className="htsMobileWatchRowPrice">{formatLivePrice(price, item.priceDecimals)}</span>
                    <span className={changePct > 0 ? 'wlNum--up' : changePct < 0 ? 'wlNum--down' : 'wlNum--flat'}>
                      {changePct > 0 ? '+' : ''}
                      {changePct.toFixed(2)}%
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <nav className="htsMobileNav" aria-label="모바일 하단 네비게이션">
            <button
              type="button"
              className={`htsMobileNavBtn${mobileTab === 'positions' ? ' htsMobileNavBtn--active' : ''}`}
              onClick={() => setMobileTab('positions')}
            >
              포지션
            </button>
            <button
              type="button"
              className={`htsMobileNavBtn${mobileTab === 'orders' ? ' htsMobileNavBtn--active' : ''}`}
              onClick={() => setMobileTab('orders')}
            >
              주문내역
            </button>
            <button
              type="button"
              className={`htsMobileNavBtn${mobileTab === 'watchlist' ? ' htsMobileNavBtn--active' : ''}`}
              onClick={() => setMobileTab('watchlist')}
            >
              관심
            </button>
          </nav>
        </div>

        {chargeModal}
      </section>
    );
  }

  return (
    <section className="htsWorkspace" aria-label="HTS 작업 영역">
      <div className="htsLeft">
        <div className="htsMainToolbar">
          <label className="symLabel" htmlFor="fc-symbol">
            종목코드
          </label>
          <input
            id="fc-symbol"
            className="symInput"
            value={symbolInput}
            onChange={(e) => setSymbolInput(e.target.value)}
            placeholder="005380"
            maxLength={12}
            autoComplete="off"
            onKeyDown={(e) => e.key === 'Enter' && applySymbol()}
          />
          <button type="button" className="symBtn" onClick={applySymbol}>
            적용
          </button>
        </div>
        <div className="htsMainMeta">
          <span className="chartLabel">Chart (TradingView 계열 엔진)</span>
          {selectedWatchInstrument ? (
            <span className="htsWatchMeta" title={selectedWatchInstrument.name}>
              관심 {selectedWatchInstrument.code}
              {(selectedWatchInstrument as any).kisIndexFuturesCode
                ? ' · 실시간(KIS 지수선물)'
                : (selectedWatchInstrument as any).kisOverseasSeriesCode
                  ? ' · 실시간(KIS 해외선물옵션)'
                  : selectedWatchInstrument.krxSubscribeCode
                    ? ' · 실시간(KIS)'
                    : ''}
            </span>
          ) : null}
          <span className="chartWs">
            WS {wsState}
            {kisState ? ` · KIS ${kisState}` : ''}
          </span>
        </div>
        <div className="htsTfBar" role="toolbar" aria-label="봉 간격">
          <span className="htsTfBarLabel">간격</span>
          {CHART_TF_OPTIONS.map((o) => (
            <button
              key={o.id}
              type="button"
              className={`htsTfBtn${timeframe === o.id ? ' htsTfBtn--active' : ''}`}
              onClick={() => setTimeframe(o.id)}
            >
              {o.label}
            </button>
          ))}
        </div>
        <div className="htsChartWrap chartWrap" ref={wrapRef} />
        <div className="htsTabBody" role="region" aria-label="실시간 체결 스택">
          <div className="htsTapeHead">
            <p className="htsPanelTitle">실시간 체결</p>
            <p className="htsMuted">호가와 직전 체결가 기준으로 매수/매도를 추정해 스택으로 표시합니다.</p>
          </div>
          <div className="htsTapeBoard">
            <section className="htsTapeLane htsTapeLane--sell" aria-label="매도 체결">
              <div className="htsTapeLaneHead">
                <span>매도 체결</span>
                <span>{sellTapeRows.length}</span>
              </div>
              <div className="htsTapeStack htsTapeStack--sell">
                {sellTapeRows.length > 0 ? (
                  sellTapeRows.map((trade) => (
                    <article key={trade.id} className="htsTapeTrade htsTapeTrade--sell">
                      <span className="htsTapeTradePrice">{formatLivePrice(trade.price, obPriceDecimals)}</span>
                      <span className="htsTapeTradeVol">{formatTapeVolume(trade.volume)}</span>
                    </article>
                  ))
                ) : (
                  <div className="htsTapeEmpty">매도 체결 대기</div>
                )}
              </div>
            </section>

            <div className="htsTapeMid" aria-label="현재가">
              <span className="htsTapeMidLabel">현재가</span>
              <strong className="htsTapeMidPrice">
                {obLastPx != null ? formatLivePrice(obLastPx, obPriceDecimals) : '—'}
              </strong>
              <span className="htsTapeMidMeta">{lastTick ?? '체결 대기'}</span>
            </div>

            <section className="htsTapeLane htsTapeLane--buy" aria-label="매수 체결">
              <div className="htsTapeLaneHead">
                <span>매수 체결</span>
                <span>{buyTapeRows.length}</span>
              </div>
              <div className="htsTapeStack htsTapeStack--buy">
                {buyTapeRows.length > 0 ? (
                  buyTapeRows.map((trade) => (
                    <article key={trade.id} className="htsTapeTrade htsTapeTrade--buy">
                      <span className="htsTapeTradePrice">{formatLivePrice(trade.price, obPriceDecimals)}</span>
                      <span className="htsTapeTradeVol">{formatTapeVolume(trade.volume)}</span>
                    </article>
                  ))
                ) : (
                  <div className="htsTapeEmpty">매수 체결 대기</div>
                )}
              </div>
            </section>
          </div>
        </div>
      </div>

      <div className="htsCenter" aria-label="호가/주문">
        <OrderBookPanel
          variant="hts"
          asks={obAsks}
          bids={obBids}
          symbol={obSymbol}
          lastTradePrice={obLastPx}
          obRevision={obRev}
          tickRevision={tickRev}
          priceDecimals={obPriceDecimals}
          isStale={obIsStale}
          isSynthetic={obIsSynthetic}
          onPriceSelect={handleOrderbookPriceSelect}
        />
        <div className="htsOrderWrap" aria-label="주문하기">
          <p className="htsPanelTitle">주문하기</p>
          <p className="htsOrderBalance" aria-live="polite">
            거래 자금{' '}
            <strong>
              {tradingApiEnabled
                ? cashBalance != null
                  ? `${cashBalance.toLocaleString('ko-KR')}원`
                  : '…'
                : '—'}
            </strong>
            {tradingApiEnabled ? (
              <>
                {' '}
                <button type="button" className="htsOrderLinkBtn" onClick={() => void refreshBalance()}>
                  새로고침
                </button>
              </>
            ) : null}
          </p>
          <p className="htsMuted htsOrderSym">
            체결 심볼 <strong>{feedSymbol}</strong> ({feedProvider}) · 모의 보유 <strong>{netPaperQty}</strong>
          </p>
          <div className="htsOrderLeverage">
            <div className="htsOrderLeverageHead">
              <span>레버리지</span>
              <strong>x{mobileLeverage}</strong>
            </div>
            <input
              className="htsLeverageSlider"
              type="range"
              min="1"
              max="125"
              step="1"
              value={mobileLeverage}
              onChange={(e) => applyMobileLeverage(Number(e.target.value))}
              aria-label="레버리지"
            />
            <div className="htsOrderLeverageMeta">
              <span>1x</span>
              <span>
                최대 수량{' '}
                <strong>{mobileMaxQty != null ? mobileMaxQty.toLocaleString('ko-KR') : '—'}</strong>
              </span>
              <span>125x</span>
            </div>
            <div className="htsOrderPresetRow">
              {[1, 10, 25, 50, 125].map((value) => (
                <button
                  key={value}
                  type="button"
                  className={`htsOrderPresetBtn${mobileLeverage === value ? ' htsOrderPresetBtn--active' : ''}`}
                  onClick={() => applyMobileLeverage(value)}
                >
                  x{value}
                </button>
              ))}
            </div>
          </div>
          <div className="htsOrderGrid">
            <div className="htsOrderRow">
              <label htmlFor="fc-order-kind">주문유형</label>
              <select
                id="fc-order-kind"
                value={orderKind}
                onChange={(e) => setOrderKind(e.target.value === 'limit' ? 'limit' : 'market')}
              >
                <option value="limit">지정가</option>
                <option value="market">시장가</option>
              </select>
            </div>
            <div className="htsOrderRow">
              <label htmlFor="fc-order-price">가격</label>
              <input
                id="fc-order-price"
                placeholder={orderKind === 'market' ? '시장가(현재가 사용)' : '가격'}
                inputMode="decimal"
                disabled={orderKind === 'market'}
                value={orderKind === 'market' ? (obLastPx != null ? String(obLastPx) : '') : orderPriceStr}
                onChange={(e) => setOrderPriceStr(e.target.value)}
              />
            </div>
            <div className="htsOrderRow">
              <label htmlFor="fc-order-qty">수량</label>
              <input
                id="fc-order-qty"
                placeholder="수량"
                inputMode="numeric"
                value={orderQtyStr}
                onChange={(e) => setOrderQtyStr(e.target.value)}
              />
            </div>
          </div>
          {orderKind === 'limit' ? (
            <p className="htsMuted htsOrderHint">오더북 가격을 클릭하면 지정가 입력란에 바로 채워집니다.</p>
          ) : null}
          <div className="htsOrderActions">
            <button
              type="button"
              className="htsOrderBtn htsOrderBtn--buy"
              disabled={tradeBusy}
              onClick={() => void runPaperOrder('buy')}
            >
              매수
            </button>
            <button
              type="button"
              className="htsOrderBtn htsOrderBtn--sell"
              disabled={tradeBusy}
              onClick={() => void runPaperOrder('sell')}
            >
              매도
            </button>
          </div>
          {positionSnapshot.side !== 'flat' ? (
            <div className={`htsPositionCard htsPositionCard--${positionSnapshot.side}`}>
              <div className="htsPositionCardHead">
                <strong>{positionSnapshot.side === 'long' ? 'LONG 포지션' : 'SHORT 포지션'}</strong>
                <button type="button" className="htsPositionActionBtn" onClick={fillPositionQty}>
                  전량 청산 수량 채우기
                </button>
              </div>
              <div className="htsPositionGrid">
                <div className="htsPositionMetric">
                  <span>수량</span>
                  <strong>{Math.abs(positionSnapshot.netQty).toLocaleString('ko-KR')}</strong>
                </div>
                <div className="htsPositionMetric">
                  <span>평단</span>
                  <strong>
                    {positionSnapshot.avgPrice != null ? formatLivePrice(positionSnapshot.avgPrice, obPriceDecimals) : '—'}
                  </strong>
                </div>
                <div className="htsPositionMetric">
                  <span>평가금액</span>
                  <strong>
                    {positionSnapshot.markValue != null
                      ? `${Math.round(positionSnapshot.markValue).toLocaleString('ko-KR')}원`
                      : '—'}
                  </strong>
                </div>
                <div className="htsPositionMetric">
                  <span>미실현손익</span>
                  <strong
                    className={
                      positionSnapshot.unrealized != null && positionSnapshot.unrealized > 0
                        ? 'wlNum--up'
                        : positionSnapshot.unrealized != null && positionSnapshot.unrealized < 0
                          ? 'wlNum--down'
                          : 'wlNum--flat'
                    }
                  >
                    {positionSnapshot.unrealized != null
                      ? `${positionSnapshot.unrealized > 0 ? '+' : ''}${Math.round(positionSnapshot.unrealized).toLocaleString('ko-KR')}원`
                      : '—'}
                  </strong>
                </div>
              </div>
              <p className="htsMuted htsPositionHint">
                {positionSnapshot.side === 'long'
                  ? '현재 보유는 롱입니다. 청산하려면 매도 버튼을 누르세요.'
                  : '현재 보유는 숏입니다. 청산하려면 매수 버튼을 누르세요.'}
              </p>
            </div>
          ) : null}
          {tradeMsg ? <p className="htsOrderTradeMsg">{tradeMsg}</p> : null}
          <p className="htsMuted" style={{ marginTop: '0.45rem' }}>
            {tradingApiEnabled
              ? '모의 체결: 잔고는 충전 승인으로 입금된 캐시이며, 실거래·실시간 주문 라우팅과는 별도입니다.'
              : 'VITE_MARKET_API_BASE(또는 VITE_API_BASE)와 마켓 로그인 시 잔고·모의 체결·충전 신청이 활성화됩니다.'}
          </p>
          {tradingApiEnabled ? (
            <button type="button" className="htsOrderChargeOpen" onClick={() => setChargeOpen(true)}>
              거래 자금 충전 신청
            </button>
          ) : null}
        </div>
      </div>

      <aside className="htsRight" aria-label="관심">
        <WatchlistPanel selectedId={selectedWatchId} onSelect={handleWatchSelect} liveById={liveById} />
      </aside>

      <footer className="htsStatusBar">
        <span>
          <span className={`htsStatusDot ${dotClass}`} aria-hidden />
          브로커 {wsState}
          <span className="htsStatusSep"> │ </span>
          {kisState ?? '—'}
        </span>
        <span className="htsStatusSep"> │ </span>
        <span>
          구독 <span className="htsSymFeed">{feedSymbol}</span>
          <span className="htsStatusSep"> </span>
          <span className="htsSymFeed">({feedProvider.toUpperCase()})</span>
          {selectedWatchInstrument ? (
            <>
              <span className="htsStatusSep"> │ </span>
              관심{' '}
              <span className="htsSymFeed">{selectedWatchInstrument.code}</span>
            </>
          ) : null}
        </span>
        <span className="htsStatusSep"> │ </span>
        <span>{lastTick ?? '체결 대기'}</span>
        <span className="htsStatusSep"> │ </span>
        <span>{timeStr}</span>
      </footer>

      {chargeModal}
    </section>
  );
}
