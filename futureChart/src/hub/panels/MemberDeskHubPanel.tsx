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
import { HubDevHint, HubPanelShell, HubTablePlaceholder } from '../HubPanelShell';
import { HubGate } from '../HubGate';

function fmt(dt: string | undefined) {
  if (!dt) return '—';
  return String(dt).replace('T', ' ').slice(0, 19);
}

type DeskSub = 'approvals' | 'roster';

/** admin.html 승인 + 회원 탭 통합 — 사이드바 중복 제거 */
export function MemberDeskHubPanel({ session }: { session: AdminSession }) {
  const isMasterUi = session.role === 'master';
  const [deskSub, setDeskSub] = useState<DeskSub>('approvals');
  const [charges, setCharges] = useState<HtsChargeRequestRow[]>([]);
  const [pendingUsers, setPendingUsers] = useState<HubPendingUser[]>([]);
  const [ops, setOps] = useState<HubOperatorRow[]>([]);
  const [users, setUsers] = useState<HtsManagedUserRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [apprSub, setApprSub] = useState<'charge' | 'signup'>('charge');

  const [opName, setOpName] = useState('');
  const [opLogin, setOpLogin] = useState('');
  const [opPw, setOpPw] = useState('');
  const [opDomain, setOpDomain] = useState('');
  const [opSettle, setOpSettle] = useState(10);
  const [nuId, setNuId] = useState('');
  const [nuPw, setNuPw] = useState('');
  const [nuOp, setNuOp] = useState<number | ''>('');

  const reloadApprovals = useCallback(async () => {
    const [cr, pu] = await Promise.all([htsListChargeRequests(session), hubListPendingSignups(session)]);
    setCharges(cr.filter((r) => r.status === 'pending'));
    setPendingUsers(pu);
  }, [session]);

  const reloadRoster = useCallback(async () => {
    const [o, u] = await Promise.all([hubListOperators(session), htsListManagedUsers(session)]);
    setOps(o);
    setUsers(u);
  }, [session]);

  const reload = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      await Promise.all([reloadApprovals(), reloadRoster()]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [reloadApprovals, reloadRoster]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (nuOp === '' && ops.length === 1) setNuOp(ops[0].id);
  }, [ops, nuOp]);

  const copyReferral = () => {
    const c = session.referralCode?.trim();
    if (!c) return;
    void navigator.clipboard.writeText(c).then(
      () => window.alert('레퍼럴 코드가 복사되었습니다.'),
      () => window.alert(c),
    );
  };

  return (
    <HubGate session={session}>
      <HubPanelShell
        title="회원·승인"
        subtitle="충전·가입 승인과 총판·회원 관리 (admin.html 승인/회원과 동일 범위)"
        actions={
          <button type="button" className="btn-ghost btn-sm" onClick={() => void reload()} disabled={loading}>
            새로고침
          </button>
        }
      >
        {session.referralCode ? (
          <div className="fx-referral-card">
            <div className="fx-referral-label">
              {isMasterUi ? '마스터 레퍼럴 코드' : '내 레퍼럴 코드'}
            </div>
            <div className="fx-referral-row">
              <code className="fx-referral-code">{session.referralCode}</code>
              <button type="button" className="btn-ghost btn-sm" onClick={copyReferral}>
                복사
              </button>
            </div>
          </div>
        ) : null}

        <div className="hub-subtabs hub-subtabs--desk">
          <button type="button" className={deskSub === 'approvals' ? 'active' : ''} onClick={() => setDeskSub('approvals')}>
            승인 처리
          </button>
          <button type="button" className={deskSub === 'roster' ? 'active' : ''} onClick={() => setDeskSub('roster')}>
            회원·총판
          </button>
        </div>

        {err ? <p className="hub-err">{err}</p> : null}
        {loading ? <p className="tab-panel-muted">불러오는 중…</p> : null}

        {deskSub === 'approvals' ? (
          <>
            <div className="hub-subtabs" style={{ marginTop: 12 }}>
              <button type="button" className={apprSub === 'charge' ? 'active' : ''} onClick={() => setApprSub('charge')}>
                충전 확인
              </button>
              <button type="button" className={apprSub === 'signup' ? 'active' : ''} onClick={() => setApprSub('signup')}>
                가입 승인
              </button>
            </div>
            {apprSub === 'charge' ? (
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
          </>
        ) : (
          <>
            {isMasterUi ? (
              <section className="hub-section">
                <h3 className="hub-section-title">총판 생성</h3>
                <div className="hub-form-grid">
                  <label className="hub-field">
                    <span>이름</span>
                    <input value={opName} onChange={(e) => setOpName(e.target.value)} placeholder="표시 이름" />
                  </label>
                  <label className="hub-field">
                    <span>로그인 ID</span>
                    <input value={opLogin} onChange={(e) => setOpLogin(e.target.value)} placeholder="로그인" />
                  </label>
                  <label className="hub-field">
                    <span>비밀번호</span>
                    <input type="password" value={opPw} onChange={(e) => setOpPw(e.target.value)} />
                  </label>
                  <label className="hub-field">
                    <span>사이트 도메인 (선택)</span>
                    <input value={opDomain} onChange={(e) => setOpDomain(e.target.value)} placeholder="demo.example.com" />
                  </label>
                  <label className="hub-field">
                    <span>정산 비율 (%)</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.1}
                      value={opSettle}
                      onChange={(e) => setOpSettle(Number(e.target.value))}
                    />
                  </label>
                </div>
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  onClick={async () => {
                    try {
                      const created = await hubCreateOperator(session, {
                        name: opName,
                        login_id: opLogin,
                        password: opPw,
                        site_domain: opDomain || undefined,
                        settlement_rate: opSettle,
                      });
                      window.alert(
                        `총판이 등록되었습니다.\n레퍼럴 코드: ${created.referral_code}\n정산 비율: ${created.settlement_rate}%`,
                      );
                      setOpName('');
                      setOpLogin('');
                      setOpPw('');
                      setOpDomain('');
                      setOpSettle(10);
                      await reload();
                    } catch (e) {
                      setErr(e instanceof Error ? e.message : String(e));
                    }
                  }}
                >
                  총판 등록
                </button>
              </section>
            ) : null}

            {isMasterUi ? (
              <section className="hub-section">
                <h3 className="hub-section-title">총판 목록</h3>
                <div className="hub-table-wrap">
                  <table className="hub-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>이름</th>
                        <th>로그인</th>
                        <th>레퍼럴</th>
                        <th>정산%</th>
                        <th>도메인</th>
                        <th>상태</th>
                        <th>작업</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ops.map((o) => (
                        <tr key={o.id}>
                          <td>{o.id}</td>
                          <td>{o.name}</td>
                          <td>{o.login_id}</td>
                          <td>
                            <code style={{ fontSize: 12 }}>{o.referral_code || '—'}</code>
                          </td>
                          <td>{o.settlement_rate != null ? `${Number(o.settlement_rate)}%` : '—'}</td>
                          <td>{o.site_domain || '—'}</td>
                          <td>{o.status}</td>
                          <td className="hub-actions">
                            <button
                              type="button"
                              className="btn-ghost btn-sm"
                              onClick={async () => {
                                const pw = window.prompt('새 비밀번호 (취소 시 스킵)');
                                if (pw === null) return;
                                try {
                                  if (pw.trim()) await hubPatchOperator(session, o.id, { password: pw.trim() });
                                  await reload();
                                } catch (e) {
                                  setErr(e instanceof Error ? e.message : String(e));
                                }
                              }}
                            >
                              비번
                            </button>
                            <button
                              type="button"
                              className="btn-ghost btn-sm"
                              onClick={async () => {
                                if (!confirm(`총판 ${o.login_id} 삭제?`)) return;
                                try {
                                  await hubDeleteOperator(session, o.id);
                                  await reload();
                                } catch (e) {
                                  setErr(e instanceof Error ? e.message : String(e));
                                }
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
              </section>
            ) : null}

            <section className="hub-section">
              <h3 className="hub-section-title">소속 회원</h3>
              {isMasterUi ? (
                <div className="hub-inline-form">
                  <label>
                    아이디 <input value={nuId} onChange={(e) => setNuId(e.target.value)} style={{ width: 120 }} />
                  </label>
                  <label>
                    비밀번호 <input type="password" value={nuPw} onChange={(e) => setNuPw(e.target.value)} style={{ width: 120 }} />
                  </label>
                  <label>
                    총판{' '}
                    <select
                      value={nuOp === '' ? '' : String(nuOp)}
                      onChange={(e) => setNuOp(e.target.value ? Number(e.target.value) : '')}
                    >
                      <option value="">선택</option>
                      {ops.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name} ({o.login_id})
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="btn-ghost btn-sm"
                    onClick={async () => {
                      if (!nuId.trim() || !nuPw.trim() || nuOp === '') {
                        setErr('아이디·비밀번호·총판을 입력하세요.');
                        return;
                      }
                      try {
                        await htsRegisterUser(session, nuId, nuPw, nuOp as number);
                        setNuId('');
                        setNuPw('');
                        await reload();
                      } catch (e) {
                        setErr(e instanceof Error ? e.message : String(e));
                      }
                    }}
                  >
                    회원 생성
                  </button>
                </div>
              ) : null}
              <div className="hub-table-wrap">
                <table className="hub-table">
                  <thead>
                    <tr>
                      <th>아이디</th>
                      <th>텔레그램</th>
                      <th>마켓상태</th>
                      <th>총판ID</th>
                      <th>작업</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id}>
                        <td>{u.id}</td>
                        <td>
                          <input
                            defaultValue={u.telegram || ''}
                            style={{ width: 120 }}
                            onBlur={async (ev) => {
                              const v = ev.target.value.trim();
                              if (v === (u.telegram || '').trim()) return;
                              try {
                                await hubPatchManagedUser(session, u.id, { telegram: v || undefined });
                              } catch (e) {
                                setErr(e instanceof Error ? e.message : String(e));
                              }
                            }}
                          />
                        </td>
                        <td>{u.market_status}</td>
                        <td>{u.operator_mu_user_id ?? '—'}</td>
                        <td className="hub-actions">
                          <button
                            type="button"
                            className="btn-ghost btn-sm"
                            onClick={async () => {
                              const next = u.market_status === 'suspended' ? 'active' : 'suspended';
                              try {
                                await hubPatchManagedUser(session, u.id, { market_status: next });
                                await reload();
                              } catch (e) {
                                setErr(e instanceof Error ? e.message : String(e));
                              }
                            }}
                          >
                            {u.market_status === 'suspended' ? '해제' : '정지'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        <HubDevHint>
          충전 <code>hts_charge_requests</code> · 가입 <code>users.approval_status</code> · 총판 <code>mu_users</code>
        </HubDevHint>
      </HubPanelShell>
    </HubGate>
  );
}
