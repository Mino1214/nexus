import { useEffect, useState } from 'react';
import { api, API_BASE, marketPath } from '../api';

type Vid = {
  id: number;
  user_id: string;
  file_url: string;
  title: string | null;
  status: string;
  review_stage: string;
  points_earned: number;
};

function assetUrl(rel: string | null | undefined): string {
  if (!rel?.trim()) return '';
  const u = rel.trim();
  if (/^https?:\/\//i.test(u)) return u;
  const base = API_BASE.replace(/\/$/, '');
  return `${base}${u.startsWith('/') ? u : `/${u}`}`;
}

export function MasterVideoReview() {
  const [videos, setVideos] = useState<Vid[]>([]);
  const [vPoints, setVPoints] = useState<Record<number, string>>({});
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  async function load() {
    const j = await api<{ videos: Vid[] }>(marketPath('/master/videos'));
    setVideos(j.videos);
  }

  useEffect(() => {
    (async () => {
      try {
        await load();
      } catch (e) {
        setErr(e instanceof Error ? e.message : '로드 실패');
      }
    })();
  }, []);

  async function reviewVideo(id: number, action: 'approve' | 'reject') {
    setErr('');
    setMsg('');
    try {
      const pts = parseInt(vPoints[id] || '500', 10);
      await api(marketPath(`/master/videos/${id}/review`), {
        method: 'PATCH',
        json: action === 'approve' ? { action: 'approve', points: pts } : { action: 'reject' },
      });
      setMsg(`영상 #${id} ${action === 'approve' ? '승인' : '반려'}`);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '처리 실패');
    }
  }

  return (
    <div>
      <h1 className="page-heading">동영상 검수</h1>
      <p style={{ color: 'var(--text-tertiary)', fontSize: 14, marginBottom: 16 }}>
        유저 업로드 영상 중 <strong>대기(pending)</strong> 상태를 마스터가 직접 검수합니다.
      </p>
      {err ? <p className="err">{err}</p> : null}
      {msg ? <p style={{ color: 'var(--ok)', fontSize: 14 }}>{msg}</p> : null}

      <div className="card">
        <h2 className="card-title">대기 목록</h2>
        {videos.length === 0 ? (
          <p style={{ color: 'var(--text-tertiary)' }}>대기 중인 항목이 없습니다.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {videos.map((v) => (
              <li
                key={v.id}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  padding: 14,
                  marginBottom: 12,
                }}
              >
                <div style={{ fontWeight: 800 }}>
                  #{v.id} · {v.user_id} · {v.title || '제목 없음'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', wordBreak: 'break-all' }}>{v.file_url}</div>

                <div style={{ marginTop: 10 }}>
                  <video
                    src={assetUrl(v.file_url)}
                    controls
                    playsInline
                    preload="metadata"
                    style={{ width: '100%', maxWidth: 520, borderRadius: 10, background: '#000' }}
                  >
                    <track kind="captions" />
                  </video>
                  <div style={{ marginTop: 6, fontSize: 12 }}>
                    <a href={assetUrl(v.file_url)} target="_blank" rel="noreferrer">
                      새 탭에서 열기
                    </a>
                  </div>
                </div>

                <div className="field" style={{ marginTop: 10 }}>
                  <label>승인 시 지급 포인트</label>
                  <input
                    style={{ maxWidth: 120 }}
                    value={vPoints[v.id] ?? '500'}
                    onChange={(e) => setVPoints((s) => ({ ...s, [v.id]: e.target.value }))}
                  />
                </div>

                <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  <button type="button" className="btn" onClick={() => reviewVideo(v.id, 'approve')}>
                    승인·지급
                  </button>
                  <button type="button" className="btn ghost" onClick={() => reviewVideo(v.id, 'reject')}>
                    반려
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <button type="button" className="btn outline" onClick={() => load()}>
          새로고침
        </button>
      </div>
    </div>
  );
}
