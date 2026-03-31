import { NavLink, Outlet } from 'react-router-dom';

const tabs: { to: string; end?: boolean; label: string }[] = [
  { to: '/me', end: true, label: '내 정보' },
  { to: '/me/history', label: '내역' },
  { to: '/me/attendance', label: '출석' },
  { to: '/me/convert', label: '포인트→캐쉬' },
  { to: '/me/videos', label: '동영상' },
  { to: '/me/predictions', label: '예측·베팅' },
];

export function MeHub() {
  return (
    <main className="main-max">
      <h1 className="section-title">내 정보 · 리워드</h1>
      <nav className="rewards-tabs" aria-label="내 정보 하위 메뉴">
        {tabs.map((t) => (
          <NavLink
            key={t.to + (t.end ? 'i' : '')}
            to={t.to}
            end={t.end}
            className={({ isActive }) => `rewards-tab${isActive ? ' active' : ''}`}
          >
            {t.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </main>
  );
}
