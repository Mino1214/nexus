/** 좌측 마켓워치 표시용 (데모 정적 시세 — 실시간은 추후 API 연동) */

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
  /** 외부 시세 공급자 심볼 (예: Yahoo "ES=F", "^HSI") */
  yahooSymbol?: string;
  /** 한투 지수선물(국내선물옵션) 실시간 TR 키 (예: "101W09") */
  kisIndexFuturesCode?: string;
  /** 한투 해외선물옵션 실시간 TR 키 (예: "DNASAAPL") */
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
    yahooSymbol: '^HSI',
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
    yahooSymbol: 'NQ=F',
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
    yahooSymbol: 'ES=F',
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
    yahooSymbol: 'CL=F',
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
    yahooSymbol: 'GC=F',
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
    yahooSymbol: 'SI=F',
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
    yahooSymbol: '6A=F',
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
    yahooSymbol: '6B=F',
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
    yahooSymbol: '6C=F',
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
    yahooSymbol: '6E=F',
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
    yahooSymbol: '6J=F',
  },
];
