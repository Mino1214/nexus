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

/* ── 환율 + 잔액 ── */

export type HtsBalance = { krw: number; usdt: number; usdKrw: number };

export async function chartFetchBalance(session: AdminSession): Promise<HtsBalance> {
  const base = getMarketApiBase();
  if (!base) throw new Error('API 베이스 없음');
  const res = await fetch(marketApiUrl(base, '/hts/balance'), { headers: headers(session, false) });
  const j = (await res.json().catch(() => ({}))) as HtsBalance & { error?: string };
  if (!res.ok) throw new Error(j.error || res.statusText);
  return { krw: Number(j.krw ?? 0), usdt: Number(j.usdt ?? 0), usdKrw: Number(j.usdKrw ?? 1380) };
}

export async function chartFetchExchangeRate(session: AdminSession): Promise<number> {
  const base = getMarketApiBase();
  if (!base) return 1380;
  try {
    const res = await fetch(marketApiUrl(base, '/hts/exchange-rate'), { headers: headers(session, false) });
    const j = (await res.json().catch(() => ({}))) as { usdKrw?: number };
    return Number(j.usdKrw ?? 1380);
  } catch {
    return 1380;
  }
}

export type ConvertResult = { ok: boolean; krw: number; usdt: number; rate: number };

export async function chartConvertBalance(
  session: AdminSession,
  from: 'KRW' | 'USDT',
  amount: number,
): Promise<ConvertResult> {
  const base = getMarketApiBase();
  if (!base) throw new Error('API 베이스 없음');
  const res = await fetch(marketApiUrl(base, '/hts/convert'), {
    method: 'POST',
    headers: headers(session),
    body: JSON.stringify({ from, amount }),
  });
  const j = (await res.json().catch(() => ({}))) as ConvertResult & { error?: string };
  if (!res.ok) throw new Error(j.error || res.statusText);
  return j;
}

export async function chartSubmitChargeRequest(
  session: AdminSession,
  amount: number,
  memo: string,
  currency: 'KRW' | 'USDT' = 'KRW',
): Promise<void> {
  const base = getMarketApiBase();
  if (!base) throw new Error('API 베이스 없음');
  const endpoint = currency === 'USDT' ? '/hts/charge-request-v2' : '/hts/charge-request';
  const res = await fetch(marketApiUrl(base, endpoint), {
    method: 'POST',
    headers: headers(session),
    body: JSON.stringify({ amount, memo: memo || undefined, currency }),
  });
  const j = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(j.error || res.statusText);
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
