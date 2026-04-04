import { useCallback, useEffect, useState } from 'react';
import type { AdminSession } from '../../admin/types';
import { hubGetNotifySettings, hubPutNotifySettings } from '../hubApiClient';
import { HubPanelShell } from '../HubPanelShell';
import { HubGate } from '../HubGate';

export function NotifyHubPanel({ session }: { session: AdminSession }) {
  const [bot, setBot] = useState('');
  const [dep, setDep] = useState('');
  const [signup, setSignup] = useState('');
  const [scopeKey, setScopeKey] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showToken, setShowToken] = useState(false);

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

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    setErr(null); setOk(null);
    try {
      await hubPutNotifySettings(session, { botToken: bot, chatDeposit: dep, chatSignup: signup });
      setOk('저장되었습니다.');
      setTimeout(() => setOk(null), 2500);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <HubGate session={session}>
      <HubPanelShell
        title="알림봇"
        actions={
          <button type="button" className="hub-refresh-btn" onClick={() => void load()} disabled={loading}>
            {loading ? '…' : '↻'}
          </button>
        }
      >
        {err ? <div className="hub-msg hub-msg--err">{err}<button type="button" onClick={() => setErr(null)}>×</button></div> : null}
        {ok  ? <div className="hub-msg hub-msg--ok">{ok}</div> : null}

        <div className="hub-notify-card">
          <div className="hub-notify-scope">범위: <code>{scopeKey || '—'}</code></div>

          <div className="hub-field-row">
            <label className="hub-field-label">봇 토큰</label>
            <div className="hub-field-input-wrap">
              <input
                className="hub-input hub-input--full"
                type={showToken ? 'text' : 'password'}
                value={bot}
                onChange={(e) => setBot(e.target.value)}
                placeholder="BotFather 토큰"
                autoComplete="off"
              />
              <button
                type="button"
                className="hub-btn hub-btn--sm hub-btn--ghost"
                onClick={() => setShowToken((v) => !v)}
                style={{ flexShrink: 0 }}
              >
                {showToken ? '숨기기' : '보기'}
              </button>
            </div>
          </div>

          <div className="hub-field-row">
            <label className="hub-field-label">입금 알림 Chat ID</label>
            <input
              className="hub-input hub-input--full"
              value={dep}
              onChange={(e) => setDep(e.target.value)}
              placeholder="-100xxxxxxxxxx"
            />
          </div>

          <div className="hub-field-row">
            <label className="hub-field-label">가입 알림 Chat ID</label>
            <input
              className="hub-input hub-input--full"
              value={signup}
              onChange={(e) => setSignup(e.target.value)}
              placeholder="-100xxxxxxxxxx"
            />
          </div>

          <div className="hub-notify-tip">
            <strong>Chat ID 확인 방법</strong>
            <ol>
              <li>@userinfobot 에 채널/그룹을 포워드하면 ID가 나옵니다.</li>
              <li>그룹 채팅은 대부분 <code>-100</code>으로 시작합니다.</li>
            </ol>
          </div>

          <button type="button" className="hub-btn hub-btn--primary" onClick={() => void save()}>
            저장
          </button>
        </div>
      </HubPanelShell>
    </HubGate>
  );
}
