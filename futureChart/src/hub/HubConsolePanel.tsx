import type { AdminSession } from '../admin/types';
import type { PandoraTabId } from '../shell/pandoraNav';
import { MemberDeskHubPanel } from './panels/MemberDeskHubPanel';
import { NotifyHubPanel } from './panels/NotifyHubPanel';
import { LedgerHubPanel } from './panels/LedgerHubPanel';
import { WithdrawHubPanel } from './panels/WithdrawHubPanel';
import { SettleMgmtHubPanel } from './panels/SettleMgmtHubPanel';
import { PricingHubPanel } from './panels/PricingHubPanel';
import { TelegramHubPanel } from './panels/TelegramHubPanel';
import { PopupsHubPanel } from './panels/PopupsHubPanel';
import { DownloadsHubPanel } from './panels/DownloadsHubPanel';

type PanelProps = { tabId: PandoraTabId; session: AdminSession };

export function HubConsolePanel({ tabId, session }: PanelProps) {
  switch (tabId) {
    case 'sectionMemberDesk':   return <MemberDeskHubPanel session={session} />;
    case 'sectionMyTgBot':      return <NotifyHubPanel session={session} />;
    case 'sectionMySettlement': return <LedgerHubPanel session={session} />;
    case 'sectionWithdraw':     return <WithdrawHubPanel session={session} />;
    case 'sectionSettleMgmt':   return <SettleMgmtHubPanel session={session} />;
    case 'sectionPricing':      return <PricingHubPanel session={session} />;
    case 'sectionTelegram':     return <TelegramHubPanel session={session} />;
    case 'sectionPopups':       return <PopupsHubPanel session={session} />;
    case 'sectionDownloads':    return <DownloadsHubPanel session={session} />;
    default:                    return null;
  }
}
