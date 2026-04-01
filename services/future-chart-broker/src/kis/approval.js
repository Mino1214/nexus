/**
 * WebSocket 접속용 approval_key 발급 (REST /oauth2/Approval)
 * @param {{ restBase: string, appKey: string, secretKey: string }} p
 */
export async function fetchApprovalKey({ restBase, appKey, secretKey }) {
  const url = `${restBase}/oauth2/Approval`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Accept: 'text/plain',
      'User-Agent': 'future-chart-broker/0.1',
    },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      appkey: appKey,
      secretkey: secretKey,
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`KIS Approval HTTP ${res.status}: ${text}`);
  }

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`KIS Approval 응답 파싱 실패: ${text.slice(0, 200)}`);
  }

  const key = json.approval_key;
  if (!key) {
    throw new Error(`approval_key 없음: ${text.slice(0, 300)}`);
  }
  return key;
}
