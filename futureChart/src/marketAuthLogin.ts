import type { AdminSession, AdminRole } from './admin/types';
import { getMarketApiBase } from './config/marketApiEnv';
import { getEffectiveHtsModuleSlug } from './config/htsModuleEnv';
import { marketApiUrl } from './config/marketPaths';

type MarketLoginOk = {
  accessToken: string;
  refreshToken: string;
  role: 'master' | 'operator' | 'user';
  sub: string;
  displayName?: string;
  operatorMuUserId?: number | null;
  hts?: {
    kind?: string;
    moduleSlug?: string;
    canAdmin?: boolean;
    canOperator?: boolean;
    customerId?: number | null;
    customerName?: string | null;
    flagsJson?: string | null;
  } | null;
};

function mapToAdminSession(j: MarketLoginOk): AdminSession {
  const h = j.hts;
  let uiRole: AdminRole = 'user';
  if (j.role === 'master') {
    uiRole = 'master';
  } else if (j.role === 'operator') {
    uiRole = 'distributor';
  } else if (j.role === 'user') {
    if (h?.canAdmin) uiRole = 'master';
    else if (h?.canOperator) uiRole = 'distributor';
    else uiRole = 'user';
  }

  const distributorId =
    uiRole === 'distributor'
      ? j.operatorMuUserId != null
        ? `op-${j.operatorMuUserId}`
        : j.role === 'user' && h?.kind === 'customer_user'
          ? `cust-${h.customerId ?? 'x'}`
          : 'd001'
      : undefined;

  return {
    role: uiRole,
    id: j.sub,
    displayName: j.displayName || j.sub,
    distributorId,
    authSource: 'market',
    accessToken: j.accessToken,
    refreshToken: j.refreshToken,
    marketRole: j.role,
    operatorMuUserId: j.operatorMuUserId ?? null,
    htsCustomerId: h?.customerId ?? undefined,
    htsModuleSlug: h?.moduleSlug || getEffectiveHtsModuleSlug(),
  };
}

export async function loginViaMarketApi(loginId: string, password: string): Promise<{ session: AdminSession } | { error: string }> {
  const base = getMarketApiBase();
  const slug = getEffectiveHtsModuleSlug();
  if (!base) return { error: 'API 베이스가 설정되지 않았습니다.' };

  let res: Response;
  try {
    res = await fetch(marketApiUrl(base, '/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'omit',
      body: JSON.stringify({
        login_id: loginId.trim(),
        password: password.trim(),
        hts_module_slug: slug,
      }),
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : '네트워크 오류' };
  }

  const text = await res.text();
  let j: unknown;
  try {
    j = JSON.parse(text) as MarketLoginOk & { error?: string };
  } catch {
    return { error: text || res.statusText };
  }

  if (!res.ok) {
    const err = (j as { error?: string })?.error;
    return { error: err || text || res.statusText };
  }

  const body = j as MarketLoginOk;
  if (!body.accessToken || !body.refreshToken || !body.role || body.sub == null) {
    return { error: '로그인 응답 형식이 올바르지 않습니다.' };
  }

  return { session: mapToAdminSession(body) };
}
