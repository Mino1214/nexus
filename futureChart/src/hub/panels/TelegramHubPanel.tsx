import { useCallback, useEffect, useState } from 'react';
import type { AdminSession } from '../../admin/types';
import { hubGetTelegramSettings, hubPutTelegramSettings, type HubTelegramSettings } from '../hubApiClient';
import { HubPanelShell } from '../HubPanelShell';
import { HubGate } from '../HubGate';

export function TelegramHubPanel({ session }: { session: AdminSession }) {
  const [settings, setSettings] = useState<HubTelegramSettings>({
    channel_url: '',
    support_username: '',
    announcement_chat_id: '',
    trade_alert_chat_id: '',
  });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const flash = (msg: string) => { setOk(msg); setTimeout(() => setOk(null), 2500); };

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const s = await hubGetTelegramSettings(session);
      setSettings(s);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => { void load(); }, [load]);

  const set = (key: keyof HubTelegramSettings, val: string) => {
    setSettings((prev) => ({ ...prev, [key]: val }));
  };

  return (
    <HubGate session={session}>
      <HubPanelShell
        title="텔레그램"
        actions={
          <button type="button" className="hub-refresh-btn" onClick={() => void load()} disabled={loading}>
            {loading ? '…' : '↻'}
          </button>
        }
      >
        {err ? <div className="hub-msg hub-msg--err">{err}<button type="button" onClick={() => setErr(null)}>×</button></div> : null}
        {ok  ? <div className="hub-msg hub-msg--ok">{ok}</div> : null}

        <div className="hub-notify-card">
          <p className="hub-cell-sub" style={{ marginBottom: 16 }}>
            서비스 내 텔레그램 링크·공지 채널 설정입니다.<br/>
            알림봇 토큰·Chat ID는 <strong>알림봇</strong> 탭에서 설정합니다.
          </p>

          <div className="hub-field-row">
            <label className="hub-field-label">공식 채널 URL</label>
            <input
              className="hub-input hub-input--full"
              value={settings.channel_url}
              onChange={(e) => set('channel_url', e.target.value)}
              placeholder="https://t.me/mychannel"
            />
          </div>

          <div className="hub-field-row">
            <label className="hub-field-label">고객센터 유저명</label>
            <input
              className="hub-input hub-input--full"
              value={settings.support_username}
              onChange={(e) => set('support_username', e.target.value)}
              placeholder="@support_id"
            />
          </div>

          <div className="hub-field-row">
            <label className="hub-field-label">공지 Chat ID</label>
            <input
              className="hub-input hub-input--full"
              value={settings.announcement_chat_id}
              onChange={(e) => set('announcement_chat_id', e.target.value)}
              placeholder="-100…"
            />
          </div>

          <div className="hub-field-row">
            <label className="hub-field-label">거래 알림 Chat ID</label>
            <input
              className="hub-input hub-input--full"
              value={settings.trade_alert_chat_id}
              onChange={(e) => set('trade_alert_chat_id', e.target.value)}
              placeholder="-100…"
            />
          </div>

          <button
            type="button"
            className="hub-btn hub-btn--primary"
            style={{ marginTop: 4 }}
            onClick={async () => {
              try { await hubPutTelegramSettings(session, settings); flash('저장되었습니다.'); }
              catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
            }}
          >
            저장
          </button>
        </div>
      </HubPanelShell>
    </HubGate>
  );
}
