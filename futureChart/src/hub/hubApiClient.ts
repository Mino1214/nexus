import type { AdminSession } from '../admin/types';
import { getEffectiveHtsModuleSlug } from '../config/htsModuleEnv';
import { getMarketApiBase } from '../config/marketApiEnv';
import { marketApiUrl } from '../config/marketPaths';

function hubHeaders(session: AdminSession, json = true): HeadersInit {
  const h: Record<string, string> = {};
  if (json) h['Content-Type'] = 'application/json';
  if (session.accessToken) h['Authorization'] = `Bearer ${session.accessToken}`;
  h['X-HTS-Module'] = session.htsModuleSlug?.trim() || getEffectiveHtsModuleSlug();
  return h;
}

async function hubFetchJson<T>(session: AdminSession, path: string, init?: RequestInit): Promise<T> {
  const base = getMarketApiBase();
  if (!base) throw new Error('API 베이스 없음');
  const method = (init?.method || 'GET').toUpperCase();
  const withJsonBody = ['POST', 'PUT', 'PATCH'].includes(method) && init?.body != null;
  const res = await fetch(marketApiUrl(base, path), {
    ...init,
    headers: { ...hubHeaders(session, withJsonBody), ...(init?.headers as Record<string, string>) },
  });
  const j = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(j.error || res.statusText);
  return j;
}

export type HubPendingUser = {
  id: string;
  operator_mu_user_id: number | null;
  market_status: string;
  created_at?: string;
  operator_login?: string | null;
  operator_name?: string | null;
};

export async function hubListPendingSignups(session: AdminSession): Promise<HubPendingUser[]> {
  const j = await hubFetchJson<{ users: HubPendingUser[] }>(session, '/hts/hub/pending-signups');
  return j.users ?? [];
}

export async function hubApprovePendingSignup(session: AdminSession, userId: string): Promise<void> {
  await hubFetchJson(session, `/hts/hub/pending-signups/${encodeURIComponent(userId)}/approve`, {
    method: 'POST',
    body: '{}',
  });
}

export async function hubRejectPendingSignup(session: AdminSession, userId: string): Promise<void> {
  await hubFetchJson(session, `/hts/hub/pending-signups/${encodeURIComponent(userId)}/reject`, {
    method: 'POST',
    body: '{}',
  });
}

export type HubOperatorRow = {
  id: number;
  name: string;
  login_id: string;
  status: string;
  site_domain: string | null;
  is_site_active: number;
  referral_code?: string | null;
  settlement_rate?: number | string | null;
};

export async function hubListOperators(session: AdminSession): Promise<HubOperatorRow[]> {
  const j = await hubFetchJson<{ operators: HubOperatorRow[] }>(session, '/hts/hub/operators');
  return j.operators ?? [];
}

export async function hubCreateOperator(
  session: AdminSession,
  body: { name: string; login_id: string; password: string; site_domain?: string; settlement_rate?: number },
): Promise<{ id: number; referral_code: string; settlement_rate: number }> {
  const j = await hubFetchJson<{ id: number; referral_code?: string; settlement_rate?: number }>(
    session,
    '/hts/hub/operators',
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  );
  return {
    id: j.id,
    referral_code: String(j.referral_code || ''),
    settlement_rate: Number(j.settlement_rate ?? 10),
  };
}

