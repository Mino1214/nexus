/**
 * 한국 표준시(Asia/Seoul, DST 없음) 기준 날짜·월 경계
 */

function kstYmdParts(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** 오늘 KST 날짜 'YYYY-MM-DD' */
function kstTodayString(now = new Date()) {
  return kstYmdParts(now);
}

/** 어제 KST (달력 기준 어제) */
function kstYesterdayString(now = new Date()) {
  const today = kstTodayString(now);
  const anchor = new Date(`${today}T12:00:00+09:00`);
  anchor.setTime(anchor.getTime() - 86400000);
  return kstYmdParts(anchor);
}

/**
 * 이번 달 KST 1일 00:00:00 의 순간 (Date, UTC 내부저장)
 * 월 전환 한도 집계 시작점
 */
function startOfKstMonth(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'numeric',
  }).formatToParts(now);
  const y = Number(parts.find((p) => p.type === 'year')?.value);
  const mo = Number(parts.find((p) => p.type === 'month')?.value);
  if (!y || !mo) return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return new Date(`${y}-${String(mo).padStart(2, '0')}-01T00:00:00+09:00`);
}

module.exports = { kstTodayString, kstYesterdayString, startOfKstMonth };
