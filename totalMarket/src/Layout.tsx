import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from './auth';
import { PortalPopup } from './components/PortalPopup';
import { api, marketPath } from './api';

export function PortalLayout() {
  const { authed, logout } = useAuth();
  const navigate = useNavigate();
  const [bal, setBal] = useState<{ points: number; cash: number } | null>(null);
  const [chargeOpen, setChargeOpen] = useState(false);

  useEffect(() => {
    let c = false;
    if (!authed) {
      setBal(null);
      return;
    }
    (async () => {
      try {
        const j = await api<{ pointsBalance: number; cashBalance: number }>(marketPath('/user/me'));
        if (!c) setBal({ points: j.pointsBalance, cash: j.cashBalance });
      } catch {
        if (!c) setBal(null);
      }
    })();
    return () => {
      c = true;
    };
  }, [authed]);

  return (
    <>
      <PortalPopup />
      <header className="portal-top">
        <div className="portal-top-inner">
          <NavLink to="/" className="portal-brand">
            Nexus 총마켓
          </NavLink>
          <nav className="portal-nav">
            <NavLink end to="/" className={({ isActive }) => (isActive ? 'active' : '')}>
              홈
            </NavLink>
            <NavLink to="/modules" className={({ isActive }) => (isActive ? 'active' : '')}>
              상품
            </NavLink>
            <NavLink to="/minigame" className={({ isActive }) => (isActive ? 'active' : '')}>
              미니게임
            </NavLink>
            <NavLink to="/shop" className={({ isActive }) => (isActive ? 'active' : '')}>
              스토어
            </NavLink>
            {authed ? (
              <NavLink to="/me" className={({ isActive }) => (isActive ? 'active' : '')}>
                내 정보
              </NavLink>
            ) : null}
            {authed && bal ? (
              <button
                type="button"
                className="wallet-chip"
                title="잔액 (클릭: 충전)"
                onClick={() => setChargeOpen(true)}
              >
                P <strong>{bal.points.toLocaleString()}</strong> · C <strong>{bal.cash.toLocaleString()}</strong>
                <span style={{ marginLeft: 6, opacity: 0.9 }}>충전</span>
              </button>
            ) : null}
            {authed ? (
              <>
                <button
                  type="button"
                  className="btn outline"
                  style={{ padding: '6px 14px', fontSize: '0.85rem' }}
                  onClick={() => {
                    logout();
                    navigate('/');
                  }}
                >
                  로그아웃
                </button>
              </>
            ) : (
              <NavLink to="/login" className="btn" style={{ padding: '8px 16px', fontSize: '0.85rem' }}>
                로그인
              </NavLink>
            )}
          </nav>
        </div>
      </header>
      {chargeOpen ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={() => setChargeOpen(false)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="modal-close" onClick={() => setChargeOpen(false)} aria-label="닫기">
              ×
            </button>
            <h2 style={{ marginBottom: 10 }}>충전 (준비 중)</h2>
            <p style={{ color: 'var(--muted)', marginBottom: 16 }}>
              캐쉬/포인트 충전은 추후 결제 모듈과 연동 예정입니다.
            </p>

            <div className="grid-modules">
              <div className="mod-card">
                <h3>캐쉬 충전</h3>
                <p>결제 연동 후 이용 가능합니다.</p>
                <button type="button" className="btn" disabled>
                  캐쉬 충전 (준비중)
                </button>
              </div>
              <div className="mod-card">
                <h3>포인트 충전</h3>
                <p>정책/이벤트/미니게임과 연동해 확장 예정입니다.</p>
                <button type="button" className="btn outline" disabled>
                  포인트 충전 (준비중)
                </button>
              </div>
            </div>

            <div style={{ marginTop: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn outline"
                onClick={() => {
                  setChargeOpen(false);
                  navigate('/me');
                }}
              >
                내 정보로 이동
              </button>
              <button type="button" className="btn ghost" onClick={() => setChargeOpen(false)}>
                닫기
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <Outlet />
      <footer className="main-max disclaimer">
        본 포털은 판매 모듈·포인트·캐쉬 연동을 제공합니다. 실제 대출·투자 등 금융 중개는 하지 않으며, UI 레이아웃은 정보
        서비스 플랫폼 구성 참고용입니다. 모듈별 이용 약관은 각 서비스 운영 정책을 따릅니다.
      </footer>
    </>
  );
}
