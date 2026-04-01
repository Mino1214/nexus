import { getPandoraApiBase } from './pandoraEnv';

/**
 * nexus-market-api 헬스 체크용.
 * VITE_MARKET_API_BASE 가 있으면 우선, 없으면 VITE_API_BASE (Pandora/마켓 공통 루트).
 */
export function getMarketApiBase(): string {
  const m = import.meta.env.VITE_MARKET_API_BASE?.trim();
  if (m) return m.replace(/\/$/, '');
  return getPandoraApiBase();
}
