import { StreamingChart } from '../StreamingChart';
import type { AdminSession } from '../admin/types';
import './ChartOnlyShell.css';

type Props = {
  session: AdminSession;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onLogout: () => void;
};

/** 유저 전용: 차트(거래 화면)만 — 운영 콘솔·Pandora 셸 없음 */
export function ChartOnlyShell({ session, theme, onToggleTheme, onLogout }: Props) {
  return (
    <div className="chart-only-shell">
      <header className="chart-only-bar">
        <div className="chart-only-left">
          <span className="chart-only-brand">FX</span>
          <span className="chart-only-badge">HTS</span>
        </div>
        <div className="chart-only-right">
          <span className="chart-only-user">{session.displayName}</span>
          <span className="chart-only-role">유저</span>
          <button type="button" className="theme-toggle btn-ghost btn-sm" onClick={onToggleTheme} title="테마">
            {theme === 'dark' ? '🌙' : '☀️'}
          </button>
          <button type="button" className="btn-ghost btn-sm" onClick={onLogout}>
            로그아웃
          </button>
        </div>
      </header>
      <main className="chart-only-main">
        <StreamingChart />
      </main>
    </div>
  );
}
