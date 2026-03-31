import { useEffect, useState } from 'react';
import { api, marketPath } from '../api';

type Policy = {
  id: number;
  operator_mu_user_id: number | null;
  monthly_limit: number;
  convert_rate: number;
};

export function PointPolicy() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [globalLimit, setGlobalLimit] = useState('');
  const [globalRate, setGlobalRate] = useState('');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  async function load() {
    const j = await api<{ policies: Policy[] }>(marketPath('/master/policy'));
    setPolicies(j.policies);
    const g = j.policies.find((p) => p.operator_mu_user_id == null);
    if (g) {
      setGlobalLimit(String(g.monthly_limit));
      setGlobalRate(String(g.convert_rate));
    }
  }

  useEffect(() => {
    (async () => {
      try {
        await load();
      } catch (e) {
        setErr(e instanceof Error ? e.message : '로드 실패');
      }
    })();
  }, []);

  async function saveGlobalPolicy(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setMsg('');
    try {
      await api(marketPath('/master/policy'), {
        method: 'PATCH',
        json: {
          monthly_limit: parseInt(globalLimit, 10),
          convert_rate: Number(globalRate),
        },
      });
      setMsg('전역 정책 저장됨 (월 한도는 KST 매월 1일 기준 집계).');
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '저장 실패');
    }
  }

  return (
    <div>
      <h1 className="page-heading">포인트 전환 정책</h1>
      <p style={{ color: 'var(--text-tertiary)', fontSize: 14, marginBottom: 16 }}>
        포인트→캐쉬 전환 한도는 <strong>매월 1일 00:00 KST</strong> 기준으로 새 달 한도로 계산됩니다.
      </p>
      {err ? <p className="err">{err}</p> : null}
      {msg ? <p style={{ color: 'var(--ok)', fontSize: 14 }}>{msg}</p> : null}

      <div className="card">
        <h2 className="card-title">전역 전환 정책</h2>
        <form onSubmit={saveGlobalPolicy} style={{ maxWidth: 420 }}>
          <div className="field">
            <label>월 포인트 전환 한도 (정수)</label>
            <input value={globalLimit} onChange={(e) => setGlobalLimit(e.target.value)} />
          </div>
          <div className="field">
            <label>전환 비율 (포인트 1당 캐쉬)</label>
            <input value={globalRate} onChange={(e) => setGlobalRate(e.target.value)} step="0.01" />
          </div>
          <button type="submit" className="btn">저장</button>
        </form>

        <h3 style={{ marginTop: 24, fontSize: 14, color: 'var(--text-tertiary)' }}>등록된 정책 행</h3>
        <div className="tbl-wrap" style={{ marginTop: 8 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>operator_mu_user_id</th>
                <th>월한도</th>
                <th>비율</th>
              </tr>
            </thead>
            <tbody>
              {policies.map((p) => (
                <tr key={p.id}>
                  <td>{p.id}</td>
                  <td>{p.operator_mu_user_id ?? '전역'}</td>
                  <td>{p.monthly_limit}</td>
                  <td>{p.convert_rate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
