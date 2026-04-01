import { useCallback, useEffect, useState } from 'react';
import { AdminApp } from './admin/AdminApp';
import { AppLogin } from './AppLogin';
import { readAuthWithMigration, saveAuth } from './auth';
import type { AdminSession } from './admin/types';
import { ChartOnlyShell } from './shell/ChartOnlyShell';
import { PandoraShell } from './shell/PandoraShell';
import { useHashRoute } from './useHashRoute';

export default function App() {
  const { route, goMain } = useHashRoute();
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

  /** 유저는 #/fx/console 접근 불가. 마스터는 HTS 운영 탭으로만 연결 */
  useEffect(() => {
    if (session?.role === 'user' && route === 'console') {
      goMain();
    }
    if (session?.role === 'master' && route === 'console') {
      sessionStorage.setItem('fx_initial_tab', 'sectionHtsOps');
      goMain();
    }
  }, [session?.role, route, goMain]);

  const logout = useCallback(() => {
    saveAuth(null);
    setSession(null);
    goMain();
  }, [goMain]);

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

  if (session.role === 'user') {
    return <ChartOnlyShell session={session} theme={theme} onToggleTheme={toggleTheme} onLogout={logout} />;
  }

  if (session.role === 'distributor') {
    return <AdminApp {...adminProps} />;
  }

  if (session.role === 'master') {
    return <PandoraShell session={session} theme={theme} onToggleTheme={toggleTheme} onLogout={logout} />;
  }

  return null;
}
