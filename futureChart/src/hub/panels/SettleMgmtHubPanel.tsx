import { useCallback, useEffect, useState } from 'react';
import type { AdminSession } from '../../admin/types';
import {
  hubApproveWithdrawal,
  hubListOperators,
  hubListWithdrawals,
  hubPatchOperator,
  hubRejectWithdrawal,
  type HubOperatorRow,
  type HubWithdrawalRow,
} from '../hubApiClient';
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
  const [operators, setOperators] = useState<HubOperatorRow[]>([]);
  const [rateDraft, setRateDraft] = useState<Record<number, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [w, o] = await Promise.all([hubListWithdrawals(session), hubListOperators(session)]);
      setRows(w);
      setOperators(o);
      const next: Record<number, string> = {};
      for (const op of o) {
        next[op.id] = String(op.settlement_rate ?? 10);
      }
      setRateDraft(next);
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
        subtitle="총판 정산 비율 · 출금 신청 (판도라 정산관리와 동일 개념)"
        actions={
          <button type="button" className="btn-ghost btn-sm" onClick={() => void load()} disabled={loading}>
            새로고침
          </button>
        }
      >
        {err ? <p className="hub-err">{err}</p> : null}
        <section className="hub-section" style={{ marginBottom: 24 }}>
          <h3 className="hub-section-title">총판 정산 비율</h3>
          <p className="tab-panel-muted" style={{ marginBottom: 8 }}>
            <code>mu_users.settlement_rate</code> — 신규 총판은 «회원» 탭 생성 시 지정 가능합니다.
          </p>
          <div className="hub-table-wrap">
            <table className="hub-table">
              <thead>
                <tr>
                  <th>총판</th>
                  <th>레퍼럴</th>
                  <th>정산율 %</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {operators.map((o) => (
                  <tr key={o.id}>
                    <td>
                      {o.name} <span className="tab-panel-muted">({o.login_id})</span>
                    </td>
                    <td>
                      <code style={{ fontSize: 12 }}>{o.referral_code || '—'}</code>
                    </td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={0.1}
                        style={{ width: 72 }}
                        value={rateDraft[o.id] ?? String(o.settlement_rate ?? 10)}
                        onChange={(e) => setRateDraft((d) => ({ ...d, [o.id]: e.target.value }))}
                      />
                    </td>
                    <td className="hub-actions">
                      <button
                        type="button"
                        className="btn-ghost btn-sm"
                        onClick={async () => {
                          const v = parseFloat(rateDraft[o.id] ?? '');
                          if (Number.isNaN(v) || v < 0 || v > 100) {
                            setErr('정산율은 0~100 사이로 입력하세요.');
                            return;
                          }
                          try {
                            await hubPatchOperator(session, o.id, { settlement_rate: v });
                            await load();
                          } catch (e) {
                            setErr(e instanceof Error ? e.message : String(e));
                          }
                        }}
                      >
                        저장
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <h3 className="hub-section-title">출금 신청</h3>
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
