import { useEffect, useState } from 'react';
import { api, marketPath } from '../../api';

export function ConvertPage() {
  const [conv, setConv] = useState<{
    monthlyLimit: number;
    monthlyUsed: number;
    monthlyRemaining: number;
    convertRate: number;
    kstToday: string;
  } | null>(null);
  const [pointsIn, setPointsIn] = useState('');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  async function refresh() {
    setErr('');
    try {
      const c = await api<{
        monthlyLimit: number;
        monthlyUsed: number;
        monthlyRemaining: number;
        convertRate: number;
        kstToday: string;
      }>(marketPath('/user/points/convert-summary'));
      setConv(c);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '로드 실패');
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function doConvert(e: React.FormEvent) {
    e.preventDefault();
    setMsg('');
    const n = parseInt(pointsIn, 10);
    if (Number.isNaN(n) || n <= 0) return;
    try {
      const j = await api<{ cashGained: number }>(marketPath('/user/points/convert'), {
        method: 'POST',
        json: { points: n },
      });
      setMsg(`캐쉬 +${j.cashGained} 전환됨`);
      setPointsIn('');
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '전환 실패');
    }
  }

  return (
    <>
      {err ? <p className="err">{err}</p> : null}
      {msg ? <p className="ok">{msg}</p> : null}
      <div className="page-card">
        <h2>포인트 → 캐쉬 전환</h2>
        {conv ? (
          <>
            <p style={{ fontSize: '0.9rem', color: 'var(--muted)' }}>
              월 한도 {conv.monthlyLimit.toLocaleString()}P 중 사용 {conv.monthlyUsed.toLocaleString()}P · 남음{' '}
              {conv.monthlyRemaining.toLocaleString()}P · 비율 {conv.convertRate} (포인트 1당 캐쉬)
            </p>
            <p style={{ fontSize: '0.85rem' }}>KST 오늘: {conv.kstToday}</p>
            <form onSubmit={doConvert} style={{ marginTop: 12 }}>
              <div className="field">
                <label>전환할 포인트</label>
                <input value={pointsIn} onChange={(e) => setPointsIn(e.target.value)} type="number" min={1} />
              </div>
              <button type="submit" className="btn">
                전환
              </button>
            </form>
          </>
        ) : (
          <p>…</p>
        )}
      </div>
    </>
  );
}
