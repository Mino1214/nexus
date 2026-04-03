/** 좌측 마켓워치: 기본 행은 시드값, 브로커 틱으로 `WatchlistPanel` `liveById` 갱신 */

export type WatchInstrument = {
  id: string;
  code: string;
  name: string;
  lastPrice: number;
  priceDecimals: number;
  changePct: number;
  volume: number;
  indexTag?: boolean;
  /** 한투 국내주식 6자리 — 있으면 클릭 시 차트 구독 연동 */
  krxSubscribeCode?: string;
  /** 한투 지수선물(국내선물옵션) 실시간 TR 키 (예: "101W09") */
  kisIndexFuturesCode?: string;
  /** 한투 해외선물옵션 실시간 series_cd (HTS/API 종목마스터 기준 — 틀리면 시세·차트 없음) */
  kisOverseasSeriesCode?: string;
  /** 썸네일 색상 (hue) */
  hue?: number;
};

/** 전일대비 액가 등락 (등락률로 역산, TV 스타일 표시용) */
export function impliedChangeAbs(price: number, changePct: number): number {
  if (!Number.isFinite(price) || !Number.isFinite(changePct)) return 0;
  const prev = price / (1 + changePct / 100);
  return price - prev;
}

export const FUTURES_WATCHLIST: WatchInstrument[] = [
  // ── 지수선물
  {
    id: 'kospi200-a01606',
    code: 'KOSPI',
    name: '코스피200 선물',
    lastPrice: 799.15,
    priceDecimals: 2,
    changePct: 0,
    volume: 0,
    indexTag: true,
    hue: 205,
    // KIS 지수선물 단축코드 (현재 근월물, 만기 때 교체 필요)
    kisIndexFuturesCode: 'A01606',
  },
  {
    id: 'nq-cnqm26',
    code: 'NQ',
    name: '나스닥 E-mini',
    lastPrice: 23854,
    priceDecimals: 2,
    changePct: 0,
    volume: 0,
    indexTag: true,
    hue: 265,
    kisOverseasSeriesCode: 'CNQM26',
  },
  {
    id: 'es-cesm26',
    code: 'ES',
    name: 'S&P 500 E-mini',
    lastPrice: 6508,
    priceDecimals: 2,
    changePct: 0,
    volume: 0,
    indexTag: true,
    hue: 220,
    kisOverseasSeriesCode: 'CESM26',
  },
  {
    id: 'hsi-chsij26',
    code: 'HSI',
    name: '항셍 지수',
    lastPrice: 25116,
    priceDecimals: 0,
    changePct: 0,
    volume: 0,
    indexTag: true,
    hue: 10,
    kisOverseasSeriesCode: 'CHSIJ26',
  },
  // ── 원자재
  {
    id: 'cl-cclk26',
    code: 'CL',
    name: 'WTI 원유',
    lastPrice: 70.0,
    priceDecimals: 2,
    changePct: 0,
    volume: 0,
    hue: 30,
    kisOverseasSeriesCode: 'CCLK26',
  },
  {
    id: 'gc-cgcm26',
    code: 'GC',
    name: '금',
    lastPrice: 3020,
    priceDecimals: 1,
    changePct: 0,
    volume: 0,
    hue: 50,
    kisOverseasSeriesCode: 'CGCM26',
  },
  {
    id: 'si-csik26',
    code: 'SI',
    name: '은',
    lastPrice: 34.5,
    priceDecimals: 3,
    changePct: 0,
    volume: 0,
    hue: 200,
    kisOverseasSeriesCode: 'CSIK26',
  },
  // ── 통화선물
  {
    id: '6e-c6em26',
    code: '6E',
    name: '유로 EUR/USD',
    lastPrice: 1.1556,
    priceDecimals: 4,
    changePct: 0,
    volume: 0,
    hue: 150,
    kisOverseasSeriesCode: 'C6EM26',
  },
  {
    id: '6b-c6bm26',
    code: '6B',
    name: '파운드 GBP/USD',
    lastPrice: 1.3200,
    priceDecimals: 4,
    changePct: 0,
    volume: 0,
    hue: 300,
    kisOverseasSeriesCode: 'C6BM26',
  },
  {
    id: '6j-c6jm26',
    code: '6J',
    name: '엔화 JPY/USD',
    lastPrice: 0.006300,
    priceDecimals: 6,
    changePct: 0,
    volume: 0,
    hue: 0,
    kisOverseasSeriesCode: 'C6JM26',
  },
  {
    id: '6a-c6am26',
    code: '6A',
    name: '호주달러 AUD/USD',
    lastPrice: 0.6859,
    priceDecimals: 4,
    changePct: 0,
    volume: 0,
    hue: 170,
    kisOverseasSeriesCode: 'C6AM26',
  },
  {
    id: '6c-c6cm26',
    code: '6C',
    name: '캐나다달러 CAD/USD',
    lastPrice: 0.7208,
    priceDecimals: 4,
    changePct: 0,
    volume: 0,
    hue: 190,
    kisOverseasSeriesCode: 'C6CM26',
  },
  // ── 국내주식
  {
    id: 'kr-005380',
    code: '005380',
    name: '현대차',
    lastPrice: 198500,
    priceDecimals: 0,
    changePct: 0.38,
    volume: 892456,
    hue: 210,
    krxSubscribeCode: '005380',
  },
  {
    id: 'kr-068270',
    code: '068270',
    name: '셀트리온',
    lastPrice: 162800,
    priceDecimals: 0,
    changePct: -0.21,
    volume: 412300,
    hue: 175,
    krxSubscribeCode: '068270',
  },
  {
    id: 'kr-373220',
    code: '373220',
    name: 'LG에너지솔루션',
    lastPrice: 385500,
    priceDecimals: 0,
    changePct: 0.55,
    volume: 156780,
    hue: 320,
    krxSubscribeCode: '373220',
  },
  {
    id: 'kr-161390',
    code: '161390',
    name: '한국타이어앤테크놀로지',
    lastPrice: 42500,
    priceDecimals: 0,
    changePct: 0.12,
    volume: 245890,
    hue: 30,
    krxSubscribeCode: '161390',
  },
];

