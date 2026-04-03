/**
 * 국내주식 차트 시드 — SQLite 캐시 우선, 빠진 구간만 KIS REST 호출.
 *
 * 흐름:
 *  1. barStore에서 오늘 분봉 로드 → 있으면 즉시 broadcast
 *  2. 마지막 봉 이후 빠진 구간만 KIS REST 호출 (최근 30봉 vs 전체 페이지네이션)
 *  3. 일봉: DB에 없으면 전체 취득 → 저장 (백그라운드)
 *  4. 결과 broadcast
 */
import { fetchDomesticDayMinuteBars } from './kisDomesticMinuteBars.js';
import { fetchAllTodayMinuteBars, fetchAllDailyBars } from './kisFullHistory.js';
import { loadBars, saveBars, getLatestBarTime } from '../db/barStore.js';

// ─────────────────────────────────────────
// KST 날짜 유틸
// ─────────────────────────────────────────

/**
 * 현재 KST 날짜 YYYYMMDD
 * @returns {string}
 */
function todayKst() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' })
    .format(new Date())
    .replace(/-/g, '');
}

/**
 * KST YYYYMMDD 에 해당하는 당일 09:00 fake-UTC epoch seconds
 * @param {string} date8
 */
function dayOpenSec(date8) {
  return Math.floor(
    Date.UTC(
      +date8.slice(0, 4),
      +date8.slice(4, 6) - 1,
      +date8.slice(6, 8),
      9, 0, 0,
    ) / 1000,
  );
}

/**
 * KST 15:30 fake-UTC epoch seconds
 * @param {string} date8
 */
function dayCloseSec(date8) {
  return Math.floor(
    Date.UTC(
      +date8.slice(0, 4),
      +date8.slice(4, 6) - 1,
      +date8.slice(6, 8),
      15, 30, 0,
    ) / 1000,
  );
}

/**
 * 현재 KST 시각을 fake-UTC epoch seconds로
 */
function nowDisplaySec() {
  const kst = new Date(Date.now() + 9 * 3600 * 1000);
  return Math.floor(kst.getTime() / 1000) - 9 * 3600;
}

// ─────────────────────────────────────────
// 메인
// ─────────────────────────────────────────

/**
 * @param {{
 *   hub: { broadcast: (p: unknown) => void },
 *   restBase: string,
 *   appKey: string,
 *   secretKey: string,
 *   paper: boolean,
 *   krxSymbol6: string,
 *   stillSubscribed?: (sym6: string) => boolean,
 * }} opts
 */
export async function seedKrxStockChartFromKisRest(opts) {
  const d = String(opts.krxSymbol6 ?? '').replace(/\D/g, '');
  if (!d) return;
  const sym = d.length > 6 ? d.slice(0, 6) : d.padStart(6, '0');

  const config = {
    restBase: opts.restBase,
    appKey: opts.appKey,
    secretKey: opts.secretKey,
    paper: opts.paper,
  };

  const stillOk = () => !opts.stillSubscribed || opts.stillSubscribed(sym);

  try {
    await seedMinuteBars(opts.hub, config, sym, stillOk);
    // 일봉은 백그라운드 (차트 로딩 block 하지 않음)
    if (stillOk()) {
      seedDailyBarsBackground(opts.hub, config, sym);
    }
  } catch (e) {
    console.warn('[kis] chart seed failed', sym, e?.message || e);
  }
}

// ─────────────────────────────────────────
// 분봉 시드
// ─────────────────────────────────────────

/**
 * @param {{ broadcast: (p: unknown) => void }} hub
 * @param {object} config
 * @param {string} sym
 * @param {() => boolean} stillOk
 */
