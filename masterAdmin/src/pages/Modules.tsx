import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, getMacroOrigin, marketPath } from '../api';

type Mod = {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  sort_order: number;
  admin_entry_url: string | null;
  ops_entry_url: string | null;
  is_active: number;
};

export function Modules() {
  const [rows, setRows] = useState<Mod[]>([]);
  const [err, setErr] = useState('');
  const [form, setForm] = useState({ slug: '', name: '', description: '', admin_entry_url: '', ops_entry_url: '' });

  async function load() {
    try {
      const j = await api<{ modules: Mod[] }>(marketPath('/master/catalog/modules'));
      setRows(j.modules);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '오류');
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    try {
      await api(marketPath('/master/catalog/modules'), {
        method: 'POST',
        json: {
          slug: form.slug,
          name: form.name,
          description: form.description || null,
          admin_entry_url: form.admin_entry_url || null,
          ops_entry_url: form.ops_entry_url || null,
        },
      });
      setForm({ slug: '', name: '', description: '', admin_entry_url: '', ops_entry_url: '' });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '저장 실패');
    }
  }

  return (
    <div>
      <h1>판매 모듈 카탈로그</h1>
      <p style={{ color: 'var(--muted)', fontSize: 14 }}>
        Pandora, PolyMart 등 마켓에서 파는 제품 단위입니다. 진입 주소는 <code>/admin.html</code> 처럼{' '}
        <strong>경로만</strong> 적어도 되며, 콘솔에서 <code>{getMacroOrigin()}</code> 에 붙여 엽니다.
      </p>

      <div className="card">
        <h2>모듈 추가</h2>
        <form onSubmit={add}>
          <div className="field">
            <label>slug (영문, 예: polymart)</label>
            <input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} required />
          </div>
          <div className="field">
            <label>표시 이름</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div className="field">
            <label>설명</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="field">
            <label>관리자 경로 또는 전체 URL</label>
            <input
              value={form.admin_entry_url}
              onChange={(e) => setForm({ ...form, admin_entry_url: e.target.value })}
              placeholder="/admin.html"
            />
          </div>
          <div className="field">
            <label>운영 경로 또는 전체 URL</label>
            <input
              value={form.ops_entry_url}
              onChange={(e) => setForm({ ...form, ops_entry_url: e.target.value })}
              placeholder="/owner.html"
            />
          </div>
          {err ? <p className="err">{err}</p> : null}
          <button type="submit" className="btn">
            추가
          </button>
        </form>
      </div>

      <div className="card">
        <h2>등록 목록</h2>
        <table>
          <thead>
            <tr>
              <th>slug</th>
              <th>이름</th>
              <th>관리자</th>
              <th>운영</th>
              <th>활성</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id}>
                <td>
                  <code>{m.slug}</code>
                </td>
                <td>{m.name}</td>
                <td>
                  {m.admin_entry_url ? (
                    <Link to={`/m/${m.slug}/admin`} className="link-pill">
                      콘솔에서 열기
                    </Link>
                  ) : (
                    '—'
                  )}
                </td>
                <td>
                  {m.ops_entry_url ? (
                    <Link to={`/m/${m.slug}/ops`} className="link-pill">
                      콘솔에서 열기
                    </Link>
                  ) : (
                    '—'
                  )}
                </td>
                <td>{m.is_active ? '예' : '아니오'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
