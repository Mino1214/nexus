import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, marketPath } from '../api';

type Row = {
  id: number;
  display_name: string;
  contact_email: string | null;
  site_domain: string | null;
  macro_user_id?: string | null;
  market_user_id?: string | null;
  status: string;
  entitlement_count: number;
};

export function Customers() {
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState('');
  const [form, setForm] = useState({
    display_name: '',
    contact_email: '',
    site_domain: '',
    notes: '',
    macro_user_id: '',
  });

  async function load() {
    try {
      const j = await api<{ customers: Row[] }>(marketPath('/master/customers'));
      setRows(j.customers);
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
      await api(marketPath('/master/customers'), {
        method: 'POST',
        json: {
          display_name: form.display_name,
          contact_email: form.contact_email || null,
          site_domain: form.site_domain || null,
          notes: form.notes || null,
          macro_user_id: form.macro_user_id || null,
        },
      });
      setForm({ display_name: '', contact_email: '', site_domain: '', notes: '', macro_user_id: '' });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '저장 실패');
    }
  }

  return (
    <div>
      <h1 className="page-heading">마켓 고객</h1>
      <p style={{ color: 'var(--text-tertiary)', fontSize: 14 }}>
        모듈을 구매·이용하는 주체입니다. 단일 DB에서는 이 레코드 + 권한 테이블이 «누가 어떤 모듈을 쓰는지»의 기준입니다.
      </p>

      <div className="card">
        <h2>고객 추가</h2>
        <form onSubmit={add}>
          <div className="field">
            <label>표시 이름</label>
            <input
              value={form.display_name}
              onChange={(e) => setForm({ ...form, display_name: e.target.value })}
              required
            />
          </div>
          <div className="field">
            <label>연락 이메일</label>
            <input
              type="email"
              value={form.contact_email}
              onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
            />
          </div>
          <div className="field">
            <label>할당 도메인 (선택)</label>
            <input
              value={form.site_domain}
              onChange={(e) => setForm({ ...form, site_domain: e.target.value })}
              placeholder="customer.example.com"
            />
          </div>
          <div className="field">
            <label>Pandora users.id 연결 (선택)</label>
            <input
              value={form.macro_user_id}
              onChange={(e) => setForm({ ...form, macro_user_id: e.target.value })}
              placeholder="소문자 계정 id"
            />
          </div>
          <div className="field">
            <label>메모</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          {err ? <p className="err">{err}</p> : null}
          <button type="submit" className="btn">
            추가
          </button>
        </form>
      </div>

      <div className="card">
        <h2>목록</h2>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>이름</th>
              <th>이메일</th>
              <th>도메인</th>
              <th>Pandora id</th>
              <th>마켓 id</th>
              <th>권한 수</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.id}</td>
                <td>{r.display_name}</td>
                <td>{r.contact_email ?? '—'}</td>
                <td>{r.site_domain ?? '—'}</td>
                <td>
                  <code>{r.macro_user_id ?? '—'}</code>
                </td>
                <td>
                  <code>{r.market_user_id ?? '—'}</code>
                </td>
                <td>{r.entitlement_count}</td>
                <td>
                  <Link to={`/customers/${r.id}`} className="btn secondary" style={{ padding: '4px 10px', fontSize: 12 }}>
                    권한
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