async function seedMinuteBars(hub, config, sym, stillOk) {
  const dateKst = todayKst();
  const todayOpen = dayOpenSec(dateKst);
  const todayClose = dayCloseSec(dateKst);
  const nowSec = nowDisplaySec();

  // ── 1. DB에서 오늘 분봉 로드
  const cached = loadBars(sym, '1m', todayOpen);
  if (cached.length > 0 && stillOk()) {
    hub.broadcast({ type: 'history', provider: 'kis', symbol: sym, bars: cached });
    console.log(`[seed] ${sym} DB 캐시 즉시 broadcast (${cached.length}봉)`);
  }

  if (!stillOk()) return;

  // ── 2. 마지막 봉 이후 빠진 구간 계산
  const latestInDb = getLatestBarTime(sym, '1m');
  const isMarketOpen = nowSec >= todayOpen && nowSec <= todayClose;

  // DB에 오늘 봉이 아예 없으면 2단계 취득
  if (!latestInDb || latestInDb < todayOpen) {
    // 이미 이 심볼의 전체 취득이 진행 중이면 스킵 (중복 API 호출 방지)
    if (minuteSeedingSet.has(sym)) {
      console.log(`[seed] ${sym} 이미 취득 중, skip`);
      return;
    }
    minuteSeedingSet.add(sym);
    console.log(`[seed] ${sym} 오늘 분봉 없음 → 전체 취득`);

    try {
      // ── 2-a. 빠른 첫 화면: 최근 30봉 즉시 표시 (1~2초)
      try {
        const quickBars = await fetchDomesticDayMinuteBars({
          restBase: config.restBase,
          appKey: config.appKey,
          secretKey: config.secretKey,
          paper: config.paper,
          symbol6: sym,
        });
        if (quickBars.length > 0 && stillOk()) {
          hub.broadcast({ type: 'history', provider: 'kis', symbol: sym, bars: quickBars });
          console.log(`[seed] ${sym} 빠른 초기 분봉 ${quickBars.length}봉 broadcast`);
        }
      } catch { /* quick fetch 실패 시 무시하고 전체 취득 계속 */ }

      // ── 2-b. 전체 취득 (결과는 항상 DB 저장, 포커스 중일 때만 broadcast)
      const bars = await fetchAllTodayMinuteBars(config, sym);
      if (bars.length) {
        saveBars(sym, '1m', bars); // 포커스 여부와 무관하게 항상 저장
        if (stillOk()) {
          hub.broadcast({ type: 'history', provider: 'kis', symbol: sym, bars });
        }
        console.log(`[seed] ${sym} 전체 분봉 저장 (${bars.length}봉)${stillOk() ? ' +broadcast' : ' (포커스 이탈, broadcast 생략)'}`);
      }
    } finally {
      minuteSeedingSet.delete(sym);
    }
    return;
  }

  // DB에 오늘 봉이 있고 장이 닫혔으면 추가 fetch 불필요
  if (!isMarketOpen) return;

  // 장 중: 마지막 봉 이후 새로운 봉만 가져오기
  // (최근 30봉 단순 호출 — 빠진 구간이 보통 수 분 이내)
  const GAP_THRESHOLD_SEC = 5 * 60; // 5분 이상 빠진 경우만 API 호출
  if (nowSec - latestInDb < GAP_THRESHOLD_SEC) return; // 최신 상태

  console.log(`[seed] ${sym} 장 중 갱신 (last=${latestInDb}, now=${nowSec})`);
  const freshBars = await fetchDomesticDayMinuteBars({
    restBase: config.restBase,
    appKey: config.appKey,
    secretKey: config.secretKey,
    paper: config.paper,
    symbol6: sym,
  });
  if (!stillOk() || freshBars.length === 0) return;

  // 이미 DB에 있는 것과 병합: latestInDb 이후 봉만 신규 저장
  const newBars = freshBars.filter((b) => b.time > latestInDb);
  if (newBars.length > 0) {
    saveBars(sym, '1m', newBars);
  }

  // 전체(캐시 + 신규) 다시 로드해서 broadcast
  const allBars = loadBars(sym, '1m', todayOpen);
  if (allBars.length > 0) {
    hub.broadcast({ type: 'history', provider: 'kis', symbol: sym, bars: allBars });
    console.log(`[seed] ${sym} 갱신 후 broadcast (${allBars.length}봉, +${newBars.length} 신규)`);
  }
}

// ─────────────────────────────────────────
// 일봉 시드 (백그라운드)
// ─────────────────────────────────────────

/** 현재 분봉 전체 취득 진행 중인 심볼 (중복 방지) */
const minuteSeedingSet = new Set();

