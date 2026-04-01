import type { AdminSession, ChargeStatus } from './types';
import { getEffectiveHtsModuleSlug } from '../config/htsModuleEnv';
import { getMarketApiBase } from '../config/marketApiEnv';
import { marketApiUrl } from '../config/marketPaths';

export function parseOperatorNumericId(distributorId: string | undefined): number | null {
  if (!distributorId || !distributorId.startsWith('op-')) return null;
  const n = parseInt(distributorId.slice(3), 10);
  return Number.isNaN(n) ? null : n;
}

export function isHtsApiSession(s: AdminSession): boolean {
  return Boolean(s.accessToken && getMarketApiBase());
}

function headers(session: AdminSession, json = true): HeadersInit {
  const h: Record<string, string> = {};
  if (json) h['Content-Type'] = 'application/json';
  if (session.accessToken) h['Authorization'] = `Bearer ${session.accessToken}`;
  const slug = session.htsModuleSlug?.trim() || getEffectiveHtsModuleSlug();
  h['X-HTS-Module'] = slug;
  return h;
}

export type HtsChargeRequestRow = {
  id: number;
  user_id: string;
  amount: number;
  memo: string | null;
  status: string;
  module_code: string | null;
  operator_mu_user_id: number | null;
  created_at: string;
  user_telegram: string | null;
  operator_name: string | null;
  operator_login: string | null;
};

export async function htsListChargeRequests(session: AdminSession): Promise<HtsChargeRequestRow[]> {
  const base = getMarketApiBase();
  if (!base) throw new Error('API 베이스 없음');
  const res = await fetch(marketApiUrl(base, '/hts/charge-requests'), { headers: headers(session, false) });
  const j = (await res.json().catch(() => ({}))) as { requests?: HtsChargeRequestRow[]; error?: string };
  if (!res.ok) throw new Error(j.error || res.statusText);
  return j.requests ?? [];
}

export async function htsSubmitChargeRequest(session: AdminSession, amount: number, memo: string): Promise<void> {
  const base = getMarketApiBase();
  if (!base) throw new Error('API 베이스 없음');
  const res = await fetch(marketApiUrl(base, '/hts/charge-request'), {
    method: 'POST',
    headers: headers(session),
    body: JSON.stringify({ amount, memo: memo || undefined }),
  });
  const j = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(j.error || res.statusText);
}

export async function htsApproveCharge(session: AdminSession, id: string): Promise<void> {
  const base = getMarketApiBase();
  if (!base) throw new Error('API 베이스 없음');
  const res = await fetch(marketApiUrl(base, `/hts/charge-requests/${encodeURIComponent(id)}/approve`), {
    method: 'POST',
    headers: headers(session),
    body: '{}',
  });
  const j = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(j.error || res.statusText);
}

export async function htsRejectCharge(session: AdminSession, id: string): Promise<void> {
  const base = getMarketApiBase();
  if (!base) throw new Error('API 베이스 없음');
  const res = await fetch(marketApiUrl(base, `/hts/charge-requests/${encodeURIComponent(id)}/reject`), {
    method: 'POST',
    headers: headers(session),
    body: '{}',
  });
  const j = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(j.error || res.statusText);
}

export type HtsOperatorRow = { id: string; name: string; loginId?: string; siteDomain?: string | null };

export async function htsListOperators(session: AdminSession): Promise<HtsOperatorRow[]> {
  const base = getMarketApiBase();
  if (!base) throw new Error('API 베이스 없음');
  const res = await fetch(marketApiUrl(base, '/hts/operators'), { headers: headers(session, false) });
  const j = (await res.json().catch(() => ({}))) as { operators?: HtsOperatorRow[]; error?: string };
  if (!res.ok) throw new Error(j.error || res.statusText);
  return j.operators ?? [];
}

export type HtsManagedUserRow = {
  id: string;
  telegram: string | null;
  status: string;
  operator_mu_user_id: number | null;
  market_status: string;
};

export async function htsListManagedUsers(session: AdminSession): Promise<HtsManagedUserRow[]> {
  const base = getMarketApiBase();
  if (!base) throw new Error('API 베이스 없음');
  const res = await fetch(marketApiUrl(base, '/hts/managed-users'), { headers: headers(session, false) });
  const j = (await res.json().catch(() => ({}))) as { users?: HtsManagedUserRow[]; error?: string };
  if (!res.ok) throw new Error(j.error || res.statusText);
  return j.users ?? [];
}

export async function htsSetUserMarketStatus(
  session: AdminSession,
  userId: string,
  market_status: 'active' | 'suspended',
): Promise<void> {
  const base = getMarketApiBase();
  if (!base) throw new Error('API 베이스 없음');
  const res = await fetch(marketApiUrl(base, `/hts/managed-users/${encodeURIComponent(userId)}/market-status`), {
    method: 'PATCH',
    headers: headers(session),
    body: JSON.stringify({ market_status }),
  });
  const j = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(j.error || res.statusText);
}

export async function htsRegisterUser(
  session: AdminSession,
  id: string,
  password: string,
  operatorMuUserId: number,
): Promise<void> {
  const base = getMarketApiBase();
  if (!base) throw new Error('API 베이스 없음');
  const res = await fetch(marketApiUrl(base, '/auth/register'), {
    method: 'POST',
    headers: headers(session),
    body: JSON.stringify({
      id: id.trim().toLowerCase(),
      password,
      operator_mu_user_id: operatorMuUserId,
    }),
  });
  const j = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(j.error || res.statusText);
}

export function mapHtsRowToChargeRequest(r: HtsChargeRequestRow, distributorNameFallback: string) {
  const opId = r.operator_mu_user_id != null ? String(r.operator_mu_user_id) : '';
  const ts = r.created_at ? String(r.created_at).replace('T', ' ').slice(0, 16) : '';
  return {
    id: String(r.id),
    userId: r.user_id,
    userName: r.user_telegram?.trim() || r.user_id,
    distributorId: opId ? `op-${opId}` : 'op-?',
    distributorName: r.operator_name || r.operator_login || distributorNameFallback || `운영자 ${opId}`,
    amount: Number(r.amount),
    status: (r.status === 'approved' || r.status === 'rejected' ? r.status : 'pending') as ChargeStatus,
    createdAt: ts,
    memo: r.memo || undefined,
  };
}
