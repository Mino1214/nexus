import { useCallback, useEffect, useState } from 'react';
import type { AdminSession } from '../../admin/types';
import { hubApproveWithdrawal, hubListWithdrawals, hubRejectWithdrawal, type HubWithdrawalRow } from '../hubApiClient';
import { HubPanelShell } from '../HubPanelShell';
import { HubGate } from '../HubGate';

function fmt(dt: string | undefined) {
  if (!dt) return '—';
  return String(dt).replace('T', ' ').slice(0, 19);
}

/** 마스터·can_admin — 총판 출금 목록 승인/거절 */
export function SettleMgmtHubPanel({ session }: { session: AdminSession }) {
  const isMasterUi = session.role === 'master';
  const [rows, setRows] = useState<HubWithdrawalRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
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

  if (!isMasterUi) {
    return (
      <HubPanelShell title="정산관리" subtitle="마스터·콘솔 관리자만 전체 총판 출금을 처리할 수 있습니다.">
        <p className="tab-panel-muted">총판 계정은 «출금신청» 탭을 이용하세요.</p>
      </HubPanelShell>
    );
  }

  return (
    <HubGate session={session}>
      <HubPanelShell
        title="정산관리"
        subtitle="총판 출금 신청 목록 (hts_operator_withdrawals)"
        actions={
          <button type="button" className="btn-ghost btn-sm" onClick={() => void load()} disabled={loading}>
            새로고침
          </button>
        }
      >
        {err ? <p className="hub-err">{err}</p> : null}
        <div className="hub-table-wrap">
          <table className="hub-table">
            <thead>
              <tr>
                <th>일시</th>
                <th>총판</th>
                <th>금액</th>
                <th>지갑</th>
                <th>상태</th>
                <th>작업</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{fmt(r.requested_at)}</td>
                  <td>
                    {r.operator_login || r.operator_name || r.operator_mu_user_id}
                  </td>
                  <td>{Number(r.amount).toLocaleString()}</td>
                  <td style={{ wordBreak: 'break-all', maxWidth: 160 }}>{r.wallet_address}</td>
                  <td>{r.status}</td>
                  <td className="hub-actions">
                    {r.status === 'pending' ? (
                      <>
                        <button
                          type="button"
                          className="btn-ghost btn-sm"
                          onClick={async () => {
                            try {
                              await hubApproveWithdrawal(session, r.id);
                              await load();
                            } catch (e) {
                              setErr(e instanceof Error ? e.message : String(e));
                            }
                          }}
                        >
                          승인
                        </button>
                        <button
                          type="button"
                          className="btn-ghost btn-sm"
                          onClick={async () => {
                            const reason = window.prompt('거절 사유 (선택)') || '';
                            try {
                              await hubRejectWithdrawal(session, r.id, reason);
                              await load();
                            } catch (e) {
                              setErr(e instanceof Error ? e.message : String(e));
                            }
                          }}
                        >
                          거절
                        </button>
                      </>
                    ) : (
                      <span className="tab-panel-muted">{r.reject_reason || '—'}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </HubPanelShell>
    </HubGate>
  );
}
