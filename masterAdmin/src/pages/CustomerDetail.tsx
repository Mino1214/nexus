import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, marketPath } from '../api';

type Ent = {
  id: number;
  module_slug: string;
  can_admin: number;
  can_operator: number;
  flags_json: string | null;
};

type Cat = { slug: string; name: string; admin_entry_url: string | null; ops_entry_url: string | null };

export function CustomerDetail() {
  const { id } = useParams();
  const cid = parseInt(id || '', 10);
  const [catalog, setCatalog] = useState<Cat[]>([]);
  const [selected, setSelected] = useState<Record<string, { on: boolean; admin: boolean; op: boolean }>>({});
  const [flags, setFlags] = useState<Record<string, string>>({});
  const [err, setErr] = useState('');
  const [name, setName] = useState('');

  async function load() {
    if (Number.isNaN(cid)) return;
    try {
      const [cust, ent] = await Promise.all([
        api<{ customer: { display_name: string } }>(marketPath(`/master/customers/${cid}`)),
        api<{ entitlements: Ent[]; catalog: Cat[] }>(marketPath(`/master/customers/${cid}/entitlements`)),
      ]);
      setName(cust.customer.display_name);
      setCatalog(ent.catalog);
      const sel: Record<string, { on: boolean; admin: boolean; op: boolean }> = {};
      const fl: Record<string, string> = {};
      for (const c of ent.catalog) {
        const ex = ent.entitlements.find((e) => e.module_slug === c.slug);
        sel[c.slug] = ex
          ? { on: true, admin: !!ex.can_admin, op: !!ex.can_operator }
          : { on: false, admin: true, op: true };
        fl[c.slug] = ex?.flags_json ? ex.flags_json : '';
      }
      setSelected(sel);
      setFlags(fl);
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

  if (Number.isNaN(cid)) return <p className="err">잘못된 ID</p>;

  return (
    <div>
      <p>
        <Link to="/customers">← 목록</Link>
      </p>
      <h1>고객 권한 · {name || ` #${cid}`}</h1>
      <p style={{ color: 'var(--muted)', fontSize: 14 }}>
        체크한 모듈만 부여됩니다. 관리자/운영 URL은 «판매 모듈»에 등록한 주소를 따릅니다 (운영 시 실제 도메인에 맞게 수정).
      </p>
      {err ? <p className="err">{err}</p> : null}

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
          권한 저장
        </button>
      </div>
    </div>
  );
}
