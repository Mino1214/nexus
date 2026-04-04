import { useCallback, useEffect, useState } from 'react';
import type { AdminSession } from '../../admin/types';
import {
  hubCreatePopup,
  hubDeletePopup,
  hubListPopups,
  hubPatchPopup,
  type HubPopupRow,
} from '../hubApiClient';
import { HubPanelShell } from '../HubPanelShell';
import { HubGate } from '../HubGate';

function fmt(dt: string | undefined) {
  if (!dt) return '—';
  return String(dt).replace('T', ' ').slice(0, 16);
}

export function PopupsHubPanel({ session }: { session: AdminSession }) {
  const isMaster = session.role === 'master';
  const [rows, setRows] = useState<HubPopupRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const flash = (msg: string) => { setOk(msg); setTimeout(() => setOk(null), 2500); };

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try { setRows(await hubListPopups(session)); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, [session]);

  useEffect(() => { void load(); }, [load]);

  const create = async () => {
    if (!title.trim()) { setErr('제목을 입력하세요.'); return; }
    try {
      await hubCreatePopup(session, { title, body, starts_at: startsAt || undefined, ends_at: endsAt || undefined });
      setTitle(''); setBody(''); setStartsAt(''); setEndsAt('');
      setShowForm(false);
      flash('공지 팝업이 등록되었습니다.');
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };

  return (
    <HubGate session={session}>
      <HubPanelShell
        title="공지팝업"
        actions={
          <>
            {isMaster ? (
              <button type="button" className="hub-btn hub-btn--primary hub-btn--sm" onClick={() => setShowForm((v) => !v)}>
                {showForm ? '취소' : '+ 새 공지'}
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

        {/* 작성 폼 */}
        {showForm && isMaster ? (
          <div className="hub-popup-form">
            <div className="hub-field-row">
              <label className="hub-field-label">제목</label>
              <input className="hub-input hub-input--full" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="공지 제목" />
            </div>
            <div className="hub-field-row">
              <label className="hub-field-label">내용</label>
              <textarea
                className="hub-input hub-input--full hub-textarea"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="공지 내용 (HTML 지원)"
                rows={4}
              />
            </div>
            <div className="hub-inline-form hub-form-compact">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span className="hub-field-label" style={{ fontSize: 11 }}>시작일 (선택)</span>
                <input className="hub-input" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span className="hub-field-label" style={{ fontSize: 11 }}>종료일 (선택)</span>
                <input className="hub-input" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
              </div>
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
            <span className="hub-empty-icon">📢</span>
            <p>등록된 공지팝업이 없습니다</p>
          </div>
        ) : (
          <div className="hub-card-list">
            {rows.map((r) => (
              <div key={r.id} className={`hub-charge-card${!r.is_active ? ' hub-charge-card--done' : ''}`}>
                <div className="hub-charge-top">
                  <span className="hub-charge-user">{r.title}</span>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span className={`hub-badge ${r.is_active ? 'hub-badge--green' : 'hub-badge--gray'}`}>
                      {r.is_active ? '활성' : '비활성'}
                    </span>
                    <span className="hub-charge-time">{fmt(r.created_at)}</span>
                  </div>
                </div>
                {r.body ? <p className="hub-charge-memo" style={{ whiteSpace: 'pre-wrap', marginTop: 2 }}>{r.body.slice(0, 120)}{r.body.length > 120 ? '…' : ''}</p> : null}
                {(r.starts_at || r.ends_at) ? (
                  <div className="hub-charge-memo">{r.starts_at ? `시작: ${fmt(r.starts_at)}` : ''}{r.starts_at && r.ends_at ? ' · ' : ''}{r.ends_at ? `종료: ${fmt(r.ends_at)}` : ''}</div>
                ) : null}
                {isMaster ? (
                  <div className="hub-charge-actions">
                    <button
                      type="button"
                      className={`hub-btn hub-btn--sm ${r.is_active ? 'hub-btn--danger' : 'hub-btn--approve'}`}
                      disabled={busy === `p-${r.id}`}
                      onClick={async () => {
                        setBusy(`p-${r.id}`);
                        try { await hubPatchPopup(session, r.id, { is_active: !r.is_active }); await load(); }
                        catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
                        finally { setBusy(null); }
                      }}
                    >
                      {r.is_active ? '비활성화' : '활성화'}
                    </button>
                    <button
                      type="button"
                      className="hub-btn hub-btn--sm hub-btn--danger"
                      disabled={busy === `p-${r.id}`}
                      onClick={async () => {
                        if (!confirm('이 공지를 삭제할까요?')) return;
                        setBusy(`p-${r.id}`);
                        try { await hubDeletePopup(session, r.id); await load(); }
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