export type BrokerSyncFeed = {
  provider: 'kis' | 'kis-index' | 'kis-overseas';
  symbol: string;
};

function normKrx6(raw: string): string | null {
  const d = raw.replace(/\D/g, '');
  if (!d) return null;
  if (d.length > 6) return d.slice(0, 6);
  return d.padStart(6, '0');
}

/**
 * 브로커 `op: sync_watchlist` — 국내주식·지수선물만 일괄 구독.
 * 해외선물(kis-overseas)은 한투 WS가 동시 다건 구독에 민감해 연결이 끊기는 경우가 많아,
 * 차트에서 해당 종목을 선택할 때만 `subscribe`(포커스)로 구독합니다.
 */
export function buildBrokerSyncFeeds(items: readonly WatchInstrument[] = FUTURES_WATCHLIST): BrokerSyncFeed[] {
  const out: BrokerSyncFeed[] = [];
  for (const it of items) {
    // 국내주식 실시간 구독
    const k = it.krxSubscribeCode?.trim();
    if (k) out.push({ provider: 'kis', symbol: k });
    // 국내지수선물 실시간 구독
    const ki = it.kisIndexFuturesCode?.trim();
    if (ki) out.push({ provider: 'kis-index', symbol: ki });
    // 해외선물 — KIS WS 구독 아님, Yahoo Finance 시세 폴 전용
    const ko = it.kisOverseasSeriesCode?.trim();
    if (ko) out.push({ provider: 'kis-overseas', symbol: ko });
  }
  return out;
}

export const DEFAULT_BROKER_SYNC_FEEDS = buildBrokerSyncFeeds();

export function watchInstrumentIdsForBrokerTick(
  items: readonly WatchInstrument[],
  provider: BrokerSyncFeed['provider'],
  symbol: string,
): string[] {
  const sym = symbol.trim();
  const ids: string[] = [];
  for (const it of items) {
    if (provider === 'kis' && it.krxSubscribeCode) {
      const a = normKrx6(it.krxSubscribeCode);
      const b = normKrx6(sym);
      if (a && b && a === b) ids.push(it.id);
    } else if (provider === 'kis-index' && it.kisIndexFuturesCode?.trim() === sym) {
      ids.push(it.id);
    } else if (provider === 'kis-overseas' && it.kisOverseasSeriesCode?.trim() === sym) {
      ids.push(it.id);
    }
  }
  return ids;
}
