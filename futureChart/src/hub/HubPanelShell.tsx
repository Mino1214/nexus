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
      <div className="hub-console-card">
        <header className="hub-console-header">
          <div className="hub-console-headerText">
            <h2 className="hub-console-title">{title}</h2>
            {subtitle ? <p className="hub-console-subtitle">{subtitle}</p> : null}
          </div>
          <div className="hub-console-actions">
            {ma ? (
              <a href={ma} target="_blank" rel="noreferrer" className="hub-ext-link">
                masterAdmin ↗
              </a>
            ) : null}
            {tm ? (
              <a href={tm} target="_blank" rel="noreferrer" className="hub-ext-link">
                총마켓 ↗
              </a>
            ) : null}
            {actions}
          </div>
        </header>
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
  return <div className="hub-dev-hint">{children}</div>;
}
