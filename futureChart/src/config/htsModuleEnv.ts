import { getMarketApiBase } from './marketApiEnv';

/** dbMigrate 시드·로컬 기본값과 동일 */
export const DEFAULT_HTS_MODULE_SLUG = 'hts_future_trade';

/**
 * masterAdmin 카탈로그 slug 와 동일 (dbMigrate 의 hts_future_trade 등).
 * 비어 있으면 env 만으로는 슬러그 없음 → getEffectiveHtsModuleSlug 로 보완.
 */
export function getHtsModuleSlug(): string {
  return (import.meta.env.VITE_HTS_MODULE_SLUG?.trim() || '').replace(/\/$/, '');
}

/** env 슬러그 없을 때 로컬/기본 모듈로 마켓 로그인·헤더 보완 */
export function getEffectiveHtsModuleSlug(): string {
  return getHtsModuleSlug() || DEFAULT_HTS_MODULE_SLUG;
}

/** 마켓 API URL 이 있으면 마켓 로그인 경로 사용 (슬러그는 기본값으로 채움) */
export function isMarketHtsGateEnabled(): boolean {
  return Boolean(getMarketApiBase());
}
