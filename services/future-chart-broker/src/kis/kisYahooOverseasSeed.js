/**
 * 해외선물 차트 시드 — Yahoo Finance 폴백 (KIS 해외선물 REST 미지원 계정용)
 *
 * KIS 실시간 WebSocket(HDFFF020)은 정상 동작하나,
 * KIS 해외선물 REST 과거 데이터 API가 계정에서 비활성 상태일 때
 * Yahoo Finance(query1.finance.yahoo.com)의 공개 chart API로 대신 취득합니다.
 *
 * 심볼 매핑 (KIS series_cd → Yahoo 심볼):
 *  - CNQM26  → NQ=F  (나스닥 E-mini 선물, rolling front month)
 *  - CNQ*    → NQ=F  (패턴 매칭)
 *
 * 타임존: Yahoo Finance 타임스탬프는 진짜 UTC seconds.
 *         해외선물 차트는 UTC 그대로 표시 (KST offset 미적용).
 */

import { loadBars, saveBars, getLatestBarTime } from '../db/barStore.js';

const YAHOO_UA = 'Mozilla/5.0 (compatible; future-chart-broker/0.1)';
const DEFAULT_OVERSEAS_QUOTE_POLL_MS = (() => {
  const raw = Number.parseInt(String(process.env.OVERSEAS_QUOTE_POLL_MS ?? '').trim(), 10);
  return Number.isFinite(raw) && raw >= 1_000 ? raw : 10_000;
})();

/**
 * KIS overseas series_cd → Yahoo Finance 심볼
 *
 * KIS WebSocket series_cd 앞에 'C'를 붙여서 전달함 (예: NQM26 → CNQM26).
 * Yahoo Finance의 continuous contract 심볼(=F)로 매핑.
 * 항셍선물은 Yahoo에서 선물이 없어 현물 지수(^HSI)로 대체.
 *
 * @param {string} seriesCd  CNQM26, CESM26, CCLK26, …
 * @returns {string | null}
 */
function seriesCodeToYahoo(seriesCd) {
  const s = String(seriesCd ?? '').trim().toUpperCase();

  // ── 지수선물
  if (s.startsWith('CNQ'))  return 'NQ=F';    // 나스닥 E-mini
  if (s.startsWith('CES'))  return 'ES=F';    // S&P 500 E-mini
  if (s.startsWith('CYM'))  return 'YM=F';    // 다우 E-mini
  if (s.startsWith('CRTM') || s.startsWith('CRTY')) return 'RTY=F'; // 러셀 2000
  if (s.startsWith('CHSI')) return '^HSI';    // 항셍 (선물 없어 현물 지수 대체)
  if (s.startsWith('CNK'))  return '^N225';   // 니케이(225) 현물 대체

  // ── 원자재
  if (s.startsWith('CCL'))  return 'CL=F';    // WTI 원유
  if (s.startsWith('CGC'))  return 'GC=F';    // 금
  if (s.startsWith('CSI'))  return 'SI=F';    // 은
  if (s.startsWith('CHG'))  return 'HG=F';    // 구리
  if (s.startsWith('CNG'))  return 'NG=F';    // 천연가스

  // ── 통화선물 (CME FX)
  if (s.startsWith('C6A'))  return '6A=F';    // 호주달러 AUD/USD
  if (s.startsWith('C6B'))  return '6B=F';    // 영국 파운드 GBP/USD
  if (s.startsWith('C6C'))  return '6C=F';    // 캐나다달러 CAD/USD
  if (s.startsWith('C6E'))  return '6E=F';    // 유로 EUR/USD
  if (s.startsWith('C6J'))  return '6J=F';    // 일본 엔 JPY/USD
  if (s.startsWith('C6S'))  return '6S=F';    // 스위스 프랑 CHF/USD
  if (s.startsWith('C6N'))  return '6N=F';    // 뉴질랜드달러 NZD/USD

  return null;
}

