/**
 * admin.html·masterAdmin 과 동일 API 베이스 (macroServer 등).
 * .env 에 VITE_API_BASE 설정 시 로그인·운영 API를 여기로 붙이면 됨.
 */
export function getPandoraApiBase(): string {
  const b = import.meta.env.VITE_API_BASE?.trim();
  return b?.replace(/\/$/, '') ?? '';
}
