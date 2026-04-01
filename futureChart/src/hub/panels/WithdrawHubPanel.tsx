import { useCallback, useEffect, useState } from 'react';
import type { AdminSession } from '../../admin/types';
import { hubCreateWithdrawal, hubListWithdrawals, type HubWithdrawalRow } from '../hubApiClient';
import { HubPanelShell } from '../HubPanelShell';
import { HubGate } from '../HubGate';

function fmt(dt: string | undefined) {
  if (!dt) return '—';
  return String(dt).replace('T', ' ').slice(0, 19);
}

/** 총판(운영자) 전용 출금 신청 */
export function WithdrawHubPanel({ session }: { session: AdminSession }) {
  const isOp = session.role === 'distributor' || session.marketRole === 'operator';
  const [rows, setRows] = useState<HubWithdrawalRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [amt, setAmt] = useState('');
  const [wallet, setWallet] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const w = await hubListWithdrawals(session);
      setRows(w);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!isOp) {
    return (
      <HubPanelShell title="출금신청" subtitle="총판(운영자) 계정으로 로그인하면 신청할 수 있습니다.">
        <p className="tab-panel-muted">마스터는 «정산관리» 탭에서 전체 출금 요청을 처리합니다.</p>
      </HubPanelShell>
    );
  }

  return (
    <HubGate session={session}>
      <HubPanelShell
        title="출금신청"
        subtitle="총판 정산 출금 요청"
        actions={
          <button type="button" className="btn-ghost btn-sm" onClick={() => void load()} disabled={loading}>
            새로고침
          </button>
        }
      >
        {err ? <p className="hub-err">{err}</p> : null}
        <div className="hub-form-grid hub-form-grid--narrow">
          <label className="hub-field">
            <span>금액 (원·정수)</span>
            <input inputMode="numeric" value={amt} onChange={(e) => setAmt(e.target.value)} />
          </label>
          <label className="hub-field">
            <span>지갑 주소</span>
            <input value={wallet} onChange={(e) => setWallet(e.target.value)} placeholder="USDT 등" />
          </label>
        </div>
        <div className="hub-form-actions">
          <button
            type="button"
            className="btn-ghost btn-sm"
            onClick={async () => {
              const n = parseInt(amt, 10);
              if (Number.isNaN(n) || n <= 0 || !wallet.trim()) {
                setErr('금액과 지갑 주소를 입력하세요.');
                return;
              }
              try {
                await hubCreateWithdrawal(session, n, wallet.trim());
                setAmt('');
                setWallet('');
                await load();
              } catch (e) {
                setErr(e instanceof Error ? e.message : String(e));
              }
            }}
          >
            신청
          </button>
        </div>
        <div className="hub-table-wrap" style={{ marginTop: 16 }}>
          <table className="hub-table">
            <thead>
              <tr>
                <th>일시</th>
                <th>금액</th>
                <th>지갑</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{fmt(r.requested_at)}</td>
                  <td>{Number(r.amount).toLocaleString()}</td>
                  <td style={{ wordBreak: 'break-all', maxWidth: 200 }}>{r.wallet_address}</td>
                  <td>{r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </HubPanelShell>
    </HubGate>
  );
}
