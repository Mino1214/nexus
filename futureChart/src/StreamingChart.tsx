import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CandlestickSeries,
  ColorType,
  createChart,
  type CandlestickData,
  type UTCTimestamp,
} from 'lightweight-charts';
import { OrderBookPanel, type BookLevel } from './OrderBookPanel';
import { FUTURES_WATCHLIST, type WatchInstrument } from './watchlistData';
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

type TickPayload = {
  type: 'tick';
  provider?: 'kis' | 'kis-index' | 'kis-overseas' | 'yahoo';
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
};

type StatusPayload = {
  type: 'status';
  source: string;
  state: string;
  message?: string;
};

type SymbolPayload = {
  type: 'symbol';
  provider?: 'kis' | 'kis-index' | 'kis-overseas' | 'yahoo';
  symbol: string;
};

type HistoryPayload = {
  type: 'history';
  provider?: 'yahoo';
  symbol: string;
  bars: Array<{ time: number; open: number; high: number; low: number; close: number }>;
};

function guessTickSize(px: number): number {
  const a = Math.abs(px);
  if (!Number.isFinite(a) || a <= 0) return 1;
  if (a < 1) return 0.0001;
  if (a < 10) return 0.0005;
  if (a < 100) return 0.01;
  if (a < 1000) return 0.1;
  if (a < 10000) return 0.25;
  return 1;
}

function synthBook(px: number, depth = 10): { asks: BookLevel[]; bids: BookLevel[] } {
  const step = guessTickSize(px);
  const asks: BookLevel[] = [];
  const bids: BookLevel[] = [];
  for (let i = 1; i <= depth; i++) {
    const qty = Math.max(1, Math.round((depth + 1 - i) * 8));
    asks.push({ price: px + step * i, qty });
    bids.push({ price: px - step * i, qty });
  }
  return { asks, bids };
}

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

