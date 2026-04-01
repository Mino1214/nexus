import { useCallback, useEffect, useState } from 'react';
import type { AdminSession } from '../../admin/types';
import {
  htsApproveCharge,
  htsListChargeRequests,
  htsRejectCharge,
  type HtsChargeRequestRow,
} from '../../admin/htsApiClient';
import { hubApprovePendingSignup, hubListPendingSignups, hubRejectPendingSignup, type HubPendingUser } from '../hubApiClient';
import { HubDevHint, HubPanelShell, HubTablePlaceholder } from '../HubPanelShell';
import { HubGate } from '../HubGate';

function fmt(dt: string | undefined) {
  if (!dt) return '—';
  return String(dt).replace('T', ' ').slice(0, 19);
}

export function ApprovalHubPanel({ session }: { session: AdminSession }) {
  const [sub, setSub] = useState<'charge' | 'signup'>('charge');
  const [charges, setCharges] = useState<HtsChargeRequestRow[]>([]);
  const [pendingUsers, setPendingUsers] = useState<HubPendingUser[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [cr, pu] = await Promise.all([htsListChargeRequests(session), hubListPendingSignups(session)]);
      setCharges(cr.filter((r) => r.status === 'pending'));
      setPendingUsers(pu);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <HubGate session={session}>
      <HubPanelShell
        title="승인"
        subtitle="충전 확인 · 가입 승인"
        actions={
          <button type="button" className="btn-ghost btn-sm" onClick={() => void reload()} disabled={loading}>
            새로고침
          </button>
        }
      >
        <div className="hub-subtabs">
          <button type="button" className={sub === 'charge' ? 'active' : ''} onClick={() => setSub('charge')}>
            충전 확인
          </button>
          <button type="button" className={sub === 'signup' ? 'active' : ''} onClick={() => setSub('signup')}>
            가입 승인
          </button>
        </div>
        {err ? <p className="hub-err">{err}</p> : null}
        {loading ? <p className="tab-panel-muted">불러오는 중…</p> : null}

        {sub === 'charge' ? (
          charges.length === 0 && !loading ? (
            <HubTablePlaceholder cols={['유저', '금액', '총판', '일시', '작업']} emptyText="대기 중인 충전 신청이 없습니다." />
          ) : (
            <div className="hub-table-wrap">
              <table className="hub-table">
                <thead>
                  <tr>
                    <th>유저</th>
                    <th>금액</th>
                    <th>총판</th>
                    <th>일시</th>
                    <th>작업</th>
                  </tr>
                </thead>
                <tbody>
                  {charges.map((r) => (
                    <tr key={r.id}>
                      <td>{r.user_telegram || r.user_id}</td>
                      <td>{Number(r.amount).toLocaleString()}원</td>
                      <td>{r.operator_name || r.operator_login || '—'}</td>
                      <td>{fmt(r.created_at)}</td>
                      <td className="hub-actions">
                        <button
                          type="button"
                          className="btn-ghost btn-sm"
                          onClick={async () => {
                            try {
                              await htsApproveCharge(session, String(r.id));
                              await reload();
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
                            try {
                              await htsRejectCharge(session, String(r.id));
                              await reload();
                            } catch (e) {
                              setErr(e instanceof Error ? e.message : String(e));
                            }
                          }}
                        >
                          거절
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : pendingUsers.length === 0 && !loading ? (
          <HubTablePlaceholder cols={['아이디', '총판', '신청일', '작업']} emptyText="승인 대기 가입이 없습니다." />
        ) : (
          <div className="hub-table-wrap">
            <table className="hub-table">
              <thead>
                <tr>
                  <th>아이디</th>
                  <th>총판</th>
                  <th>신청일</th>
                  <th>작업</th>
                </tr>
              </thead>
              <tbody>
                {pendingUsers.map((u) => (
                  <tr key={u.id}>
                    <td>{u.id}</td>
                    <td>{u.operator_login || u.operator_name || u.operator_mu_user_id || '—'}</td>
                    <td>{fmt(u.created_at)}</td>
                    <td className="hub-actions">
                      <button
                        type="button"
                        className="btn-ghost btn-sm"
                        onClick={async () => {
                          try {
                            await hubApprovePendingSignup(session, u.id);
                            await reload();
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
                          if (!confirm(`${u.id} 가입을 거절하고 삭제할까요?`)) return;
                          try {
                            await hubRejectPendingSignup(session, u.id);
                            await reload();
                          } catch (e) {
                            setErr(e instanceof Error ? e.message : String(e));
                          }
                        }}
                      >
                        거절
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <HubDevHint>충전은 HTS 모듈 <code>hts_charge_requests</code> · 가입은 <code>users.approval_status</code> 입니다.</HubDevHint>
      </HubPanelShell>
    </HubGate>
  );
}
