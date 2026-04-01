/** nexus-market-api 의 mount 경로 (server.js 주석과 동일) */
export function marketApiUrl(apiBase: string, path: string): string {
  const b = apiBase.replace(/\/$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${b}/api/market${p}`;
}
