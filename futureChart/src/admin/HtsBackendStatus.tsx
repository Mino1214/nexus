import { useEffect, useState } from 'react';
import { getFutureTradeAdminBase } from '../config/futureTradeAdminEnv';
import { getMarketApiBase } from '../config/marketApiEnv';

type Line = { key: string; label: string; ok: boolean | null; detail?: string };

export function HtsBackendStatus() {
  const [lines, setLines] = useState<Line[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function probe() {
      const out: Line[] = [];
      const ft = getFutureTradeAdminBase();
      if (!ft) {
        out.push({
          key: 'ft',
          label: 'FutureTrade Admin',
          ok: false,
          detail: '.env 에 VITE_FUTURE_TRADE_ADMIN_BASE 설정',
        });
      } else {
        try {
          const r = await fetch(`${ft}/health`, { credentials: 'omit' });
          const j = (await r.json().catch(() => null)) as { ok?: boolean; moduleCode?: string } | null;
          out.push({
            key: 'ft',
            label: 'FutureTrade Admin',
            ok: r.ok && j?.ok === true,
            detail: j?.moduleCode ? `module=${j.moduleCode}` : r.statusText,
          });
        } catch (e) {
          out.push({
            key: 'ft',
            label: 'FutureTrade Admin',
            ok: false,
            detail: e instanceof Error ? e.message : '연결 실패',
          });
        }
      }

      const m = getMarketApiBase();
      if (!m) {
        out.push({
          key: 'market',
          label: 'Market API',
          ok: null,
          detail: '선택 — VITE_API_BASE 또는 VITE_MARKET_API_BASE',
        });
      } else {
        try {
          const r = await fetch(`${m}/health`, { credentials: 'omit' });
          const j = (await r.json().catch(() => null)) as { ok?: boolean; service?: string } | null;
          out.push({
            key: 'market',
            label: 'Market API',
            ok: r.ok && j?.ok === true,
            detail: j?.service ? String(j.service) : undefined,
          });
        } catch (e) {
          out.push({
            key: 'market',
            label: 'Market API',
            ok: false,
            detail: e instanceof Error ? e.message : '연결 실패',
          });
        }
      }

      if (!cancelled) setLines(out);
    }
    probe();
    const t = window.setInterval(probe, 20000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, []);

  return (
    <div className="fc-admin__backendStatus" role="status">
      <div className="fc-admin__backendStatusTitle">로컬 백엔드</div>
      <ul className="fc-admin__backendStatusList">
        {lines.map((l) => (
          <li key={l.key}>
            <span
              className={`fc-admin__backendDot${l.ok === true ? ' fc-admin__backendDot--ok' : ''}${l.ok === false ? ' fc-admin__backendDot--err' : ''}${l.ok === null ? ' fc-admin__backendDot--muted' : ''}`}
              aria-hidden
            />
            <span className="fc-admin__backendLabel">{l.label}</span>
            {l.detail ? <span className="fc-admin__backendDetail">{l.detail}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