/**
 * Yahoo Finance v8 chart API 호출
 * @param {string} yahooSym  'NQ=F'
 * @param {string} interval  '1m' | '1d'
 * @param {string} range     '7d' | '2y'
 * @returns {Promise<Array<{time:number, open:number, high:number, low:number, close:number, volume:number}>>}
 */
async function fetchYahooChart(yahooSym, interval, range) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSym)}?interval=${interval}&range=${range}`;
  let res;
  try {
    res = await fetch(url, {
      headers: { 'User-Agent': YAHOO_UA, Accept: 'application/json' },
      signal: AbortSignal.timeout(20_000),
    });
  } catch (e) {
    throw new Error(`Yahoo Finance 요청 실패 (${yahooSym}): ${e?.message || e}`);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Yahoo Finance HTTP ${res.status} (${yahooSym}): ${text.slice(0, 120)}`);
  }

  let json;
  try {
    json = await res.json();
  } catch (e) {
    throw new Error(`Yahoo Finance JSON 파싱 실패 (${yahooSym})`);
  }

  const result = json?.chart?.result?.[0];
  if (!result) {
    const errMsg = json?.chart?.error?.description ?? '데이터 없음';
    throw new Error(`Yahoo Finance 데이터 없음 (${yahooSym}): ${errMsg}`);
  }

  const timestamps = result.timestamp;
  const q = result.indicators?.quote?.[0];
  if (!Array.isArray(timestamps) || !q) return [];

  /** @type {Array<{time:number, open:number, high:number, low:number, close:number, volume:number}>} */
  const bars = [];
  for (let i = 0; i < timestamps.length; i++) {
    const ts = timestamps[i];
    const o = q.open?.[i];
    const h = q.high?.[i];
    const l = q.low?.[i];
    const c = q.close?.[i];
    const v = q.volume?.[i];
    if (ts == null || c == null || !Number.isFinite(c) || c <= 0) continue;

    const open  = Number.isFinite(o) && o > 0 ? o : c;
    const high  = Number.isFinite(h) && h > 0 ? h : c;
    const low   = Number.isFinite(l) && l > 0 ? l : c;

    // 분봉은 분 경계로 내림
    const time = interval === '1m'
      ? Math.floor(ts / 60) * 60
      : Math.floor(ts / 86400) * 86400;  // 일봉은 일 경계

    bars.push({ time, open, high, low, close: c, volume: Number.isFinite(v) ? v : 0 });
  }

  // 정렬 + 분봉 중복 제거 (같은 분 버킷 → OHLC 병합)
  const barMap = new Map();
  for (const b of bars.sort((a, bb) => a.time - bb.time)) {
    const existing = barMap.get(b.time);
    if (existing) {
      existing.high  = Math.max(existing.high, b.high);
      existing.low   = Math.min(existing.low, b.low);
      existing.close = b.close;
      existing.volume += b.volume;
    } else {
      barMap.set(b.time, { ...b });
    }
  }
  return Array.from(barMap.values());
}

// ─────────────────────────────────────────
// 진행 중인 시드 추적 (중복 방지)
// ─────────────────────────────────────────
const seedingSet = new Set();

/**
 * 해외선물 차트 시드 메인 함수.
 * DB에 오늘 데이터가 있으면 즉시 broadcast, 없으면 Yahoo Finance에서 취득.
 *
 * @param {{
 *   hub: { broadcast: (p: unknown) => void },
 *   seriesCd: string,          KIS series_cd (e.g. 'CNQM26')
 *   stillSubscribed?: (cd: string) => boolean,
 * }} opts
 */
