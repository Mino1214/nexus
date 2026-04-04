import { useCallback, useEffect, useState } from 'react';
import type { AdminSession } from '../../admin/types';
import {
  hubCreateDownload,
  hubDeleteDownload,
  hubListDownloads,
  hubPatchDownload,
  type HubDownloadRow,
} from '../hubApiClient';
import { HubPanelShell } from '../HubPanelShell';
import { HubGate } from '../HubGate';

function fmt(dt: string | undefined) {
  if (!dt) return '—';
  return String(dt).replace('T', ' ').slice(0, 16);
}

const PLATFORM_ICON: Record<string, string> = {
  android: '🤖',
  ios: '🍎',
  windows: '🖥',
  mac: '💻',
  web: '🌐',
  other: '📦',
};

export function DownloadsHubPanel({ session }: { session: AdminSession }) {
  const isMaster = session.role === 'master';
  const [rows, setRows] = useState<HubDownloadRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [version, setVersion] = useState('');
  const [platform, setPlatform] = useState('android');
  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const flash = (msg: string) => { setOk(msg); setTimeout(() => setOk(null), 2500); };

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try { setRows(await hubListDownloads(session)); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, [session]);

  useEffect(() => { void load(); }, [load]);

  const create = async () => {
    if (!name.trim() || !url.trim()) { setErr('이름과 URL을 입력하세요.'); return; }
    try {
      await hubCreateDownload(session, { name, version, platform, url, note });
      setName(''); setVersion(''); setPlatform('android'); setUrl(''); setNote('');
      setShowForm(false);
      flash('등록되었습니다.');
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };

  return (
    <HubGate session={session}>
      <HubPanelShell
        title="다운로드"
        actions={
          <>
            {isMaster ? (
              <button type="button" className="hub-btn hub-btn--primary hub-btn--sm" onClick={() => setShowForm((v) => !v)}>
                {showForm ? '취소' : '+ 파일 추가'}
              </button>
            ) : null}
            <button type="button" className="hub-refresh-btn" onClick={() => void load()} disabled={loading}>
              {loading ? '…' : '↻'}
            </button>
          </>
        }
      >
        {err ? <div className="hub-msg hub-msg--err">{err}<button type="button" onClick={() => setErr(null)}>×</button></div> : null}
        {ok  ? <div className="hub-msg hub-msg--ok">{ok}</div> : null}

        {/* 등록 폼 */}
        {showForm && isMaster ? (
          <div className="hub-popup-form">
            <div className="hub-inline-form hub-form-compact">
              <input className="hub-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="이름 (예: FX 앱 v2)" />
              <input className="hub-input hub-input--narrow" value={version} onChange={(e) => setVersion(e.target.value)} placeholder="버전 (예: 2.1.0)" />
              <select className="hub-input" value={platform} onChange={(e) => setPlatform(e.target.value)}>
                <option value="android">Android</option>
                <option value="ios">iOS</option>
                <option value="windows">Windows</option>
                <option value="mac">Mac</option>
                <option value="web">Web</option>
                <option value="other">기타</option>
              </select>
            </div>
            <div className="hub-field-row" style={{ marginTop: 8 }}>
              <label className="hub-field-label">다운로드 URL</label>
              <input className="hub-input hub-input--full" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
            </div>
            <div className="hub-field-row">
              <label className="hub-field-label">메모 (선택)</label>
              <input className="hub-input hub-input--full" value={note} onChange={(e) => setNote(e.target.value)} placeholder="변경사항 등" />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button type="button" className="hub-btn hub-btn--primary" onClick={() => void create()}>등록</button>
              <button type="button" className="hub-btn hub-btn--ghost hub-btn--sm" onClick={() => setShowForm(false)}>취소</button>
            </div>
          </div>
        ) : null}

        {/* 목록 */}
        {rows.length === 0 && !loading ? (
          <div className="hub-empty">
            <span className="hub-empty-icon">⬇️</span>
            <p>등록된 다운로드 파일이 없습니다</p>
          </div>
        ) : (
          <div className="hub-card-list">
            {rows.map((r) => (
              <div key={r.id} className={`hub-charge-card${!r.is_active ? ' hub-charge-card--done' : ''}`}>
                <div className="hub-charge-top">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 18 }}>{PLATFORM_ICON[r.platform] ?? '📦'}</span>
                    <div>
                      <span className="hub-charge-user">{r.name}</span>
                      {r.version ? <span className="hub-charge-op">· v{r.version}</span> : null}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span className={`hub-badge ${r.is_active ? 'hub-badge--green' : 'hub-badge--gray'}`}>
                      {r.is_active ? '활성' : '비활성'}
                    </span>
                    <span className="hub-charge-time">{fmt(r.created_at)}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noreferrer"
                    className="hub-download-link"
                    style={{ fontSize: 12, color: 'var(--ac)', wordBreak: 'break-all' }}
                  >
                    {r.url}
                  </a>
                </div>
                {r.note ? <p className="hub-charge-memo">{r.note}</p> : null}
                {isMaster ? (
                  <div className="hub-charge-actions">
                    <button
                      type="button"
                      className={`hub-btn hub-btn--sm ${r.is_active ? 'hub-btn--danger' : 'hub-btn--approve'}`}
                      disabled={busy === `dl-${r.id}`}
                      onClick={async () => {
                        setBusy(`dl-${r.id}`);
                        try { await hubPatchDownload(session, r.id, { is_active: !r.is_active }); await load(); }
                        catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
                        finally { setBusy(null); }
                      }}
                    >
                      {r.is_active ? '비활성화' : '활성화'}
                    </button>
                    <button
                      type="button"
                      className="hub-btn hub-btn--sm hub-btn--danger"
                      disabled={busy === `dl-${r.id}`}
                      onClick={async () => {
                        if (!confirm('이 항목을 삭제할까요?')) return;
                        setBusy(`dl-${r.id}`);
                        try { await hubDeleteDownload(session, r.id); await load(); }
                        catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
                        finally { setBusy(null); }
                      }}
                    >
                      삭제
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </HubPanelShell>
    </HubGate>
  );
}
