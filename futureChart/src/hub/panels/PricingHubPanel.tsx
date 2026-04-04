import { useCallback, useEffect, useState } from 'react';
import type { AdminSession } from '../../admin/types';
import { hubGetExchangeRate, hubGetPricingSettings, hubPutPricingSettings, type HubPricingSettings } from '../hubApiClient';
import { HubPanelShell } from '../HubPanelShell';
import { HubGate } from '../HubGate';

export function PricingHubPanel({ session }: { session: AdminSession }) {
  const isMaster = session.role === 'master';
  const [rate, setRate] = useState<number | null>(null);
  const [settings, setSettings] = useState<HubPricingSettings>({
    charge_fee_rate: 0,
    withdraw_fee_rate: 0,
    min_charge_krw: 10000,
    min_withdraw_krw: 10000,
    usdt_markup_rate: 0,
  });
  const [draft, setDraft] = useState<HubPricingSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const flash = (msg: string) => { setOk(msg); setTimeout(() => setOk(null), 2500); };

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [r, s] = await Promise.all([hubGetExchangeRate(), hubGetPricingSettings(session)]);
      setRate(r);
      setSettings(s);
      setDraft(s);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => { void load(); }, [load]);

  const d = draft ?? settings;
  const set = (key: keyof HubPricingSettings, val: string) => {
    setDraft((prev) => ({ ...(prev ?? settings), [key]: Number(val) }));
  };

  const effectiveRate = rate != null ? rate * (1 + (d.usdt_markup_rate ?? 0) / 100) : null;

  return (
    <HubGate session={session}>
      <HubPanelShell
        title="가격 설정"
        actions={
          <button type="button" className="hub-refresh-btn" onClick={() => void load()} disabled={loading}>
            {loading ? '…' : '↻'}
          </button>
        }
      >
        {err ? <div className="hub-msg hub-msg--err">{err}<button type="button" onClick={() => setErr(null)}>×</button></div> : null}
        {ok  ? <div className="hub-msg hub-msg--ok">{ok}</div> : null}

        {/* 환율 카드 */}
        <div className="hub-stat-row">
          <div className="hub-stat-card">
            <div className="hub-stat-label">현재 USD/KRW</div>
            <div className="hub-stat-value">{rate != null ? `₩${rate.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}` : '—'}</div>
          </div>
          <div className="hub-stat-card">
            <div className="hub-stat-label">마크업 적용 환율</div>
            <div className="hub-stat-value hub-stat-value--green">
              {effectiveRate != null ? `₩${effectiveRate.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}` : '—'}
            </div>
          </div>
          <div className="hub-stat-card hub-stat-card--sm">
            <div className="hub-stat-label">출처</div>
            <div className="hub-stat-value" style={{ fontSize: 12 }}>exchangerate-api</div>
          </div>
        </div>

        {isMaster ? (
          <section className="hub-section">
            <h3 className="hub-section-title">수수료 · 한도 설정</h3>
            <div className="hub-pricing-grid">
              <div className="hub-pricing-row">
                <label className="hub-pricing-label">USDT 마크업 (%)</label>
                <input className="hub-input hub-input--xs" type="number" min={0} max={20} step={0.1}
                  value={d.usdt_markup_rate} onChange={(e) => set('usdt_markup_rate', e.target.value)} />
                <span className="hub-pricing-hint">환전 시 스프레드</span>
              </div>
              <div className="hub-pricing-row">
                <label className="hub-pricing-label">충전 수수료 (%)</label>
                <input className="hub-input hub-input--xs" type="number" min={0} max={30} step={0.1}
                  value={d.charge_fee_rate} onChange={(e) => set('charge_fee_rate', e.target.value)} />
                <span className="hub-pricing-hint">승인 시 차감</span>
              </div>
              <div className="hub-pricing-row">
                <label className="hub-pricing-label">출금 수수료 (%)</label>
                <input className="hub-input hub-input--xs" type="number" min={0} max={30} step={0.1}
                  value={d.withdraw_fee_rate} onChange={(e) => set('withdraw_fee_rate', e.target.value)} />
                <span className="hub-pricing-hint">출금 신청 시</span>
              </div>
              <div className="hub-pricing-row">
                <label className="hub-pricing-label">최소 충전 (₩)</label>
                <input className="hub-input" type="number" min={0} step={1000}
                  value={d.min_charge_krw} onChange={(e) => set('min_charge_krw', e.target.value)} />
              </div>
              <div className="hub-pricing-row">
                <label className="hub-pricing-label">최소 출금 (₩)</label>
                <input className="hub-input" type="number" min={0} step={1000}
                  value={d.min_withdraw_krw} onChange={(e) => set('min_withdraw_krw', e.target.value)} />
              </div>
            </div>
            <button
              type="button"
              className="hub-btn hub-btn--primary"
              style={{ marginTop: 14 }}
              onClick={async () => {
                if (!draft) return;
                try { await hubPutPricingSettings(session, draft); flash('설정이 저장되었습니다.'); await load(); }
                catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
              }}
            >
              저장
            </button>
          </section>
        ) : (
          <div className="hub-empty hub-empty--sm">
            <p>수수료·가격 설정은 마스터만 변경할 수 있습니다.</p>
          </div>
        )}
      </HubPanelShell>
    </HubGate>
  );
}
