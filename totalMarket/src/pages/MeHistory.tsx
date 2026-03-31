import { useEffect, useState } from 'react';
import { api, marketPath } from '../api';

type PointTx = { id: number; amount: number; type: string; description: string | null; created_at: string };
type CashTx = { id: number; amount: number; type: string; description: string | null; created_at: string };

type Attendance = { checked_date: string; points_earned: number; streak_count: number };

export function MeHistory() {
  const [me, setMe] = useState<{ pointsBalance: number; cashBalance: number } | null>(null);
  const [points, setPoints] = useState<PointTx[]>([]);
  const [cash, setCash] = useState<CashTx[]>([]);
  const [att, setAtt] = useState<Attendance[]>([]);
  const [err, setErr] = useState('');

  useEffect(() => {
    let c = false;
    (async () => {
      try {
        const [m, p, ca, a] = await Promise.all([
          api<{ pointsBalance: number; cashBalance: number }>(marketPath('/user/me')),
          api<{ points: PointTx[] }>(marketPath('/user/points?limit=50')),
          api<{ transactions: CashTx[] }>(marketPath('/user/cash?limit=50')),
          api<{ history: Attendance[] }>(marketPath('/user/attendance/streak')),
        ]);
        if (!c) {
          setMe({ pointsBalance: m.pointsBalance, cashBalance: m.cashBalance });
          setPoints(p.points);
          setCash(ca.transactions);
          setAtt(a.history);
        }
      } catch (e) {
        if (!c) setErr(e instanceof Error ? e.message : '로드 실패');
      }
    })();
    return () => {
      c = true;
    };
  }, []);

  return (
    <main className="main-max">
      <h1 className="section-title">내 정보</h1>
      {err ? <p className="err">{err}</p> : null}

      <div className="page-card">
        <h2>잔액</h2>
        {me ? (
          <p>
            포인트 <strong>{me.pointsBalance.toLocaleString()}</strong> · 캐쉬 <strong>{me.cashBalance.toLocaleString()}</strong>
          </p>
        ) : (
          <p>불러오는 중…</p>
        )}
      </div>

      <div className="page-card">
        <h2>리워드 내역 (포인트)</h2>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>ID</th>
                <th>금액</th>
                <th>유형</th>
                <th>설명</th>
                <th>일시</th>
              </tr>
            </thead>
            <tbody>
              {points.map((t) => (
                <tr key={t.id}>
                  <td>{t.id}</td>
                  <td style={{ fontWeight: 700, color: t.amount >= 0 ? 'var(--ok)' : 'var(--err)' }}>{t.amount}</td>
                  <td>{t.type}</td>
                  <td>{t.description || '—'}</td>
                  <td>{t.created_at}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="page-card">
        <h2>캐쉬 내역</h2>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>ID</th>
                <th>금액</th>
                <th>유형</th>
                <th>설명</th>
                <th>일시</th>
              </tr>
            </thead>
            <tbody>
              {cash.map((t) => (
                <tr key={t.id}>
                  <td>{t.id}</td>
                  <td style={{ fontWeight: 700, color: t.amount >= 0 ? 'var(--ok)' : 'var(--err)' }}>{t.amount}</td>
                  <td>{t.type}</td>
                  <td>{t.description || '—'}</td>
                  <td>{t.created_at}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="page-card">
        <h2>출석 기록 (최근 30일)</h2>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>날짜(KST)</th>
                <th>지급 포인트</th>
                <th>연속</th>
              </tr>
            </thead>
            <tbody>
              {att.map((r) => (
                <tr key={r.checked_date}>
                  <td>{r.checked_date}</td>
                  <td>{r.points_earned}</td>
                  <td>{r.streak_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
