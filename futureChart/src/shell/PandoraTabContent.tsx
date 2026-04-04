import { HubConsolePanel } from '../hub/HubConsolePanel';
import type { AdminSession } from '../admin/types';
import type { PandoraTabId } from './pandoraNav';

type Props = {
  tab: PandoraTabId;
  session: AdminSession;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onLogout: () => void;
  onNavigateTab: (id: PandoraTabId) => void;
};

export function PandoraTabContent({ tab, session }: Props) {
  return <HubConsolePanel tabId={tab} session={session} />;
}
