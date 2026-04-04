import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowsClockwise,
  ArrowUp,
  BellSimple,
  BookOpen,
  ChartLine,
  CheckCircle,
  Clock,
  CreditCard,
  Lightning,
  ListBullets,
  PencilSimpleLine,
  Stack,
  Swap,
  User,
  Wallet,
  X,
} from '@phosphor-icons/react';
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
  chartConvertBalance,
  chartFetchBalance,
  chartFetchUserMe,
  chartListPaperTrades,
  chartPaperOrder,
  chartSubmitChargeRequest,
  type ConvertResult,
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

type FeedMode = 'demo' | 'live';
type FeedLogKind = 'tick' | 'orderbook' | 'history' | 'mode';
type FeedLogEntry = {
  id: string;
  mode: FeedMode;
  kind: FeedLogKind;
  text: string;
  at: number;
};

type RecordTab = 'positions' | 'openOrders' | 'fills';
type OrderKind = 'limit' | 'market';

const TRADE_BUY_COLOR = '#5ce1e6';
const TRADE_SELL_COLOR = '#ff6b78';
const TRADE_INK_COLOR = '#111111';

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

function chartLayoutTheme() {
  return {
    background: {
      type: ColorType.Solid,
      color: '#ffffff',
    } as const,
    textColor: TRADE_INK_COLOR,
    grid: {
      vertLines: { color: 'rgba(17, 17, 17, 0.08)' },
      horzLines: { color: 'rgba(17, 17, 17, 0.08)' },
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

function resolveInitialFeed(item: WatchInstrument | null): { provider: KisFeedProvider; symbol: string } {
  if (item?.kisIndexFuturesCode) return { provider: 'kis-index', symbol: item.kisIndexFuturesCode.trim() };
  if (item?.kisOverseasSeriesCode) return { provider: 'kis-overseas', symbol: item.kisOverseasSeriesCode.trim() };
  const krx = item?.krxSubscribeCode ? normalizeSymbol(item.krxSubscribeCode) : null;
  if (krx) return { provider: 'kis', symbol: krx };
  return { provider: 'kis-index', symbol: 'A01606' };
}

function formatLivePrice(n: number, decimals: number) {
  const d = Number.isFinite(decimals) ? Math.min(8, Math.max(0, Math.floor(decimals))) : 2;
  return n.toLocaleString('ko-KR', {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
}

function formatOrderInputPrice(n: number, decimals: number) {
  const d = Number.isFinite(decimals) ? Math.min(8, Math.max(0, Math.floor(decimals))) : 2;
  return d <= 0 ? String(Math.round(n)) : n.toFixed(d).replace(/\.?0+$/, '');
}

function quantizePrice(n: number, decimals: number) {
  const d = Number.isFinite(decimals) ? Math.min(8, Math.max(0, Math.floor(decimals))) : 2;
  const factor = 10 ** d;
  return Math.round(n * factor) / factor;
}

function chartStepSecondsForTf(tf: ChartTf) {
  const mult = TF_MINUTES[tf];
  if (mult != null) return mult * 60;
  if (tf === 'D') return 86400;
  return 7 * 86400;
}

function generateSyntheticHistoryBars(
  anchorPrice: number,
  decimals: number,
  tf: ChartTf,
  provider: KisFeedProvider,
): CandlestickData<UTCTimestamp>[] {
  const minPrice = 10 ** -Math.max(0, decimals);
  const safeAnchor = Math.max(anchorPrice, minPrice);
  const stepSec = chartStepSecondsForTf(tf);
  const nowMs = Date.now();
  const endBucket = bucketUtcSecForTf(provider === 'kis-overseas' ? nowMs : nowMs + KST_OFFSET_MS, tf);
  const bars: CandlestickData<UTCTimestamp>[] = [];
  let prevClose = quantizePrice(safeAnchor * 0.996, decimals);

  for (let offset = 79; offset >= 0; offset -= 1) {
    const idx = 79 - offset;
    const wave = Math.sin(idx / 5.3) * safeAnchor * 0.0011;
    const drift = Math.cos(idx / 9.4) * safeAnchor * 0.0007;
    const noise = (Math.random() - 0.5) * safeAnchor * 0.00045;
    const open = prevClose;
    const close = quantizePrice(Math.max(minPrice, open + wave + drift + noise), decimals);
    const high = quantizePrice(Math.max(open, close) + Math.abs(Math.sin(idx * 1.2)) * safeAnchor * 0.00065, decimals);
    const low = quantizePrice(
      Math.max(minPrice, Math.min(open, close) - Math.abs(Math.cos(idx * 1.05)) * safeAnchor * 0.00065),
      decimals,
    );
    bars.push({
      time: (endBucket - stepSec * offset) as UTCTimestamp,
      open: quantizePrice(open, decimals),
      high: Math.max(high, open, close),
      low: Math.min(low, open, close),
      close,
    });
    prevClose = close;
  }

  return bars;
}

function generateSyntheticOrderbook(price: number, decimals: number, ts: number) {
  const step = decimals > 0 ? 1 / 10 ** decimals : 1;
  const asks: BookLevel[] = [];
  const bids: BookLevel[] = [];

  for (let depth = 0; depth < 7; depth += 1) {
    const wave = (Math.sin(ts / 1400 + depth * 0.7) + 1) / 2;
    asks.push({
      price: quantizePrice(price + step * (depth + 1), decimals),
      qty: Math.max(1, Math.round((depth === 0 ? 42 : 18) * (1 + wave * 2.2))),
    });
    bids.push({
      price: quantizePrice(Math.max(step, price - step * (depth + 1)), decimals),
      qty: Math.max(1, Math.round((depth === 0 ? 39 : 16) * (1 + (1 - wave) * 2.2))),
    });
  }

  return { asks, bids };
}

function OrderKindToggle({ value, onChange }: { value: OrderKind; onChange: (kind: OrderKind) => void }) {
  return (
    <div className="htsModeToggle" role="tablist" aria-label="주문 유형">
      {([
        ['limit', '지정가'],
        ['market', '시장가'],
      ] as const).map(([kind, label]) => (
        <button
          key={kind}
          type="button"
          role="tab"
          aria-selected={value === kind}
          className={`htsModeToggleBtn${value === kind ? ' htsModeToggleBtn--active' : ''}`}
          onClick={() => onChange(kind)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

const PRIMARY_WATCH = FUTURES_WATCHLIST[0] ?? null;
const DEFAULT_FEED = resolveInitialFeed(PRIMARY_WATCH);
const LEVERAGE_OPTIONS = [5, 10, 25, 50] as const;
// SIZING_OPTIONS replaced by free slider; kept for reference
// const SIZING_OPTIONS = [25, 50, 75, 100] as const;
const RECORD_TABS: { id: RecordTab; label: string; icon: React.ReactNode }[] = [
  { id: 'positions',  label: '현재 포지션', icon: <Stack size={13} weight="duotone" /> },
  { id: 'openOrders', label: '미체결',      icon: <Clock size={13} weight="duotone" /> },
  { id: 'fills',      label: '체결 기록',   icon: <CheckCircle size={13} weight="duotone" /> },
];

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
    provider: DEFAULT_FEED.provider,
    symbol: DEFAULT_FEED.symbol,
  });
  const lastBookRef = useRef<Record<string, { asks: BookLevel[]; bids: BookLevel[] }>>({});
  /** 마지막 실시간 호가 수신 시각(ms) — 호가 TR은 체결보다 드물어 스냅샷만 보이는 현상 방지 */
  const lastObReceivedAtRef = useRef<number>(0);
  const liveBookRef = useRef<{ asks: BookLevel[]; bids: BookLevel[] }>({ asks: [], bids: [] });
  const tapeRef = useRef<{ lastPrice: number | null; lastSide: TapeSide }>({ lastPrice: null, lastSide: 'buy' });
  const focusRequestedAtRef = useRef<number>(Date.now());
  const lastFocusedTickAtRef = useRef<number>(0);
  const lastFocusedOrderbookAtRef = useRef<number>(0);
  const simPriceRef = useRef<number | null>(null);
  const simPhaseRef = useRef<number>(Math.random() * Math.PI * 2);

  const [feedProvider, setFeedProvider] = useState<KisFeedProvider>(DEFAULT_FEED.provider);
  const [feedSymbol, setFeedSymbol] = useState(DEFAULT_FEED.symbol);
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
  const [selectedWatchId, setSelectedWatchId] = useState(PRIMARY_WATCH?.id ?? '');
  const [timeframe, setTimeframe] = useState<ChartTf>('1');
  const tfRef = useRef<ChartTf>('1');
  tfRef.current = timeframe;

  const tradingApiEnabled = Boolean(session?.accessToken && getMarketApiBase());
  const [cashBalance, setCashBalance] = useState<number | null>(null);
  const [usdtBalance, setUsdtBalance] = useState<number | null>(null);
  const [usdKrw, setUsdKrw] = useState<number>(1380);
  // 전환 모달
  const [convertOpen, setConvertOpen] = useState(false);
  const [convertFrom, setConvertFrom] = useState<'KRW' | 'USDT'>('KRW');
  const [convertAmtStr, setConvertAmtStr] = useState('');
  const [convertBusy, setConvertBusy] = useState(false);
  const [convertMsg, setConvertMsg] = useState<string | null>(null);
  const [paperTrades, setPaperTrades] = useState<HtsPaperTradeRow[]>([]);
  const [tradeMsg, setTradeMsg] = useState<string | null>(null);
  const [tradeBusy, setTradeBusy] = useState(false);
  const [orderKind, setOrderKind] = useState<OrderKind>('market');
  const [orderPriceStr, setOrderPriceStr] = useState('');
  const [orderQtyStr, setOrderQtyStr] = useState('1');
  const [chargeOpen, setChargeOpen] = useState(false);
  const [chargeAmountStr, setChargeAmountStr] = useState('');
  const [chargeMemo, setChargeMemo] = useState('');
  const [chargeErr, setChargeErr] = useState<string | null>(null);
  const [chargeBusy, setChargeBusy] = useState(false);
  const [recordTab, setRecordTab] = useState<RecordTab>('positions');
  const [mobileLeverage, setMobileLeverage] = useState(5);
  const [mobileSizePct, setMobileSizePct] = useState(50);
  const [mobileTab, setMobileTab] = useState<'trade' | 'chart' | 'notice' | 'account'>('trade');
  const [leverageModalOpen, setLeverageModalOpen] = useState(false);
  const [feedMode, setFeedMode] = useState<FeedMode>('demo');
  const [feedLogs, setFeedLogs] = useState<FeedLogEntry[]>([]);
  const [isMobileViewport, setIsMobileViewport] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 960px)').matches,
  );
  const [simFeedActive, setSimFeedActive] = useState(false);

  const wsUrl = getBrokerWebSocketUrl();

  feedRef.current = { provider: feedProvider, symbol: feedSymbol };

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
    focusRequestedAtRef.current = Date.now();
    lastFocusedTickAtRef.current = 0;
    lastFocusedOrderbookAtRef.current = 0;
    simPriceRef.current = null;
    lastObReceivedAtRef.current = 0;
    setBookAsks([]);
    setBookBids([]);
    setLastTradePx(null);
    setLastTick(null);
    setObIsSynthetic(false);
    setSimFeedActive(false);
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
    simPriceRef.current = out.length > 0 ? out[out.length - 1].close : null;
    chartRef.current?.timeScale().fitContent();
  }, []);

  const pushFeedLog = useCallback((entry: Omit<FeedLogEntry, 'id' | 'at'>) => {
    setFeedLogs((prev) => {
      const nowAt = Date.now();
      const head = prev[0];
      if (head && head.mode === entry.mode && head.kind === entry.kind && nowAt - head.at < 1400) {
        return [{ ...head, text: entry.text, at: nowAt }, ...prev.slice(1)];
      }
      return [{ id: `${nowAt}-${Math.random().toString(36).slice(2, 7)}`, at: nowAt, ...entry }, ...prev].slice(0, 18);
    });
  }, []);

  const syncWatchRowsFromPrice = useCallback((provider: BrokerSyncFeed['provider'], symbol: string, price: number, volume: number) => {
    const ids = watchInstrumentIdsForBrokerTick(FUTURES_WATCHLIST, provider, symbol);
    if (ids.length === 0) return;
    setLiveById((prev) => {
      const next = { ...prev };
      for (const id of ids) {
        const row = FUTURES_WATCHLIST.find((item) => item.id === id);
        const ref = row?.lastPrice ?? price;
        const changePct = ref !== 0 && Number.isFinite(ref) ? ((price - ref) / ref) * 100 : 0;
        next[id] = { lastPrice: price, volume, changePct };
      }
      return next;
    });
  }, []);

  const applyTickFeed = useCallback(
    (t: TickPayload, options?: { simulated?: boolean }) => {
      const series = seriesRef.current;
      const isSimulated = options?.simulated === true;
      const isOverseas = feedRef.current.provider === 'kis-overseas';
      const bucket = bucketUtcSecForTf(isOverseas ? t.ts : t.ts + KST_OFFSET_MS, tfRef.current);
      const time = bucket as UTCTimestamp;
      const price = t.price;

      if (series) {
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
          if (prev) {
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
        }
      }

      setLastTick(`${t.symbol} ${price.toLocaleString('ko-KR')} · ${isSimulated ? '시뮬레이션' : '체결'}`);
      setLastTradePx(price);
      setTickRev((r) => r + 1);
      simPriceRef.current = price;
      pushFeedLog({
        mode: isSimulated ? 'demo' : 'live',
        kind: 'tick',
        text: `${t.symbol} ${price.toLocaleString('ko-KR')} · ${isSimulated ? 'demo tick' : 'live tick'}`,
      });

      if (!isSimulated) {
        lastFocusedTickAtRef.current = Date.now();
        setSimFeedActive(false);
      }

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
    },
    [pushFeedLog],
  );

  const applyOrderbookFeed = useCallback(
    (ob: OrderbookPayload, options?: { simulated?: boolean }) => {
      const isSimulated = options?.simulated === true;
      const isSynth = ob.synthetic === true;
      const hasLiveBook = !obIsSyntheticRef.current && (liveBookRef.current.asks.length > 0 || liveBookRef.current.bids.length > 0);
      if (isSynth && hasLiveBook && !isSimulated) return;

      lastObReceivedAtRef.current = isSynth ? 0 : Date.now();
      setBookAsks(ob.asks);
      setBookBids(ob.bids);
      liveBookRef.current = { asks: ob.asks, bids: ob.bids };
      obIsSyntheticRef.current = isSynth;
      setObIsSynthetic(isSynth);
      setObRev((r) => r + 1);
      pushFeedLog({
        mode: isSimulated ? 'demo' : 'live',
        kind: 'orderbook',
        text: `${ob.symbol} 호가 ${ob.asks.length}/${ob.bids.length} · ${isSimulated || isSynth ? 'demo book' : 'live book'}`,
      });

      if (!isSynth) {
        lastBookRef.current[`${feedRef.current.provider}:${feedRef.current.symbol}`] = { asks: ob.asks, bids: ob.bids };
      }

      if (!isSimulated && !isSynth) {
        lastFocusedOrderbookAtRef.current = Date.now();
        setSimFeedActive(false);
      }
    },
    [pushFeedLog],
  );

  const refreshBalance = useCallback(async () => {
    if (!session?.accessToken || !getMarketApiBase()) return;
    try {
      const bal = await chartFetchBalance(session);
      setCashBalance(bal.krw);
      setUsdtBalance(bal.usdt);
      setUsdKrw(bal.usdKrw);
    } catch {
      // /hts/balance 없으면 기존 /user/me 폴백
      try {
        const me = await chartFetchUserMe(session);
        setCashBalance(me.cashBalance);
      } catch {
        setCashBalance(null);
      }
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
        color: isBuy ? TRADE_BUY_COLOR : TRADE_SELL_COLOR,
        text: `${isBuy ? 'B' : 'S'}${t.qty}`,
      });
    }
    markers.sort((a, b) => (a.time as number) - (b.time as number));
    api.setMarkers(markers);
  }, [paperTrades, timeframe, feedProvider, feedSymbol]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    const th = chartLayoutTheme();
    let rafId = 0;

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
      upColor: TRADE_BUY_COLOR,
      downColor: TRADE_SELL_COLOR,
      borderVisible: false,
      wickUpColor: TRADE_BUY_COLOR,
      wickDownColor: TRADE_SELL_COLOR,
    });

    chartRef.current = chart;
    seriesRef.current = series;
    markersPluginRef.current = createSeriesMarkers(series, []) as {
      setMarkers: (m: SeriesMarker<UTCTimestamp>[]) => void;
      detach: () => void;
    };

    const syncChartSize = () => {
      if (!wrapRef.current) return;
      chart.applyOptions({
        width: Math.max(wrapRef.current.clientWidth, 1),
        height: Math.max(wrapRef.current.clientHeight, 1),
      });
      chart.timeScale().fitContent();
    };

    rafId = window.requestAnimationFrame(syncChartSize);

    const ro = new ResizeObserver(() => {
      syncChartSize();
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      window.cancelAnimationFrame(rafId);
      markersPluginRef.current?.detach();
      markersPluginRef.current = null;
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      bucketRef.current = null;
      barRef.current = null;
    };
  }, [isMobileViewport]);

  useEffect(() => {
    const chart = chartRef.current;
    const el = wrapRef.current;
    if (!chart || !el) return;

    let rafId = 0;
    rafId = window.requestAnimationFrame(() => {
      if (!wrapRef.current) return;
      chart.applyOptions({
        width: Math.max(wrapRef.current.clientWidth, 1),
        height: Math.max(wrapRef.current.clientHeight, 1),
      });
      chart.timeScale().fitContent();
    });

    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [isMobileViewport, mobileTab]);

  useEffect(() => {
    hardReset();
  }, [timeframe, hardReset]);

  useEffect(() => {
    let stopped = false;
    let retry = 0;
    let timer: number | null = null;
    let ws: WebSocket | null = null;

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
        if (feedMode === 'live') {
          const cur = feedRef.current;
          ws?.send(JSON.stringify({ op: 'subscribe', provider: cur.provider, symbol: cur.symbol }));
        }
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

          if (feedMode === 'live' && msg.type === 'tick' && 'price' in msg && msgSymbol) {
            const t = msg as TickPayload;
            const p = (t.provider ?? 'kis') as BrokerSyncFeed['provider'];
            if (p === 'kis' || p === 'kis-index' || p === 'kis-overseas') {
              syncWatchRowsFromPrice(p, t.symbol, t.price, t.volume);
            }
          }

          // Yahoo Finance 30초 주기 시세 배치 (해외선물 마켓워치 업데이트)
          if (feedMode === 'live' && msg.type === 'quote_batch' && 'quotes' in msg) {
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

          if (feedMode === 'live' && msg.type === 'history' && 'bars' in msg && isForCurrent) {
            applyHistory((msg as HistoryPayload).bars);
            pushFeedLog({
              mode: 'live',
              kind: 'history',
              text: `${msgSymbol} 히스토리 ${((msg as HistoryPayload).bars ?? []).length}개`,
            });
          }
          if (feedMode === 'live' && msg.type === 'tick' && 'price' in msg && isForCurrent) {
            applyTickFeed(msg as TickPayload);
          }
          if (feedMode === 'live' && msg.type === 'orderbook' && 'asks' in msg && isForCurrent) {
            applyOrderbookFeed(msg as OrderbookPayload);
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
  }, [applyHistory, applyOrderbookFeed, applyTickFeed, feedMode, pushFeedLog, syncWatchRowsFromPrice, wsUrl]);

  useEffect(() => {
    const w = wsRef.current;
    if (feedMode === 'live' && w?.readyState === 1) {
      w.send(JSON.stringify({ op: 'subscribe', provider: feedProvider, symbol: feedSymbol }));
    }
    hardReset();
  }, [feedMode, feedProvider, feedSymbol, hardReset]);

  const handleWatchSelect = useCallback((item: WatchInstrument) => {
    setSelectedWatchId(item.id);
    const k = item.krxSubscribeCode?.trim();
    if (k) {
      const n = normalizeSymbol(k);
      if (n) {
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
  const liveTapeCount = buyTape.length + sellTape.length;

  const positionSnapshot = useMemo(
    () => summarizePaperPosition(paperTrades, obLastPx),
    [paperTrades, obLastPx],
  );
  const currentTfLabel = useMemo(
    () => CHART_TF_OPTIONS.find((option) => option.id === timeframe)?.label ?? timeframe,
    [timeframe],
  );
  const mobileChangePct = liveRow?.changePct ?? selectedWatchInstrument?.changePct ?? 0;
  const priceToneClass = mobileChangePct > 0 ? 'wlNum--up' : mobileChangePct < 0 ? 'wlNum--down' : 'wlNum--flat';
  const displaySymbolCode = selectedWatchInstrument?.code ?? obSymbol ?? '—';
  const displaySymbolName = selectedWatchInstrument?.name ?? '선택 종목';
  const displayPriceText = obLastPx != null ? formatLivePrice(obLastPx, obPriceDecimals) : '—';
  const statusText =
    feedMode === 'demo'
      ? simFeedActive
        ? 'DEMO 수신중'
        : 'DEMO 준비중'
      : kisState
        ? `LIVE · KIS ${kisState}`
        : `LIVE · WS ${wsState}`;
  const parsedOrderQty = useMemo(() => {
    const qty = parseInt(orderQtyStr.replace(/\D/g, ''), 10);
    return Number.isFinite(qty) && qty > 0 ? qty : 0;
  }, [orderQtyStr]);

  const mobileMaxQty = useMemo(() => {
    if (!tradingApiEnabled || cashBalance == null || obLastPx == null || obLastPx <= 0) return null;
    const qty = Math.floor((cashBalance * mobileLeverage) / obLastPx);
    return Number.isFinite(qty) && qty > 0 ? qty : null;
  }, [tradingApiEnabled, cashBalance, obLastPx, mobileLeverage]);

  useEffect(() => {
    pushFeedLog({
      mode: feedMode,
      kind: 'mode',
      text: feedMode === 'demo' ? '데모 수신 모드로 전환' : '라이브 수신 모드로 전환',
    });
  }, [feedMode, pushFeedLog]);

  useEffect(() => {
    const SIM_START_DELAY_MS = 700;
    const TICK_INTERVAL_MS = 1100;
    if (feedMode !== 'demo') {
      setSimFeedActive(false);
      return;
    }

    let simTimer: number | null = null;

    const clearSimTimer = () => {
      if (simTimer != null) {
        window.clearInterval(simTimer);
        simTimer = null;
      }
    };

    const seedSimulationHistory = (anchorPrice: number) => {
      if (barRef.current != null) return;
      const series = seriesRef.current;
      if (!series) return;
      const bars = generateSyntheticHistoryBars(anchorPrice, obPriceDecimals, timeframe, feedProvider);
      series.setData(bars);
      bucketRef.current = bars.length > 0 ? (bars[bars.length - 1].time as number) : null;
      barRef.current = bars.length > 0 ? bars[bars.length - 1] : null;
      simPriceRef.current = bars.length > 0 ? bars[bars.length - 1].close : anchorPrice;
      chartRef.current?.timeScale().fitContent();
      pushFeedLog({
        mode: 'demo',
        kind: 'history',
        text: `${feedSymbol} 데모 히스토리 ${bars.length}개`,
      });
    };

    const emitSimulationFrame = () => {
      const anchorFromWatch = liveRow?.lastPrice ?? selectedWatchInstrument?.lastPrice ?? 100;
      const anchor = simPriceRef.current ?? barRef.current?.close ?? lastTradePx ?? anchorFromWatch;
      const step = obPriceDecimals > 0 ? 1 / 10 ** obPriceDecimals : 1;
      const ceiling = Math.max(anchorFromWatch * 0.018, step * 12);
      simPhaseRef.current += 0.42;
      const drift = Math.sin(simPhaseRef.current) * ceiling * 0.12;
      const jitter = (Math.random() - 0.5) * ceiling * 0.08;
      const nextPrice = quantizePrice(
        Math.max(step, Math.min(anchorFromWatch + ceiling, Math.max(anchorFromWatch - ceiling, anchor + drift + jitter))),
        obPriceDecimals,
      );
      const ts = Date.now();
      const volume = Math.max(1, Math.round(4 + Math.abs(Math.sin(simPhaseRef.current * 1.7)) * 18));
      const syntheticBook = generateSyntheticOrderbook(nextPrice, obPriceDecimals, ts);
      syncWatchRowsFromPrice(feedProvider, feedSymbol, nextPrice, volume);
      applyOrderbookFeed(
        {
          type: 'orderbook',
          provider: feedProvider,
          symbol: feedSymbol,
          asks: syntheticBook.asks,
          bids: syntheticBook.bids,
          ts,
          synthetic: true,
        },
        { simulated: true },
      );
      applyTickFeed(
        {
          type: 'tick',
          provider: feedProvider,
          symbol: feedSymbol,
          price: nextPrice,
          volume,
          hour: null,
          ts,
        },
        { simulated: true },
      );
    };

    const startSimulation = () => {
      if (simTimer != null) return;
      const anchorPrice = lastTradePx ?? barRef.current?.close ?? liveRow?.lastPrice ?? selectedWatchInstrument?.lastPrice ?? 100;
      seedSimulationHistory(anchorPrice);
      simPriceRef.current = anchorPrice;
      setSimFeedActive(true);
      emitSimulationFrame();
      simTimer = window.setInterval(emitSimulationFrame, TICK_INTERVAL_MS);
    };

    focusRequestedAtRef.current = Date.now();
    const bootTimer = window.setTimeout(startSimulation, SIM_START_DELAY_MS);

    return () => {
      window.clearTimeout(bootTimer);
      clearSimTimer();
    };
  }, [
    applyOrderbookFeed,
    applyTickFeed,
    feedMode,
    feedProvider,
    feedSymbol,
    lastTradePx,
    liveRow?.lastPrice,
    obPriceDecimals,
    pushFeedLog,
    selectedWatchInstrument?.lastPrice,
    syncWatchRowsFromPrice,
    timeframe,
  ]);

  const applyOrderSizing = useCallback(
    (pct: number) => {
      setMobileSizePct(pct);
      if (mobileMaxQty == null) return;
      setOrderQtyStr(String(Math.max(1, Math.floor((mobileMaxQty * pct) / 100))));
    },
    [mobileMaxQty],
  );

  const applyOrderLeverage = useCallback(
    (nextLeverage: number) => {
      setMobileLeverage(nextLeverage);
      if (!tradingApiEnabled || cashBalance == null || obLastPx == null || obLastPx <= 0) return;
      const nextMaxQty = Math.floor((cashBalance * nextLeverage) / obLastPx);
      if (!Number.isFinite(nextMaxQty) || nextMaxQty <= 0) return;
      setOrderQtyStr(String(Math.max(1, Math.floor((nextMaxQty * mobileSizePct) / 100))));
    },
    [tradingApiEnabled, cashBalance, obLastPx, mobileSizePct],
  );

  const cycleLeverage = useCallback(() => {
    const currentIndex = LEVERAGE_OPTIONS.findIndex((value) => value === mobileLeverage);
    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % LEVERAGE_OPTIONS.length : 0;
    applyOrderLeverage(LEVERAGE_OPTIONS[nextIndex]);
  }, [applyOrderLeverage, mobileLeverage]);

  const handleOrderKindChange = useCallback((kind: OrderKind) => {
    setOrderKind(kind);
    if (kind === 'market') setOrderPriceStr('');
  }, []);

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
  const estimatedOrderCost = useMemo(() => {
    if (effectiveOrderPrice == null || parsedOrderQty <= 0) return 0;
    return effectiveOrderPrice * parsedOrderQty;
  }, [effectiveOrderPrice, parsedOrderQty]);

  const fillCurrentPrice = useCallback(() => {
    if (obLastPx == null || !Number.isFinite(obLastPx) || obLastPx <= 0) return;
    setOrderKind('limit');
    setOrderPriceStr(formatOrderInputPrice(obLastPx, obPriceDecimals));
  }, [obLastPx, obPriceDecimals]);

  const adjustOrderPrice = useCallback(
    (direction: -1 | 1) => {
      const priceStep = obPriceDecimals > 0 ? 1 / 10 ** obPriceDecimals : 1;
      const base = effectiveOrderPrice ?? obLastPx ?? priceStep;
      const next = Math.max(priceStep, base + priceStep * direction);
      setOrderKind('limit');
      setOrderPriceStr(formatOrderInputPrice(next, obPriceDecimals));
    },
    [effectiveOrderPrice, obLastPx, obPriceDecimals],
  );

  const adjustOrderQty = useCallback(
    (direction: -1 | 1) => {
      const base = parsedOrderQty > 0 ? parsedOrderQty : 1;
      const next = Math.max(1, base + direction);
      setOrderQtyStr(String(next));
    },
    [parsedOrderQty],
  );

  const fillMaxQty = useCallback(() => {
    if (mobileMaxQty == null) return;
    setOrderQtyStr(String(mobileMaxQty));
  }, [mobileMaxQty]);

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

  const [chargeCurrency, setChargeCurrency] = useState<'KRW' | 'USDT'>('KRW');

  const submitCharge = async () => {
    if (!session?.accessToken || !getMarketApiBase()) return;
    let n: number;
    if (chargeCurrency === 'USDT') {
      n = parseFloat(chargeAmountStr);
    } else {
      n = parseInt(chargeAmountStr.replace(/\D/g, ''), 10);
    }
    if (!Number.isFinite(n) || n <= 0) {
      setChargeErr('충전 금액을 입력하세요.');
      return;
    }
    setChargeBusy(true);
    setChargeErr(null);
    try {
      await chartSubmitChargeRequest(session, n, chargeMemo.trim(), chargeCurrency);
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
        {/* 통화 선택 */}
        <div className="fcCurrencyTabs">
          <button type="button" className={`fcCurrencyTab${chargeCurrency === 'KRW' ? ' fcCurrencyTab--active' : ''}`} onClick={() => { setChargeCurrency('KRW'); setChargeAmountStr(''); }}>₩ KRW</button>
          <button type="button" className={`fcCurrencyTab${chargeCurrency === 'USDT' ? ' fcCurrencyTab--active' : ''}`} onClick={() => { setChargeCurrency('USDT'); setChargeAmountStr(''); }}>$ USDT</button>
        </div>
        <label className="fcChargeLabel" htmlFor="fc-charge-amt">
          금액 {chargeCurrency === 'USDT' ? '(USDT)' : '(원)'}
        </label>
        <input
          id="fc-charge-amt"
          className="fcChargeInput"
          inputMode={chargeCurrency === 'USDT' ? 'decimal' : 'numeric'}
          value={chargeAmountStr}
          onChange={(e) => setChargeAmountStr(e.target.value)}
          placeholder={chargeCurrency === 'USDT' ? '예: 100.00' : '예: 100000'}
        />
        {chargeCurrency === 'KRW' && chargeAmountStr && Number(chargeAmountStr.replace(/\D/g, '')) > 0 && (
          <p className="fcChargeHint">≈ {(Number(chargeAmountStr.replace(/\D/g, '')) / usdKrw).toFixed(2)} USDT (참고)</p>
        )}
        {chargeCurrency === 'USDT' && chargeAmountStr && parseFloat(chargeAmountStr) > 0 && (
          <p className="fcChargeHint">≈ ₩{Math.round(parseFloat(chargeAmountStr) * usdKrw).toLocaleString('ko-KR')} (참고)</p>
        )}
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

  /* ── 전환 모달 ── */
  const convertModal = convertOpen ? (
    <div
      className="fcChargeModalRoot"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => { if (e.target === e.currentTarget) { setConvertOpen(false); setConvertMsg(null); } }}
    >
      <div className="fcChargeModal">
        <h2 className="fcChargeModalTitle">잔액 전환</h2>
        <p className="htsMuted">현재 환율 <strong>1 USD = ₩{usdKrw.toLocaleString('ko-KR')}</strong> (Frankfurter)</p>
        <div className="fcCurrencyTabs" style={{ marginBottom: '0.85rem' }}>
          <button type="button" className={`fcCurrencyTab${convertFrom === 'KRW' ? ' fcCurrencyTab--active' : ''}`} onClick={() => { setConvertFrom('KRW'); setConvertAmtStr(''); setConvertMsg(null); }}>₩ → USDT</button>
          <button type="button" className={`fcCurrencyTab${convertFrom === 'USDT' ? ' fcCurrencyTab--active' : ''}`} onClick={() => { setConvertFrom('USDT'); setConvertAmtStr(''); setConvertMsg(null); }}>USDT → ₩</button>
        </div>
        <div className="fcConvertBalRow">
          <span>{convertFrom === 'KRW' ? '₩ 잔액' : 'USDT 잔액'}</span>
          <strong>{convertFrom === 'KRW' ? `₩${(cashBalance ?? 0).toLocaleString('ko-KR')}` : `${(usdtBalance ?? 0).toFixed(4)} USDT`}</strong>
        </div>
        <label className="fcChargeLabel" htmlFor="fc-conv-amt">
          전환 금액 {convertFrom === 'KRW' ? '(원)' : '(USDT)'}
        </label>
        <input
          id="fc-conv-amt"
          className="fcChargeInput"
          inputMode={convertFrom === 'USDT' ? 'decimal' : 'numeric'}
          value={convertAmtStr}
          onChange={(e) => { setConvertAmtStr(e.target.value); setConvertMsg(null); }}
          placeholder={convertFrom === 'KRW' ? '예: 100000' : '예: 100.00'}
        />
        {/* 환산 미리보기 */}
        {(() => {
          const v = parseFloat(convertAmtStr);
          if (!v || v <= 0) return null;
          if (convertFrom === 'KRW') {
            return <p className="fcChargeHint">→ ≈ {(v / usdKrw).toFixed(4)} USDT</p>;
          } else {
            return <p className="fcChargeHint">→ ≈ ₩{Math.round(v * usdKrw).toLocaleString('ko-KR')}</p>;
          }
        })()}
        {convertMsg ? <p className={convertMsg.startsWith('✓') ? 'fcChargeHint fcChargeHint--ok' : 'fcChargeErr'}>{convertMsg}</p> : null}
        <div className="fcChargeActions">
          <button type="button" className="btn-ghost btn-sm" onClick={() => { setConvertOpen(false); setConvertMsg(null); }}>취소</button>
          <button
            type="button"
            className="symBtn"
            disabled={convertBusy}
            onClick={async () => {
              if (!session?.accessToken) return;
              const v = parseFloat(convertAmtStr);
              if (!v || v <= 0) { setConvertMsg('금액을 입력하세요.'); return; }
              setConvertBusy(true);
              setConvertMsg(null);
              try {
                const r: ConvertResult = await chartConvertBalance(session, convertFrom, v);
                setCashBalance(r.krw);
                setUsdtBalance(r.usdt);
                setConvertAmtStr('');
                setConvertMsg(`✓ 전환 완료 · ₩${r.krw.toLocaleString('ko-KR')} / ${r.usdt.toFixed(4)} USDT`);
              } catch (e) {
                setConvertMsg(e instanceof Error ? e.message : String(e));
              } finally {
                setConvertBusy(false);
              }
            }}
          >
            {convertBusy ? '처리 중…' : '전환'}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  const renderFeedModeToggle = () => (
    <div className="htsFeedModeToggle" role="tablist" aria-label="수신 모드">
      <button
        type="button"
        role="tab"
        aria-selected={feedMode === 'demo'}
        className={`htsFeedModeBtn${feedMode === 'demo' ? ' htsFeedModeBtn--active' : ''}`}
        onClick={() => setFeedMode('demo')}
      >
        DEMO
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={feedMode === 'live'}
        className={`htsFeedModeBtn${feedMode === 'live' ? ' htsFeedModeBtn--active' : ''}`}
        onClick={() => setFeedMode('live')}
      >
        LIVE
      </button>
    </div>
  );

  const renderFeedLogPanel = () => (
    <div className="htsFeedLogPanel">
      <div className="htsFeedLogHead">
        <strong>수신 기록</strong>
        <span>{feedMode === 'demo' ? '데모 기록' : '라이브 기록'}</span>
      </div>
      {feedLogs.length > 0 ? (
        <div className="htsFeedLogList">
          {feedLogs.map((entry) => (
            <article key={entry.id} className={`htsFeedLogItem htsFeedLogItem--${entry.mode}`}>
              <div className="htsFeedLogMeta">
                <span className={`htsFeedLogMode htsFeedLogMode--${entry.mode}`}>{entry.mode.toUpperCase()}</span>
                <span>{new Date(entry.at).toLocaleTimeString('ko-KR', { hour12: false })}</span>
              </div>
              <p>{entry.text}</p>
            </article>
          ))}
        </div>
      ) : (
        <div className="htsFeedLogEmpty">수신 기록을 준비 중입니다.</div>
      )}
    </div>
  );

  const symbolTabs =
    FUTURES_WATCHLIST.length > 1 ? (
      <div className="htsSymbolTabs" role="tablist" aria-label="심볼 선택">
        {FUTURES_WATCHLIST.map((item) => {
          const live = liveById[item.id];
          const price = live?.lastPrice ?? item.lastPrice;
          const changePct = live?.changePct ?? item.changePct;
          const toneClass = changePct > 0 ? 'wlNum--up' : changePct < 0 ? 'wlNum--down' : 'wlNum--flat';
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={selectedWatchId === item.id}
              className={`htsSymbolTab${selectedWatchId === item.id ? ' htsSymbolTab--active' : ''}`}
              onClick={() => handleWatchSelect(item)}
            >
              <span className="htsSymbolTabCode">{item.code}</span>
              <span className={`htsSymbolTabPrice ${toneClass}`}>{formatLivePrice(price, item.priceDecimals)}</span>
            </button>
          );
        })}
      </div>
    ) : null;

  const recordContent =
    recordTab === 'positions' ? (
      positionSnapshot.side === 'flat' ? (
        <div className="htsRecordEmpty">현재 보유 중인 포지션이 없습니다.</div>
      ) : (
        <article className={`htsRecordPosition htsRecordPosition--${positionSnapshot.side}`}>
          <div className="htsRecordPositionHead">
            <div>
              <strong>{positionSnapshot.side === 'long' ? 'LONG' : 'SHORT'}</strong>
              <p>{displaySymbolCode}</p>
            </div>
            <button type="button" className="htsPositionActionBtn" onClick={fillPositionQty}>
              수량 채우기
            </button>
          </div>
          <div className="htsRecordMetricGrid">
            <div className="htsRecordMetric">
              <span>수량</span>
              <strong>{Math.abs(positionSnapshot.netQty).toLocaleString('ko-KR')}</strong>
            </div>
            <div className="htsRecordMetric">
              <span>평단</span>
              <strong>{positionSnapshot.avgPrice != null ? formatLivePrice(positionSnapshot.avgPrice, obPriceDecimals) : '—'}</strong>
            </div>
            <div className="htsRecordMetric">
              <span>평가금액</span>
              <strong>
                {positionSnapshot.markValue != null ? `${Math.round(positionSnapshot.markValue).toLocaleString('ko-KR')}원` : '—'}
              </strong>
            </div>
            <div className="htsRecordMetric">
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
        </article>
      )
    ) : recordTab === 'openOrders' ? (
      <div className="htsRecordEmpty">현재 미체결 주문이 없습니다.</div>
    ) : recentPaperTrades.length > 0 ? (
      <div className="htsRecordTradeList">
        {recentPaperTrades.map((trade) => (
          <article key={trade.id} className="htsRecordTradeRow">
            <div className="htsRecordTradeMain">
              <strong className={trade.side === 'buy' ? 'wlNum--up' : 'wlNum--down'}>
                {trade.side === 'buy' ? '매수' : '매도'}
              </strong>
              <span>{trade.symbol}</span>
              <span>수량 {trade.qty.toLocaleString('ko-KR')}</span>
            </div>
            <div className="htsRecordTradeMeta">
              <span>{formatLivePrice(trade.price, trade.provider === 'kis' ? 0 : 5)}</span>
              <span>{new Date(trade.executed_at_ms).toLocaleTimeString('ko-KR', { hour12: false })}</span>
            </div>
          </article>
        ))}
      </div>
    ) : (
      <div className="htsRecordEmpty">아직 체결 기록이 없습니다.</div>
    );

  /* ── 레버리지 조정 모달 ─────────────────────────────── */
  const leverageModal = leverageModalOpen ? (
    <div
      className="fcLevModalRoot"
      role="dialog"
      aria-modal="true"
      aria-labelledby="fc-lev-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setLeverageModalOpen(false);
      }}
    >
      <div className="fcLevModal">
        <div className="fcLevModalTop">
          <h2 id="fc-lev-title" className="fcLevModalTitle">레버리지 조정</h2>
          <button type="button" className="fcLevModalClose" onClick={() => setLeverageModalOpen(false)} aria-label="닫기">
            <X size={18} weight="bold" />
          </button>
        </div>
        <div className="fcLevCurrentRow">
          <span>현재</span>
          <strong className="fcLevCurrent">{mobileLeverage}x</strong>
        </div>
        <div className="fcLevSliderWrap">
          <div className="htsLineSliderWrap">
            <div className="htsLineSliderRail" />
            <div
              className="htsLineSliderFill"
              style={{
                '--slider-pct': `${((mobileLeverage - 1) / (LEVERAGE_OPTIONS[LEVERAGE_OPTIONS.length - 1] - 1)) * 100}%`,
              } as React.CSSProperties}
            />
            <input
              type="range"
              className="htsLineSliderInput"
              min={1}
              max={LEVERAGE_OPTIONS[LEVERAGE_OPTIONS.length - 1]}
              step={1}
              value={mobileLeverage}
              onChange={(e) => setMobileLeverage(Number(e.target.value))}
            />
          </div>
          <div className="fcLevMarks">
            {LEVERAGE_OPTIONS.map((v) => (
              <button
                key={v}
                type="button"
                className={`fcLevMark${mobileLeverage === v ? ' fcLevMark--active' : ''}`}
                onClick={() => setMobileLeverage(v)}
              >
                {v}x
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          className="htsOrderBtn htsOrderBtn--buy"
          style={{ marginTop: '0.75rem', width: '100%' }}
          onClick={() => setLeverageModalOpen(false)}
        >
          확인
        </button>
      </div>
    </div>
  ) : null;

  if (isMobileViewport) {
    return (
      <section className="htsWorkspace htsWorkspace--mobile" aria-label="모바일 HTS 작업 영역">

        {/* ── 상단 헤더 ───────────────────────────────── */}
        <header className="htsMobileHeader">
          <div className="htsMobileTickerRow">
            <div className="htsMobileTickerMain">
              <div className="htsMobileTickerLine">
                <strong className="htsMobileTickerSymbol">{displaySymbolCode}</strong>
                <strong className={`htsMobileTickerPrice ${priceToneClass}`}>{displayPriceText}</strong>
                <span className={`htsMobileTickerChange ${priceToneClass}`}>
                  {mobileChangePct > 0 ? '+' : ''}
                  {mobileChangePct.toFixed(2)}%
                </span>
              </div>
              <p className="htsMobileTickerName">{displaySymbolName}</p>
            </div>
            <div className="htsMobileStatusBadge" aria-hidden="true" style={{ display: 'none' }} />
          </div>
          <div className="htsMobileActionRow">
            {renderFeedModeToggle()}
            <button type="button" className="htsMobileLevBtnNew" onClick={() => setLeverageModalOpen(true)}>
              <Lightning size={14} weight="fill" />
              레버리지 {mobileLeverage}x
            </button>
          </div>
          {symbolTabs}
        </header>

        {/* ── 주문 탭 ─────────────────────────────────── */}
        {mobileTab === 'trade' && (
          <div className="htsMobileTradeLayout">

            {/* 상단: [오더북] [주문] 좌우 */}
            <div className="htsMobileTopRow">

              {/* 오더북 */}
              <section className="htsMobileBookSection htsMobileBookSection--tall" aria-label="모바일 오더북">
                <div className="htsSectionHead htsSectionHead--sm">
                  <strong><BookOpen size={13} weight="duotone" style={{verticalAlign:'middle',marginRight:'0.25rem'}}/>Depth</strong>
                  <span>{Math.max(obAsks.length, obBids.length)}단</span>
                </div>
                <div className="htsMobileBookScroll">
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
                    maxDepth={7}
                    onPriceSelect={handleOrderbookPriceSelect}
                  />
                </div>
              </section>

              {/* 주문 패널 */}
              <section className="htsMobileOrderSection htsMobileOrderSection--scroll" aria-label="모바일 주문 패널">
                <div className="htsSectionHead htsSectionHead--sm">
                  <strong><PencilSimpleLine size={13} weight="duotone" style={{verticalAlign:'middle',marginRight:'0.25rem'}}/>주문</strong>
                  <span className={positionSnapshot.side !== 'flat' ? (positionSnapshot.side === 'long' ? 'mobilePosBadge--long' : 'mobilePosBadge--short') : ''}>
                    {positionSnapshot.side === 'flat' ? '없음' : positionSnapshot.side === 'long' ? 'LONG' : 'SHORT'}
                  </span>
                </div>

                <div className="htsOrderPanelBody htsOrderPanelBody--compact">
                  <div className="htsOrderFieldBlock">
                    <span className="htsOrderFieldLabel">타입</span>
                    <OrderKindToggle value={orderKind} onChange={handleOrderKindChange} />
                  </div>

                  <div className="htsOrderInputRow">
                    <label className="htsOrderFieldBlock">
                      <span className="htsOrderFieldLabel">가격</span>
                      <div className="htsStepInput">
                        <button type="button" className="htsStepInputBtn htsStepInputBtn--circle" onClick={() => adjustOrderPrice(-1)}>−</button>
                        <input
                          placeholder={orderKind === 'market' ? '시장가' : '가격'}
                          inputMode="decimal"
                          disabled={orderKind === 'market'}
                          value={orderKind === 'market' ? (obLastPx != null ? String(obLastPx) : '') : orderPriceStr}
                          onChange={(e) => setOrderPriceStr(e.target.value)}
                        />
                        <button type="button" className="htsStepInputBtn htsStepInputBtn--circle" onClick={() => adjustOrderPrice(1)}>+</button>
                      </div>
                    </label>
                    <button type="button" className="htsGhostActionBtn htsGhostActionBtn--sm" onClick={fillCurrentPrice}>
                      <ArrowsClockwise size={12} weight="bold" style={{verticalAlign:'middle',marginRight:'0.2rem'}}/>현재가
                    </button>
                  </div>

                  <div className="htsOrderInputRow">
                    <label className="htsOrderFieldBlock">
                      <span className="htsOrderFieldLabel">수량</span>
                      <div className="htsStepInput">
                        <button type="button" className="htsStepInputBtn htsStepInputBtn--circle" onClick={() => adjustOrderQty(-1)}>−</button>
                        <input placeholder="수량" inputMode="numeric" value={orderQtyStr} onChange={(e) => setOrderQtyStr(e.target.value)} />
                        <button type="button" className="htsStepInputBtn htsStepInputBtn--circle" onClick={() => adjustOrderQty(1)}>+</button>
                      </div>
                    </label>
                    <button type="button" className="htsGhostActionBtn htsGhostActionBtn--sm" onClick={fillMaxQty}>
                      <ArrowUp size={12} weight="bold" style={{verticalAlign:'middle',marginRight:'0.2rem'}}/>최대
                    </button>
                  </div>

                  {/* 수량 레버 */}
                  <div className="htsSizingLever">
                    <div className="htsSizingLeverTrack">
                      <input
                        type="range"
                        className="htsSizingLeverInput"
                        min={0}
                        max={100}
                        step={1}
                        value={mobileSizePct}
                        onChange={(e) => applyOrderSizing(Number(e.target.value))}
                      />
                      <div className="htsSizingLeverFill" style={{ '--lev-pct': `${mobileSizePct}%` } as React.CSSProperties} />
                    </div>
                    <div className="htsSizingLeverMarks">
                      {[0, 25, 50, 75, 100].map((v) => (
                        <button key={v} type="button" className="htsSizingLeverMark" onClick={() => applyOrderSizing(v)}>
                          {v === 0 ? '' : `${v}%`}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="htsSizingLeverInfo">
                    <span>잔고 <b>{tradingApiEnabled ? (cashBalance != null ? `${cashBalance.toLocaleString('ko-KR')}₩` : '…') : '—'}</b></span>
                    <span>비용 <b>{estimatedOrderCost > 0 ? `${Math.round(estimatedOrderCost).toLocaleString('ko-KR')}₩` : '0₩'}</b></span>
                  </div>

                  {/* 매수/매도 버튼 — 상하 배치 */}
                  <div className="htsOrderActions htsOrderActions--stack">
                    <button type="button" className="htsOrderBtn htsOrderBtn--buy" disabled={tradeBusy} onClick={() => void runPaperOrder('buy')}>
                      <ArrowUp size={14} weight="bold" style={{verticalAlign:'middle',marginRight:'0.3rem'}}/>매수 / Long
                    </button>
                    <button type="button" className="htsOrderBtn htsOrderBtn--sell" disabled={tradeBusy} onClick={() => void runPaperOrder('sell')}>
                      <ArrowDown size={14} weight="bold" style={{verticalAlign:'middle',marginRight:'0.3rem'}}/>매도 / Short
                    </button>
                  </div>
                  {tradeMsg ? <p className="htsOrderTradeMsg">{tradeMsg}</p> : null}
                </div>
              </section>
            </div>

            {/* 하단: 포지션 영역 */}
            <div className="htsMobilePosRow">
              {/*<div className="htsMobilePosDividerRow">*/}
              {/*  <span>포지션</span>*/}
              {/*</div>*/}
              <div className="htsRecordTabs htsRecordTabs--sm" role="tablist">
                {RECORD_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={recordTab === tab.id}
                    className={`htsRecordTab htsRecordTab--sm${recordTab === tab.id ? ' htsRecordTab--active' : ''}`}
                    onClick={() => setRecordTab(tab.id)}
                  >
                    {tab.icon}{tab.label}
                  </button>
                ))}
              </div>
              <div className="htsMobilePosBody">{recordContent}</div>
            </div>

          </div>
        )}

        {/* ── 차트 탭 — 항상 DOM 유지(차트 초기화 보장), 비활성 탭은 CSS로 숨김 */}
        <div className={`htsMobileChartTab${mobileTab === 'chart' ? '' : ' htsMobileChartTab--hidden'}`} aria-hidden={mobileTab !== 'chart'}>
          <div className="htsTfBar" role="toolbar" aria-label="봉 간격">
            {CHART_TF_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`htsTfBtn${timeframe === option.id ? ' htsTfBtn--active' : ''}`}
                onClick={() => setTimeframe(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="htsMobileChartWrap htsChartWrap chartWrap" ref={wrapRef} />
          {/* 차트 탭 하단 — 주문 탭 바로가기 */}
          <div className="htsMobileChartOrderBar">
            <button type="button" className="htsOrderBtn htsOrderBtn--buy htsMobileChartOrderBtn" onClick={() => setMobileTab('trade')}>
              매수 / Long
            </button>
            <button type="button" className="htsOrderBtn htsOrderBtn--sell htsMobileChartOrderBtn" onClick={() => setMobileTab('trade')}>
              매도 / Short
            </button>
          </div>
        </div>

        {/* ── 공지 탭 ─────────────────────────────────── */}
        {mobileTab === 'notice' && (
          <div className="htsMobileNoticeTab">
            <div className="htsSectionHead">
              <strong>공지·상태</strong>
              <span>{timeStr}</span>
            </div>
            <div className="htsInfoList">
              <div className="htsInfoRow"><span>연결 상태</span><strong>{statusText}</strong></div>
              <div className="htsInfoRow"><span>최근 체결</span><strong>{lastTick ?? '체결 대기'}</strong></div>
              <div className="htsInfoRow"><span>실시간 누적</span><strong>{liveTapeCount.toLocaleString('ko-KR')}건</strong></div>
            </div>
            {renderFeedLogPanel()}
          </div>
        )}

        {/* ── 계정 탭 ─────────────────────────────────── */}
        {mobileTab === 'account' && (
          <div className="htsMobileAccountTab">
            <div className="htsSectionHead">
              <strong>계정</strong>
              <span>{tradingApiEnabled ? '모의거래' : '로그인 필요'}</span>
            </div>
            <div className="htsAccountGrid">
              <div className="htsAccountMetric"><span>잔고</span><strong>{tradingApiEnabled ? (cashBalance != null ? `${cashBalance.toLocaleString('ko-KR')}원` : '…') : '—'}</strong></div>
              <div className="htsAccountMetric"><span>레버리지</span><strong>{mobileLeverage}x</strong></div>
              <div className="htsAccountMetric"><span>보유</span><strong>{Math.abs(netPaperQty).toLocaleString('ko-KR')}</strong></div>
              <div className="htsAccountMetric">
                <span>PnL</span>
                <strong className={positionSnapshot.unrealized != null && positionSnapshot.unrealized > 0 ? 'wlNum--up' : positionSnapshot.unrealized != null && positionSnapshot.unrealized < 0 ? 'wlNum--down' : 'wlNum--flat'}>
                  {positionSnapshot.unrealized != null ? `${Math.round(positionSnapshot.unrealized).toLocaleString('ko-KR')}원` : '—'}
                </strong>
              </div>
            </div>
            {tradingApiEnabled ? (
              <button type="button" className="htsOrderChargeOpen" onClick={() => setChargeOpen(true)}>
                충전 신청
              </button>
            ) : null}
          </div>
        )}

        {/* ── 하단 고정 내비게이션 ──────────────────────── */}
        <nav className="htsMobileBottomNav htsMobileBottomNav--fixed" aria-label="하단 내비게이션">
          <button
            type="button"
            className={`htsMobileBottomNavItem${mobileTab === 'trade' ? ' htsMobileBottomNavItem--active' : ''}`}
            onClick={() => setMobileTab('trade')}
          >
            <Swap size={22} weight={mobileTab === 'trade' ? 'fill' : 'regular'} />
            <span>주문</span>
          </button>
          <button
            type="button"
            className={`htsMobileBottomNavItem${mobileTab === 'chart' ? ' htsMobileBottomNavItem--active' : ''}`}
            onClick={() => setMobileTab('chart')}
          >
            <ChartLine size={22} weight={mobileTab === 'chart' ? 'fill' : 'regular'} />
            <span>차트</span>
          </button>
          <button
            type="button"
            className={`htsMobileBottomNavItem${mobileTab === 'notice' ? ' htsMobileBottomNavItem--active' : ''}`}
            onClick={() => setMobileTab('notice')}
          >
            <BellSimple size={22} weight={mobileTab === 'notice' ? 'fill' : 'regular'} />
            <span>공지</span>
          </button>
          <button
            type="button"
            className={`htsMobileBottomNavItem${mobileTab === 'account' ? ' htsMobileBottomNavItem--active' : ''}`}
            onClick={() => setMobileTab('account')}
          >
            <User size={22} weight={mobileTab === 'account' ? 'fill' : 'regular'} />
            <span>계정</span>
          </button>
        </nav>

        {chargeModal}
        {convertModal}
        {leverageModal}
      </section>
    );
  }

  return (
    <section className="htsWorkspace htsWorkspace--deskLayout" aria-label="HTS 작업 영역">
      <header className="htsDeskTopbar">
        <div className="htsDeskTicker">
          <strong className="htsDeskTickerSymbol">{displaySymbolCode}</strong>
          <strong className={`htsDeskTickerPrice ${priceToneClass}`}>{displayPriceText}</strong>
          <span className={`htsDeskTickerChange ${priceToneClass}`}>
            {mobileChangePct > 0 ? '+' : ''}
            {mobileChangePct.toFixed(2)}%
          </span>
        </div>
        <div className="htsDeskTopbarMeta">
          {renderFeedModeToggle()}
          {/*<span className="htsDeskInfoChip">오더북 {Math.max(obAsks.length, obBids.length)}단</span>*/}
          <span className="htsDeskInfoChip">{currentTfLabel}</span>
          <button type="button" className="htsDeskInfoChip htsDeskInfoChip--action" onClick={cycleLeverage}>
            <Lightning size={12} weight="fill" style={{verticalAlign:'middle',marginRight:'0.2rem'}}/>레버리지 {mobileLeverage}x
          </button>
        </div>
      </header>

      {symbolTabs}

      <div className="htsDeskMain">
        <section className="htsDeskChartPane" aria-label="차트">
          <div className="htsSectionHead">
            <strong><ChartLine size={14} weight="duotone" style={{verticalAlign:'middle',marginRight:'0.3rem'}}/>차트</strong>
            <span>{statusText}</span>
          </div>
          <div className="htsTfBar" role="toolbar" aria-label="봉 간격">
            {CHART_TF_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`htsTfBtn${timeframe === option.id ? ' htsTfBtn--active' : ''}`}
                onClick={() => setTimeframe(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="htsChartWrap chartWrap" ref={wrapRef} />
        </section>

        <section className="htsDeskBookPane" aria-label="오더북">
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
            maxDepth={8}
            onPriceSelect={handleOrderbookPriceSelect}
          />
        </section>

        <section className="htsDeskOrderPane" aria-label="주문하기">
          <div className="htsSectionHead">
            <strong><PencilSimpleLine size={14} weight="duotone" style={{verticalAlign:'middle',marginRight:'0.3rem'}}/>주문</strong>
            <span>{displaySymbolName}</span>
          </div>

          <div className="htsOrderPanelBody">
            {/* ─ 레버리지 레버 ─ */}
            <div className="htsDeskLevSection">
              <div className="htsDeskLevHead">
                <Lightning size={13} weight="fill" style={{verticalAlign:'middle',marginRight:'0.2rem'}}/>
                <span>레버리지</span>
                <strong className="htsDeskLevValue">{mobileLeverage}x</strong>
              </div>
              <div className="htsSizingLever">
                <div className="htsSizingLeverTrack">
                  <input
                    type="range"
                    className="htsSizingLeverInput"
                    min={1}
                    max={LEVERAGE_OPTIONS[LEVERAGE_OPTIONS.length - 1]}
                    step={1}
                    value={mobileLeverage}
                    onChange={(e) => setMobileLeverage(Number(e.target.value))}
                  />
                  <div className="htsSizingLeverFill" style={{ '--lev-pct': `${((mobileLeverage - 1) / (LEVERAGE_OPTIONS[LEVERAGE_OPTIONS.length - 1] - 1)) * 100}%` } as React.CSSProperties} />
                </div>
                <div className="htsSizingLeverMarks">
                  {LEVERAGE_OPTIONS.map((v) => (
                    <button key={v} type="button" className={`htsSizingLeverMark${mobileLeverage === v ? ' htsSizingLeverMark--active' : ''}`} onClick={() => setMobileLeverage(v)}>
                      {v}x
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="htsOrderFieldBlock">
              <span className="htsOrderFieldLabel">주문 타입</span>
              <OrderKindToggle value={orderKind} onChange={handleOrderKindChange} />
            </div>

            <div className="htsOrderInputRow">
              <label className="htsOrderFieldBlock">
                <span className="htsOrderFieldLabel">가격</span>
                <div className="htsStepInput">
                  <button type="button" className="htsStepInputBtn htsStepInputBtn--circle" onClick={() => adjustOrderPrice(-1)}>−</button>
                  <input
                    placeholder={orderKind === 'market' ? '시장가(현재가 사용)' : '가격'}
                    inputMode="decimal"
                    disabled={orderKind === 'market'}
                    value={orderKind === 'market' ? (obLastPx != null ? String(obLastPx) : '') : orderPriceStr}
                    onChange={(e) => setOrderPriceStr(e.target.value)}
                  />
                  <button type="button" className="htsStepInputBtn htsStepInputBtn--circle" onClick={() => adjustOrderPrice(1)}>+</button>
                </div>
              </label>
              <button type="button" className="htsGhostActionBtn" onClick={fillCurrentPrice}>
                <ArrowsClockwise size={12} weight="bold" style={{verticalAlign:'middle',marginRight:'0.2rem'}}/>현재가
              </button>
            </div>

            <div className="htsOrderInputRow">
              <label className="htsOrderFieldBlock">
                <span className="htsOrderFieldLabel">수량</span>
                <div className="htsStepInput">
                  <button type="button" className="htsStepInputBtn htsStepInputBtn--circle" onClick={() => adjustOrderQty(-1)}>−</button>
                  <input placeholder="수량" inputMode="numeric" value={orderQtyStr} onChange={(e) => setOrderQtyStr(e.target.value)} />
                  <button type="button" className="htsStepInputBtn htsStepInputBtn--circle" onClick={() => adjustOrderQty(1)}>+</button>
                </div>
              </label>
              <button type="button" className="htsGhostActionBtn" onClick={fillMaxQty}>
                <ArrowUp size={12} weight="bold" style={{verticalAlign:'middle',marginRight:'0.2rem'}}/>최대
              </button>
            </div>

            {/* 수량 레버 (웹도 동일) */}
            <div className="htsSizingLever">
              <div className="htsSizingLeverTrack">
                <input
                  type="range"
                  className="htsSizingLeverInput"
                  min={0} max={100} step={1}
                  value={mobileSizePct}
                  onChange={(e) => applyOrderSizing(Number(e.target.value))}
                />
                <div className="htsSizingLeverFill" style={{ '--lev-pct': `${mobileSizePct}%` } as React.CSSProperties} />
              </div>
              <div className="htsSizingLeverMarks">
                {[0, 25, 50, 75, 100].map((v) => (
                  <button key={v} type="button" className="htsSizingLeverMark" onClick={() => applyOrderSizing(v)}>
                    {v === 0 ? '' : `${v}%`}
                  </button>
                ))}
              </div>
            </div>

            <div className="htsSizingLeverInfo">
              <span>잔고 <b>{tradingApiEnabled ? (cashBalance != null ? `${cashBalance.toLocaleString('ko-KR')}원` : '…') : '—'}</b></span>
              <span>Max <b>{mobileMaxQty != null ? mobileMaxQty.toLocaleString('ko-KR') : '—'}</b></span>
              <span>비용 <b>{estimatedOrderCost > 0 ? `${Math.round(estimatedOrderCost).toLocaleString('ko-KR')}원` : '0원'}</b></span>
              <span>보유 <b>{netPaperQty.toLocaleString('ko-KR')}</b></span>
            </div>

            <div className="htsOrderActions">
              <button
                type="button"
                className="htsOrderBtn htsOrderBtn--buy"
                disabled={tradeBusy}
                onClick={() => void runPaperOrder('buy')}
              >
                <ArrowUp size={14} weight="bold" style={{verticalAlign:'middle',marginRight:'0.3rem'}}/>매수 / Long
              </button>
              <button
                type="button"
                className="htsOrderBtn htsOrderBtn--sell"
                disabled={tradeBusy}
                onClick={() => void runPaperOrder('sell')}
              >
                <ArrowDown size={14} weight="bold" style={{verticalAlign:'middle',marginRight:'0.3rem'}}/>매도 / Short
              </button>
            </div>

            {tradeMsg ? <p className="htsOrderTradeMsg">{tradeMsg}</p> : null}
          </div>
        </section>
      </div>

      <div className="htsDeskLower">
        <section className="htsRecordsSection" aria-label="포지션 및 주문내역">
          <div className="htsSectionHead">
            <strong><ListBullets size={14} weight="duotone" style={{verticalAlign:'middle',marginRight:'0.3rem'}}/>포지션 / 주문내역</strong>
            <span>{displaySymbolCode}</span>
          </div>
          <div className="htsRecordTabs" role="tablist" aria-label="포지션 및 주문 기록">
            {RECORD_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={recordTab === tab.id}
                className={`htsRecordTab${recordTab === tab.id ? ' htsRecordTab--active' : ''}`}
                onClick={() => setRecordTab(tab.id)}
              >
                {tab.icon}{tab.label}
              </button>
            ))}
          </div>
          <div className="htsRecordsBody">{recordContent}</div>
        </section>

        <aside className="htsDeskAccountPane" aria-label="계정 상태 및 잔고">
          <div className="htsSectionHead">
            <strong><Wallet size={14} weight="duotone" style={{verticalAlign:'middle',marginRight:'0.3rem'}}/>잔고 / 계정</strong>
            {tradingApiEnabled ? (
              <div style={{marginLeft:'auto',display:'flex',gap:'0.35rem'}}>
                <button type="button" className="htsAccChargeBtn htsAccChargeBtn--ghost" onClick={() => { setConvertOpen(true); setConvertMsg(null); }}>
                  전환
                </button>
                <button type="button" className="htsAccChargeBtn" onClick={() => setChargeOpen(true)}>
                  <CreditCard size={12} weight="duotone" style={{verticalAlign:'middle',marginRight:'0.2rem'}}/>충전
                </button>
              </div>
            ) : null}
          </div>

          {/* ── 잔고 항목 ── */}
          {(() => {
            const bal = tradingApiEnabled ? cashBalance : null;
            const usdtBal = tradingApiEnabled ? usdtBalance : null;
            const pnl = positionSnapshot.unrealized;
            const usdtPnl = pnl != null ? pnl / usdKrw : null;
            const withdrawable = bal != null ? Math.max(0, bal - (pnl != null && pnl < 0 ? Math.abs(pnl) : 0)) : null;
            const pnlClass = pnl == null ? '' : pnl > 0 ? ' htsAccVal--up' : pnl < 0 ? ' htsAccVal--down' : '';
            const fmt = (n: number | null, decimals = 0) =>
              n != null ? n.toLocaleString('ko-KR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) : '—';
            return (
              <div className="htsAccList">
                <div className="htsAccRow">
                  <span className="htsAccLabel">USDT</span>
                  <span className="htsAccVal">{usdtBal != null ? fmt(usdtBal, 2) : '—'}</span>
                </div>
                <div className="htsAccRow">
                  <span className="htsAccLabel">₩</span>
                  <span className="htsAccVal">{bal != null ? fmt(bal) : '—'}</span>
                </div>

                <div className="htsAccDivider" />

                <div className="htsAccSectionLabel">미실현손익</div>
                <div className="htsAccRow htsAccRow--sub">
                  <span className="htsAccLabel">USDT</span>
                  <span className={`htsAccVal${pnlClass}`}>{usdtPnl != null ? `${usdtPnl > 0 ? '+' : ''}${fmt(usdtPnl, 2)}` : '—'}</span>
                </div>
                <div className="htsAccRow htsAccRow--sub">
                  <span className="htsAccLabel">₩</span>
                  <span className={`htsAccVal${pnlClass}`}>{pnl != null ? `${pnl > 0 ? '+' : ''}${fmt(Math.round(pnl))}` : '—'}</span>
                </div>

                <div className="htsAccDivider" />

                <div className="htsAccRow">
                  <span className="htsAccLabel">출금 가능액</span>
                  <span className="htsAccVal">{withdrawable != null ? `₩ ${fmt(Math.round(withdrawable))}` : '—'}</span>
                </div>
              </div>
            );
          })()}

        </aside>
      </div>

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
      {convertModal}
    </section>
  );
}
