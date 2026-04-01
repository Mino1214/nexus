import { useCallback, useEffect, useState } from 'react';
import type { AdminSession } from '../../admin/types';
import { hubGetNotifySettings, hubPutNotifySettings } from '../hubApiClient';
import { HubDevHint, HubPanelShell } from '../HubPanelShell';
import { HubGate } from '../HubGate';

export function NotifyHubPanel({ session }: { session: AdminSession }) {
  const [bot, setBot] = useState('');
  const [dep, setDep] = useState('');
  const [signup, setSignup] = useState('');
  const [scopeKey, setScopeKey] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const s = await hubGetNotifySettings(session);
      setBot(s.botToken);
      setDep(s.chatDeposit);
      setSignup(s.chatSignup);
      setScopeKey(s.scopeKey);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <HubGate session={session}>
      <HubPanelShell
        title="알림봇"
        subtitle="입금 알림 · 회원가입 알림 (Chat ID)"
        actions={
          <button type="button" className="btn-ghost btn-sm" onClick={() => void load()} disabled={loading}>
            다시 불러오기
          </button>
        }
      >
        {err ? <p className="hub-err">{err}</p> : null}
        {msg ? <p className="hub-ok">{msg}</p> : null}
        <p className="tab-panel-muted">저장 범위: <code>{scopeKey || '—'}</code></p>
        <div className="hub-form-grid">
          <label className="hub-field">
            <span>봇 토큰</span>
            <input type="password" value={bot} onChange={(e) => setBot(e.target.value)} placeholder="BotFather 토큰" autoComplete="off" />
          </label>
          <label className="hub-field">
            <span>입금 알림 Chat ID</span>
            <input value={dep} onChange={(e) => setDep(e.target.value)} placeholder="-100…" />
          </label>
          <label className="hub-field">
            <span>회원가입 알림 Chat ID</span>
            <input value={signup} onChange={(e) => setSignup(e.target.value)} placeholder="-100…" />
          </label>
        </div>
        <div className="hub-form-actions">
          <button
            type="button"
            className="btn-ghost btn-sm"
            onClick={async () => {
              setMsg(null);
              try {
                await hubPutNotifySettings(session, { botToken: bot, chatDeposit: dep, chatSignup: signup });
                setMsg('저장되었습니다.');
              } catch (e) {
                setErr(e instanceof Error ? e.message : String(e));
              }
            }}
          >
            저장
          </button>
        </div>
        <HubDevHint>실제 텔레그램 전송은 추후 워커에서 <code>hts_hub_notify_settings</code> 를 읽어 처리합니다.</HubDevHint>
      </HubPanelShell>
    </HubGate>
  );
}
