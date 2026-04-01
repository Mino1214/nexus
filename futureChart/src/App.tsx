import { useCallback, useEffect, useState } from 'react';
import { AdminApp } from './admin/AdminApp';
import { AppLogin } from './AppLogin';
import { readAuthWithMigration, saveAuth } from './auth';
import type { AdminSession } from './admin/types';
import { ChartOnlyShell } from './shell/ChartOnlyShell';
import { PandoraShell } from './shell/PandoraShell';
import { useHashRoute } from './useHashRoute';

export default function App() {
  const { route, goChart } = useHashRoute();
  const [session, setSession] = useState<AdminSession | null>(() => readAuthWithMigration());
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('fc-theme');
    if (saved === 'light' || saved === 'dark') return saved;
    return 'dark';
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.body.classList.toggle('light', theme === 'light');
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'light' ? '#f2f3f9' : '#061a1c');
  }, [theme]);

  /** 유저는 #/admin 접근 불가. 마스터는 HTS 운영을 Pandora 탭으로만 연다 */
  useEffect(() => {
    if (session?.role === 'user' && route === 'admin') {
      goChart();
    }
    if (session?.role === 'master' && route === 'admin') {
      sessionStorage.setItem('fc_pandora_initial_tab', 'sectionHtsOps');
      goChart();
    }
  }, [session?.role, route, goChart]);

  const logout = useCallback(() => {
    saveAuth(null);
    setSession(null);
    goChart();
  }, [goChart]);

  const onLoginSuccess = useCallback((s: AdminSession) => {
    saveAuth(s);
    setSession(s);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((t) => {
      const next = t === 'dark' ? 'light' : 'dark';
      localStorage.setItem('fc-theme', next);
      return next;
    });
  }, []);

  if (!session) {
    return <AppLogin onSuccess={onLoginSuccess} theme={theme} onToggleTheme={toggleTheme} />;
  }

  const adminProps = {
    session,
    onLogout: logout,
    theme,
    onToggleTheme: toggleTheme,
  };

  /* 유저: 차트(거래)만 — 운영 콘솔·Pandora 대시보드 없음 */
  if (session.role === 'user') {
    return <ChartOnlyShell session={session} theme={theme} onToggleTheme={toggleTheme} onLogout={logout} />;
  }

  /* 총판: HTS 운영 콘솔만 — 소속 유저만 관리(AdminApp 필터). 차트·마스터 대시보드 없음 */
  if (session.role === 'distributor') {
    return <AdminApp {...adminProps} />;
  }

  /* 마스터: Pandora 안에 거래·차트 + HTS 운영(임베드) + macro 탭 */
  if (session.role === 'master') {
    return (
      <PandoraShell session={session} theme={theme} onToggleTheme={toggleTheme} onLogout={logout} />
    );
  }

  return null;
}
