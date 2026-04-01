import type { ReactNode } from 'react';
import type { AdminSession } from '../admin/types';
import { isHtsApiSession } from '../admin/htsApiClient';
import { HubPanelShell } from './HubPanelShell';

export function HubGate({ session, children }: { session: AdminSession; children: ReactNode }) {
  if (!isHtsApiSession(session)) {
    return (
      <HubPanelShell title="마켓 API 연동 필요" subtitle="운영 콘솔은 JWT + VITE_API_BASE 가 있어야 동작합니다.">
        <p className="tab-panel-muted">
          데모 로그인만 쓰는 경우 데이터가 없습니다. <code>htsdemo</code> 등 마켓 계정으로 다시 로그인하세요.
        </p>
      </HubPanelShell>
    );
  }
  return <>{children}</>;
}
