import { getKisAccessToken } from './kisAccessToken.js';

const TR_ID = 'FHKST03010200';
const PATH = '/uapi/domestic-stock/v1/quotations/inquire-time-itemchartprice';

function kstHhmmss() {
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
  return `${h.padStart(2, '0')}${m.padStart(2, '0')}${s.padStart(2, '0')}`;
}

/**
 * KST 시각을 "표시용 fake-UTC 초"로 변환.
 * lightweight-charts는 UTCTimestamp를 UTC 기준으로 표시하므로,
 * 한국 시장 시각(15:30 KST)을 그대로 UTC로 취급해 차트에 15:30으로 보이게 함.
 * @param {string} date8 YYYYMMDD
 * @param {string} time6 HHMMSS (KST)
 * @returns {number} fake-UTC 초
 */
function kstToDisplaySec(date8, time6) {
  const d = String(date8 ?? '').replace(/\D/g, '');
  const t = String(time6 ?? '').replace(/\D/g, '').padEnd(6, '0').slice(0, 6);
  if (d.length !== 8 || t.length !== 6) {
    // 폴백: 현재 KST 시각을 fake-UTC로
    const kstNow = new Date(Date.now() + 9 * 3600 * 1000);
    return Math.floor(kstNow.getTime() / 1000) - 9 * 3600;
  }
  const y = +d.slice(0, 4);
  const mo = +d.slice(4, 6);
  const day = +d.slice(6, 8);
  const hh = +t.slice(0, 2);
  const mm = +t.slice(2, 4);
  const ss = +t.slice(4, 6);
  // Date.UTC는 timezone 없이 직접 epoch 계산 → KST 시각이 그대로 UTC처럼 저장됨
  return Math.floor(Date.UTC(y, mo - 1, day, hh, mm, ss) / 1000);
}

/**
 * @param {Record<string, string>} row
 */
function rowToBar(row) {
  const date =
    row.stck_bsop_date?.trim() ||
    row.STCK_BSOP_DATE?.trim() ||
    row.bsop_date?.trim() ||
    '';
  const hour =
    row.stck_cntg_hour?.trim() ||
    row.STCK_CNTG_HOUR?.trim() ||
    row.cntg_hour?.trim() ||
    '';
  const o = Number(String(row.stck_oprc ?? row.STCK_OPRC ?? row.oprc ?? '').trim());
  const h = Number(String(row.stck_hgpr ?? row.STCK_HGPR ?? row.hgpr ?? '').trim());
  const l = Number(String(row.stck_lwpr ?? row.STCK_LWPR ?? row.lwpr ?? '').trim());
  const c = Number(String(row.stck_prpr ?? row.STCK_PRPR ?? row.prpr ?? row.stck_clpr ?? '').trim());
  const px = Number.isFinite(c) && c > 0 ? c : NaN;
  if (!date || !hour || !Number.isFinite(px)) return null;
  const open = Number.isFinite(o) && o > 0 ? o : px;
  const high = Number.isFinite(h) && h > 0 ? h : px;
  const low = Number.isFinite(l) && l > 0 ? l : px;
  // 분 버킷 경계(00초)로 내림 — lightweight-charts 분봉 정렬 기준
  const time = Math.floor(kstToDisplaySec(date, hour) / 60) * 60;
  return { time, open, high, low, close: px };
}

/**
 * 당일 분봉(한 번에 최대 30개) — 차트 시드
 * @param {{
 *   restBase: string,
 *   appKey: string,
 *   secretKey: string,
 *   paper: boolean,
 *   symbol6: string,
 * }} p
 */
export async function fetchDomesticDayMinuteBars(p) {
  const sym = String(p.symbol6 ?? '')
    .replace(/\D/g, '')
    .slice(0, 6)
    .padStart(6, '0');
  if (!sym) return [];

  const token = await getKisAccessToken({
    restBase: p.restBase,
    appKey: p.appKey,
    secretKey: p.secretKey,
  });

  const trId = TR_ID;

  const params = new URLSearchParams({
    FID_COND_MRKT_DIV_CODE: 'J',
    FID_INPUT_ISCD: sym,
    FID_INPUT_HOUR_1: kstHhmmss(),
    FID_PW_DATA_INCU_YN: 'Y',
    FID_ETC_CLS_CODE: '',
  });

  const url = `${p.restBase.replace(/\/$/, '')}${PATH}?${params.toString()}`;
  const res = await fetch(url, {
    headers: {
      authorization: `Bearer ${token}`,
      appkey: p.appKey,
      appsecret: p.secretKey,
      tr_id: trId,
      custtype: 'P',
      Accept: 'application/json',
      'User-Agent': 'future-chart-broker/0.1',
    },
  });

  const text = await res.text();
  if (!res.ok) {
    console.warn('[kis] domestic minute bars HTTP', res.status, text.slice(0, 200));
    return [];
  }

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    return [];
  }

  if (json.rt_cd != null && String(json.rt_cd) !== '0') {
    console.warn('[kis] domestic minute bars', json.rt_cd, json.msg_cd, json.msg1);
    return [];
  }

  const rows = json.output2;
  if (!Array.isArray(rows)) return [];

  // 동일 분 버킷이 여러 행으로 올 경우 OHLC 병합
  /** @type {Map<number, {time:number,open:number,high:number,low:number,close:number}>} */
  const barMap = new Map();
  for (const raw of rows) {
    const bar = rowToBar(/** @type {Record<string, string>} */ (raw));
    if (!bar) continue;
    const existing = barMap.get(bar.time);
    if (existing) {
      existing.high = Math.max(existing.high, bar.high);
      existing.low = Math.min(existing.low, bar.low);
      existing.close = bar.close;
    } else {
      barMap.set(bar.time, { ...bar });
    }
  }
  const bars = Array.from(barMap.values());
  bars.sort((a, b) => a.time - b.time);
  return bars;
}
