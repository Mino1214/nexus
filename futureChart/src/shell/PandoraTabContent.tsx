import { HubConsolePanel } from '../hub/HubConsolePanel';
import { AdminApp } from '../admin/AdminApp';
import type { AdminSession } from '../admin/types';
import type { PandoraTabId } from './pandoraNav';
import { tabProductLayer } from './pandoraSurfaceRegistry';

type Props = {
  tab: PandoraTabId;
  session: AdminSession;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onLogout: () => void;
  onNavigateTab: (id: PandoraTabId) => void;
};

export function PandoraTabContent({
  tab,
  session,
  theme,
  onToggleTheme,
  onLogout,
  onNavigateTab,
}: Props) {
  if (tab === 'sectionHtsOps') {
    return (
      <div className="pandora-hts-embed-root">
        <AdminApp
          layout="embedded"
          session={session}
          onLogout={onLogout}
          theme={theme}
          onToggleTheme={onToggleTheme}
          onBackToChart={() => onNavigateTab('sectionMemberDesk')}
        />
      </div>
    );
  }

  if (tabProductLayer(tab) === 'hub') {
    return <HubConsolePanel tabId={tab} session={session} />;
  }

  return null;
}
