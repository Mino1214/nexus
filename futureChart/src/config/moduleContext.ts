/**
 * masterAdmin 모듈 레지스트리(A-1, A-2, …)와 동일한 개념.
 * FutureChart = HTS 모듈 총괄 인스턴스. A-3 등 추가 시에도 동일 패턴.
 * 지갑·시드·시드지급 UI/라우트는 이 모듈에서 제외(공통 DB/API는 macroServer·market-api와 통일).
 */
export const MODULE_CODE = (import.meta.env.VITE_MODULE_CODE?.trim() || 'A-2') as string;

export const MODULE_NAME = 'FutureChart HTS' as const;

/** DB·세션은 macroServer / nexus-market-api 와 동일 스키마 사용(연동 시) */
export const MODULE_EXCLUDED_FROM_ADMIN_HTML = ['wallet', 'seed', 'seedGrant'] as const;
