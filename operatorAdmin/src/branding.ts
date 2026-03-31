/** Pandora와 같은 호스트에 올라간 로고 (VITE_MACRO_ORIGIN 미설정 시 텍스트만) */
export function brandLogoUrl(): string | null {
  const raw = import.meta.env.VITE_MACRO_ORIGIN?.trim();
  if (!raw) return null;
  return `${raw.replace(/\/$/, '')}/logo/logo.png?v=2`;
}
