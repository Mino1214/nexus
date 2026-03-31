import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from './auth';

export function Layout() {
  const { logout } = useAuth();
  return (
    <div className="layout">
      <header>
        <strong>총마켓 Master</strong>
        <nav>
          <NavLink end to="/" className={({ isActive }) => (isActive ? 'active' : '')}>
            대시보드
          </NavLink>
          <NavLink to="/modules" className={({ isActive }) => (isActive ? 'active' : '')}>
            판매 모듈
          </NavLink>
          <NavLink to="/customers" className={({ isActive }) => (isActive ? 'active' : '')}>
            마켓 고객
          </NavLink>
          <NavLink to="/operators" className={({ isActive }) => (isActive ? 'active' : '')}>
            Pandora 운영자
          </NavLink>
          <button type="button" className="btn ghost" onClick={logout}>
            로그아웃
          </button>
        </nav>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
