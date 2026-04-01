import { getMarketApiBase } from './config/marketApiEnv';
import { marketApiUrl } from './config/marketPaths';

export type MarketRegisterResult =
  | { ok: true; pendingApproval: true; message: string }
  | { ok: true; pendingApproval: false; accessToken: string; refreshToken: string; role: string }
  | { ok: false; error: string };

/** 공개 마켓 가입 — 레퍼럴 코드 필수(총판 코드 또는 총판 로그인 ID). 승인 대기 시 토큰 없음. */
export async function marketPublicRegister(
  id: string,
  password: string,
  referralCode: string,
): Promise<MarketRegisterResult> {
  const base = getMarketApiBase();
  if (!base) return { ok: false, error: 'API 베이스가 설정되지 않았습니다.' };
  const code = referralCode.trim();
  if (!code) return { ok: false, error: '레퍼럴 코드를 입력하세요.' };

  let res: Response;
  try {
    res = await fetch(marketApiUrl(base, '/auth/register'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'omit',
      body: JSON.stringify({
        id: id.trim().toLowerCase(),
        password: password.trim(),
        referral_code: code,
      }),
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '네트워크 오류' };
  }

  const text = await res.text();
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { ok: false, error: text || res.statusText };
  }

  if (!res.ok) {
    return { ok: false, error: (j.error as string) || text || res.statusText };
  }

  if (j.pendingApproval === true) {
    return {
      ok: true,
      pendingApproval: true,
      message: (j.message as string) || '가입 신청이 접수되었습니다. 총판 승인 후 로그인할 수 있습니다.',
    };
  }

  const accessToken = j.accessToken as string | undefined;
  const refreshToken = j.refreshToken as string | undefined;
  const role = j.role as string | undefined;
  if (!accessToken || !refreshToken || role !== 'user') {
    return { ok: false, error: '예상치 못한 가입 응답입니다.' };
  }

  return { ok: true, pendingApproval: false, accessToken, refreshToken, role };
}
