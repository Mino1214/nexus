import type { ReactNode } from 'react';
import { getMasterAdminPublicUrl, getTotalMarketPublicUrl } from '../config/hubUrls';

type Props = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
};

export function HubPanelShell({ title, subtitle, actions, children }: Props) {
  const ma = getMasterAdminPublicUrl();
  const tm = getTotalMarketPublicUrl();

  return (
    <div className="hub-console-root">
      <div className="glass-card hub-console-card">
        <header className="hub-console-header">
          <div className="hub-console-headerText">
            <h2 className="tab-panel-title hub-console-title">{title}</h2>
            {subtitle ? <p className="tab-panel-muted hub-console-subtitle">{subtitle}</p> : null}
          </div>
          {actions ? <div className="hub-console-actions">{actions}</div> : null}
        </header>
        <p className="hub-console-scope tab-panel-muted">
          이 화면은 <strong>FutureChart 운영 콘솔</strong> 네이티브 UI입니다. API는 <code>nexus-market-api</code>·
          masterAdmin 정책에 맞춰 여기서만 연동합니다 (iframe·레거시 HTML 래핑 없음).
        </p>
        {ma || tm ? (
          <div className="hub-console-external">
            {ma ? (
              <a href={ma} target="_blank" rel="noreferrer" className="btn-ghost btn-sm">
                masterAdmin
              </a>
            ) : null}
            {tm ? (
              <a href={tm} target="_blank" rel="noreferrer" className="btn-ghost btn-sm">
                총마켓
              </a>
            ) : null}
          </div>
        ) : null}
        <div className="hub-console-body">{children}</div>
      </div>
    </div>
  );
}

export function HubTablePlaceholder({ cols, emptyText }: { cols: string[]; emptyText: string }) {
  return (
    <div className="hub-table-wrap">
      <table className="hub-table">
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colSpan={cols.length} className="hub-table-empty">
              {emptyText}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function HubDevHint({ children }: { children: ReactNode }) {
  return <div className="hub-dev-hint tab-panel-muted">{children}</div>;
}
