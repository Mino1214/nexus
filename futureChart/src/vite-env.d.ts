/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** masterAdmin 모듈 코드 (예: A-2) */
  readonly VITE_MODULE_CODE?: string;
  readonly VITE_BROKER_WS_URL?: string;
  /** macroServer / masterAdmin 과 동일 API 루트 (admin.html·DB 연동) */
  readonly VITE_API_BASE?: string;
  /** true 시 HTS 운영 저장 시 masterAdmin API 스텁 호출 */
  readonly VITE_FC_MASTERADMIN_SYNC?: string;
  /** 예: http://127.0.0.1:3000 (끝 슬래시 없음) */
  readonly VITE_FC_MASTERADMIN_API_BASE?: string;
  /** services/future-trade-admin (기본 포트 3020) */
  readonly VITE_FUTURE_TRADE_ADMIN_BASE?: string;
  /** nexus-market-api 전용 URL — 없으면 VITE_API_BASE 사용 */
  readonly VITE_MARKET_API_BASE?: string;
  /**
   * master_catalog_modules.slug (예: hts_future_trade). 설정 시 로그인에 모듈 권한 검사 포함.
   * 비우면 데모 로컬 로그인만 사용.
   */
  readonly VITE_HTS_MODULE_SLUG?: string;
}

export interface FutureChartApi {
  platform: string;
}

declare global {
  interface Window {
    futureChart?: FutureChartApi;
  }
}
