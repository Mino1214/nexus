import { useCallback, useEffect, useState } from 'react';
import type { AdminSession } from '../../admin/types';
import {
  htsApproveCharge,
  htsListChargeRequests,
  htsListManagedUsers,
  htsRegisterUser,
  htsRejectCharge,
  type HtsChargeRequestRow,
  type HtsManagedUserRow,
} from '../../admin/htsApiClient';
import {
  hubApprovePendingSignup,
  hubCreateOperator,
  hubDeleteOperator,
  hubListOperators,
  hubListPendingSignups,
  hubPatchManagedUser,
  hubPatchOperator,
  hubRejectPendingSignup,
  type HubOperatorRow,
  type HubPendingUser,
} from '../hubApiClient';
import { HubPanelShell } from '../HubPanelShell';
import { HubGate } from '../HubGate';

function fmt(dt: string | undefined) {
  if (!dt) return '—';
  return String(dt).replace('T', ' ').slice(0, 16);
}

function fmtAmount(row: HtsChargeRequestRow) {
  const n = Number(row.amount);
  const cur = row.currency || 'KRW';
  if (cur === 'USDT') return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `₩${n.toLocaleString('ko-KR')}`;
}

type DeskSub = 'charge' | 'signup' | 'roster';

export function MemberDeskHubPanel({ session }: { session: AdminSession }) {
  const isMaster = session.role === 'master';
  const [sub, setSub] = useState<DeskSub>('charge');
  const [charges, setCharges] = useState<HtsChargeRequestRow[]>([]);
  const [pendingUsers, setPendingUsers] = useState<HubPendingUser[]>([]);
  const [ops, setOps] = useState<HubOperatorRow[]>([]);
  const [users, setUsers] = useState<HtsManagedUserRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null); // id of row being processed

  // 총판 생성 폼
  const [opName, setOpName] = useState('');
  const [opLogin, setOpLogin] = useState('');
  const [opPw, setOpPw] = useState('');
  const [opDomain, setOpDomain] = useState('');
  const [opSettle, setOpSettle] = useState(10);

  // 회원 생성 폼
  const [nuId, setNuId] = useState('');
  const [nuPw, setNuPw] = useState('');
  const [nuOp, setNuOp] = useState<number | ''>('');

  const flash = (msg: string) => { setOk(msg); setTimeout(() => setOk(null), 2500); };

  const reload = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [cr, pu, o, u] = await Promise.all([
        htsListChargeRequests(session),
        hubListPendingSignups(session),
        hubListOperators(session),
        htsListManagedUsers(session),
      ]);
      setCharges(cr.filter((r) => r.status === 'pending'));
      setPendingUsers(pu);
      setOps(o);
      setUsers(u);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => { if (nuOp === '' && ops.length === 1) setNuOp(ops[0].id); }, [ops, nuOp]);

  const copyReferral = () => {
    const c = session.referralCode?.trim();
    if (!c) return;
    void navigator.clipboard.writeText(c).then(
      () => flash('레퍼럴 코드 복사됨'),
      () => window.alert(c),
    );
  };

  const handleApproveCharge = async (id: number) => {
    setBusy(`charge-${id}`);
    try { await htsApproveCharge(session, String(id)); flash('충전 승인 완료'); await reload(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  };
  const handleRejectCharge = async (id: number) => {
    if (!confirm('이 충전 신청을 거절할까요?')) return;
    setBusy(`charge-${id}`);
    try { await htsRejectCharge(session, String(id)); flash('충전 거절 완료'); await reload(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  };
  const handleApproveSignup = async (uid: string) => {
    setBusy(`signup-${uid}`);
    try { await hubApprovePendingSignup(session, uid); flash(`${uid} 가입 승인 완료`); await reload(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  };
  const handleRejectSignup = async (uid: string) => {
    if (!confirm(`${uid} 가입을 거절하고 삭제할까요?`)) return;
    setBusy(`signup-${uid}`);
    try { await hubRejectPendingSignup(session, uid); flash(`${uid} 거절 완료`); await reload(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  };
  const handleToggleStatus = async (u: HtsManagedUserRow) => {
    const next = u.market_status === 'suspended' ? 'active' : 'suspended';
    try { await hubPatchManagedUser(session, u.id, { market_status: next }); await reload(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };

  const TABS: { id: DeskSub; label: string; badge?: number }[] = [
    { id: 'charge', label: '충전 확인', badge: charges.length || undefined },
    { id: 'signup', label: '가입 승인', badge: pendingUsers.length || undefined },
    { id: 'roster', label: '회원·총판' },
  ];

  return (
    <HubGate session={session}>
      <HubPanelShell
        title="회원 · 승인"
        actions={
          <button type="button" className="hub-refresh-btn" onClick={() => void reload()} disabled={loading}>
            {loading ? '…' : '↻ 새로고침'}
          </button>
        }
      >
        {/* 레퍼럴 코드 */}
        {session.referralCode ? (
          <div className="hub-referral-strip">
            <span className="hub-referral-label">{isMaster ? '마스터 레퍼럴' : '내 레퍼럴'}</span>
            <code className="hub-referral-code">{session.referralCode}</code>
            <button type="button" className="hub-referral-copy" onClick={copyReferral}>복사</button>
          </div>
        ) : null}

        {/* 탭 */}
        <div className="hub-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`hub-tab${sub === t.id ? ' hub-tab--active' : ''}`}
              onClick={() => setSub(t.id)}
            >
              {t.label}
              {t.badge ? <span className="hub-tab-badge">{t.badge}</span> : null}
            </button>
          ))}
        </div>

        {/* 피드백 */}
        {err ? <div className="hub-msg hub-msg--err">{err}<button type="button" onClick={() => setErr(null)}>×</button></div> : null}
        {ok  ? <div className="hub-msg hub-msg--ok">{ok}</div> : null}

        {/* ── 충전 확인 ── */}
        {sub === 'charge' && (
          charges.length === 0 && !loading ? (
            <div className="hub-empty">
              <span className="hub-empty-icon">💳</span>
              <p>대기 중인 충전 신청이 없습니다</p>
            </div>
          ) : (
            <div className="hub-card-list">
              {charges.map((r) => (
                <div key={r.id} className="hub-charge-card">
                  <div className="hub-charge-top">
                    <div>
                      <span className="hub-charge-user">{r.user_telegram || r.user_id}</span>
                      {r.operator_name || r.operator_login ? (
                        <span className="hub-charge-op">· {r.operator_name || r.operator_login}</span>
                      ) : null}
                    </div>
                    <span className="hub-charge-time">{fmt(r.created_at)}</span>
                  </div>
                  <div className="hub-charge-mid">
                    <span className="hub-charge-amount">{fmtAmount(r)}</span>
                    {r.memo ? <span className="hub-charge-memo">{r.memo}</span> : null}
                  </div>
                  <div className="hub-charge-actions">
                    <button
                      type="button"
                      className="hub-btn hub-btn--approve"
                      disabled={busy === `charge-${r.id}`}
                      onClick={() => void handleApproveCharge(r.id)}
                    >
                      승인
                    </button>
                    <button
                      type="button"
                      className="hub-btn hub-btn--reject"
                      disabled={busy === `charge-${r.id}`}
                      onClick={() => void handleRejectCharge(r.id)}
                    >
                      거절
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* ── 가입 승인 ── */}
        {sub === 'signup' && (
          pendingUsers.length === 0 && !loading ? (
            <div className="hub-empty">
              <span className="hub-empty-icon">👤</span>
              <p>승인 대기 가입이 없습니다</p>
            </div>
          ) : (
            <div className="hub-card-list">
              {pendingUsers.map((u) => (
                <div key={u.id} className="hub-charge-card">
                  <div className="hub-charge-top">
                    <span className="hub-charge-user">{u.id}</span>
                    <span className="hub-charge-time">{fmt(u.created_at)}</span>
                  </div>
                  <div className="hub-charge-mid">
                    <span className="hub-charge-memo">총판: {u.operator_login || u.operator_name || u.operator_mu_user_id || '—'}</span>
                  </div>
                  <div className="hub-charge-actions">
                    <button
                      type="button"
                      className="hub-btn hub-btn--approve"
                      disabled={busy === `signup-${u.id}`}
                      onClick={() => void handleApproveSignup(u.id)}
                    >
                      승인
                    </button>
                    <button
                      type="button"
                      className="hub-btn hub-btn--reject"
                      disabled={busy === `signup-${u.id}`}
                      onClick={() => void handleRejectSignup(u.id)}
                    >
                      거절
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* ── 회원·총판 ── */}
        {sub === 'roster' && (
          <>
            {/* 총판 영역 (마스터만) */}
            {isMaster && (
              <section className="hub-section">
                <div className="hub-section-head">
                  <h3 className="hub-section-title">총판</h3>
                </div>
                <div className="hub-inline-form hub-form-compact">
                  <input
                    className="hub-input"
                    value={opName}
                    onChange={(e) => setOpName(e.target.value)}
                    placeholder="이름"
                  />
                  <input
                    className="hub-input"
                    value={opLogin}
                    onChange={(e) => setOpLogin(e.target.value)}
                    placeholder="로그인 ID"
                  />
                  <input
                    className="hub-input"
                    type="password"
                    value={opPw}
                    onChange={(e) => setOpPw(e.target.value)}
                    placeholder="비밀번호"
                  />
                  <input
                    className="hub-input hub-input--narrow"
                    value={opDomain}
                    onChange={(e) => setOpDomain(e.target.value)}
                    placeholder="도메인 (선택)"
                  />
                  <input
                    className="hub-input hub-input--xs"
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    value={opSettle}
                    onChange={(e) => setOpSettle(Number(e.target.value))}
                    placeholder="정산%"
                  />
                  <button
                    type="button"
                    className="hub-btn hub-btn--primary"
                    onClick={async () => {
                      try {
                        const created = await hubCreateOperator(session, {
                          name: opName, login_id: opLogin, password: opPw,
                          site_domain: opDomain || undefined, settlement_rate: opSettle,
                        });
                        flash(`총판 등록 완료 · 레퍼럴: ${created.referral_code}`);
                        setOpName(''); setOpLogin(''); setOpPw(''); setOpDomain(''); setOpSettle(10);
                        await reload();
                      } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
                    }}
                  >
                    + 총판 등록
                  </button>
                </div>

                {ops.length > 0 && (
                  <div className="hub-table-wrap">
                    <table className="hub-table">
                      <thead>
                        <tr>
                          <th>이름 / ID</th>
                          <th>레퍼럴</th>
                          <th>정산%</th>
                          <th>도메인</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {ops.map((o) => (
                          <tr key={o.id}>
                            <td>
                              <div className="hub-cell-primary">{o.name}</div>
                              <div className="hub-cell-sub">{o.login_id}</div>
                            </td>
                            <td><code className="hub-code">{o.referral_code || '—'}</code></td>
                            <td>{o.settlement_rate != null ? `${Number(o.settlement_rate)}%` : '—'}</td>
                            <td className="hub-cell-sub">{o.site_domain || '—'}</td>
                            <td className="hub-row-actions">
                              <button
                                type="button"
                                className="hub-btn hub-btn--sm hub-btn--ghost"
                                onClick={async () => {
                                  const pw = window.prompt('새 비밀번호');
                                  if (!pw?.trim()) return;
                                  try { await hubPatchOperator(session, o.id, { password: pw.trim() }); flash('비밀번호 변경 완료'); }
                                  catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
                                }}
                              >
                                비번 변경
                              </button>
                              <button
                                type="button"
                                className="hub-btn hub-btn--sm hub-btn--danger"
                                onClick={async () => {
                                  if (!confirm(`총판 ${o.login_id} 삭제?`)) return;
                                  try { await hubDeleteOperator(session, o.id); await reload(); }
                                  catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
                                }}
                              >
                                삭제
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}

            {/* 회원 영역 */}
            <section className="hub-section">
              <div className="hub-section-head">
                <h3 className="hub-section-title">소속 회원</h3>
              </div>

              {isMaster && (
                <div className="hub-inline-form hub-form-compact">
                  <input
                    className="hub-input"
                    value={nuId}
                    onChange={(e) => setNuId(e.target.value)}
                    placeholder="아이디"
                  />
                  <input
                    className="hub-input"
                    type="password"
                    value={nuPw}
                    onChange={(e) => setNuPw(e.target.value)}
                    placeholder="비밀번호"
                  />
                  <select
                    className="hub-input"
                    value={nuOp === '' ? '' : String(nuOp)}
                    onChange={(e) => setNuOp(e.target.value ? Number(e.target.value) : '')}
                  >
                    <option value="">총판 선택</option>
                    {ops.map((o) => (
                      <option key={o.id} value={o.id}>{o.name} ({o.login_id})</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="hub-btn hub-btn--primary"
                    onClick={async () => {
                      if (!nuId.trim() || !nuPw.trim() || nuOp === '') { setErr('아이디·비밀번호·총판을 입력하세요.'); return; }
                      try {
                        await htsRegisterUser(session, nuId, nuPw, nuOp as number);
                        flash(`${nuId} 생성 완료`); setNuId(''); setNuPw(''); await reload();
                      } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
                    }}
                  >
                    + 회원 생성
                  </button>
                </div>
              )}

              {users.length === 0 && !loading ? (
                <div className="hub-empty hub-empty--sm">
                  <p>소속 회원이 없습니다</p>
                </div>
              ) : (
                <div className="hub-table-wrap">
                  <table className="hub-table">
                    <thead>
                      <tr>
                        <th>아이디</th>
                        <th>텔레그램</th>
                        <th>총판</th>
                        <th>상태</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((u) => (
                        <tr key={u.id}>
                          <td className="hub-cell-primary">{u.id}</td>
                          <td>
                            <input
                              className="hub-input-inline"
                              defaultValue={u.telegram || ''}
                              placeholder="@username"
                              onBlur={async (ev) => {
                                const v = ev.target.value.trim();
                                if (v === (u.telegram || '').trim()) return;
                                try { await hubPatchManagedUser(session, u.id, { telegram: v || undefined }); }
                                catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
                              }}
                            />
                          </td>
                          <td className="hub-cell-sub">{u.operator_mu_user_id ?? '—'}</td>
                          <td>
                            <span className={`hub-badge ${u.market_status === 'suspended' ? 'hub-badge--red' : 'hub-badge--green'}`}>
                              {u.market_status === 'suspended' ? '정지' : '활성'}
                            </span>
                          </td>
                          <td className="hub-row-actions">
                            <button
                              type="button"
                              className={`hub-btn hub-btn--sm ${u.market_status === 'suspended' ? 'hub-btn--approve' : 'hub-btn--danger'}`}
                              onClick={() => void handleToggleStatus(u)}
                            >
                              {u.market_status === 'suspended' ? '해제' : '정지'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </HubPanelShell>
    </HubGate>
  );
}
