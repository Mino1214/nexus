import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, marketPath } from '../api';

type Row = {
  entitlement_id: number;
  customer_id: number;
  customer_name: string;
  macro_user_id: string | null;
  market_user_id: string | null;
  customer_site_domain: string | null;
  module_slug: string;
  module_name: string;
  deployment_url: string | null;
  deployment_notes: string | null;
  can_admin: number;
  can_operator: number;
  updated_at: string;
};

export function ModuleDeployments() {
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState('');

  useEffect(() => {
    let c = false;
    (async () => {
      try {
        const j = await api<{ deployments: Row[] }>(marketPath('/master/module-deployments'));
        if (!c) setRows(j.deployments);
      } catch (e) {
        if (!c) setErr(e instanceof Error ? e.message : '로드 실패');
      }
    })();
    return () => {
      c = true;
    };
  }, []);

  return (
    <div>
      <h1 className="page-heading">구매·배포 기록</h1>
      <p style={{ color: 'var(--text-tertiary)', fontSize: 14, marginBottom: 16 }}>
        고객 권한 화면에서 모듈별로 입력한 <strong>배포 URL·메모</strong>가 여기 모입니다. Pandora 계정(
        <code>macro_user_id</code>)과 마켓플레이스 로그인(<code>market_user_id</code>)을 함께 보려는 용도입니다.
      </p>
      {err ? <p className="err">{err}</p> : null}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="tbl-wrap" style={{ border: 'none', borderRadius: 0 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>고객</th>
                <th>모듈</th>
                <th>배포 URL</th>
                <th>메모</th>
                <th>Pandora id</th>
                <th>마켓 id</th>
                <th>고객 도메인</th>
                <th>갱신</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && !err ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: 24 }}>
                    아직 권한 부여가 없거나 배포 기록이 비어 있습니다.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.entitlement_id}>
                    <td>{r.customer_name}</td>
                    <td>
                      <code>{r.module_slug}</code>
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{r.module_name}</div>
                    </td>
                    <td style={{ maxWidth: 200 }}>
                      {r.deployment_url ? (
                        <a
                          href={r.deployment_url.startsWith('http') ? r.deployment_url : `https://${r.deployment_url}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {r.deployment_url}
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td style={{ maxWidth: 180, fontSize: 12 }}>{r.deployment_notes ?? '—'}</td>
                    <td>
                      <code>{r.macro_user_id ?? '—'}</code>
                    </td>
                    <td>
                      <code>{r.market_user_id ?? '—'}</code>
                    </td>
                    <td style={{ fontSize: 12 }}>{r.customer_site_domain ?? '—'}</td>
                    <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{r.updated_at}</td>
                    <td>
                      <Link to={`/customers/${r.customer_id}`} className="link-pill">
                        편집
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