export async function seedOverseasFuturesChart(opts) {
  const seriesCd = String(opts.seriesCd ?? '').trim();
  if (!seriesCd) return;

  const yahooSym = seriesCodeToYahoo(seriesCd);
  if (!yahooSym) {
    console.warn(`[yahoo-seed] 알 수 없는 series_cd: ${seriesCd}`);
    opts.hub.broadcast({
      type: 'status',
      source: 'broker',
      state: 'no_history',
      message: `해외선물 ${seriesCd}: 과거 데이터 미지원 심볼`,
    });
    return;
  }

  const stillOk = () => !opts.stillSubscribed || opts.stillSubscribed(seriesCd);

  try {
    await seedMinuteBarsOverseas(opts.hub, seriesCd, yahooSym, stillOk);
    // 일봉은 백그라운드
    seedDailyBarsOverseasBackground(seriesCd, yahooSym);
  } catch (e) {
    console.warn('[yahoo-seed] chart seed 실패', seriesCd, e?.message || e);
  }
}

/**
 * 분봉 시드 (1m bars, 최대 7일치 → Yahoo Finance)
 * @param {{ broadcast: (p: unknown) => void }} hub
 * @param {string} seriesCd
 * @param {string} yahooSym
 * @param {() => boolean} stillOk
 */
async function seedMinuteBarsOverseas(hub, seriesCd, yahooSym, stillOk) {
  const sevenDaysAgo = Math.floor(Date.now() / 1000) - 7 * 86400;
  const nowSec = Math.floor(Date.now() / 1000);
  const todayMidnightUtc = Math.floor(nowSec / 86400) * 86400;
  const staleThreshold = 5 * 60; // 5분 이상 빠지면 갱신

  // 1. DB에서 최근 분봉 로드 → 있으면 바로 broadcast (포커스 중인 경우만)
  const latestInDb = getLatestBarTime(seriesCd, '1m');
  const cached = latestInDb ? loadBars(seriesCd, '1m', sevenDaysAgo) : [];
  if (cached.length > 0 && stillOk()) {
    hub.broadcast({ type: 'history', provider: 'kis-overseas', symbol: seriesCd, bars: cached });
    console.log(`[yahoo-seed] ${seriesCd} DB 캐시 즉시 broadcast (${cached.length}봉)`);
  }

  // 2. 이미 최신이면 fetch 불필요 (포커스 이탈 무관하게 skip)
  if (latestInDb && nowSec - latestInDb < staleThreshold) {
    return;
  }

  // 3. 중복 취득 방지
  if (seedingSet.has(seriesCd)) {
    console.log(`[yahoo-seed] ${seriesCd} 이미 취득 중, skip`);
    return;
  }
  seedingSet.add(seriesCd);
  console.log(`[yahoo-seed] ${seriesCd} (${yahooSym}) 분봉 취득 시작...`);

  try {
    // DB에 오늘 데이터가 아예 없으면 7일치 전체 취득, 있으면 오늘치만
    const range = (!latestInDb || latestInDb < todayMidnightUtc) ? '7d' : '1d';
    const bars = await fetchYahooChart(yahooSym, '1m', range);

    if (bars.length > 0) {
      // 포커스 이탈과 무관하게 항상 DB에 저장 (이후 클릭 시 즉시 로드 목적)
      saveBars(seriesCd, '1m', bars);
      if (stillOk()) {
        const allBars = loadBars(seriesCd, '1m', sevenDaysAgo);
        hub.broadcast({ type: 'history', provider: 'kis-overseas', symbol: seriesCd, bars: allBars });
        console.log(`[yahoo-seed] ${seriesCd} 분봉 저장+broadcast (${bars.length}봉)`);
      } else {
        console.log(`[yahoo-seed] ${seriesCd} 분봉 저장 완료 (${bars.length}봉, 포커스 이탈 broadcast 생략)`);
      }
    }
  } finally {
    seedingSet.delete(seriesCd);
  }
}

// ─────────────────────────────────────────
// 합성 호가 스냅샷 (KIS 해외선물 실시간 미수신 시 폴백)
// ─────────────────────────────────────────

/**
 * 심볼별 최소 호가 단위 (tick size)
 * Yahoo Finance 현재가 기준으로 호가창 레벨 생성 시 사용
 * @type {Record<string, number>}
 */
