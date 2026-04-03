/**
 * KIS REST 전체 히스토리 페이지네이션
 *  - fetchAllTodayMinuteBars : 당일 분봉 전체 (FHKST03010200, 30봉씩 역방향)
 *  - fetchAllDailyBars       : 일봉 전체 (FHKST03010100, 100봉씩 역방향)
 */
import { getKisAccessToken } from './kisAccessToken.js';

// ─────────────────────────────────────────
// 공통 유틸
// ─────────────────────────────────────────

/**
 * KST YYYYMMDD 문자열 반환 (Asia/Seoul 기준)
 * @returns {string}
 */
function todayKst() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' })
    .format(new Date())
    .replace(/-/g, '');
}

/**
 * KST 현재 시각 HHMMSS
 * @returns {string}
 */
function nowKstHhmmss() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const h = parts.find((x) => x.type === 'hour')?.value ?? '15';
  const m = parts.find((x) => x.type === 'minute')?.value ?? '30';
  const s = parts.find((x) => x.type === 'second')?.value ?? '00';
  return `${h}${m}${s}`;
}

/**
 * KST 시각(YYYYMMDD, HHMMSS)을 fake-UTC epoch 초로 변환.
 * 차트 라이브러리(lightweight-charts)는 UTCTimestamp를 UTC로 표시하므로
 * KST 시각을 그대로 UTC인 것처럼 처리해 화면에 KST 시각이 보이게 함.
 * @param {string} date8 YYYYMMDD
 * @param {string} time6 HHMMSS (KST)
 * @returns {number} epoch seconds
 */
function kstToDisplaySec(date8, time6) {
  const d = String(date8 ?? '').replace(/\D/g, '');
  const t = String(time6 ?? '').replace(/\D/g, '').padEnd(6, '0').slice(0, 6);
  if (d.length !== 8 || t.length !== 6) return Math.floor(Date.now() / 1000);
  return Math.floor(
    Date.UTC(+d.slice(0,4), +d.slice(4,6)-1, +d.slice(6,8),
             +t.slice(0,2), +t.slice(2,4), +t.slice(4,6)) / 1000,
  );
}

/** 분 경계(초)로 내림 */
const toMinBucket = (sec) => Math.floor(sec / 60) * 60;

