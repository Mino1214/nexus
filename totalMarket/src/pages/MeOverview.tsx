import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, marketPath } from '../api';

export function MeOverview() {
  const [me, setMe] = useState<{ pointsBalance: number; cashBalance: number } | null>(null);
  const [conv, setConv] = useState<{
    monthlyLimit: number;
    monthlyUsed: number;
    monthlyRemaining: number;
    convertRate: number;
    kstToday: string;
  } | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let c = false;
    (async () => {
      try {
        const [m, co] = await Promise.all([
          api<{ pointsBalance: number; cashBalance: number }>(marketPath('/user/me')).then((x) => ({
            pointsBalance: x.pointsBalance,
            cashBalance: x.cashBalance,
          })),
          api<{
            monthlyLimit: number;
            monthlyUsed: number;
            monthlyRemaining: number;
            convertRate: number;
            kstToday: string;
          }>(marketPath('/user/points/convert-summary')),
        ]);
        if (!c) {
          setMe(m);
          setConv(co);
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
    <>
      {err ? <p className="err">{err}</p> : null}
      <div className="page-card">
        <h2>잔액 요약</h2>
        {me ? (
          <p style={{ fontSize: '1.05rem' }}>
            포인트 <strong>{me.pointsBalance.toLocaleString()}</strong> · 캐쉬 <strong>{me.cashBalance.toLocaleString()}</strong>
          </p>
        ) : (
          <p>불러오는 중…</p>
        )}
        {conv ? (
          <p style={{ fontSize: '0.88rem', color: 'var(--muted)', marginTop: 8 }}>
            전환 한도(월, KST): {conv.monthlyUsed.toLocaleString()} / {conv.monthlyLimit.toLocaleString()}P 사용 · 남음{' '}
            {conv.monthlyRemaining.toLocaleString()}P · 오늘(KST) {conv.kstToday}
          </p>
        ) : null}
      </div>

      <div className="reward-quick-grid">
        <Link to="/me/history" className="reward-quick-card">
          <strong>내역</strong>
          <span>포인트·캐쉬·출석 기록</span>
        </Link>
        <Link to="/me/attendance" className="reward-quick-card">
          <strong>출석</strong>
          <span>1일 1회 · KST 자정 기준</span>
        </Link>
        <Link to="/me/convert" className="reward-quick-card">
          <strong>포인트 → 캐쉬</strong>
          <span>월 한도 내 전환</span>
        </Link>
        <Link to="/minigame" className="reward-quick-card">
          <strong>미니게임</strong>
          <span>포인트 적립</span>
        </Link>
        <Link to="/me/videos" className="reward-quick-card">
          <strong>동영상</strong>
          <span>업로드 · 검수 후 포인트</span>
        </Link>
        <Link to="/shop" className="reward-quick-card">
          <strong>스토어</strong>
          <span>캐쉬/포인트 결제</span>
        </Link>
      </div>
    </>
  );
}