/** 심볼별 일봉 시드 진행 중 여부 (중복 방지) */
const dailySeedingSet = new Set();

/** 워치리스트 프리시드 실행 중 여부 */
let watchlistPreSeedRunning = false;

/**
 * 일봉을 백그라운드에서 취득·저장.
 * 이미 진행 중이거나 최근에 저장된 경우 스킵.
 * @param {{ broadcast: (p: unknown) => void }} hub
 * @param {object} config
 * @param {string} sym
 */
function seedDailyBarsBackground(hub, config, sym) {
  if (dailySeedingSet.has(sym)) return;

  // DB에 일봉이 있으면 스킵 (이미 최신인 경우)
  const latestDaily = getLatestBarTime(sym, '1d');
  const dateKst = todayKst();
  const todayOpen = dayOpenSec(dateKst);
  // 오늘 일봉이 있으면 갱신 불필요
  if (latestDaily != null && latestDaily >= todayOpen - 86400) return;

  dailySeedingSet.add(sym);
  void (async () => {
    try {
      console.log(`[seed] ${sym} 일봉 전체 취득 시작`);
      const bars = await fetchAllDailyBars(config, sym);
      if (bars.length > 0) {
        saveBars(sym, '1d', bars);
        console.log(`[seed] ${sym} 일봉 저장 완료 (${bars.length}봉)`);
      }
    } catch (e) {
      console.warn('[seed] 일봉 취득 실패', sym, e?.message);
    } finally {
      dailySeedingSet.delete(sym);
    }
  })();
}

// ─────────────────────────────────────────
// 워치리스트 전체 프리시드 (백그라운드)
// ─────────────────────────────────────────

/**
 * 워치리스트 심볼 전체를 백그라운드에서 순차 프리시드.
 * DB에 오늘 분봉이 없는 심볼만 처리하며, 심볼 간 500ms 딜레이로 rate-limit 방지.
 * 이미 실행 중이면 새 요청을 무시 (재구독 시 중복 방지).
 *
 * @param {{
 *   restBase: string, appKey: string, secretKey: string, paper: boolean
 * }} config
 * @param {{ broadcast: (p: unknown) => void }} hub
 * @param {string[]} symbols  국내주식 심볼 배열 (6자리 코드)
 */
export function preSeedWatchlistBg(config, hub, symbols) {
  if (!symbols.length) return;
  if (watchlistPreSeedRunning) return;

  const dateKst = todayKst();
  const todayOpen = dayOpenSec(dateKst);

  // DB에 오늘 분봉이 없는 심볼만 필터링
  const toSeed = symbols.filter((sym) => {
    const latest = getLatestBarTime(sym, '1m');
    return !latest || latest < todayOpen;
  });

  if (toSeed.length === 0) return;

  console.log(`[seed] 워치리스트 프리시드 예약 ${toSeed.length}종목: ${toSeed.join(',')}`);
  watchlistPreSeedRunning = true;

  void (async () => {
    // subscribe 메시지가 먼저 오는 경우 포커스 심볼 seed가 먼저 돌도록 3초 양보
    await new Promise((r) => setTimeout(r, 3000));

    try {
      for (const sym of toSeed) {
        // 3초 기다리는 사이에 이미 세딩됐으면 스킵
        const latest = getLatestBarTime(sym, '1m');
        if (latest && latest >= todayOpen) continue;

        console.log(`[seed] 워치리스트 프리시드 진행: ${sym}`);
        try {
          await seedKrxStockChartFromKisRest({
            hub,
            restBase: config.restBase,
            appKey: config.appKey,
            secretKey: config.secretKey,
            paper: config.paper,
            krxSymbol6: sym,
            stillSubscribed: () => true, // 워치리스트 심볼은 항상 계속
          });
        } catch (e) {
          console.warn('[seed] 프리시드 실패', sym, e?.message);
        }

        // 심볼 간 500ms 딜레이 (KIS rate-limit 방지)
        await new Promise((r) => setTimeout(r, 500));
      }
      console.log('[seed] 워치리스트 프리시드 완료');
    } finally {
      watchlistPreSeedRunning = false;
    }
  })();
}
