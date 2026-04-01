import { useCallback, useEffect, useMemo, useState } from 'react';
import { isMasterAdminSyncEnabled } from '../config/featureFlags';
import { getMarketApiBase } from '../config/marketApiEnv';
import './AdminApp.css';
import { DistributorManagementPanel } from './DistributorManagementPanel';
import {
  htsApproveCharge,
  htsListChargeRequests,
  htsListManagedUsers,
  htsListOperators,
  htsRejectCharge,
  htsSubmitChargeRequest,
  isHtsApiSession,
  mapHtsRowToChargeRequest,
} from './htsApiClient';
import {
  initialChargeRequests,
  initialDistributorConfigs,
  initialManagedUsers,
  initialPositions,
  MOCK_DISTRIBUTORS,
} from './mockData';
import { loadHtsMasterPersisted, mergeDistributorConfigs, saveHtsMasterPersisted } from './htsMasterState';
import { HtsBackendStatus } from './HtsBackendStatus';
import { UserManagementPanel } from './UserManagementPanel';
import type { AdminSession, ChargeRequest, DistributorHtsConfig, ManagedHtsUser, PositionRow } from './types';

function padYmd() {
  const n = new Date();
  const p = (x: number) => String(x).padStart(2, '0');
  return `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}`;
}

function roleLabel(role: AdminSession['role']): string {
  if (role === 'master') return 'MASTER';
  if (role === 'distributor') return '총판';
  return '유저';
}

function fmtMoney(n: number) {
  return n.toLocaleString('ko-KR') + '원';
}

type TabId = 'charge' | 'position' | 'distributor' | 'users';