/** HHMMSS 형태 epoch 초 → "HHMMSS" 역방향 패딩 */
function secToKstHhmmss(epochSec) {
  // epochSec은 fake-UTC이므로 Date.UTC 역방향: UTC 시각 = KST 시각
  const d = new Date(epochSec * 1000);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  return `${hh}${mm}${ss}`;
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// ─────────────────────────────────────────
// 분봉 (당일 전체)
// ─────────────────────────────────────────

const MINUTE_TR_ID = 'FHKST03010200';
const MINUTE_PATH = '/uapi/domestic-stock/v1/quotations/inquire-time-itemchartprice';

/**
 * @param {Record<string, string>} row
 * @param {string} fallbackDate8  행에 날짜 없을 때 사용
 */
function minuteRowToBar(row, fallbackDate8) {
  const date =
    row.stck_bsop_date?.trim() || row.STCK_BSOP_DATE?.trim() || fallbackDate8;
  const hour =
    row.stck_cntg_hour?.trim() || row.STCK_CNTG_HOUR?.trim() || '';
  const o = Number(String(row.stck_oprc ?? row.STCK_OPRC ?? '').trim());
  const h = Number(String(row.stck_hgpr ?? row.STCK_HGPR ?? '').trim());
  const l = Number(String(row.stck_lwpr ?? row.STCK_LWPR ?? '').trim());
  const c = Number(String(row.stck_prpr ?? row.STCK_PRPR ?? row.stck_clpr ?? '').trim());
  if (!date || !hour || !Number.isFinite(c) || c <= 0) return null;
  const px = c;
  const time = toMinBucket(kstToDisplaySec(date, hour));
  return {
    time,
    open:  Number.isFinite(o) && o > 0 ? o : px,
    high:  Number.isFinite(h) && h > 0 ? h : px,
    low:   Number.isFinite(l) && l > 0 ? l : px,
    close: px,
    volume: 0,
  };
}

/**
 * 당일 분봉 전체 취득 (FHKST03010200 역방향 페이지네이션).
 * 09:00 KST 이전 봉이 나타나거나 빈 응답이 오면 종료.
 * 최대 MAX_PAGES 호출로 한도 설정.
 *
 * @param {{
 *   restBase: string, appKey: string, secretKey: string, paper: boolean
 * }} config
 * @param {string} symbol6
 * @returns {Promise<{time:number,open:number,high:number,low:number,close:number,volume:number}[]>}
 */
export async function fetchAllTodayMinuteBars(config, symbol6) {
  const sym = symbol6.replace(/\D/g, '').slice(0, 6).padStart(6, '0');
  const token = await getKisAccessToken({
    restBase: config.restBase,
    appKey: config.appKey,
    secretKey: config.secretKey,
  });

  const dateKst = todayKst();
  // 당일 09:00 fake-UTC epoch seconds
  const market_open = kstToDisplaySec(dateKst, '090000');

  /** @type {Map<number, {time:number,open:number,high:number,low:number,close:number,volume:number}>} */
  const barMap = new Map();

  let endHhmmss = nowKstHhmmss();
  const MAX_PAGES = 20;

  for (let page = 0; page < MAX_PAGES; page++) {
    if (page > 0) await delay(200);

    const params = new URLSearchParams({
      FID_COND_MRKT_DIV_CODE: 'J',
      FID_INPUT_ISCD: sym,
      FID_INPUT_HOUR_1: endHhmmss,
      FID_PW_DATA_INCU_YN: 'Y',
      FID_ETC_CLS_CODE: '',
    });

    let json;
    try {
      const res = await fetch(
        `${config.restBase.replace(/\/$/, '')}${MINUTE_PATH}?${params}`,
        {
          headers: {
            authorization: `Bearer ${token}`,
            appkey: config.appKey,
            appsecret: config.secretKey,
            tr_id: MINUTE_TR_ID,
            custtype: 'P',
            Accept: 'application/json',
            'User-Agent': 'future-chart-broker/0.1',
          },
        },
      );
      const text = await res.text();
      if (!res.ok) {
        console.warn('[kisFullHistory] minute HTTP', res.status, text.slice(0, 120));
        break;
      }
      json = JSON.parse(text);
    } catch (e) {
      console.warn('[kisFullHistory] minute fetch error', e?.message);
      break;
    }

    if (json.rt_cd != null && String(json.rt_cd) !== '0') {
      console.warn('[kisFullHistory] minute API', json.rt_cd, json.msg1);
      break;
    }

    const rows = json.output2;
    if (!Array.isArray(rows) || rows.length === 0) break;

    let earliest = Infinity;
    for (const row of rows) {
      const bar = minuteRowToBar(row, dateKst);
      if (!bar) continue;
      if (bar.time < earliest) earliest = bar.time;
      // OHLC 병합 (같은 분 버킷이 여러 행으로 올 수 있음)
      const ex = barMap.get(bar.time);
      if (ex) {
        ex.high  = Math.max(ex.high,  bar.high);
        ex.low   = Math.min(ex.low,   bar.low);
        ex.close = bar.close;
      } else {
        barMap.set(bar.time, { ...bar });
      }
    }

    // 09:00 이전 봉까지 도달했거나 페이지 전체가 당일 09:00 이전이면 종료
    if (earliest <= market_open) break;

    // 다음 페이지: 가장 이른 봉의 1분 전 시각
    const prevSec = earliest - 60;
    if (prevSec < market_open) break;
    endHhmmss = secToKstHhmmss(prevSec);
  }

  // 당일 09:00 이후 봉만 필터링, 시간 오름차순
  const bars = Array.from(barMap.values())
    .filter((b) => b.time >= market_open)
    .sort((a, b) => a.time - b.time);

  console.log(`[kisFullHistory] ${sym} 당일 분봉 ${bars.length}개 수집`);
  return bars;
}

// ─────────────────────────────────────────
// 일봉 (전체 히스토리)
// ─────────────────────────────────────────

const DAILY_TR_ID = 'FHKST03010100';
const DAILY_PATH = '/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice';

/**
 * @param {Record<string, string>} row
 */
function dailyRowToBar(row) {
  const date =
    row.stck_bsop_date?.trim() || row.STCK_BSOP_DATE?.trim() || '';
  if (!date || date.length !== 8) return null;
  const o = Number(String(row.stck_oprc ?? row.STCK_OPRC ?? '').trim());
  const h = Number(String(row.stck_hgpr ?? row.STCK_HGPR ?? '').trim());
  const l = Number(String(row.stck_lwpr ?? row.STCK_LWPR ?? '').trim());
  const c = Number(String(row.stck_clpr ?? row.STCK_CLPR ?? row.stck_prpr ?? '').trim());
  const v = Number(String(row.acml_vol ?? row.ACML_VOL ?? '').trim());
  if (!Number.isFinite(c) || c <= 0) return null;
  // 일봉은 09:00 KST를 fake-UTC로 표현 (장 시작 시각)
  const time = kstToDisplaySec(date, '090000');
  return {
    time,
    open:  Number.isFinite(o) && o > 0 ? o : c,
    high:  Number.isFinite(h) && h > 0 ? h : c,
    low:   Number.isFinite(l) && l > 0 ? l : c,
    close: c,
    volume: Number.isFinite(v) ? v : 0,
  };
}

/**
 * YYYYMMDD 문자열 N일 전 날짜 반환
 * @param {string} date8 YYYYMMDD
 * @param {number} days
 * @returns {string}
 */
function subDays(date8, days) {
  const d = new Date(
    +date8.slice(0,4), +date8.slice(4,6)-1, +date8.slice(6,8),
  );
  d.setDate(d.getDate() - days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

/**
 * 국내주식 일봉 전체 취득 (FHKST03010100 역방향 페이지네이션).
 * KIS는 한 번에 최대 100봉 반환. stopDate 이전까지 계속 페이징.
 *
 * @param {{
 *   restBase: string, appKey: string, secretKey: string, paper: boolean
 * }} config
 * @param {string} symbol6
 * @param {string} [stopDate]  YYYYMMDD — 이 날짜 이전에서 중단 (기본 3년 전)
 * @returns {Promise<{time:number,open:number,high:number,low:number,close:number,volume:number}[]>}
 */
export async function fetchAllDailyBars(config, symbol6, stopDate) {
  const sym = symbol6.replace(/\D/g, '').slice(0, 6).padStart(6, '0');
  const token = await getKisAccessToken({
    restBase: config.restBase,
    appKey: config.appKey,
    secretKey: config.secretKey,
  });

  const today = todayKst();
  const stop = stopDate ?? subDays(today, 3 * 365); // 기본 3년

  /** @type {Map<number, {time:number,open:number,high:number,low:number,close:number,volume:number}>} */
  const barMap = new Map();

  let endDate = today;
  const MAX_PAGES = 60; // 최대 6000봉 (약 24년)

  for (let page = 0; page < MAX_PAGES; page++) {
    if (page > 0) await delay(200);

    const startDate = subDays(endDate, 100);
    const params = new URLSearchParams({
      FID_COND_MRKT_DIV_CODE: 'J',
      FID_INPUT_ISCD: sym,
      FID_INPUT_DATE_1: startDate,
      FID_INPUT_DATE_2: endDate,
      FID_PERIOD_DIV_CODE: 'D',
      FID_ORG_ADJ_PRC: '1',  // 수정주가 반영
    });

    let json;
    try {
      const res = await fetch(
        `${config.restBase.replace(/\/$/, '')}${DAILY_PATH}?${params}`,
        {
          headers: {
            authorization: `Bearer ${token}`,
            appkey: config.appKey,
            appsecret: config.secretKey,
            tr_id: DAILY_TR_ID,
            custtype: 'P',
            Accept: 'application/json',
            'User-Agent': 'future-chart-broker/0.1',
          },
        },
      );
      const text = await res.text();
      if (!res.ok) {
        console.warn('[kisFullHistory] daily HTTP', res.status, text.slice(0, 120));
        break;
      }
      json = JSON.parse(text);
    } catch (e) {
      console.warn('[kisFullHistory] daily fetch error', e?.message);
      break;
    }

    if (json.rt_cd != null && String(json.rt_cd) !== '0') {
      console.warn('[kisFullHistory] daily API', json.rt_cd, json.msg1);
      break;
    }

    const rows = json.output2 ?? json.output ?? [];
    if (!Array.isArray(rows) || rows.length === 0) break;

    let earliestDate = endDate;
    for (const row of rows) {
      const bar = dailyRowToBar(row);
      if (!bar) continue;
      barMap.set(bar.time, bar);
      // 날짜 문자열을 역추적해 가장 오래된 날짜 업데이트
      const d = row.stck_bsop_date?.trim() || row.STCK_BSOP_DATE?.trim() || '';
      if (d && d < earliestDate) earliestDate = d;
    }

    // stop 날짜에 도달하면 종료
    if (earliestDate <= stop) break;
    // 다음 페이지: 가장 이른 날짜 하루 전
    endDate = subDays(earliestDate, 1);
    if (endDate <= stop) break;
  }

  const bars = Array.from(barMap.values()).sort((a, b) => a.time - b.time);
  console.log(`[kisFullHistory] ${sym} 일봉 ${bars.length}개 수집`);
  return bars;
}
