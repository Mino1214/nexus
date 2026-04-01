import 'dotenv/config';

/**
 * @returns {{
 *   appKey: string,
 *   secretKey: string,
 *   paper: boolean,
 *   restBase: string,
 *   wsBase: string,
 *   symbol: string,
 *   port: number
 * }}
 */
export function loadConfig() {
  const appKey = process.env.KIS_APP_KEY?.trim();
  const secretKey = process.env.KIS_APP_SECRET?.trim();
  if (!appKey || !secretKey) {
    throw new Error('KIS_APP_KEY / KIS_APP_SECRET 환경 변수가 필요합니다. .env.example 참고.');
  }

  const paper =
    process.env.KIS_PAPER === '1' ||
    process.env.KIS_PAPER === 'true' ||
    process.env.KIS_PAPER === 'yes';

  const restBase = paper
    ? 'https://openapivts.koreainvestment.com:29443'
    : 'https://openapi.koreainvestment.com:9443';

  const wsBase = paper ? 'ws://ops.koreainvestment.com:31000' : 'ws://ops.koreainvestment.com:21000';

  const symbol = (process.env.KIS_DEFAULT_SYMBOL || '005930').trim();
  const port = Number(process.env.BROKER_PORT || 8787);

  return { appKey, secretKey, paper, restBase, wsBase, symbol, port };
}
