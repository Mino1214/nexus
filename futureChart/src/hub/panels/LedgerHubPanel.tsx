import { useCallback, useEffect, useState } from 'react';
import type { AdminSession } from '../../admin/types';
import { hubListCashLedger, type HubCashTx } from '../hubApiClient';
import { HubPanelShell } from '../HubPanelShell';
import { HubGate } from '../HubGate';

function fmt(dt: string | undefined) {
  if (!dt) return '—';
  return String(dt).replace('T', ' ').slice(0, 16);
}

const TYPE_LABEL: Record<string, { label: string; color: string }> = {
  charge:    { label: '충전',   color: 'hub-badge--green' },
  withdraw:  { label: '출금',   color: 'hub-badge--red'   },
  convert:   { label: '전환',   color: 'hub-badge--blue'  },
  fee:       { label: '수수료', color: 'hub-badge--gray'  },
  pnl:       { label: 'P&L',   color: 'hub-badge--blue'  },
};

export function LedgerHubPanel({ session }: { session: AdminSession }) {
  const [rows, setRows] = useState<HubCashTx[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<string>('all');

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const t = await hubListCashLedger(session, 300);
      setRows(t);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => { void load(); }, [load]);

  const types = ['all', ...Array.from(new Set(rows.map((r) => r.type))).sort()];
  const visible = filter === 'all' ? rows : rows.filter((r) => r.type === filter);

  const totalIn  = visible.filter((r) => Number(r.amount) > 0).reduce((s, r) => s + Number(r.amount), 0);
  const totalOut = visible.filter((r) => Number(r.amount) < 0).reduce((s, r) => s + Number(r.amount), 0);

  return (
    <HubGate session={session}>
      <HubPanelShell
        title="정산내역"
        actions={
          <button type="button" className="hub-refresh-btn" onClick={() => void load()} disabled={loading}>
            {loading ? '…' : '↻ 새로고침'}
          </button>
        }
      >
        {err ? <div className="hub-msg hub-msg--err">{err}<button type="button" onClick={() => setErr(null)}>×</button></div> : null}

        {/* 요약 카드 */}
        <div className="hub-stat-row">
          <div className="hub-stat-card">
            <div className="hub-stat-label">입금 합계</div>
            <div className="hub-stat-value hub-stat-value--green">+{totalIn.toLocaleString()}</div>
          </div>
          <div className="hub-stat-card">
            <div className="hub-stat-label">출금 합계</div>
            <div className="hub-stat-value hub-stat-value--red">{totalOut.toLocaleString()}</div>
          </div>
          <div className="hub-stat-card">
            <div className="hub-stat-label">건수</div>
            <div className="hub-stat-value">{visible.length.toLocaleString()}</div>
          </div>
        </div>

        {/* 유형 필터 탭 */}
        <div className="hub-tabs" style={{ marginBottom: 12 }}>
          {types.map((t) => (
            <button
              key={t}
              type="button"
              className={`hub-tab${filter === t ? ' hub-tab--active' : ''}`}
              onClick={() => setFilter(t)}
            >
              {t === 'all' ? '전체' : (TYPE_LABEL[t]?.label ?? t)}
            </button>
          ))}
        </div>

        {visible.length === 0 && !loading ? (
          <div className="hub-empty">
            <span className="hub-empty-icon">📋</span>
            <p>거래 내역이 없습니다</p>
          </div>
        ) : (
          <div className="hub-table-wrap">
            <table className="hub-table">
              <thead>
                <tr>
                  <th>일시</th>
                  <th>유저</th>
                  <th>유형</th>
                  <th>금액</th>
                  <th>설명</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => {
                  const tInfo = TYPE_LABEL[r.type];
                  const isPos = Number(r.amount) >= 0;
                  return (
                    <tr key={r.id}>
                      <td className="hub-cell-sub">{fmt(r.created_at)}</td>
                      <td className="hub-cell-primary">{r.user_id}</td>
                      <td>
                        <span className={`hub-badge ${tInfo?.color ?? 'hub-badge--gray'}`}>
                          {tInfo?.label ?? r.type}
                        </span>
                      </td>
                      <td style={{ fontWeight: 600, color: isPos ? '#4ade80' : '#f87171' }}>
                        {isPos ? '+' : ''}{Number(r.amount).toLocaleString()}
                      </td>
                      <td className="hub-cell-sub">{r.description || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </HubPanelShell>
    </HubGate>
  );
}
