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

export function SettleMgmtHubPanel({ session }: { session: AdminSession }) {
  const isMaster = session.role === 'master';
  const [rows, setRows] = useState<HubWithdrawalRow[]>([]);
  const [operators, setOperators] = useState<HubOperatorRow[]>([]);
  const [rateDraft, setRateDraft] = useState<Record<number, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [sub, setSub] = useState<'rate' | 'withdraw'>('withdraw');

  const flash = (msg: string) => { setOk(msg); setTimeout(() => setOk(null), 2500); };

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [w, o] = await Promise.all([hubListWithdrawals(session), hubListOperators(session)]);
      setRows(w);
      setOperators(o);
      const next: Record<number, string> = {};
      for (const op of o) next[op.id] = String(op.settlement_rate ?? 10);
      setRateDraft(next);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => { void load(); }, [load]);

  if (!isMaster) {
    return (
      <HubPanelShell title="정산관리">
        <div className="hub-empty">
          <span className="hub-empty-icon">📋</span>
          <p>마스터·콘솔 관리자만 전체 출금을 처리할 수 있습니다.</p>
          <p style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>총판 계정은 «출금신청» 탭을 이용하세요.</p>
        </div>
      </HubPanelShell>
    );
  }

  const pendingRows = rows.filter((r) => r.status === 'pending');

  return (
    <HubGate session={session}>
      <HubPanelShell
        title="정산관리"
        actions={
          <button type="button" className="hub-refresh-btn" onClick={() => void load()} disabled={loading}>
            {loading ? '…' : '↻ 새로고침'}
          </button>
        }
      >
        {err ? <div className="hub-msg hub-msg--err">{err}<button type="button" onClick={() => setErr(null)}>×</button></div> : null}
        {ok  ? <div className="hub-msg hub-msg--ok">{ok}</div> : null}

        {/* 요약 */}
        <div className="hub-stat-row">
          <div className="hub-stat-card">
            <div className="hub-stat-label">대기 중 출금</div>
            <div className="hub-stat-value">{pendingRows.length}건</div>
          </div>
          <div className="hub-stat-card">
            <div className="hub-stat-label">총판 수</div>
            <div className="hub-stat-value">{operators.length}개</div>
          </div>
        </div>

        {/* 탭 */}
        <div className="hub-tabs">
          <button type="button" className={`hub-tab${sub === 'withdraw' ? ' hub-tab--active' : ''}`} onClick={() => setSub('withdraw')}>
            출금 신청
            {pendingRows.length > 0 ? <span className="hub-tab-badge">{pendingRows.length}</span> : null}
          </button>
          <button type="button" className={`hub-tab${sub === 'rate' ? ' hub-tab--active' : ''}`} onClick={() => setSub('rate')}>
            정산 비율
          </button>
        </div>

        {/* 출금 신청 처리 */}
        {sub === 'withdraw' && (
          rows.length === 0 && !loading ? (
            <div className="hub-empty hub-empty--sm"><p>출금 신청 내역이 없습니다</p></div>
          ) : (
            <div className="hub-card-list">
              {rows.map((r) => (
                <div key={r.id} className={`hub-charge-card${r.status !== 'pending' ? ' hub-charge-card--done' : ''}`}>
                  <div className="hub-charge-top">
                    <div>
                      <span className="hub-charge-user">{r.operator_name || r.operator_login || String(r.operator_mu_user_id)}</span>
                    </div>
                    <span className="hub-charge-time">{fmt(r.requested_at)}</span>
                  </div>
                  <div className="hub-charge-mid">
                    <span className="hub-charge-amount">{Number(r.amount).toLocaleString()}원</span>
                    <span className="hub-charge-memo" style={{ wordBreak: 'break-all' }}>{r.wallet_address}</span>
                  </div>
                  <div className="hub-charge-actions">
                    <span className={`hub-badge ${STATUS_BADGE[r.status] ?? 'hub-badge--gray'}`}>
                      {STATUS_LABEL[r.status] ?? r.status}
                    </span>
                    {r.status === 'pending' ? (
                      <>
                        <button
                          type="button"
                          className="hub-btn hub-btn--approve"
                          disabled={busy === `w-${r.id}`}
                          onClick={async () => {
                            setBusy(`w-${r.id}`);
                            try { await hubApproveWithdrawal(session, r.id); flash('승인 완료'); await load(); }
                            catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
                            finally { setBusy(null); }
                          }}
                        >
                          승인
                        </button>
                        <button
                          type="button"
                          className="hub-btn hub-btn--reject"
                          disabled={busy === `w-${r.id}`}
                          onClick={async () => {
                            const reason = window.prompt('거절 사유 (선택)') ?? '';
                            setBusy(`w-${r.id}`);
                            try { await hubRejectWithdrawal(session, r.id, reason); flash('거절 처리 완료'); await load(); }
                            catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
                            finally { setBusy(null); }
                          }}
                        >
                          거절
                        </button>
                      </>
                    ) : null}
                    {r.reject_reason ? <span className="hub-cell-sub">{r.reject_reason}</span> : null}
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* 정산 비율 */}
        {sub === 'rate' && (
          operators.length === 0 ? (
            <div className="hub-empty hub-empty--sm"><p>등록된 총판이 없습니다</p></div>
          ) : (
            <div className="hub-table-wrap">
              <table className="hub-table">
                <thead>
                  <tr>
                    <th>총판</th>
                    <th>레퍼럴</th>
                    <th>정산율 %</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {operators.map((o) => (
                    <tr key={o.id}>
                      <td>
                        <div className="hub-cell-primary">{o.name}</div>
                        <div className="hub-cell-sub">{o.login_id}</div>
                      </td>
                      <td><code className="hub-code">{o.referral_code || '—'}</code></td>
                      <td>
                        <input
                          className="hub-input hub-input--xs"
                          type="number"
                          min={0}
                          max={100}
                          step={0.1}
                          value={rateDraft[o.id] ?? String(o.settlement_rate ?? 10)}
                          onChange={(e) => setRateDraft((d) => ({ ...d, [o.id]: e.target.value }))}
                        />
                      </td>
                      <td className="hub-row-actions">
                        <button
                          type="button"
                          className="hub-btn hub-btn--sm hub-btn--primary"
                          onClick={async () => {
                            const v = parseFloat(rateDraft[o.id] ?? '');
                            if (Number.isNaN(v) || v < 0 || v > 100) { setErr('0~100 사이로 입력하세요.'); return; }
                            try { await hubPatchOperator(session, o.id, { settlement_rate: v }); flash('저장 완료'); await load(); }
                            catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
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
          )
        )}
      </HubPanelShell>
    </HubGate>
  );
}
