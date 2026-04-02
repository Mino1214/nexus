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
  /** 데모용 국내주식(KIS) — 삼성·네이버·카카오 등 대형 IT/반도체 대표명은 제외 */
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
  {
    id: 'f-202606',
    code: 'F 202606',
    name: '국내선물-202606',
    lastPrice: 816.35,
    priceDecimals: 5,
    changePct: 3.13,
    volume: 216114,
    indexTag: true,
    hue: 210,
    // 지수선물 실시간(실전) 예시 코드. 실제 매핑은 종목 마스터 기준으로 교체하세요.
    kisIndexFuturesCode: '101W09',
  },
  {
    id: 'hsij26',
    code: 'HSIJ26',
    name: '홍콩 항셍지수-202604',
    lastPrice: 25390,
    priceDecimals: 5,
    changePct: 2.55,
    volume: 91242,
    indexTag: true,
    hue: 200,
    kisOverseasSeriesCode: 'DHSIJ26',
  },
  {
    id: 'nqm26',
    code: 'NQM26',
    name: '나스닥 지수-202606',
    lastPrice: 24106,
    priceDecimals: 5,
    changePct: 0.91,
    volume: 57840,
    indexTag: true,
    hue: 265,
    kisOverseasSeriesCode: 'CNQM26',
  },
  {
    id: 'esm26',
    code: 'ESM26',
    name: 'S&P500지수-202606',
    lastPrice: 6607.25,
    priceDecimals: 5,
    changePct: 0.69,
    volume: 97882,
    indexTag: true,
    hue: 250,
    kisOverseasSeriesCode: 'CESM26',
  },
  {
    id: 'clk26',
    code: 'CLK26',
    name: '크루드 오일-202605',
    lastPrice: 99.76,
    priceDecimals: 5,
    changePct: -1.93,
    volume: 41492,
    hue: 30,
    kisOverseasSeriesCode: 'CCLM26',
  },
  {
    id: 'gcm26',
    code: 'GCM26',
    name: '골드-202606',
    lastPrice: 4734.5,
    priceDecimals: 5,
    changePct: 0.77,
    volume: 47182,
    hue: 45,
    kisOverseasSeriesCode: 'CGCM26',
  },
  {
    id: 'sik26',
    code: 'SIK26',
    name: '실버-202605',
    lastPrice: 75.155,
    priceDecimals: 5,
    changePct: -0.43,
    volume: 8620,
    hue: 195,
    kisOverseasSeriesCode: 'CSIM26',
  },
  {
    id: '6am26',
    code: '6AM26',
    name: '호주 달러-202606',
    lastPrice: 0.6917,
    priceDecimals: 5,
    changePct: 0.32,
    volume: 36624,
    hue: 160,
    kisOverseasSeriesCode: 'C6AM26',
  },
  {
    id: '6bm26',
    code: '6BM26',
    name: '영국 파운드-202606',
    lastPrice: 1.3284,
    priceDecimals: 5,
    changePct: 0.45,
    volume: 14660,
    hue: 340,
    kisOverseasSeriesCode: 'C6BM26',
  },
  {
    id: '6cm26',
    code: '6CM26',
    name: '캐나다 달러-202606',
    lastPrice: 0.72185,
    priceDecimals: 5,
    changePct: 0.06,
    volume: 8851,
    hue: 175,
    kisOverseasSeriesCode: 'C6CM26',
  },
  {
    id: '6em26',
    code: '6EM26',
    name: '유로 F/X-202606',
    lastPrice: 1.16235,
    priceDecimals: 5,
    changePct: 0.28,
    volume: 29081,
    hue: 220,
    kisOverseasSeriesCode: 'C6EM26',
  },
  {
    id: '6jm26',
    code: '6JM26',
    name: '일본 엔-202606',
    /** 원문에 시세 미기재 — 실제 값으로 교체 가능 */
    lastPrice: 149.085,
    priceDecimals: 5,
    changePct: 0.18,
    volume: 12450,
    hue: 130,
    kisOverseasSeriesCode: 'C6JM26',
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

/** 브로커 `op: sync_watchlist` 페이로드 — 한 연결로 마켓워치 전 종목 구독(멀티플렉스) */
export function buildBrokerSyncFeeds(items: readonly WatchInstrument[] = FUTURES_WATCHLIST): BrokerSyncFeed[] {
  const out: BrokerSyncFeed[] = [];
  for (const it of items) {
    const k = it.krxSubscribeCode?.trim();
    if (k) out.push({ provider: 'kis', symbol: k });
    const ki = it.kisIndexFuturesCode?.trim();
    if (ki) out.push({ provider: 'kis-index', symbol: ki });
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
