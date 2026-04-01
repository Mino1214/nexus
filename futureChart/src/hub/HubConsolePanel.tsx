import type { AdminSession } from '../admin/types';
import { PANDORA_NAV, type PandoraTabId } from '../shell/pandoraNav';
import { HubPanelShell } from './HubPanelShell';
import { ApprovalHubPanel } from './panels/ApprovalHubPanel';
import { MembersHubPanel } from './panels/MembersHubPanel';
import { NotifyHubPanel } from './panels/NotifyHubPanel';
import { LedgerHubPanel } from './panels/LedgerHubPanel';
import { WithdrawHubPanel } from './panels/WithdrawHubPanel';
import { SettleMgmtHubPanel } from './panels/SettleMgmtHubPanel';

type PanelProps = { tabId: PandoraTabId; session: AdminSession };

export function HubConsolePanel({ tabId, session }: PanelProps) {
  const label = PANDORA_NAV.find((i) => i.id === tabId)?.label ?? tabId;

  switch (tabId) {
    case 'sectionApproval':
      return <ApprovalHubPanel session={session} />;
    case 'sectionUsers':
      return <MembersHubPanel session={session} />;
    case 'sectionMyTgBot':
      return <NotifyHubPanel session={session} />;
    case 'sectionMySettlement':
      return <LedgerHubPanel session={session} />;
    case 'sectionWithdraw':
      return <WithdrawHubPanel session={session} />;
    case 'sectionSettleMgmt':
      return <SettleMgmtHubPanel session={session} />;
    case 'sectionPricing':
      return (
        <HubPanelShell title={label} subtitle="구독·상품 가격 — nexus-market-api /master 또는 별도 정책 API 연동 예정">
          <p className="tab-panel-muted">HTS 충전 승인과 별도로, 마켓 상품 가격은 master 라우트·정책 테이블과 맞춰 확장하면 됩니다.</p>
        </HubPanelShell>
      );
    case 'sectionTelegram':
      return (
        <HubPanelShell title={label} subtitle="총판 계정의 텔레그램 표시명 등">
          <p className="tab-panel-muted">회원의 텔레그램은 «회원» 탭에서 수정합니다. 총판 본인 프로필은 mu_users / 별도 화면에서 다룰 수 있습니다.</p>
        </HubPanelShell>
      );
    case 'sectionPopups':
      return (
        <HubPanelShell title={label} subtitle="포털 공지 팝업">
          <p className="tab-panel-muted"><code>GET/POST /api/market/master/portal/popup</code> 등 기존 마스터 API를 이 탭에서 감싸면 됩니다.</p>
        </HubPanelShell>
      );
    case 'sectionDownloads':
      return (
        <HubPanelShell title={label} subtitle="배포 파일">
          <p className="tab-panel-muted">파일 메타·S3 연동은 masterAdmin·스토리지 정책에 맞춰 단계적으로 추가합니다.</p>
        </HubPanelShell>
      );
    default:
      return null;
  }
}
