import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, marketPath } from '../api';

type Ent = {
  id: number;
  module_slug: string;
  can_admin: number;
  can_operator: number;
  flags_json: string | null;
  deployment_url: string | null;
  deployment_notes: string | null;
};

type Cat = { slug: string; name: string; admin_entry_url: string | null; ops_entry_url: string | null };

type Customer = {
  display_name: string;
  macro_user_id: string | null;
  market_user_id: string | null;
};

export function CustomerDetail() {
  const { id } = useParams();
  const cid = parseInt(id || '', 10);
  const [catalog, setCatalog] = useState<Cat[]>([]);
  const [selected, setSelected] = useState<Record<string, { on: boolean; admin: boolean; op: boolean }>>({});
  const [flags, setFlags] = useState<Record<string, string>>({});
  const [deploy, setDeploy] = useState<Record<string, { url: string; notes: string }>>({});
  const [err, setErr] = useState('');
  const [name, setName] = useState('');
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [provLogin, setProvLogin] = useState('');
  const [provPw, setProvPw] = useState('');
  const [provUpdatePw, setProvUpdatePw] = useState(false);
  const [provMsg, setProvMsg] = useState('');

  async function load() {
    if (Number.isNaN(cid)) return;
    try {
      const [cust, ent] = await Promise.all([
        api<{ customer: Customer }>(marketPath(`/master/customers/${cid}`)),
        api<{ entitlements: Ent[]; catalog: Cat[] }>(marketPath(`/master/customers/${cid}/entitlements`)),
      ]);
      setName(cust.customer.display_name);
      setCustomer(cust.customer);
      setCatalog(ent.catalog);
      const sel: Record<string, { on: boolean; admin: boolean; op: boolean }> = {};
      const fl: Record<string, string> = {};
      const dep: Record<string, { url: string; notes: string }> = {};
      for (const c of ent.catalog) {
        const ex = ent.entitlements.find((e) => e.module_slug === c.slug);
        sel[c.slug] = ex
          ? { on: true, admin: !!ex.can_admin, op: !!ex.can_operator }
          : { on: false, admin: true, op: true };
        fl[c.slug] = ex?.flags_json ? ex.flags_json : '';
        dep[c.slug] = {
          url: ex?.deployment_url ?? '',
          notes: ex?.deployment_notes ?? '',
        };
      }
      setSelected(sel);
      setFlags(fl);
      setDeploy(dep);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '로드 실패');
    }
  }

  useEffect(() => {
    void load();
  }, [cid]);

  async function save() {
    setErr('');
    try {
      const items = catalog
        .filter((c) => selected[c.slug]?.on)
        .map((c) => ({
          module_slug: c.slug,
          can_admin: selected[c.slug].admin,
          can_operator: selected[c.slug].op,
          flags_json: flags[c.slug]?.trim() ? flags[c.slug].trim() : null,
          deployment_url: deploy[c.slug]?.url?.trim() || null,
          deployment_notes: deploy[c.slug]?.notes?.trim() || null,
        }));
      await api(marketPath(`/master/customers/${cid}/entitlements`), {
        method: 'PUT',
        json: { items },
      });
      await load();
      alert('저장했습니다.');
    } catch (e) {
      setErr(e instanceof Error ? e.message : '저장 실패');
    }
  }

  async function provision(e: React.FormEvent) {
    e.preventDefault();
    setProvMsg('');
    setErr('');
    try {
      const j = await api<{ ok: boolean; login_id: string; created?: boolean; passwordUpdated?: boolean }>(
        marketPath(`/master/customers/${cid}/provision-market-user`),
        {
          method: 'POST',
          json: {
            login_id: provLogin,
            password: provPw,
            update_password: provUpdatePw,
          },
        },
      );
      setProvMsg(
        j.created
          ? `마켓 유저 «${j.login_id}» 생성 후 연결했습니다.`
          : j.passwordUpdated
            ? `기존 «${j.login_id}» 비밀번호를 갱신했습니다.`
            : `기존 «${j.login_id}» 계정에 이 고객을 연결했습니다.`,
      );
      setProvPw('');
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '발급 실패');
    }
  }

  if (Number.isNaN(cid)) return <p className="err">잘못된 ID</p>;

  return (
    <div>
      <p>
        <Link to="/customers">← 목록</Link>
      </p>
      <h1 className="page-heading">고객 권한 · {name || ` #${cid}`}</h1>
      <p style={{ color: 'var(--text-tertiary)', fontSize: 14 }}>
        모듈별로 <strong>구매·배포 URL/도메인</strong>을 남기면 «구매·배포 기록»에서 전체 목록으로 볼 수 있습니다. Pandora{' '}
        <code>users.id</code>는 macro_user_id, <strong>마켓플레이스</strong> 로그인은 <code>users</code> 테이블과{' '}
        <code>market_user_id</code>로 연결됩니다. Master 콘솔 비밀번호와 다른 비밀번호를 쓰면 같은 아이디(예: master666)로
        마켓 유저 로그인도 가능합니다(먼저 Master 비밀번호는 Master JWT).
      </p>
      {err ? <p className="err">{err}</p> : null}

      <div className="card">
        <h2 className="card-title">마켓플레이스 유저 발급 / 연결</h2>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
          연결된 ID: <code>{customer?.market_user_id ?? '—'}</code> · Pandora macro:{' '}
          <code>{customer?.macro_user_id ?? '—'}</code>
        </p>
        {provMsg ? <p style={{ color: 'var(--ok)', fontSize: 14, marginBottom: 8 }}>{provMsg}</p> : null}
        <form onSubmit={provision} style={{ maxWidth: 440 }}>
          <div className="field">
            <label>마켓 로그인 id (소문자, 가입 화면과 동일 규칙)</label>
            <input value={provLogin} onChange={(e) => setProvLogin(e.target.value)} placeholder="예: master666" />
          </div>
          <div className="field">
            <label>비밀번호 (마켓 전용, 8~24자 영문·숫자)</label>
            <input
              type="password"
              value={provPw}
              onChange={(e) => setProvPw(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 12 }}>
            <input type="checkbox" checked={provUpdatePw} onChange={(e) => setProvUpdatePw(e.target.checked)} />
            이미 있는 유저면 비밀번호도 갱신
          </label>
          <button type="submit" className="btn secondary">
            발급 또는 연결
          </button>
        </form>
      </div>

      <div className="card">
        {catalog.map((c) => (
          <div key={c.slug} style={{ marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
              <input
                type="checkbox"
                checked={selected[c.slug]?.on ?? false}
                onChange={(e) =>
                  setSelected((s) => ({
                    ...s,
                    [c.slug]: { ...(s[c.slug] || { admin: true, op: true }), on: e.target.checked },
                  }))
                }
              />
              {c.name} <code style={{ fontWeight: 400 }}>({c.slug})</code>
            </label>
            <div style={{ marginLeft: 28, marginTop: 8, fontSize: 13 }}>
              <label style={{ marginRight: 16 }}>
                <input
                  type="checkbox"
                  checked={selected[c.slug]?.admin ?? true}
                  onChange={(e) =>
                    setSelected((s) => ({
                      ...s,
                      [c.slug]: { ...s[c.slug], on: s[c.slug]?.on ?? false, admin: e.target.checked, op: s[c.slug]?.op ?? true },
                    }))
                  }
                />{' '}
                관리자(Admin) 발급
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={selected[c.slug]?.op ?? true}
                  onChange={(e) =>
                    setSelected((s) => ({
                      ...s,
                      [c.slug]: { ...s[c.slug], on: s[c.slug]?.on ?? false, admin: s[c.slug]?.admin ?? true, op: e.target.checked },
                    }))
                  }
                />{' '}
                운영(Operator) 발급
              </label>
            </div>
            <div className="field" style={{ marginLeft: 28, marginTop: 8 }}>
              <label>수동 배포 URL / 도메인 (기록용)</label>
              <input
                value={deploy[c.slug]?.url ?? ''}
                onChange={(e) =>
                  setDeploy((d) => ({
                    ...d,
                    [c.slug]: { url: e.target.value, notes: d[c.slug]?.notes ?? '' },
                  }))
                }
                placeholder="https://buyer.example.com 또는 buyer.example.com"
              />
            </div>
            <div className="field" style={{ marginLeft: 28, marginTop: 8 }}>
              <label>배포 메모</label>
              <input
                value={deploy[c.slug]?.notes ?? ''}
                onChange={(e) =>
                  setDeploy((d) => ({
                    ...d,
                    [c.slug]: { url: d[c.slug]?.url ?? '', notes: e.target.value },
                  }))
                }
                placeholder="상품명, 구매일, 담당 등"
              />
            </div>
            <div className="field" style={{ marginLeft: 28, marginTop: 8 }}>
              <label>추가 플래그 JSON (선택)</label>
              <textarea
                value={flags[c.slug] ?? ''}
                onChange={(e) => setFlags((f) => ({ ...f, [c.slug]: e.target.value }))}
                placeholder='{"tier":"pro"}'
                style={{ fontFamily: 'monospace', fontSize: 12 }}
              />
            </div>
            <div style={{ marginLeft: 28, marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              {c.admin_entry_url ? (
                <Link to={`/m/${c.slug}/admin`} className="link-pill">
                  관리자 화면
                </Link>
              ) : null}
              {c.ops_entry_url ? (
                <Link to={`/m/${c.slug}/ops`} className="link-pill">
                  운영 화면
                </Link>
              ) : null}
            </div>
          </div>
        ))}
        <button type="button" className="btn" onClick={save}>
          권한·배포 정보 저장
        </button>
      </div>
    </div>
  );
}
