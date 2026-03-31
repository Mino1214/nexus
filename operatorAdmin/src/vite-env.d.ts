/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE: string;
  readonly VITE_MACRO_ORIGIN?: string;
  /** 기본 /api/market — 프록시가 /market 만 넘기면 /market */
  readonly VITE_MARKET_PREFIX?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
