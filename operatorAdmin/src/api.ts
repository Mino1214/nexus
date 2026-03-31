const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:3001';

/**
 * 마켓 API 접두사. 기본 /api/market
 * Nginx 가 /api 를 제거해 백엔드에 /market/... 만 넘기면 .env 에 VITE_MARKET_PREFIX=/market
 */
export const MARKET_PREFIX = (import.meta.env.VITE_MARKET_PREFIX || '/api/market').replace(/\/$/, '');

export function marketPath(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${MARKET_PREFIX}${p}`;
}

const TOKEN_KEY = 'operatorAdmin_access';

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

export function assetUrl(rel: string | null | undefined): string {
  if (!rel?.trim()) return '';
  const u = rel.trim();
  if (/^https?:\/\//i.test(u)) return u;
  const base = API_BASE.replace(/\/$/, '');
  return `${base}${u.startsWith('/') ? u : `/${u}`}`;
}

export { API_BASE };
