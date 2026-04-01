import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { registerRuntimeDemoUser } from './demoAuthRegistry';
import { isMasterAdminSyncEnabled } from '../config/featureFlags';
import { pushCreateUser } from './htsMasterClient';
import {
  htsRegisterUser,
  htsSetUserMarketStatus,
  isHtsApiSession,
  parseOperatorNumericId,
} from './htsApiClient';
import type { AdminSession, ManagedHtsUser } from './types';

type Props = {
  session: AdminSession;
  distributors: readonly { id: string; name: string }[];
  managedUsers: ManagedHtsUser[];
  setManagedUsers: Dispatch<SetStateAction<ManagedHtsUser[]>>;
  onSyncNotice: (msg: string | null) => void;
  onReloadFromApi?: () => void | Promise<void>;
};

function padDate() {
  const n = new Date();
  const p = (x: number) => String(x).padStart(2, '0');
  return `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}`;
}

export function UserManagementPanel({
  session,
  distributors,
  managedUsers,
  setManagedUsers,
  onSyncNotice,
  onReloadFromApi,
}: Props) {
  const useMarketApi = isHtsApiSession(session);
  const [filterDist, setFilterDist] = useState('');
  const [newId, setNewId] = useState('');
  const [newName, setNewName] = useState('');
  const [newPw, setNewPw] = useState('demo');
  const [newDist, setNewDist] = useState(distributors[0]?.id ?? '');
  const [formErr, setFormErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const visible = useMemo(() => {
    let rows = managedUsers;
    if (session.role === 'distributor' && session.distributorId) {
      rows = rows.filter((u) => u.distributorId === session.distributorId);
    } else if (session.role === 'master' && filterDist) {
      rows = rows.filter((u) => u.distributorId === filterDist);
    }
    return rows;
  }, [managedUsers, session.role, session.distributorId, filterDist]);

  const createUser = useCallback(async () => {
    setFormErr(null);
    const id = newId.trim();
    const displayName = newName.trim();
    if (!id || !displayName) {
      setFormErr('아이디와 표시 이름을 입력하세요.');
      return;
    }
    if (!/^[a-zA-Z0-9_]{2,32}$/.test(id)) {
      setFormErr('아이디는 2–32자 영문·숫자·_ 만 사용하세요.');
      return;
    }
    if (managedUsers.some((u) => u.id === id)) {
      setFormErr('이미 존재하는 아이디입니다.');
      return;
    }
    const distributorId =
      session.role === 'distributor' ? session.distributorId ?? newDist : newDist;
    if (!distributorId) {
      setFormErr('총판을 선택하세요.');
      return;
    }
    const pw = newPw.trim() || 'demo';
    const row: ManagedHtsUser = {
      id,
      displayName,
      distributorId,
      status: 'active',
      createdAt: padDate(),
    };
    onSyncNotice(null);
    setSaving(true);
    try {
      if (useMarketApi) {
        const opNum =
          session.role === 'distributor'
            ? parseOperatorNumericId(session.distributorId)
            : parseOperatorNumericId(distributorId);
        if (opNum == null) {
          setFormErr('총판(운영자) ID 를 확인할 수 없습니다.');
          return;
        }
        await htsRegisterUser(session, id, pw, opNum);
        onSyncNotice('nexus-market-api 에 유저가 등록되었습니다.');
        registerRuntimeDemoUser(id, pw, {
          role: 'user',
          id,
          displayName,
          distributorId,
        });
        await onReloadFromApi?.();
        setNewId('');
        setNewName('');
        setNewPw('HtsDemo12');
        return;
      }
      const r = await pushCreateUser({ ...row, initialPassword: pw });
      if (!r.ok) {
        onSyncNotice(`유저 생성 API 실패 — 로컬에만 추가: ${r.message}`);
      } else if (isMasterAdminSyncEnabled()) {
        onSyncNotice('유저가 생성되었습니다. (연동 API 호출 완료)');
      }
      registerRuntimeDemoUser(id, pw, {
        role: 'user',
        id,
        displayName,
        distributorId,
      });
      setManagedUsers((prev) => [...prev, row]);
      setNewId('');
      setNewName('');
      setNewPw('demo');
    } catch (e) {
      setFormErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [
    newId,
    newName,
    newPw,
    newDist,
    session,
    useMarketApi,
    session.role,
    session.distributorId,
    managedUsers,
    setManagedUsers,
    onSyncNotice,
    onReloadFromApi,
  ]);

  const setStatus = useCallback(
    async (id: string, status: ManagedHtsUser['status']) => {
      if (useMarketApi) {
        try {
          await htsSetUserMarketStatus(session, id, status === 'active' ? 'active' : 'suspended');
          await onReloadFromApi?.();
        } catch (e) {
          onSyncNotice(e instanceof Error ? e.message : String(e));
        }
        return;
      }
      setManagedUsers((prev) => prev.map((u) => (u.id === id ? { ...u, status } : u)));
    },
    [setManagedUsers, session, useMarketApi, onReloadFromApi, onSyncNotice],
  );

  return (
    <div className="fc-admin__masterGrid">
      <section className="fc-admin__card">
        <h2 className="fc-admin__cardTitle">유저 관리</h2>
        <p className="fc-admin__cardDesc">
          마스터는 총판 소속 유저를 만들고, 총판은 자신의 하위 유저만 관리합니다.
          {useMarketApi
            ? ' 마켓 API 로직: 아이디는 소문자·4–20자 규칙, 비밀번호는 8–24자·영문+숫자 조합.'
            : ' 신규 유저는 비밀번호 기본 demo 로 로그인 레지스트리에 등록됩니다.'}
        </p>
        {session.role === 'master' ? (
          <div className="fc-admin__field fc-admin__field--inline">
            <label htmlFor="fc-user-filter-dist">총판 필터</label>
            <select id="fc-user-filter-dist" value={filterDist} onChange={(e) => setFilterDist(e.target.value)}>
              <option value="">전체</option>
              {distributors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div className="fc-admin__tableWrap">
          <table>
            <thead>
              <tr>
                <th>아이디</th>
                <th>이름</th>
                {session.role === 'master' ? <th>총판</th> : null}
                <th>상태</th>
                <th>생성일</th>
                <th>비고</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={session.role === 'master' ? 6 : 5}>유저가 없습니다.</td>
                </tr>
              ) : (
                visible.map((u) => (
                  <tr key={u.id}>
                    <td>{u.id}</td>
                    <td>{u.displayName}</td>
                    {session.role === 'master' ? <td>{u.distributorId}</td> : null}
                    <td>
                      {u.status === 'active' ? (
                        <span className="fc-admin__badge fc-admin__badge--ok">이용</span>
                      ) : (
                        <span className="fc-admin__badge fc-admin__badge--err">중지</span>
                      )}
                    </td>
                    <td>{u.createdAt}</td>
                    <td>
                      <div className="fc-admin__rowActions">
                        {u.status === 'active' ? (
                          <button
                            type="button"
                            className="fc-admin__btnSm fc-admin__btnSm--err"
                            onClick={() => void setStatus(u.id, 'suspended')}
                          >
                            중지
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="fc-admin__btnSm fc-admin__btnSm--ok"
                            onClick={() => void setStatus(u.id, 'active')}
                          >
                            재개
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="fc-admin__card">
        <h2 className="fc-admin__cardTitle">유저 만들기</h2>
        <div className="fc-admin__field">
          <label htmlFor="fc-new-id">로그인 아이디</label>
          <input id="fc-new-id" value={newId} onChange={(e) => setNewId(e.target.value)} autoComplete="off" />
        </div>
        <div className="fc-admin__field">
          <label htmlFor="fc-new-name">표시 이름</label>
          <input id="fc-new-name" value={newName} onChange={(e) => setNewName(e.target.value)} />
        </div>
        <div className="fc-admin__field">
          <label htmlFor="fc-new-pw">초기 비밀번호</label>
          <input
            id="fc-new-pw"
            type="password"
            autoComplete="new-password"
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
          />
        </div>
        {session.role === 'master' ? (
          <div className="fc-admin__field">
            <label htmlFor="fc-new-dist">소속 총판</label>
            <select id="fc-new-dist" value={newDist} onChange={(e) => setNewDist(e.target.value)}>
              {distributors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.id})
                </option>
              ))}
            </select>
          </div>
        ) : null}
        {formErr ? (
          <p className="fc-admin__hint" style={{ color: 'var(--fc-err)' }}>
            {formErr}
          </p>
        ) : null}
        <button type="button" className="fc-admin__btnPrimary" disabled={saving} onClick={createUser}>
          {saving ? '처리 중…' : '유저 생성'}
        </button>
      </section>
    </div>
  );
}
