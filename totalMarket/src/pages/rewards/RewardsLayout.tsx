import { NavLink, Outlet } from 'react-router-dom';

const tabs: { to: string; end?: boolean; label: string }[] = [
  { to: '/rewards', end: true, label: '개요' },
  { to: '/rewards/attendance', label: '출석' },
  { to: '/rewards/convert', label: '포인트→캐쉬' },
  { to: '/rewards/minigame', label: '미니게임' },
  { to: '/rewards/videos', label: '동영상' },
  { to: '/rewards/predictions', label: '예측·베팅' },
];

export function RewardsLayout() {
  return (
    <main className="main-max">
      <h1 className="section-title">포인트 · 캐쉬 · 리워드</h1>
      <p style={{ color: 'var(--muted)', marginBottom: 16 }}>
        한국 시간(KST) 기준 출석이며, 포인트→캐쉬 전환 한도는 <strong>매월 1일 00:00 KST</strong>에 초기화됩니다.
      </p>
      <nav className="rewards-tabs" aria-label="리워드 하위 메뉴">
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
