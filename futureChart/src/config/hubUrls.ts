/** masterAdmin SPA 배포 URL (선택). 비어 있으면 링크 버튼 숨김 */
export function getMasterAdminPublicUrl(): string {
  return (import.meta.env.VITE_MASTER_ADMIN_URL?.trim() || '').replace(/\/$/, '');
}

/** totalMarket(총마켓) 포털 URL (선택) */
export function getTotalMarketPublicUrl(): string {
  return (import.meta.env.VITE_TOTAL_MARKET_URL?.trim() || '').replace(/\/$/, '');
}
