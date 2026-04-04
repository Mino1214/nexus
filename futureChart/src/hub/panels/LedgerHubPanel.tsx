import { useCallback, useEffect, useRef, useState } from 'react';
import type { AdminSession } from '../../admin/types';
import { hubListCashLedger, type HubCashTx } from '../hubApiClient';
import { HubPanelShell } from '../HubPanelShell';
import { HubGate } from '../HubGate';

function fmt(dt: string | undefined) {
  if (!dt) return '—';
  return String(dt).replace('T', ' ').slice(0, 16);
}

/** 거래 유형 → 한글 표시 + 배지 색 */
const TYPE_META: Record<string, { label: string; color: string }> = {
  /* 충전·출금 */
  charge:              { label: '충전',        color: 'hub-badge--green'  },
  deposit:             { label: '충전',        color: 'hub-badge--green'  },
  withdraw:            { label: '출금',        color: 'hub-badge--red'    },
  withdrawal:          { label: '출금',        color: 'hub-badge--red'    },
  /* 환전 */
  convert:             { label: '환전',        color: 'hub-badge--blue'   },
  conversion:          { label: '환전',        color: 'hub-badge--blue'   },
  /* 수수료 */
  fee:                 { label: '수수료',      color: 'hub-badge--gray'   },
  commission:          { label: '수수료',      color: 'hub-badge--gray'   },
  /* HTS 포지션 */
  hts_paper_buy:       { label: '매수',        color: 'hub-badge--green'  },
  hts_paper_sell:      { label: '매도',        color: 'hub-badge--red'    },
  hts_paper_open:      { label: '포지션 진입', color: 'hub-badge--blue'   },
  hts_paper_close:     { label: '포지션 청산', color: 'hub-badge--blue'   },
  hts_paper_pnl:       { label: '포지션 손익', color: 'hub-badge--blue'   },
  hts_paper_fee:       { label: '거래 수수료', color: 'hub-badge--gray'   },
  hts_paper_liquidate: { label: '강제 청산',   color: 'hub-badge--red'    },
  /* 일반 포지션 (paper prefix 없는 버전) */
  pnl:                 { label: '포지션 손익', color: 'hub-badge--blue'   },
  position_close:      { label: '포지션 청산', color: 'hub-badge--blue'   },
  position_open:       { label: '포지션 진입', color: 'hub-badge--blue'   },
  liquidation:         { label: '강제 청산',   color: 'hub-badge--red'    },
  trade:               { label: '거래',        color: 'hub-badge--blue'   },
  /* 정산·기타 */
  settlement:          { label: '정산',        color: 'hub-badge--green'  },
  bonus:               { label: '보너스',      color: 'hub-badge--green'  },
  refund:              { label: '환불',        color: 'hub-badge--blue'   },
  adjustment:          { label: '조정',        color: 'hub-badge--gray'   },
};

function typeMeta(t: string) {
  return TYPE_META[t.toLowerCase()] ?? { label: t, color: 'hub-badge--gray' };
}

/** 모든 유형의 필터 탭 — 실제 데이터에 있는 것만 */
const ALL_FILTER_TYPES = Object.keys(TYPE_META);

export function LedgerHubPanel({ session }: { session: AdminSession }) {
  const [rows, setRows] = useState<HubCashTx[]>([]);
  const [knownTypes, setKnownTypes] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const t = await hubListCashLedger(session, 500);
      setRows(t);
      const seen = Array.from(new Set(t.map((r) => r.type))).sort();
      setKnownTypes(seen);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => { void load(); }, [load]);

  // 필터 탭: 실제 데이터에 있는 유형만 (TYPE_META 순서 우선)
  const filterTypes = [
    ...ALL_FILTER_TYPES.filter((t) => knownTypes.includes(t)),
    ...knownTypes.filter((t) => !ALL_FILTER_TYPES.includes(t)),
  ];

  const visible = rows.filter((r) => {
    if (filter !== 'all' && r.type !== filter) return false;
    if (search.trim() && !r.user_id.toLowerCase().includes(search.trim().toLowerCase())) return false;
    return true;
  });

  const totalIn  = visible.filter((r) => Number(r.amount) > 0).reduce((s, r) => s + Number(r.amount), 0);
  const totalOut = visible.filter((r) => Number(r.amount) < 0).reduce((s, r) => s + Number(r.amount), 0);
  const net = totalIn + totalOut;

  const handleSearch = (v: string) => {
    setSearch(v);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
  };

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
            <div className="hub-stat-label">순 합계</div>
            <div className={`hub-stat-value ${net >= 0 ? 'hub-stat-value--green' : 'hub-stat-value--red'}`}>
              {net >= 0 ? '+' : ''}{net.toLocaleString()}
            </div>
          </div>
          <div className="hub-stat-card hub-stat-card--sm">
            <div className="hub-stat-label">건수</div>
            <div className="hub-stat-value">{visible.length.toLocaleString()}</div>
          </div>
        </div>

        {/* 유형 필터 탭 + 유저 검색 */}
        <div className="hub-ledger-toolbar">
          <div className="hub-tabs hub-tabs--scroll">
            <button
              type="button"
              className={`hub-tab${filter === 'all' ? ' hub-tab--active' : ''}`}
              onClick={() => setFilter('all')}
            >
              전체
            </button>
            {filterTypes.map((t) => (
              <button
                key={t}
                type="button"
                className={`hub-tab${filter === t ? ' hub-tab--active' : ''}`}
                onClick={() => setFilter(t)}
              >
                {typeMeta(t).label}
              </button>
            ))}
          </div>
          <input
            className="hub-input hub-search-input"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="유저 아이디 검색…"
          />
        </div>

        {visible.length === 0 && !loading ? (
          <div className="hub-empty">
            <span className="hub-empty-icon">📋</span>
            <p>{search ? `'${search}' 검색 결과가 없습니다` : '거래 내역이 없습니다'}</p>
          </div>
        ) : (
          <div className="hub-table-wrap">
            <table className="hub-table hub-table--ledger">
              <thead>
                <tr>
                  <th>일시</th>
                  <th>유저</th>
                  <th>총판</th>
                  <th>유형</th>
                  <th style={{ textAlign: 'right' }}>금액</th>
                  <th>설명</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => {
                  const meta = typeMeta(r.type);
                  const amt = Number(r.amount);
                  const isPos = amt >= 0;
                  const opName = r.operator_name || r.operator_login;
                  return (
                    <tr key={r.id} className="hub-table-row">
                      <td className="hub-cell-time">{fmt(r.created_at)}</td>
                      <td>
                        <span className="hub-cell-primary">{r.user_id}</span>
                      </td>
                      <td>
                        {opName ? (
                          <div>
                            <div className="hub-cell-primary" style={{ fontSize: 12 }}>{r.operator_name || '—'}</div>
                            <div className="hub-cell-sub">{r.operator_login}</div>
                          </div>
                        ) : (
                          <span className="hub-cell-sub">—</span>
                        )}
                      </td>
                      <td>
                        <span className={`hub-badge ${meta.color}`}>{meta.label}</span>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: isPos ? '#4ade80' : '#f87171', whiteSpace: 'nowrap' }}>
                        {isPos ? '+' : ''}{amt.toLocaleString()}
                      </td>
                      <td className="hub-cell-sub hub-cell-desc">{r.description || '—'}</td>
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
