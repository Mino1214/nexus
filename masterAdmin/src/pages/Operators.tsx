import { useEffect, useState } from 'react';
import { api, API_BASE, marketPath } from '../api';

type Op = {
  id: number;
  name: string;
  login_id: string;
  site_domain: string | null;
  is_site_active: number;
  status: string;
};

export function Operators() {
  const [rows, setRows] = useState<Op[]>([]);
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const j = await api<{ operators: Op[] }>(marketPath('/master/operators'));
        setRows(j.operators);
      } catch (e) {
        setErr(e instanceof Error ? e.message : '오류');
      }
    })();
  }, []);

  return (
    <div>
      <h1 className="page-heading">Pandora 운영자 (mu_users)</h1>
      <p style={{ color: 'var(--text-tertiary)', fontSize: 14 }}>
        macroServer 마켓 API로 생성한 운영자입니다. 사이트 도메인은 테넌시 분기에 사용됩니다. API 베이스:{' '}
        <code>{API_BASE}</code>
      </p>
      {err ? <p className="err">{err}</p> : null}
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>이름</th>
              <th>login_id</th>
              <th>site_domain</th>
              <th>사이트 활성</th>
              <th>상태</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.id}</td>
                <td>{r.name}</td>
                <td>{r.login_id}</td>
                <td>{r.site_domain ?? '—'}</td>
                <td>{r.is_site_active ? '예' : '아니오'}</td>
                <td>{r.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
