import { useCallback, useEffect, useState } from 'react';
import type { AdminSession } from '../../admin/types';
import { hubListCashLedger, type HubCashTx } from '../hubApiClient';
import { HubPanelShell } from '../HubPanelShell';
import { HubGate } from '../HubGate';

function fmt(dt: string | undefined) {
  if (!dt) return '—';
  return String(dt).replace('T', ' ').slice(0, 19);
}

export function LedgerHubPanel({ session }: { session: AdminSession }) {
  const [rows, setRows] = useState<HubCashTx[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const t = await hubListCashLedger(session, 300);
      setRows(t);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <HubGate session={session}>
      <HubPanelShell
        title="정산내역"
        subtitle="캐시 입출금 거래 (market_cash_transactions)"
        actions={
          <button type="button" className="btn-ghost btn-sm" onClick={() => void load()} disabled={loading}>
            새로고침
          </button>
        }
      >
        {err ? <p className="hub-err">{err}</p> : null}
        {loading ? <p className="tab-panel-muted">불러오는 중…</p> : null}
        <div className="hub-table-wrap">
          <table className="hub-table">
            <thead>
              <tr>
                <th>일시</th>
                <th>유저</th>
                <th>유형</th>
                <th>금액</th>
                <th>설명</th>
                <th>총판</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && !loading ? (
                <tr>
                  <td colSpan={6} className="hub-table-empty">
                    거래 내역이 없습니다.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id}>
                    <td>{fmt(r.created_at)}</td>
                    <td>{r.user_id}</td>
                    <td>{r.type}</td>
                    <td>{Number(r.amount).toLocaleString()}</td>
                    <td>{r.description || '—'}</td>
                    <td>{r.operator_mu_user_id ?? '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </HubPanelShell>
    </HubGate>
  );
}
