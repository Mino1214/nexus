/** services/future-trade-admin (공용 DB + MODULE_CODE) */
export function getFutureTradeAdminBase(): string {
  const b = import.meta.env.VITE_FUTURE_TRADE_ADMIN_BASE?.trim();
  return b?.replace(/\/$/, '') ?? '';
}