export async function hubPatchOperator(
  session: AdminSession,
  id: number,
  body: Partial<{
    name: string;
    password: string;
    site_domain: string | null;
    is_site_active: boolean;
    status: string;
    settlement_rate: number;
  }>,
): Promise<void> {
  await hubFetchJson(session, `/hts/hub/operators/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export async function hubDeleteOperator(session: AdminSession, id: number): Promise<void> {
  await hubFetchJson(session, `/hts/hub/operators/${id}`, { method: 'DELETE' });
}

export async function hubPatchManagedUser(
  session: AdminSession,
  userId: string,
  body: { telegram?: string; market_status?: 'active' | 'suspended' },
): Promise<void> {
  await hubFetchJson(session, `/hts/hub/managed-users/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export type HubCashTx = {
  id: number;
  user_id: string;
  amount: number;
  type: string;
  description: string | null;
  module_code: string | null;
  created_at: string;
  operator_mu_user_id: number | null;
  operator_name: string | null;
  operator_login: string | null;
};

export async function hubListCashLedger(session: AdminSession, limit = 200): Promise<HubCashTx[]> {
  const j = await hubFetchJson<{ transactions: HubCashTx[]; types?: string[] }>(
    session,
    `/hts/hub/cash-ledger?limit=${encodeURIComponent(String(limit))}`,
  );
  return j.transactions ?? [];
}

export async function hubListCashLedgerTypes(session: AdminSession): Promise<string[]> {
  const j = await hubFetchJson<{ transactions: HubCashTx[]; types?: string[] }>(
    session,
    `/hts/hub/cash-ledger?limit=1`,
  );
  return j.types ?? [];
}

export type HubNotifySettings = {
  scopeKey: string;
  botToken: string;
  chatDeposit: string;
  chatSignup: string;
};

export async function hubGetNotifySettings(session: AdminSession): Promise<HubNotifySettings> {
  return hubFetchJson<HubNotifySettings>(session, '/hts/hub/notify-settings');
}

export async function hubPutNotifySettings(
  session: AdminSession,
  body: { botToken?: string; chatDeposit?: string; chatSignup?: string },
): Promise<void> {
  await hubFetchJson(session, '/hts/hub/notify-settings', {
    method: 'PUT',
    body: JSON.stringify({
      botToken: body.botToken,
      chatDeposit: body.chatDeposit,
      chatSignup: body.chatSignup,
    }),
  });
}

export type HubWithdrawalRow = {
  id: number;
  operator_mu_user_id: number;
  amount: number;
  wallet_address: string;
  status: string;
  reject_reason: string | null;
  requested_at: string;
  processed_at: string | null;
  operator_login?: string | null;
  operator_name?: string | null;
};

export async function hubListWithdrawals(session: AdminSession): Promise<HubWithdrawalRow[]> {
  const j = await hubFetchJson<{ withdrawals: HubWithdrawalRow[] }>(session, '/hts/hub/withdrawals');
  return j.withdrawals ?? [];
}

export async function hubCreateWithdrawal(session: AdminSession, amount: number, wallet_address: string): Promise<void> {
  await hubFetchJson(session, '/hts/hub/withdrawals', {
    method: 'POST',
    body: JSON.stringify({ amount, wallet_address }),
  });
}

export async function hubApproveWithdrawal(session: AdminSession, id: number): Promise<void> {
  await hubFetchJson(session, `/hts/hub/withdrawals/${id}/approve`, { method: 'POST', body: '{}' });
}

export async function hubRejectWithdrawal(session: AdminSession, id: number, reason?: string): Promise<void> {
  await hubFetchJson(session, `/hts/hub/withdrawals/${id}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reason: reason || '' }),
  });
}

/* ── 가격 설정 ─────────────────────────────────── */

export type HubPricingSettings = {
  charge_fee_rate: number;
  withdraw_fee_rate: number;
  min_charge_krw: number;
  min_withdraw_krw: number;
  usdt_markup_rate: number;
};

export async function hubGetExchangeRate(): Promise<number> {
  const base = getMarketApiBase();
  if (!base) throw new Error('API 베이스 없음');
  const res = await fetch(marketApiUrl(base, '/hts/exchange-rate'));
  const j = await res.json().catch(() => ({})) as { krwPerUsd?: number; error?: string };
  if (!res.ok) throw new Error(j.error || res.statusText);
  return Number(j.krwPerUsd ?? 0);
}

export async function hubGetPricingSettings(session: AdminSession): Promise<HubPricingSettings> {
  const j = await hubFetchJson<{ settings: HubPricingSettings }>(session, '/hts/hub/pricing-settings');
  return j.settings ?? { charge_fee_rate: 0, withdraw_fee_rate: 0, min_charge_krw: 10000, min_withdraw_krw: 10000, usdt_markup_rate: 0 };
}

export async function hubPutPricingSettings(session: AdminSession, body: HubPricingSettings): Promise<void> {
  await hubFetchJson(session, '/hts/hub/pricing-settings', { method: 'PUT', body: JSON.stringify(body) });
}

/* ── 텔레그램 설정 ─────────────────────────────── */

export type HubTelegramSettings = {
  channel_url: string;
  support_username: string;
  announcement_chat_id: string;
  trade_alert_chat_id: string;
};

export async function hubGetTelegramSettings(session: AdminSession): Promise<HubTelegramSettings> {
  const j = await hubFetchJson<{ settings: HubTelegramSettings }>(session, '/hts/hub/telegram-settings');
  return j.settings ?? { channel_url: '', support_username: '', announcement_chat_id: '', trade_alert_chat_id: '' };
}

export async function hubPutTelegramSettings(session: AdminSession, body: HubTelegramSettings): Promise<void> {
  await hubFetchJson(session, '/hts/hub/telegram-settings', { method: 'PUT', body: JSON.stringify(body) });
}

/* ── 공지 팝업 ─────────────────────────────────── */

export type HubPopupRow = {
  id: number;
  title: string;
  body: string | null;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
};

export async function hubListPopups(session: AdminSession): Promise<HubPopupRow[]> {
  const j = await hubFetchJson<{ popups: HubPopupRow[] }>(session, '/hts/hub/popups');
  return j.popups ?? [];
}

export async function hubCreatePopup(
  session: AdminSession,
  body: { title: string; body?: string; starts_at?: string; ends_at?: string },
): Promise<void> {
  await hubFetchJson(session, '/hts/hub/popups', { method: 'POST', body: JSON.stringify(body) });
}

export async function hubPatchPopup(session: AdminSession, id: number, body: { is_active?: boolean; title?: string; body?: string }): Promise<void> {
  await hubFetchJson(session, `/hts/hub/popups/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
}

export async function hubDeletePopup(session: AdminSession, id: number): Promise<void> {
  await hubFetchJson(session, `/hts/hub/popups/${id}`, { method: 'DELETE' });
}

/* ── 다운로드 ──────────────────────────────────── */

export type HubDownloadRow = {
  id: number;
  name: string;
  version: string | null;
  platform: string;
  url: string;
  note: string | null;
  is_active: boolean;
  created_at: string;
};

export async function hubListDownloads(session: AdminSession): Promise<HubDownloadRow[]> {
  const j = await hubFetchJson<{ downloads: HubDownloadRow[] }>(session, '/hts/hub/downloads');
  return j.downloads ?? [];
}

export async function hubCreateDownload(
  session: AdminSession,
  body: { name: string; version?: string; platform: string; url: string; note?: string },
): Promise<void> {
  await hubFetchJson(session, '/hts/hub/downloads', { method: 'POST', body: JSON.stringify(body) });
}

export async function hubPatchDownload(session: AdminSession, id: number, body: { is_active?: boolean; name?: string; url?: string }): Promise<void> {
  await hubFetchJson(session, `/hts/hub/downloads/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
}

export async function hubDeleteDownload(session: AdminSession, id: number): Promise<void> {
  await hubFetchJson(session, `/hts/hub/downloads/${id}`, { method: 'DELETE' });
}
