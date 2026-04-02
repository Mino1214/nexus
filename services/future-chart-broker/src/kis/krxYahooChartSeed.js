import { fetchYahoo1d1m } from '../ext/yahooStream.js';

/**
 * KIS 국내주식 WS는 체결 전까지 히스토리가 없어 차트가 비어 보임.
 * Yahoo `XXXXXX.KS` 1분 봉으로 동일 6자리 코드에 맞춰 초기 캔들만 시드(실시간은 KIS 틱이 이어감).
 *
 * @param {{
 *   hub: { broadcast: (p: unknown) => void },
 *   krxSymbol6: string,
 *   stillSubscribed?: (sym6: string) => boolean,
 * }} opts
 */
export async function seedKrxStockChartFromYahoo({ hub, krxSymbol6, stillSubscribed }) {
  const d = String(krxSymbol6 ?? '').replace(/\D/g, '');
  if (!d) return;
  const sym = d.length > 6 ? d.slice(0, 6) : d.padStart(6, '0');
  const yahooSym = `${sym}.KS`;
  try {
    const { bars } = await fetchYahoo1d1m(yahooSym);
    if (stillSubscribed && !stillSubscribed(sym)) return;
    if (bars.length) {
      hub.broadcast({ type: 'history', provider: 'kis', symbol: sym, bars });
    }
  } catch (e) {
    console.warn('[kis] krx yahoo chart seed failed', sym, e?.message || e);
  }
}
