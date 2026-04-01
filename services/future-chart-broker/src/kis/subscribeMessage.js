/**
 * 국내주식 실시간 체결가 H0STCNT0 구독 메시지
 * @param {{ approvalKey: string, trId: string, trKey: string, trType: string }} p
 * @param {string} p.trType "1" 등록 / "2" 해제
 */
export function buildSubscribeMessage({ approvalKey, trId, trKey, trType }) {
  return {
    header: {
      approval_key: approvalKey,
      custtype: 'P',
      tr_type: trType,
      'content-type': 'utf-8',
    },
    body: {
      input: {
        tr_id: trId,
        tr_key: trKey,
      },
    },
  };
}
