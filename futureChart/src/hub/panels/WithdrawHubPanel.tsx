import { useCallback, useEffect, useState } from 'react';
import type { AdminSession } from '../../admin/types';
import { hubCreateWithdrawal, hubListWithdrawals, type HubWithdrawalRow } from '../hubApiClient';
import { HubPanelShell } from '../HubPanelShell';
import { HubGate } from '../HubGate';

function fmt(dt: string | undefined) {
  if (!dt) return '—';
  return String(dt).replace('T', ' ').slice(0, 16);
}

const STATUS_BADGE: Record<string, string> = {
  pending:  'hub-badge--gray',
  approved: 'hub-badge--green',
  rejected: 'hub-badge--red',
};
const STATUS_LABEL: Record<string, string> = {
  pending: '대기', approved: '승인', rejected: '거절',
};

export function WithdrawHubPanel({ session }: { session: AdminSession }) {
  const isOp = session.role === 'distributor' || session.marketRole === 'operator';
  const [rows, setRows] = useState<HubWithdrawalRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [amt, setAmt] = useState('');
  const [wallet, setWallet] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try { setRows(await hubListWithdrawals(session)); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, [session]);

  useEffect(() => { void load(); }, [load]);

  if (!isOp) {
    return (
      <HubPanelShell title="출금신청">
        <div className="hub-empty">
          <span className="hub-empty-icon">💸</span>
          <p>총판(운영자) 계정으로 로그인하면<br/>출금을 신청할 수 있습니다.</p>
          <p style={{ fontSize: 12, marginTop: 4, opacity: 0.6 }}>마스터는 «정산관리» 탭에서 처리합니다.</p>
        </div>
      </HubPanelShell>
    );
  }

  const pending = rows.filter((r) => r.status === 'pending');
  const approved = rows.filter((r) => r.status === 'approved');

  return (
    <HubGate session={session}>
      <HubPanelShell
        title="출금신청"
        actions={
          <button type="button" className="hub-refresh-btn" onClick={() => void load()} disabled={loading}>
            {loading ? '…' : '↻'}
          </button>
        }
      >
        {err ? <div className="hub-msg hub-msg--err">{err}<button type="button" onClick={() => setErr(null)}>×</button></div> : null}
        {ok  ? <div className="hub-msg hub-msg--ok">{ok}</div> : null}

        {/* 요약 */}
        <div className="hub-stat-row">
          <div className="hub-stat-card">
            <div className="hub-stat-label">대기</div>
            <div className="hub-stat-value">{pending.length}</div>
          </div>
          <div className="hub-stat-card">
            <div className="hub-stat-label">누적 출금</div>
            <div className="hub-stat-value hub-stat-value--green">
              {approved.reduce((s, r) => s + Number(r.amount), 0).toLocaleString()}원
            </div>
          </div>
        </div>

        {/* 출금 신청 폼 */}
        <div className="hub-withdraw-form">
          <h3 className="hub-section-title">새 출금 신청</h3>
          <div className="hub-inline-form hub-form-compact">
            <input
              className="hub-input"
              inputMode="numeric"
              value={amt}
              onChange={(e) => setAmt(e.target.value)}
              placeholder="금액 (원)"
              style={{ minWidth: 120 }}
            />
            <input
              className="hub-input"
              value={wallet}
              onChange={(e) => setWallet(e.target.value)}
              placeholder="USDT 지갑 주소"
              style={{ flex: 1, minWidth: 200 }}
            />
            <button
              type="button"
              className="hub-btn hub-btn--primary"
              onClick={async () => {
                const n = parseInt(amt, 10);
                if (Number.isNaN(n) || n <= 0 || !wallet.trim()) { setErr('금액과 지갑 주소를 입력하세요.'); return; }
                try {
                  await hubCreateWithdrawal(session, n, wallet.trim());
                  setAmt(''); setWallet('');
                  setOk('출금 신청이 접수되었습니다.');
                  setTimeout(() => setOk(null), 2500);
                  await load();
                } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
              }}
            >
              신청
            </button>
          </div>
        </div>

        {/* 내역 */}
        {rows.length === 0 && !loading ? (
          <div className="hub-empty hub-empty--sm"><p>출금 신청 내역이 없습니다</p></div>
        ) : (
          <div className="hub-table-wrap">
            <table className="hub-table">
              <thead>
                <tr>
                  <th>신청일</th>
                  <th>금액</th>
                  <th>지갑 주소</th>
                  <th>상태</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="hub-cell-sub">{fmt(r.requested_at)}</td>
                    <td className="hub-cell-primary">{Number(r.amount).toLocaleString()}원</td>
                    <td style={{ wordBreak: 'break-all', maxWidth: 220, fontSize: 12 }}>{r.wallet_address}</td>
                    <td>
                      <span className={`hub-badge ${STATUS_BADGE[r.status] ?? 'hub-badge--gray'}`}>
                        {STATUS_LABEL[r.status] ?? r.status}
                      </span>
                      {r.reject_reason ? <span className="hub-cell-sub" style={{ marginLeft: 6 }}>{r.reject_reason}</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </HubPanelShell>
    </HubGate>
  );
}