export function AdminApp({
  session,
  onLogout,
  onBackToChart,
  theme,
  onToggleTheme,
  layout = 'standalone',
}: {
  session: AdminSession;
  onLogout: () => void;
  /** 마스터만: Pandora(차트)로 돌아가기. 총판 전용 운영만 쓸 때는 생략 */
  onBackToChart?: () => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  /** Pandora HTS 운영 탭에 넣을 때 사이드바 중복 제거 */
  layout?: 'standalone' | 'embedded';
}) {
  const useApi = isHtsApiSession(session);
  const [tab, setTab] = useState<TabId>('charge');
  const [charges, setCharges] = useState<ChargeRequest[]>(() => initialChargeRequests());
  const [positions, setPositions] = useState<PositionRow[]>(() => initialPositions());
  const [distOptions, setDistOptions] = useState<readonly { id: string; name: string }[]>(MOCK_DISTRIBUTORS);
  const [apiErr, setApiErr] = useState<string | null>(null);
  const [apiLoading, setApiLoading] = useState(false);
  const [distFilter, setDistFilter] = useState<string>('');
  const [reqAmount, setReqAmount] = useState('');
  const [reqMemo, setReqMemo] = useState('');
  const [userFormErr, setUserFormErr] = useState<string | null>(null);
  const [managedUsers, setManagedUsers] = useState<ManagedHtsUser[]>(() => {
    const p = loadHtsMasterPersisted();
    return p?.managedUsers?.length ? p.managedUsers : initialManagedUsers();
  });
  const [distributorConfigs, setDistributorConfigs] = useState<DistributorHtsConfig[]>(() => {
    const p = loadHtsMasterPersisted();
    return mergeDistributorConfigs(initialDistributorConfigs(), p?.distributorConfigs);
  });
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  useEffect(() => {
    if (useApi) {
      saveHtsMasterPersisted({ managedUsers: [], distributorConfigs });
      return;
    }
    saveHtsMasterPersisted({ managedUsers, distributorConfigs });
  }, [managedUsers, distributorConfigs, useApi]);

  const reloadHts = useCallback(async () => {
    if (!isHtsApiSession(session)) return;
    setApiLoading(true);
    setApiErr(null);
    try {
      const needOps = session.role === 'master' || session.role === 'distributor';
      const needUsers = session.role === 'master' || session.role === 'distributor';
      const [ops, rows, users] = await Promise.all([
        needOps ? htsListOperators(session) : Promise.resolve([]),
        htsListChargeRequests(session),
        needUsers ? htsListManagedUsers(session) : Promise.resolve([]),
      ]);
      if (session.role === 'master') {
        setDistOptions(ops.map((o) => ({ id: `op-${o.id}`, name: o.name })));
      } else if (session.role === 'distributor' && ops.length) {
        setDistOptions(ops.map((o) => ({ id: `op-${o.id}`, name: o.name })));
      }
      setCharges(rows.map((r) => mapHtsRowToChargeRequest(r, '')));
      if (needUsers) {
        setManagedUsers(
          users.map((u) => ({
            id: u.id,
            displayName: (u.telegram || '').trim() || u.id,
            distributorId: u.operator_mu_user_id != null ? `op-${u.operator_mu_user_id}` : 'op-?',
            status: u.market_status === 'suspended' ? 'suspended' : 'active',
            createdAt: padYmd(),
          })),
        );
      }
      setPositions([]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setApiErr(msg);
      setCharges([]);
      if (session.role === 'master' || session.role === 'distributor') {
        setManagedUsers([]);
      }
    } finally {
      setApiLoading(false);
    }
  }, [session]);

  useEffect(() => {
    if (!useApi) return;
    void reloadHts();
  }, [useApi, reloadHts]);

  const logout = useCallback(() => {
    onLogout();
    setTab('charge');
    setDistFilter('');
    setSyncNotice(null);
  }, [onLogout]);

  const filteredCharges = useMemo(() => {
    let rows = charges;
    if (session.role === 'distributor') {
      rows = rows.filter((c) => c.distributorId === session.distributorId);
    } else if (session.role === 'user') {
      rows = rows.filter((c) => c.userId === session.id);
    } else if (session.role === 'master' && distFilter) {
      rows = rows.filter((c) => c.distributorId === distFilter);
    }
    return rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [charges, session, distFilter]);

  const filteredPositions = useMemo(() => {
    let rows = positions;
    if (session.role === 'distributor') {
      rows = rows.filter((p) => p.distributorId === session.distributorId);
    } else if (session.role === 'user') {
      rows = rows.filter((p) => p.userId === session.id);
    } else if (session.role === 'master' && distFilter) {
      rows = rows.filter((p) => p.distributorId === distFilter);
    }
    return rows;
  }, [positions, session, distFilter]);

  const setChargeStatus = useCallback(
    async (id: string, status: 'approved' | 'rejected') => {
      if (useApi) {
        try {
          if (status === 'approved') await htsApproveCharge(session, id);
          else await htsRejectCharge(session, id);
          await reloadHts();
        } catch (e) {
          setSyncNotice(e instanceof Error ? e.message : String(e));
        }
        return;
      }
      setCharges((prev) => prev.map((c) => (c.id === id ? { ...c, status } : c)));
    },
    [session, useApi, reloadHts],
  );

  const submitUserCharge = useCallback(async () => {
    if (session.role !== 'user') return;
    const n = Number(String(reqAmount).replace(/\D/g, ''));
    if (!Number.isFinite(n) || n <= 0) {
      setUserFormErr('충전 금액을 올바르게 입력하세요.');
      return;
    }
    setUserFormErr(null);
    if (useApi) {
      try {
        await htsSubmitChargeRequest(session, n, reqMemo.trim());
        setReqAmount('');
        setReqMemo('');
        await reloadHts();
      } catch (e) {
        setUserFormErr(e instanceof Error ? e.message : String(e));
      }
      return;
    }
    const dist = MOCK_DISTRIBUTORS.find((d) => d.id === session.distributorId);
    const now = new Date();
    const pad = (x: number) => String(x).padStart(2, '0');
    const ts = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const row: ChargeRequest = {
      id: `cr-${Date.now()}`,
      userId: session.id,
      userName: session.displayName,
      distributorId: session.distributorId ?? 'd001',
      distributorName: dist?.name ?? session.distributorId ?? '—',
      amount: n,
      status: 'pending',
      createdAt: ts,
      memo: reqMemo.trim() || undefined,
    };
    setCharges((prev) => [row, ...prev]);
    setReqAmount('');
    setReqMemo('');
  }, [session, reqAmount, reqMemo, useApi, reloadHts]);

  const canApprove = session.role === 'master' || session.role === 'distributor';

  const chargeColCount = session.role === 'master' ? 6 : session.role === 'distributor' ? 5 : 3;
  const posColCount = session.role === 'master' ? 8 : session.role === 'distributor' ? 7 : 6;

  const navButtons = (
    <>
      <button
        type="button"
        className={`fc-admin__navBtn${tab === 'charge' ? ' fc-admin__navBtn--active' : ''}`}
        onClick={() => setTab('charge')}
      >
        <span aria-hidden>💳</span>
        충전관리
      </button>
      <button
        type="button"
        className={`fc-admin__navBtn${tab === 'position' ? ' fc-admin__navBtn--active' : ''}`}
        onClick={() => setTab('position')}
      >
        <span aria-hidden>📊</span>
        포지션관리
      </button>
      {session.role === 'master' ? (
        <button
          type="button"
          className={`fc-admin__navBtn${tab === 'distributor' ? ' fc-admin__navBtn--active' : ''}`}
          onClick={() => setTab('distributor')}
        >
          <span aria-hidden>🏢</span>
          총판관리
        </button>
      ) : null}
      {session.role === 'master' || session.role === 'distributor' ? (
        <button
          type="button"
          className={`fc-admin__navBtn${tab === 'users' ? ' fc-admin__navBtn--active' : ''}`}
          onClick={() => setTab('users')}
        >
          <span aria-hidden>👤</span>
          유저관리
        </button>
      ) : null}
    </>
  );

  const mainColumn = (
    <>
      <header className="fc-admin__topbar">
        <div className="fc-admin__topbarLeft">
          <span className="fc-admin__roleTag">{roleLabel(session.role)}</span>
          <span className="fc-admin__userName">{session.displayName}</span>
          {session.role === 'distributor' || session.role === 'user' ? (
            <span className="fc-admin__userName" style={{ color: 'var(--fc-muted)', fontWeight: 600 }}>
              · {session.distributorId}
            </span>
          ) : null}
        </div>
        <div className="fc-admin__topbarRight">
          {layout === 'embedded' ? (
            <>
              {onBackToChart ? (
                <button type="button" className="fc-admin__btnGhost fc-admin__btnCompact" onClick={onBackToChart}>
                  차트·대시보드
                </button>
              ) : null}
              <button type="button" className="fc-admin__btnGhost fc-admin__btnDanger fc-admin__btnCompact" onClick={logout}>
                로그아웃
              </button>
            </>
          ) : null}
          <button type="button" className="fc-admin__themeToggle" onClick={onToggleTheme} aria-label="테마 전환">
            {theme === 'dark' ? '다크' : '라이트'}
          </button>
        </div>
      </header>

      {layout === 'embedded' ? (
        <nav className="fc-admin__embeddedNav" aria-label="운영 메뉴">
          {navButtons}
        </nav>
      ) : null}

      <div className="fc-admin__content">
          {layout === 'embedded' ? <HtsBackendStatus /> : null}
          {getMarketApiBase() && !session.accessToken ? (
            <div className="fc-admin__syncBanner" style={{ borderColor: 'var(--fc-warn, #b8860b)' }}>
              <strong>데모 세션</strong>입니다. 마켓 API(<code>VITE_API_BASE</code> 등)가 있어도 JWT가 없으면 DB
              목록이 아니라 로컬 목업만 씁니다. 시드 계정(예: <code>htsdemo</code>)으로 로그인해 다시 시도하세요.
            </div>
          ) : null}
          {isMasterAdminSyncEnabled() ? (
            <div className="fc-admin__syncBanner">
              masterAdmin 연동 모드: 저장·유저 생성 시 <code>VITE_FC_MASTERADMIN_API_BASE</code> 로 API 스텁이
              호출됩니다. 백엔드가 없으면 네트워크 오류가 날 수 있으며, 로컬 상태는 그대로 유지됩니다.
            </div>
          ) : null}
          {syncNotice ? <div className="fc-admin__syncMsg">{syncNotice}</div> : null}
          {useApi && apiErr ? <div className="fc-admin__syncMsg" style={{ borderColor: 'var(--fc-err)' }}>{apiErr}</div> : null}
          {useApi && apiLoading ? (
            <div className="fc-admin__hint" style={{ marginBottom: '0.75rem' }}>
              HTS 데이터 동기화 중…
            </div>
          ) : null}

          {session.role === 'master' && (tab === 'charge' || tab === 'position') ? (
            <div className="fc-admin__filterRow">
              <div className="fc-admin__field">
                <label htmlFor="fc-dist-filter">총판 필터</label>
                <select id="fc-dist-filter" value={distFilter} onChange={(e) => setDistFilter(e.target.value)}>
                  <option value="">전체 총판</option>
                  {distOptions.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.id})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : null}

          {tab === 'distributor' && session.role === 'master' ? (
            <DistributorManagementPanel
              distributors={distOptions}
              configs={distributorConfigs}
              setConfigs={setDistributorConfigs}
              onSyncNotice={setSyncNotice}
            />
          ) : null}

          {tab === 'users' && (session.role === 'master' || session.role === 'distributor') ? (
            <UserManagementPanel
              session={session}
              distributors={distOptions}
              managedUsers={managedUsers}
              setManagedUsers={setManagedUsers}
              onSyncNotice={setSyncNotice}
              onReloadFromApi={useApi ? reloadHts : undefined}
            />
          ) : null}

          {tab === 'charge' ? (
            <>
              {session.role === 'user' ? (
                <section className="fc-admin__card">
                  <h2 className="fc-admin__cardTitle">충전 신청</h2>
                  <p className="fc-admin__cardDesc">
                    {useApi
                      ? 'nexus-market-api HTS 충전 요청으로 등록됩니다. 승인 시 캐시 잔액에 반영됩니다.'
                      : '총판·마스터 승인 후 반영되는 플로우를 가정한 데모 폼입니다.'}
                  </p>
                  <div className="fc-admin__field">
                    <label htmlFor="fc-req-amt">신청 금액 (원)</label>
                    <input
                      id="fc-req-amt"
                      inputMode="numeric"
                      value={reqAmount}
                      onChange={(e) => setReqAmount(e.target.value)}
                      placeholder="예: 500000"
                    />
                  </div>
                  <div className="fc-admin__field">
                    <label htmlFor="fc-req-memo">메모 (선택)</label>
                    <input
                      id="fc-req-memo"
                      value={reqMemo}
                      onChange={(e) => setReqMemo(e.target.value)}
                      placeholder="입금자명 등"
                    />
                  </div>
                  {userFormErr ? (
                    <p className="fc-admin__hint" style={{ color: 'var(--fc-err)', marginBottom: '0.5rem' }}>
                      {userFormErr}
                    </p>
                  ) : null}
                  <button type="button" className="fc-admin__btnPrimary" onClick={() => void submitUserCharge()}>
                    충전 신청하기
                  </button>
                </section>
              ) : null}

              <section className="fc-admin__card">
                <h2 className="fc-admin__cardTitle">충전 요청 목록</h2>
                <p className="fc-admin__cardDesc">
                  {session.role === 'master'
                    ? '전체 총판·유저의 충전 요청을 확인하고 승인/거절합니다.'
                    : session.role === 'distributor'
                      ? '소속 유저의 충전 요청만 표시됩니다.'
                      : '본인 신청 내역만 표시됩니다.'}
                </p>
                <div className="fc-admin__tableWrap">
                  <table>
                    <thead>
                      <tr>
                        <th>일시</th>
                        {session.role !== 'user' ? <th>유저</th> : null}
                        {session.role === 'master' ? <th>총판</th> : null}
                        <th>금액</th>
                        <th>상태</th>
                        {canApprove ? <th>처리</th> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCharges.length === 0 ? (
                        <tr>
                          <td colSpan={chargeColCount}>데이터가 없습니다.</td>
                        </tr>
                      ) : (
                        filteredCharges.map((c) => (
                          <tr key={c.id}>
                            <td>{c.createdAt}</td>
                            {session.role !== 'user' ? <td>{c.userName}</td> : null}
                            {session.role === 'master' ? <td>{c.distributorName}</td> : null}
                            <td>{fmtMoney(c.amount)}</td>
                            <td>
                              {c.status === 'pending' ? (
                                <span className="fc-admin__badge fc-admin__badge--pending">대기</span>
                              ) : c.status === 'approved' ? (
                                <span className="fc-admin__badge fc-admin__badge--ok">승인</span>
                              ) : (
                                <span className="fc-admin__badge fc-admin__badge--err">거절</span>
                              )}
                            </td>
                            {canApprove ? (
                              <td>
                                {c.status === 'pending' &&
                                (session.role === 'master' || c.distributorId === session.distributorId) ? (
                                  <div className="fc-admin__rowActions">
                                    <button
                                      type="button"
                                      className="fc-admin__btnSm fc-admin__btnSm--ok"
                                      onClick={() => void setChargeStatus(c.id, 'approved')}
                                    >
                                      승인
                                    </button>
                                    <button
                                      type="button"
                                      className="fc-admin__btnSm fc-admin__btnSm--err"
                                      onClick={() => void setChargeStatus(c.id, 'rejected')}
                                    >
                                      거절
                                    </button>
                                  </div>
                                ) : (
                                  '—'
                                )}
                              </td>
                            ) : null}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          ) : tab === 'position' ? (
            <section className="fc-admin__card">
              <h2 className="fc-admin__cardTitle">포지션 목록</h2>
              <p className="fc-admin__cardDesc">
                역할에 따라 조회 범위가 달라집니다. 실서버에서는 브로커/DB와 연동해 갱신합니다.
              </p>
              <div className="fc-admin__tableWrap">
                <table>
                  <thead>
                    <tr>
                      {(session.role === 'master' || session.role === 'distributor') && <th>유저</th>}
                      {session.role === 'master' ? <th>총판</th> : null}
                      <th>종목</th>
                      <th>방향</th>
                      <th>수량</th>
                      <th>평단</th>
                      <th>평가손익</th>
                      <th>갱신</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPositions.length === 0 ? (
                      <tr>
                        <td colSpan={posColCount}>포지션이 없습니다.</td>
                      </tr>
                    ) : (
                      filteredPositions.map((p) => (
                        <tr key={p.id}>
                          {(session.role === 'master' || session.role === 'distributor') && (
                            <td>{p.userName}</td>
                          )}
                          {session.role === 'master' ? <td>{p.distributorId}</td> : null}
                          <td>{p.symbol}</td>
                          <td>{p.side === 'LONG' ? '롱' : '숏'}</td>
                          <td>{p.qty}</td>
                          <td>{p.avgPrice.toLocaleString('ko-KR')}</td>
                          <td style={{ color: p.unrealizedPnl >= 0 ? 'var(--fc-ok)' : 'var(--fc-err)' }}>
                            {p.unrealizedPnl >= 0 ? '+' : ''}
                            {fmtMoney(p.unrealizedPnl)}
                          </td>
                          <td>{p.updatedAt}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
      </div>
    </>
  );

  if (layout === 'embedded') {
    return (
      <div className="fc-admin fc-admin--embedded">
        <div className="fc-admin__main">{mainColumn}</div>
      </div>
    );
  }

  return (
    <div className="fc-admin">
      <aside className="fc-admin__sidebar">
        <div className="fc-admin__brand">
          <h1 className="fc-admin__brandTitle">운영</h1>
          <p className="fc-admin__brandSub">충전 · 포지션 · 조직</p>
        </div>
        <nav className="fc-admin__nav" aria-label="운영 메뉴">
          <div className="fc-admin__navLabel">메뉴</div>
          {navButtons}
        </nav>
        <div className="fc-admin__footer">
          {onBackToChart ? (
            <button type="button" className="fc-admin__btnGhost" onClick={onBackToChart}>
              차트·대시보드로
            </button>
          ) : null}
          <button type="button" className="fc-admin__btnGhost fc-admin__btnDanger" onClick={logout}>
            로그아웃
          </button>
        </div>
      </aside>

      <div className="fc-admin__main">{mainColumn}</div>
    </div>
  );
}
