import { useCallback, useEffect, useState } from 'react';
import type { AdminSession } from '../../admin/types';
import { htsListManagedUsers, htsRegisterUser, type HtsManagedUserRow } from '../../admin/htsApiClient';
import {
  hubCreateOperator,
  hubDeleteOperator,
  hubListOperators,
  hubPatchManagedUser,
  hubPatchOperator,
  type HubOperatorRow,
} from '../hubApiClient';
import { HubDevHint, HubPanelShell } from '../HubPanelShell';
import { HubGate } from '../HubGate';

export function MembersHubPanel({ session }: { session: AdminSession }) {
  const isMasterUi = session.role === 'master';
  const [ops, setOps] = useState<HubOperatorRow[]>([]);
  const [users, setUsers] = useState<HtsManagedUserRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [opName, setOpName] = useState('');
  const [opLogin, setOpLogin] = useState('');
  const [opPw, setOpPw] = useState('');
  const [opDomain, setOpDomain] = useState('');
  const [opSettle, setOpSettle] = useState(10);

  const [nuId, setNuId] = useState('');
  const [nuPw, setNuPw] = useState('');
  const [nuOp, setNuOp] = useState<number | ''>('');

  const reload = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const o = await hubListOperators(session);
      setOps(o);
      const u = await htsListManagedUsers(session);
      setUsers(u);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (nuOp === '' && ops.length === 1) setNuOp(ops[0].id);
  }, [ops, nuOp]);

  return (
    <HubGate session={session}>
      <HubPanelShell
        title="회원"
        subtitle="회원 관리 · 총판(운영자) 생성"
        actions={
          <button type="button" className="btn-ghost btn-sm" onClick={() => void reload()} disabled={loading}>
            새로고침
          </button>
        }
      >
        {err ? <p className="hub-err">{err}</p> : null}

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
                  title="판도라 정산관리의 총판 정산 비율과 동일"
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
                아이디{' '}
                <input value={nuId} onChange={(e) => setNuId(e.target.value)} style={{ width: 120 }} />
              </label>
              <label>
                비밀번호{' '}
                <input type="password" value={nuPw} onChange={(e) => setNuPw(e.target.value)} style={{ width: 120 }} />
              </label>
              <label>
                총판{' '}
                <select value={nuOp === '' ? '' : String(nuOp)} onChange={(e) => setNuOp(e.target.value ? Number(e.target.value) : '')}>
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
        <HubDevHint>총판 CRUD 는 마스터·can_admin 만. 총판 로그인은 본인 소속 회원만 조회됩니다.</HubDevHint>
      </HubPanelShell>
    </HubGate>
  );
}
