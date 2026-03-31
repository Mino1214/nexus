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

const TOKEN_KEY = 'marketPlace_access';
const ROLE_KEY = 'marketPlace_role';

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
