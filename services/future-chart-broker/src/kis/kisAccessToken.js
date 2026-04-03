import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// OS 임시 디렉토리 사용 → node --watch가 감지하지 않음 (EADDRINUSE 재시작 방지)
const CACHE_DIR = join(tmpdir(), 'future-chart-broker');
const CACHE_FILE = join(CACHE_DIR, 'kis_token.json');

/** @type {{ token: string, expiresAtMs: number }} */
let memCached = { token: '', expiresAtMs: 0 };

/** 파일에서 캐시 로드 (프로세스 재시작 후에도 토큰 유지 → 속도 제한 방지) */
function loadFileCached() {
  try {
    const raw = readFileSync(CACHE_FILE, 'utf8');
    const j = JSON.parse(raw);
    if (j.token && typeof j.expiresAtMs === 'number') {
      memCached = { token: j.token, expiresAtMs: j.expiresAtMs };
    }
  } catch {
    /* 파일 없거나 파싱 실패 → 무시 */
  }
}

function saveFileCached() {
  try {
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(CACHE_FILE, JSON.stringify(memCached), 'utf8');
  } catch {
    /* 저장 실패 → 메모리 캐시만 사용 */
  }
}

// 모듈 로드 시 파일 캐시 복원
loadFileCached();

/**
 * KIS REST 접근토큰 (/oauth2/tokenP) — 메모리+파일 이중 캐시
 * 프로세스 재시작 후에도 유효 토큰을 재사용해 1분당 1회 속도 제한 방지.
 * @param {{ restBase: string, appKey: string, secretKey: string }} p
 * @returns {Promise<string>}
 */
export async function getKisAccessToken(p) {
  const now = Date.now();
  if (memCached.token && memCached.expiresAtMs > now + 30_000) {
    return memCached.token;
  }

  const url = `${p.restBase.replace(/\/$/, '')}/oauth2/tokenP`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=UTF-8',
      Accept: 'application/json',
      'User-Agent': 'future-chart-broker/0.1',
    },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      appkey: p.appKey,
      appsecret: p.secretKey,
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`tokenP HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`tokenP JSON 실패: ${text.slice(0, 120)}`);
  }

  const token = json.access_token;
  if (!token) {
    throw new Error(`tokenP access_token 없음: ${text.slice(0, 200)}`);
  }

  const sec = Number(json.expires_in);
  const ttlMs = Number.isFinite(sec) && sec > 120 ? (sec - 120) * 1000 : 23 * 3600 * 1000;
  memCached = { token, expiresAtMs: now + ttlMs };
  saveFileCached();
  console.log('[kis] 새 접근토큰 발급 완료 (유효:', Math.round(ttlMs / 3600000), 'h)');
  return token;
}