const TICK_SIZE = {
  'NQ=F':  0.25,
  'ES=F':  0.25,
  'YM=F':  1,
  'RTY=F': 0.10,
  '^HSI':  1,
  '^N225': 5,
  'CL=F':  0.01,
  'GC=F':  0.10,
  'SI=F':  0.005,
  'HG=F':  0.0005,
  'NG=F':  0.001,
  '6A=F':  0.00005,
  '6B=F':  0.0001,
  '6C=F':  0.00005,
  '6E=F':  0.00005,
  '6J=F':  0.0000005,
  '6S=F':  0.0001,
  '6N=F':  0.00005,
};

/**
 * Yahoo Finance 현재가 조회 → 합성 5단 호가창 생성 → broadcast
 *
 * KIS 실시간 HDFFF010이 데이터를 보내지 않을 때의 폴백.
 * 실제 주문 호가가 아니라 현재가 ±tick 레벨로 구성된 참고용 가격입니다.
 *
 * @param {{
 *   hub: { broadcast: (p: unknown) => void },
 *   seriesCd: string,
 *   stillOk?: () => boolean,
 * }} opts
 */
export async function broadcastOverseasFuturesObSnapshot(opts) {
  const { hub, seriesCd } = opts;
  const stillOk = opts.stillOk ?? (() => true);

  const yahooSym = seriesCodeToYahoo(seriesCd);
  if (!yahooSym) return;

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSym)}?interval=1m&range=1d`;
  let price = null;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': YAHOO_UA, Accept: 'application/json' },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return;
    const j = await res.json();
    price = j?.chart?.result?.[0]?.meta?.regularMarketPrice;
  } catch {
    return;
  }

  if (!price || !Number.isFinite(price) || !stillOk()) return;

  const tick = TICK_SIZE[yahooSym] ?? (price * 0.0001); // 기본: 가격의 0.01%
  const LEVELS = 10;

  /** @type {{ price: number; qty: number }[]} */
  const asks = [];
  /** @type {{ price: number; qty: number }[]} */
  const bids = [];

  for (let i = 1; i <= LEVELS; i++) {
    asks.push({ price: +(price + tick * i).toPrecision(10), qty: 0 });
    bids.push({ price: +(price - tick * i).toPrecision(10), qty: 0 });
  }

  hub.broadcast({
    type: 'orderbook',
    provider: 'kis-overseas',
    symbol: seriesCd,
    asks,
    bids,
    ts: Date.now(),
    synthetic: true, // 참고용 합성 호가 표시
  });
  console.log(`[yahoo-seed] ${seriesCd} 합성 호가 broadcast (현재가: ${price})`);
}

// ─────────────────────────────────────────
// 마켓워치 시세 폴링 (30초 주기 → quote_batch broadcast)
// ─────────────────────────────────────────

/**
 * Yahoo Finance 현재가·전일 종가 취득 (단건)
 * @param {string} yahooSym  'NQ=F'
 * @returns {Promise<{ price: number; prevClose: number; volume: number } | null>}
 */
async function fetchYahooQuote(yahooSym) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSym)}?interval=1d&range=2d`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': YAHOO_UA, Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const j = await res.json();
    const meta = j?.chart?.result?.[0]?.meta;
    if (!meta) return null;
    const price = Number(meta.regularMarketPrice);
    const prevClose = Number(meta.previousClose ?? meta.chartPreviousClose ?? meta.regularMarketPrice);
    const volume = Number(meta.regularMarketVolume ?? 0);
    if (!Number.isFinite(price) || price <= 0) return null;
    return { price, prevClose: prevClose > 0 ? prevClose : price, volume };
  } catch {
    return null;
  }
}

