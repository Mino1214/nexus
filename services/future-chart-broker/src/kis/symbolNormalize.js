/** @param {string} raw */
export function normalizeKrxSymbol(raw) {
  const d = String(raw ?? '').replace(/\D/g, '');
  if (!d) return null;
  if (d.length > 6) return d.slice(0, 6);
  return d.padStart(6, '0');
}
