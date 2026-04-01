import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AdminSession } from '../admin/types';
import { MODULE_CODE, MODULE_NAME } from '../config/moduleContext';
import { PandoraTabContent } from './PandoraTabContent';
import {
  defaultTabForRole,
  isNavItemVisible,
  PANDORA_NAV,
  sectionLabel,
  type NavItemDef,
  type PandoraTabId,
} from './pandoraNav';
import './PandoraShell.css';

type Props = {
  session: AdminSession;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onLogout: () => void;
};

function readInitialPandoraTab(): PandoraTabId {
  try {
    const raw = sessionStorage.getItem('fc_pandora_initial_tab');
    if (!raw) return defaultTabForRole();
    sessionStorage.removeItem('fc_pandora_initial_tab');
    if (PANDORA_NAV.some((i) => i.id === raw)) return raw as PandoraTabId;
  } catch {
    /* ignore */
  }
  return defaultTabForRole();
}

function roleTag(role: AdminSession['role']): string {
  if (role === 'master') return 'MASTER';
  if (role === 'distributor') return 'MANAGER';
  return 'USER';
}

export function PandoraShell({ session, theme, onToggleTheme, onLogout }: Props) {
  const [activeTab, setActiveTab] = useState<PandoraTabId>(() => readInitialPandoraTab());
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const vis = PANDORA_NAV.filter((i) => isNavItemVisible(i, session.role));
    if (!vis.some((i) => i.id === activeTab)) {
      setActiveTab(defaultTabForRole());
    }
  }, [session.role, activeTab]);

  const grouped = useMemo(() => {
    const sections = ['hts', 'hub'] as const;
    const out: { key: (typeof sections)[number]; items: NavItemDef[] }[] = [];
    for (const key of sections) {
      const items = PANDORA_NAV.filter((i) => i.section === key && isNavItemVisible(i, session.role));
      if (items.length) out.push({ key, items });
    }
    return out;
  }, [session.role]);

  const pickTab = useCallback((id: PandoraTabId) => {
    setActiveTab(id);
    setSidebarOpen(false);
  }, []);

  const activeTitle = PANDORA_NAV.find((i) => i.id === activeTab)?.label ?? '—';

  return (
    <div className="pa-dashboard">
      <div
        className={`sidebar-overlay${sidebarOpen ? ' open' : ''}`}
        aria-hidden
        onClick={() => setSidebarOpen(false)}
      />

      <aside className={`sidebar${sidebarOpen ? ' open' : ''}`} aria-label="주 메뉴">
        <div className="sidebar-brand">
          <img src="/logo.svg" alt="" className="brand-logo" width={200} height={56} />
          <span className="brand-name">Pandora</span>
          <span className="brand-module">{MODULE_NAME}</span>
          <span className="brand-module-code">{MODULE_CODE}</span>
        </div>

        <div className="sidebar-kpi">
          <div className="kpi-item">
            <span className="kpi-val">—</span>
            <span className="kpi-lbl">회원</span>
          </div>
          <div className="kpi-item">
            <span className="kpi-val kpi-warn">—</span>
            <span className="kpi-lbl">대기</span>
          </div>
          <div className="kpi-item">
            <span className="kpi-val kpi-ok">—</span>
            <span className="kpi-lbl">세션</span>
          </div>
          <div className="kpi-item">
            <span className="kpi-val">—</span>
            <span className="kpi-lbl">주문</span>
          </div>
        </div>

        <nav className="sidebar-nav" aria-label="섹션">
          {grouped.map(({ key, items }) => (
            <div key={key}>
              <div className="nav-section-label">{sectionLabel(key)}</div>
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`nav-item tab-btn${activeTab === item.id ? ' active' : ''}`}
                  data-tab={item.id}
                  onClick={() => pickTab(item.id)}
                >
                  <span className="nav-icon" aria-hidden>
                    {item.icon}
                  </span>
                  <span className="nav-text">{item.label}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button type="button" className="btn-ghost btn-sm" onClick={onLogout}>
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
              onClick={() => setSidebarOpen((o) => !o)}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect y="3" width="18" height="2" rx="1" fill="currentColor" />
                <rect y="8" width="18" height="2" rx="1" fill="currentColor" />
                <rect y="13" width="18" height="2" rx="1" fill="currentColor" />
              </svg>
            </button>
            <div className="topbar-brand">
              <img src="/logo.svg" alt="" className="brand-logo" width={190} height={46} aria-hidden />
              <span>Pandora</span>
            </div>
            <span className="topbar-title">{activeTitle}</span>
          </div>
          <div className="topbar-right">
            <button type="button" className="theme-toggle btn-ghost btn-sm" onClick={onToggleTheme} title="테마">
              {theme === 'dark' ? '🌙' : '☀️'}
            </button>
            <div className="user-chip">
              <div className="dot" />
              <span style={{ fontSize: '13px', fontWeight: 600 }}>{session.displayName}</span>
              <span className="role-tag">{roleTag(session.role)}</span>
            </div>
            <button type="button" className="btn-ghost btn-sm" onClick={onLogout}>
              로그아웃
            </button>
          </div>
        </div>

        <div className="tab-content">
          <div className={`tab-panel active pandora-tab-panel pandora-tab-panel--${activeTab}`} id={activeTab}>
            <PandoraTabContent
              tab={activeTab}
              session={session}
              theme={theme}
              onToggleTheme={onToggleTheme}
              onLogout={onLogout}
              onNavigateTab={pickTab}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
