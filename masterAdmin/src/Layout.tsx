import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from './auth';
import { api, marketPath } from './api';
import { brandLogoUrl } from './branding';

const THEME_KEY = 'masterAdmin-theme-light';

type Hub = {
  activeCatalogModules: number;
  activeMarketCustomers: number;
  entitlementGrants: number;
  pandoraOperators: number;
};

export function Layout() {
  const { logout } = useAuth();
  const logo = brandLogoUrl();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [light, setLight] = useState(() => typeof localStorage !== 'undefined' && localStorage.getItem(THEME_KEY) === '1');
  const [kpi, setKpi] = useState<Hub | null>(null);

  useEffect(() => {
    document.body.classList.toggle('light', light);
    try {
      localStorage.setItem(THEME_KEY, light ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [light]);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const j = await api<{ hub: Hub }>(marketPath('/master/hub/summary'));
        if (!cancel) setKpi(j.hub);
      } catch {
        if (!cancel) setKpi(null);
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  function closeSidebar() {
    setSidebarOpen(false);
  }

  return (
    <div className="pa-dashboard">
      <div
        className={`sidebar-overlay${sidebarOpen ? ' open' : ''}`}
        role="presentation"
        onClick={closeSidebar}
      />
      <aside className={`sidebar${sidebarOpen ? ' open' : ''}`}>
        <div className="sidebar-brand">
          {logo ? <img src={logo} alt="" className="brand-logo" width={200} height={56} /> : null}
          <span className="brand-name">총마켓 Master</span>
        </div>
        <div className="sidebar-kpi">
          <div className="kpi-item">
            <span className="kpi-val">{kpi?.activeCatalogModules ?? '—'}</span>
            <span className="kpi-lbl">모듈</span>
          </div>
          <div className="kpi-item">
            <span className="kpi-val">{kpi?.activeMarketCustomers ?? '—'}</span>
            <span className="kpi-lbl">고객</span>
          </div>
          <div className="kpi-item">
            <span className="kpi-val">{kpi?.entitlementGrants ?? '—'}</span>
            <span className="kpi-lbl">권한</span>
          </div>
          <div className="kpi-item">
            <span className="kpi-val">{kpi?.pandoraOperators ?? '—'}</span>
            <span className="kpi-lbl">운영자</span>
          </div>
        </div>
        <nav className="sidebar-nav">
          <div className="nav-section-label">메뉴</div>
          <NavLink
            end
            to="/"
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            onClick={closeSidebar}
          >
            <span className="nav-icon">📊</span>
            <span className="nav-text">대시보드</span>
          </NavLink>
          <NavLink
            to="/modules"
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            onClick={closeSidebar}
          >
            <span className="nav-icon">🧩</span>
            <span className="nav-text">판매 모듈</span>
          </NavLink>
          <NavLink
            to="/customers"
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            onClick={closeSidebar}
          >
            <span className="nav-icon">🏢</span>
            <span className="nav-text">마켓 고객</span>
          </NavLink>
          <NavLink
            to="/deployments"
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            onClick={closeSidebar}
          >
            <span className="nav-icon">📋</span>
            <span className="nav-text">구매·배포 기록</span>
          </NavLink>
          <NavLink
            to="/rewards-hub"
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            onClick={closeSidebar}
          >
            <span className="nav-icon">💰</span>
            <span className="nav-text">포인트·캐쉬·검수</span>
          </NavLink>
          <NavLink
            to="/store-products"
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            onClick={closeSidebar}
          >
            <span className="nav-icon">🛒</span>
            <span className="nav-text">스토어 상품</span>
          </NavLink>
          <NavLink
            to="/operators"
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            onClick={closeSidebar}
          >
            <span className="nav-icon">⚙️</span>
            <span className="nav-text">Pandora 운영자</span>
          </NavLink>
        </nav>
        <div className="sidebar-footer">
          <button type="button" className="btn ghost btn-sm" onClick={() => logout()}>
            로그아웃
          </button>
        </div>
      </aside>
      <div className="main-area">
        <div className="topbar">
          <div className="topbar-left">
            <button
              type="button"
              className="hamburger"
              aria-label="메뉴 열기"
              onClick={() => setSidebarOpen((v) => !v)}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect y="3" width="18" height="2" rx="1" fill="currentColor" />
                <rect y="8" width="18" height="2" rx="1" fill="currentColor" />
                <rect y="13" width="18" height="2" rx="1" fill="currentColor" />
              </svg>
            </button>
            <span className="topbar-title">Master Console</span>
          </div>
          <div className="topbar-right">
            <button type="button" className="theme-toggle" onClick={() => setLight((v) => !v)} title="테마">
              {light ? '🌙' : '☀️'}
            </button>
            <div className="user-chip">
              <span className="dot" aria-hidden />
              <span className="role-tag">Master</span>
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
