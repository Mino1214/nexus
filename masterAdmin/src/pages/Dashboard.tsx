import { useEffect, useState } from 'react';
import { api, marketPath } from '../api';

type Hub = {
  hub: {
    activeCatalogModules: number;
    activeMarketCustomers: number;
    entitlementGrants: number;
    pandoraOperators: number;
  };
};

type Stats = {
  operatorCount: number;
  marketUserCount: number;
  totalCashSales: number;
  totalPointsIssued: number;
};

export function Dashboard() {
  const [hub, setHub] = useState<Hub['hub'] | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [h, s] = await Promise.all([
          api<Hub>(marketPath('/master/hub/summary')),
          api<Stats>(marketPath('/master/stats')),
        ]);
        if (!cancelled) {
          setHub(h.hub);
          setStats(s);
        }
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : '로드 실패');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (err) return <p className="err">{err}</p>;

  return (
    <div>
      <h1>대시보드</h1>
      <h2>총마켓 (모듈·고객)</h2>
      <div className="stats">
        <div className="stat">
          <div className="num">{hub?.activeCatalogModules ?? '—'}</div>
          <div className="lbl">활성 판매 모듈</div>
        </div>
        <div className="stat">
          <div className="num">{hub?.activeMarketCustomers ?? '—'}</div>
          <div className="lbl">활성 마켓 고객</div>
        </div>
        <div className="stat">
          <div className="num">{hub?.entitlementGrants ?? '—'}</div>
          <div className="lbl">모듈 권한 부여 건</div>
        </div>
        <div className="stat">
          <div className="num">{hub?.pandoraOperators ?? '—'}</div>
          <div className="lbl">Pandora 운영자(mu)</div>
        </div>
      </div>

      <h2 style={{ marginTop: 28 }}>Pandora 내부 마켓 지표</h2>
      <div className="stats">
        <div className="stat">
          <div className="num">{stats?.operatorCount ?? '—'}</div>
          <div className="lbl">운영자(API)</div>
        </div>
        <div className="stat">
          <div className="num">{stats?.marketUserCount ?? '—'}</div>
          <div className="lbl">마켓 연동 유저</div>
        </div>
        <div className="stat">
          <div className="num">{stats?.totalCashSales ?? '—'}</div>
          <div className="lbl">확정 캐쉬 매출</div>
        </div>
        <div className="stat">
          <div className="num">{stats?.totalPointsIssued ?? '—'}</div>
          <div className="lbl">포인트 적립 합계</div>
        </div>
      </div>
    </div>
  );
}
