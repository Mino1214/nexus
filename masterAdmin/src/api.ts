const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:3000';

/** macroServer(Pandora) 웹 루트 — 미설정 시 API 주소의 origin 사용 */
export function getMacroOrigin(): string {
  const raw = import.meta.env.VITE_MACRO_ORIGIN?.trim();
  if (raw) return raw.replace(/\/$/, '');
  try {
    return new URL(API_BASE).origin;
  } catch {
    return 'http://127.0.0.1:3000';
  }
}

/**
 * 마켓 API 접두사. 기본 /api/market
 * Nginx 가 /api 를 제거해 백엔드에 /market/... 만 넘기면 .env 에 VITE_MARKET_PREFIX=/market
 */
export const MARKET_PREFIX = (import.meta.env.VITE_MARKET_PREFIX || '/api/market').replace(/\/$/, '');

/** @param path '/auth/login' 처럼 앞에 슬래시 */
export function marketPath(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${MARKET_PREFIX}${p}`;
}

/** DB에 넣은 상대경로(/admin.html) 또는 절대 URL → 실제 iframe src */
export function resolveModuleEntryUrl(href: string | null | undefined): string | null {
  if (!href?.trim()) return null;
  const h = href.trim();
  if (/^https?:\/\//i.test(h)) return h;
  const path = h.startsWith('/') ? h : `/${h}`;
  return `${getMacroOrigin()}${path}`;
}

const TOKEN_KEY = 'masterAdmin_access';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(t: string | null) {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

export async function api<T>(
  path: string,
  options: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const { json, headers: hdr, ...rest } = options;
  const headers: HeadersInit = { ...(hdr as Record<string, string>) };
  if (json !== undefined) {
    (headers as Record<string, string>)['Content-Type'] = 'application/json';
    rest.body = JSON.stringify(json);
  }
  const t = getToken();
  if (t) (headers as Record<string, string>)['Authorization'] = `Bearer ${t}`;

  const res = await fetch(`${API_BASE}${path}`, { ...rest, headers });
  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const msg =
      typeof data === 'object' && data && 'error' in data
        ? String((data as { error: string }).error)
        : text || res.statusText;
    throw new Error(msg);
  }
  return data as T;
}

export { API_BASE };