/** WS 메시지 심볼과 현재 구독 심볼 매칭(KIS는 6자리 정규화, 선물·해외·Yahoo는 trim 일치) */
function messageMatchesFeed(
  msgProvider: string,
  msgSymbol: string,
  curProvider: 'kis' | 'kis-index' | 'kis-overseas' | 'yahoo',
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

export function StreamingChart() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null);
  const seriesRef = useRef<ReturnType<
    ReturnType<typeof createChart>['addSeries']
  > | null>(null);
  const bucketRef = useRef<number | null>(null);
  const barRef = useRef<CandlestickData<UTCTimestamp> | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const feedRef = useRef<{ provider: 'kis' | 'kis-index' | 'kis-overseas' | 'yahoo'; symbol: string }>({
    provider: 'kis',
    symbol: '005380',
  });
  const lastBookRef = useRef<Record<string, { asks: BookLevel[]; bids: BookLevel[] }>>({});

  const [feedProvider, setFeedProvider] = useState<'kis' | 'kis-index' | 'kis-overseas' | 'yahoo'>('kis');
  const [feedSymbol, setFeedSymbol] = useState('005380');
  const [symbolInput, setSymbolInput] = useState('005380');
  const [wsState, setWsState] = useState<'idle' | 'open' | 'closed' | 'error'>('idle');
  const [lastTick, setLastTick] = useState<string | null>(null);
  const [kisState, setKisState] = useState<string | null>(null);
  const [bookAsks, setBookAsks] = useState<BookLevel[]>([]);
  const [bookBids, setBookBids] = useState<BookLevel[]>([]);
  const [lastTradePx, setLastTradePx] = useState<number | null>(null);
  const [obRev, setObRev] = useState(0);
  const [tickRev, setTickRev] = useState(0);
  const [now, setNow] = useState(() => new Date());
  /** 첫 국내주식 행 기준으로 초기 선택(시연용) */
  const [selectedWatchId, setSelectedWatchId] = useState(
    FUTURES_WATCHLIST.find((w) => w.krxSubscribeCode)?.id ?? FUTURES_WATCHLIST[0]?.id ?? '',
  );
  const [chartUiTheme, setChartUiTheme] = useState<'light' | 'dark'>(readHtmlTheme);
  const [timeframe, setTimeframe] = useState<ChartTf>('1');
  const tfRef = useRef<ChartTf>('1');
  tfRef.current = timeframe;

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

  const selectedWatchInstrument = useMemo(
    () => FUTURES_WATCHLIST.find((w) => w.id === selectedWatchId) ?? null,
    [selectedWatchId],
  );

  const isYahoo = feedProvider === 'yahoo';

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const resetSeries = useCallback(() => {
    bucketRef.current = null;
    barRef.current = null;
    seriesRef.current?.setData([]);
    setBookAsks([]);
    setBookBids([]);
    setLastTradePx(null);
  }, []);

  const applyHistory = useCallback((bars: HistoryPayload['bars']) => {
    const series = seriesRef.current;
    if (!series) return;
    bucketRef.current = null;
    barRef.current = null;
    const out: CandlestickData<UTCTimestamp>[] = bars
      .filter(
        (b) =>
          Number.isFinite(b.time) &&
          Number.isFinite(b.open) &&
          Number.isFinite(b.high) &&
          Number.isFinite(b.low) &&
          Number.isFinite(b.close),
      )
      .map((b) => ({
        time: Math.floor(b.time) as UTCTimestamp,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
      }));
    series.setData(out);
  }, []);

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
    resetSeries();
  }, [timeframe, resetSeries]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    let stopped = false;
    let retry = 0;
    let timer: number | null = null;
    let ws: WebSocket | null = null;

    const onTick = (t: TickPayload) => {
      const bucket = bucketUtcSecForTf(t.ts, tfRef.current);
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

          if (msg.type === 'history' && 'bars' in msg && isForCurrent) {
            applyHistory((msg as HistoryPayload).bars);
          }
          if (msg.type === 'tick' && 'price' in msg && isForCurrent) {
            onTick(msg as TickPayload);
          }
          if (msg.type === 'orderbook' && 'asks' in msg && isForCurrent) {
            const ob = msg as OrderbookPayload;
            setBookAsks(ob.asks);
            setBookBids(ob.bids);
            setObRev((r) => r + 1);
            lastBookRef.current[`${cur.provider}:${cur.symbol}`] = { asks: ob.asks, bids: ob.bids };
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
            } else if (p === 'yahoo') {
              setFeedProvider('yahoo');
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
  }, [wsUrl]);

  useEffect(() => {
    const w = wsRef.current;
    if (w?.readyState === 1) {
      w.send(JSON.stringify({ op: 'subscribe', provider: feedProvider, symbol: feedSymbol }));
    }
    resetSeries();
  }, [feedProvider, feedSymbol, resetSeries]);

  const applySymbol = () => {
    const n = normalizeSymbol(symbolInput);
    if (!n) return;
    setFeedProvider('kis');
    setFeedSymbol(n);
    resetSeries();
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
    const y = item.yahooSymbol?.trim();
    if (y) {
      setFeedProvider('yahoo');
      setFeedSymbol(y);
    }
  }, []);

  const timeStr = now.toLocaleTimeString('ko-KR', { hour12: false });
  const dotClass = statusDotClass(wsState, kisState);

  const obSymbol = selectedWatchInstrument?.code ?? feedSymbol;
  const cached = lastBookRef.current[`${feedProvider}:${feedSymbol}`];
  const pxForSynth = lastTradePx ?? selectedWatchInstrument?.lastPrice ?? null;
  const synth = pxForSynth != null ? synthBook(pxForSynth, 10) : null;

  const obAsks = isYahoo ? (synth?.asks ?? []) : (bookAsks.length ? bookAsks : cached?.asks ?? []);
  const obBids = isYahoo ? (synth?.bids ?? []) : (bookBids.length ? bookBids : cached?.bids ?? []);
  const obLastPx = lastTradePx;

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
                  : selectedWatchInstrument.yahooSymbol
                    ? ' · 실시간(Yahoo)'
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
        <div className="htsTabBody" role="region" aria-label="실시간 시세">
          <p className="htsPanelTitle">실시간 시세</p>
          <p className="htsMuted">
            {lastTick ?? '체결 대기'} <span className="htsStatusSep">│</span> 현재가{' '}
            <strong className="htsSymFeed">{obLastPx != null ? obLastPx.toLocaleString('ko-KR') : '—'}</strong>
          </p>
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
        />
        <div className="htsOrderWrap" aria-label="주문하기">
          <p className="htsPanelTitle">주문하기</p>
          <div className="htsOrderGrid">
            <div className="htsOrderRow">
              <label>주문유형</label>
              <select defaultValue="limit">
                <option value="limit">지정가</option>
                <option value="market">시장가</option>
              </select>
            </div>
            <div className="htsOrderRow">
              <label>가격</label>
              <input placeholder="가격" inputMode="decimal" />
            </div>
            <div className="htsOrderRow">
              <label>수량</label>
              <input placeholder="수량" inputMode="numeric" />
            </div>
          </div>
          <div className="htsOrderActions">
            <button type="button" className="htsOrderBtn htsOrderBtn--buy">
              매수
            </button>
            <button type="button" className="htsOrderBtn htsOrderBtn--sell">
              매도
            </button>
          </div>
          <p className="htsMuted" style={{ marginTop: '0.45rem' }}>
            아직 주문 API 미연동(UI만 구성). 연결 시 현재 선택 종목/구독 종목 기준으로 주문 연동 가능합니다.
          </p>
        </div>
      </div>

      <aside className="htsRight" aria-label="관심">
        <WatchlistPanel selectedId={selectedWatchId} onSelect={handleWatchSelect} />
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
    </section>
  );
}