/**
 * 해외선물 마켓워치 전체 시세 폴링 시작
 *
 * 30초(기본)마다 watchlist 전체 종목의 Yahoo Finance 현재가를 조회하고
 * `quote_batch` 메시지로 broadcast합니다.
 *
 * @param {{
 *   hub: { broadcast: (p: unknown) => void },
 *   seriesCodes: readonly string[],
 *   intervalMs?: number,
 * }} opts
 * @returns {{ stop: () => void, refresh: (codes: readonly string[]) => void }}
 */
export function startOverseasQuotePoll({ hub, seriesCodes, intervalMs = DEFAULT_OVERSEAS_QUOTE_POLL_MS }) {
  let stopped = false;
  let running = false;
  let currentCodes = [...new Set(seriesCodes.map((code) => String(code ?? '').trim()).filter(Boolean))];
  let timer = /** @type {ReturnType<typeof setTimeout> | null} */ (null);

  const clearTimer = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const schedule = (delayMs = intervalMs) => {
    if (stopped) return;
    clearTimer();
    timer = setTimeout(() => {
      timer = null;
      void poll();
    }, Math.max(0, delayMs));
  };

  const poll = async () => {
    if (stopped || running) return;
    running = true;
    const codes = [...currentCodes];
    try {
      if (codes.length > 0) {
        /** @type {Array<{ provider: string; symbol: string; price: number; changePct: number; volume: number }>} */
        const quotes = [];

        for (const seriesCd of codes) {
          if (stopped) break;
          const yahooSym = seriesCodeToYahoo(seriesCd);
          if (!yahooSym) continue;
          try {
            const q = await fetchYahooQuote(yahooSym);
            if (!q) continue;
            const changePct = q.prevClose !== 0
              ? ((q.price - q.prevClose) / q.prevClose) * 100
              : 0;
            quotes.push({
              provider: 'kis-overseas',
              symbol: seriesCd,
              price: q.price,
              changePct: +changePct.toFixed(4),
              volume: q.volume,
              prevClose: q.prevClose,
            });
          } catch {
            // 개별 실패는 무시
          }
          // 요청 간 살짝 간격 (Yahoo 속도 제한 회피)
          await new Promise((r) => setTimeout(r, 150));
        }

        if (!stopped && quotes.length > 0) {
          hub.broadcast({ type: 'quote_batch', quotes });
          console.log(`[yahoo-poll] quote_batch ${quotes.length}개 broadcast`);
        }
      }
    } finally {
      running = false;
      schedule(intervalMs);
    }
  };

  // 즉시 1회 실행
  schedule(0);

  return {
    stop() {
      stopped = true;
      clearTimer();
    },
    refresh(newCodes) {
      currentCodes = [...new Set(newCodes.map((code) => String(code ?? '').trim()).filter(Boolean))];
      schedule(0);
    },
  };
}

/** 일봉 시딩 중인 심볼 추적 */
const dailySeedingSet = new Set();

/**
 * 일봉 백그라운드 취득·저장 (2년치 → DB)
 * @param {string} seriesCd
 * @param {string} yahooSym
 */
function seedDailyBarsOverseasBackground(seriesCd, yahooSym) {
  if (dailySeedingSet.has(seriesCd)) return;

  const latestDaily = getLatestBarTime(seriesCd, '1d');
  const nowSec = Math.floor(Date.now() / 1000);
  // 최근 1일 내 데이터 있으면 스킵
  if (latestDaily && nowSec - latestDaily < 86400 * 2) return;

  dailySeedingSet.add(seriesCd);
  void (async () => {
    try {
      console.log(`[yahoo-seed] ${seriesCd} 일봉 전체 취득 시작`);
      const bars = await fetchYahooChart(yahooSym, '1d', '2y');
      if (bars.length > 0) {
        saveBars(seriesCd, '1d', bars);
        console.log(`[yahoo-seed] ${seriesCd} 일봉 저장 완료 (${bars.length}봉)`);
      }
    } catch (e) {
      console.warn('[yahoo-seed] 일봉 취득 실패', seriesCd, e?.message);
    } finally {
      dailySeedingSet.delete(seriesCd);
    }
  })();
}
