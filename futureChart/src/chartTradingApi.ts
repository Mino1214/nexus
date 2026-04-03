import type { AdminSession } from './admin/types';
import { getEffectiveHtsModuleSlug } from './config/htsModuleEnv';
import { getMarketApiBase } from './config/marketApiEnv';
import { marketApiUrl } from './config/marketPaths';

function headers(session: AdminSession, json = true): HeadersInit {
  const h: Record<string, string> = {};
  if (json) h['Content-Type'] = 'application/json';
  if (session.accessToken) h['Authorization'] = `Bearer ${session.accessToken}`;
  h['X-HTS-Module'] = session.htsModuleSlug?.trim() || getEffectiveHtsModuleSlug();
  return h;
}

export type ChartUserMe = {
  cashBalance: number;
  pointsBalance: number;
};

export async function chartFetchUserMe(session: AdminSession): Promise<ChartUserMe> {
  const base = getMarketApiBase();
  if (!base) throw new Error('API 베이스 없음');
  const res = await fetch(marketApiUrl(base, '/user/me'), { headers: headers(session, false) });
  const j = (await res.json().catch(() => ({}))) as {
    cashBalance?: number;
    pointsBalance?: number;
    error?: string;
  };
  if (!res.ok) throw new Error(j.error || res.statusText);
  return {
    cashBalance: Number(j.cashBalance ?? 0),
    pointsBalance: Number(j.pointsBalance ?? 0),
  };
}

export type HtsPaperTradeRow = {
  id: number;
  side: string;
  provider: string;
  symbol: string;
  price: number;
  qty: number;
  notional: number;
  executed_at_ms: number;
};

export async function chartListPaperTrades(
  session: AdminSession,
  provider: string,
  symbol: string,
  limit = 120,
): Promise<HtsPaperTradeRow[]> {
  const base = getMarketApiBase();
  if (!base) throw new Error('API 베이스 없음');
  const q = new URLSearchParams({ provider, symbol, limit: String(limit) });
  const res = await fetch(marketApiUrl(base, `/user/hts-paper-trades?${q}`), {
    headers: headers(session, false),
  });
  const j = (await res.json().catch(() => ({}))) as { trades?: HtsPaperTradeRow[]; error?: string };
  if (!res.ok) throw new Error(j.error || res.statusText);
  return j.trades ?? [];
}

export type PaperOrderResult = {
  ok: boolean;
  balance: number;
  notional: number;
  executedAtMs: number;
  side: string;
};

export async function chartPaperOrder(
  session: AdminSession,
  body: { side: 'buy' | 'sell'; provider: string; symbol: string; price: number; qty: number },
): Promise<PaperOrderResult> {
  const base = getMarketApiBase();
  if (!base) throw new Error('API 베이스 없음');
  const res = await fetch(marketApiUrl(base, '/user/hts-paper-order'), {
    method: 'POST',
    headers: headers(session),
    body: JSON.stringify(body),
  });
  const j = (await res.json().catch(() => ({}))) as PaperOrderResult & {
    error?: string;
    code?: string;
    balance?: number;
    notional?: number;
    netQty?: number;
  };
  if (!res.ok) {
    const err = new Error(j.error || res.statusText) as Error & {
      code?: string;
      balance?: number;
      notional?: number;
      netQty?: number;
    };
    err.code = j.code;
    if (typeof j.balance === 'number') err.balance = j.balance;
    if (typeof j.notional === 'number') err.notional = j.notional;
    if (typeof j.netQty === 'number') err.netQty = j.netQty;
    throw err;
  }
  return j as PaperOrderResult;
}

export async function chartSubmitChargeRequest(
  session: AdminSession,
  amount: number,
  memo: string,
): Promise<void> {
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
