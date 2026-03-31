export function brandLogoUrl(): string | null {
  const raw = import.meta.env.VITE_MACRO_ORIGIN?.trim();
  if (!raw) return null;
  return `${raw.replace(/\/$/, '')}/logo/logo.png?v=2`;
}
