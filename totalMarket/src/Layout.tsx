import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from './auth';

export function PortalLayout() {
  const { authed, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <>
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
              판매 모듈
            </NavLink>
            <NavLink to="/rewards" className={({ isActive }) => (isActive ? 'active' : '')}>
              포인트·리워드
            </NavLink>
            <NavLink to="/shop" className={({ isActive }) => (isActive ? 'active' : '')}>
              스토어
            </NavLink>
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
      <Outlet />
      <footer className="main-max disclaimer">
        본 포털은 판매 모듈·포인트·캐쉬 연동을 제공합니다. 실제 대출·투자 등 금융 중개는 하지 않으며, UI 레이아웃은 정보
        서비스 플랫폼 구성 참고용입니다. 모듈별 이용 약관은 각 서비스 운영 정책을 따릅니다.
      </footer>
    </>
  );
}
