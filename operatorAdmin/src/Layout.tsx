import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from './auth';
import { brandLogoUrl } from './branding';

export function Layout() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const logo = brandLogoUrl();

  return (
    <div className="pa-dashboard" style={{ gridTemplateColumns: '240px 1fr' }}>
      <aside className="sidebar open" style={{ position: 'sticky', top: 0, height: '100vh' }}>
        <div className="sidebar-brand">
          {logo ? <img src={logo} alt="" className="brand-logo" width={200} height={56} /> : null}
          <span className="brand-name">총마켓 Operator</span>
        </div>
        <nav className="sidebar-nav">
          <div className="nav-section-label">메뉴</div>
          <NavLink
            to="/videos"
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            onClick={() => {}}
          >
            <span className="nav-icon">🎬</span>
            <span className="nav-text">동영상 1차 검수</span>
          </NavLink>
        </nav>
        <div className="sidebar-footer">
          <button
            type="button"
            className="btn ghost btn-sm"
            onClick={() => {
              logout();
              navigate('/login');
            }}
          >
            로그아웃
          </button>
        </div>
      </aside>

      <div className="main-area">
        <div className="topbar">
          <div className="topbar-left">
            <span className="topbar-title">Operator Console</span>
          </div>
          <div className="topbar-right">
            <div className="user-chip">
              <span className="dot" aria-hidden />
              <span className="role-tag">Operator</span>
            </div>
          </div>
        </div>
        <div className="tab-content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
