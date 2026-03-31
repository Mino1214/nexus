const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:3001';

export function getMacroOrigin(): string {
  const raw = import.meta.env.VITE_MACRO_ORIGIN?.trim();
  if (raw) return raw.replace(/\/$/, '');
  try {
    return new URL(API_BASE).origin;
  } catch {
    return 'http://127.0.0.1:3000';
  }
}

export const MARKET_PREFIX = (import.meta.env.VITE_MARKET_PREFIX || '/api/market').replace(/\/$/, '');

export function marketPath(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${MARKET_PREFIX}${p}`;
}

/** 인증 없는 공개 API (랜딩 모듈 목록) */
export function publicApiPath(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${MARKET_PREFIX}/public${p}`;
}

const TOKEN_KEY = 'totalMarket_access';
const ROLE_KEY = 'totalMarket_role';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(t: string | null) {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

export function getStoredRole(): string | null {
  return sessionStorage.getItem(ROLE_KEY);
}

export function setStoredRole(r: string | null) {
  if (r) sessionStorage.setItem(ROLE_KEY, r);
  else sessionStorage.removeItem(ROLE_KEY);
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

/** 상대 경로(/market-static/...) 또는 절대 URL → 브라우저용 전체 URL */
export function assetUrl(rel: string | null | undefined): string {
  if (!rel?.trim()) return '';
  const u = rel.trim();
  if (/^https?:\/\//i.test(u)) return u;
  const base = API_BASE.replace(/\/$/, '');
  return `${base}${u.startsWith('/') ? u : `/${u}`}`;
}

export async function fetchPublic<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${publicApiPath(path)}`);
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
