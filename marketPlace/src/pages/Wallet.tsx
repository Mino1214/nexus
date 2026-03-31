import { useEffect, useState } from 'react';
import { api, marketPath } from '../api';

type Me = {
  user: { id: string };
  pointsBalance: number;
  cashBalance: number;
};

type PointsRes = { points: { id: number; amount: number; type: string; description: string | null; created_at: string }[] };
type CashRes = {
  transactions: { id: number; amount: number; type: string; description: string | null; created_at: string }[];
};

export function Wallet() {
  const [me, setMe] = useState<Me | null>(null);
  const [points, setPoints] = useState<PointsRes['points']>([]);
  const [cash, setCash] = useState<CashRes['transactions']>([]);
  const [err, setErr] = useState('');

  useEffect(() => {
    let c = false;
    (async () => {
      try {
        const [m, p, x] = await Promise.all([
          api<Me>(marketPath('/user/me')),
          api<PointsRes>(marketPath('/user/points?limit=20')),
          api<CashRes>(marketPath('/user/cash?limit=20')),
        ]);
        if (!c) {
          setMe(m);
          setPoints(p.points);
          setCash(x.transactions);
        }
      } catch (e) {
        if (!c) setErr(e instanceof Error ? e.message : '오류');
      }
    })();
    return () => {
      c = true;
    };
  }, []);

  if (err) return <p className="err">{err}</p>;

  return (
    <div>
      <h1 className="page-heading">내 지갑</h1>

      {me ? (
        <div className="stats" style={{ marginBottom: 20 }}>
          <div className="stat">
            <div className="num">{me.pointsBalance}</div>
            <div className="lbl">포인트 잔액</div>
          </div>
          <div className="stat">
            <div className="num">{me.cashBalance}</div>
            <div className="lbl">캐쉬 잔액</div>
          </div>
        </div>
      ) : (
        <p style={{ color: 'var(--text-tertiary)' }}>불러오는 중…</p>
      )}

      <div className="card">
        <h2 className="card-title">포인트 내역</h2>
        <div className="tbl-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>일시</th>
                <th>유형</th>
                <th>변동</th>
                <th>메모</th>
              </tr>
            </thead>
            <tbody>
              {points.map((r) => (
                <tr key={r.id}>
                  <td>{r.created_at}</td>
                  <td>{r.type}</td>
                  <td>{r.amount}</td>
                  <td>{r.description ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2 className="card-title">캐쉬 내역</h2>
        <div className="tbl-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>일시</th>
                <th>유형</th>
                <th>변동</th>
                <th>메모</th>
              </tr>
            </thead>
            <tbody>
              {cash.map((r) => (
                <tr key={r.id}>
                  <td>{r.created_at}</td>
                  <td>{r.type}</td>
                  <td>{r.amount}</td>
                  <td>{r.description ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
