/** masterAdmin(또는 중앙 API)과 HTS 운영 데이터 동기화 — true면 저장 시 API 스텁 호출 */
export function isMasterAdminSyncEnabled(): boolean {
  return import.meta.env.VITE_FC_MASTERADMIN_SYNC === 'true';
}

export function getMasterAdminApiBase(): string {
  const b = import.meta.env.VITE_FC_MASTERADMIN_API_BASE?.trim();
  return b?.replace(/\/$/, '') ?? '';
}
