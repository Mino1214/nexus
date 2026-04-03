import { getKisAccessToken } from './kisAccessToken.js';

const TR_ID = 'FHKST01010200';
const PATH = '/uapi/domestic-stock/v1/quotations/inquire-asking-price-exp-ccn';

/**
 * KIS REST로 국내주식 호가 스냅샷 취득.
 * 장 마감 후에도 마지막 호가를 반환하므로 초기 표시에 유용.
 * @param {{
 *   restBase: string,
 *   appKey: string,
 *   secretKey: string,
 *   symbol6: string,
 * }} p
 * @returns {Promise<{ asks: {price:number,qty:number}[], bids: {price:number,qty:number}[] } | null>}
 */
export async function fetchDomesticOrderbookSnapshot(p) {
  const sym = String(p.symbol6 ?? '').replace(/\D/g, '').padStart(6, '0').slice(0, 6);
  if (!sym) return null;

  let token;
  try {
    token = await getKisAccessToken({
      restBase: p.restBase,
      appKey: p.appKey,
      secretKey: p.secretKey,
    });
  } catch {
    return null;
  }

  const params = new URLSearchParams({
    FID_COND_MRKT_DIV_CODE: 'J',
    FID_INPUT_ISCD: sym,
  });
  const url = `${p.restBase.replace(/\/$/, '')}${PATH}?${params.toString()}`;

  let json;
  try {
    const res = await fetch(url, {
      headers: {
        authorization: `Bearer ${token}`,
        appkey: p.appKey,
        appsecret: p.secretKey,
        tr_id: TR_ID,
        custtype: 'P',
        Accept: 'application/json',
        'User-Agent': 'future-chart-broker/0.1',
      },
    });
    if (!res.ok) return null;
    json = await res.json();
  } catch {
    return null;
  }

  if (json.rt_cd != null && String(json.rt_cd) !== '0') {
    console.warn('[kis] ob-snapshot 실패', json.rt_cd, json.msg1 ?? json.msg_cd ?? '');
    return null;
  }

  const asks = [];
  const bids = [];

  // 방식 A: output2 배열 (각 row에 askp/bidp 필드)
  const rows = json.output2;
  if (Array.isArray(rows) && rows.length > 0) {
    for (const row of rows) {
      const ap = Number(row.askp ?? row.ASKP ?? '');
      const aq = Number(row.askp_rsqn ?? row.ASKP_RSQN ?? '');
      const bp = Number(row.bidp ?? row.BIDP ?? '');
      const bq = Number(row.bidp_rsqn ?? row.BIDP_RSQN ?? '');
      if (Number.isFinite(ap) && ap > 0) asks.push({ price: ap, qty: Number.isFinite(aq) ? aq : 0 });
      if (Number.isFinite(bp) && bp > 0) bids.push({ price: bp, qty: Number.isFinite(bq) ? bq : 0 });
    }
  }

  // 방식 B: output1 단일 객체에 askp1~askp10, bidp1~bidp10 필드
  if (asks.length === 0 && bids.length === 0 && json.output1) {
    const o1 = json.output1;
    for (let i = 1; i <= 10; i++) {
      const ap = Number(o1[`askp${i}`] ?? o1[`ASKP${i}`] ?? '');
      const aq = Number(o1[`askp_rsqn${i}`] ?? o1[`ASKP_RSQN${i}`] ?? '');
      const bp = Number(o1[`bidp${i}`] ?? o1[`BIDP${i}`] ?? '');
      const bq = Number(o1[`bidp_rsqn${i}`] ?? o1[`BIDP_RSQN${i}`] ?? '');
      if (Number.isFinite(ap) && ap > 0) asks.push({ price: ap, qty: Number.isFinite(aq) ? aq : 0 });
      if (Number.isFinite(bp) && bp > 0) bids.push({ price: bp, qty: Number.isFinite(bq) ? bq : 0 });
    }
  }

  if (asks.length === 0 && bids.length === 0) {
    // 어떤 형식도 파싱 못함 → 응답 구조 로그
    console.warn('[kis] ob-snapshot 파싱 실패 keys:', Object.keys(json).join(','),
      'output2 length:', Array.isArray(json.output2) ? json.output2.length : 'none');
    return null;
  }
  return { asks, bids };
}
