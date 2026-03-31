import { useEffect, useState } from 'react';
import { api, assetUrl, marketPath } from '../api';

type Vid = {
  id: number;
  user_id: string;
  file_url: string;
  thumbnail_url?: string | null;
  title: string | null;
  status: string;
  review_stage: string;
  created_at?: string;
};

export function Videos() {
  const [rows, setRows] = useState<Vid[]>([]);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  async function load() {
    setErr('');
    try {
      const j = await api<{ videos: Vid[] }>(marketPath('/operator/videos'));
      // 1차 대기만 필터 (서버에서 이미 걸러도 되고, 여기서 보강)
      setRows(j.videos.filter((v) => v.status === 'pending' && v.review_stage === 'operator'));
    } catch (e) {
      setErr(e instanceof Error ? e.message : '로드 실패');
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function review(id: number, action: 'approve' | 'reject') {
    setErr('');
    setMsg('');
    try {
      await api(marketPath(`/operator/videos/${id}/review`), {
        method: 'PATCH',
        json: { action },
      });
      setMsg(`영상 #${id} ${action === 'approve' ? '마스터로 전달' : '반려'} 처리됨`);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '처리 실패');
    }
  }

  return (
    <div>
      <h1 className="page-heading">동영상 1차 검수</h1>
      <p style={{ color: 'var(--text-tertiary)', fontSize: 14, marginBottom: 16 }}>
        유저 업로드 영상 중 <strong>review_stage=operator</strong> 상태를 검수합니다. 승인 시 마스터 검수(stage=master)로 넘어갑니다.
      </p>
      {err ? <p className="err">{err}</p> : null}
      {msg ? <p style={{ color: 'var(--ok)', fontSize: 14 }}>{msg}</p> : null}

      {rows.length === 0 ? (
        <div className="card">
          <p style={{ color: 'var(--text-tertiary)' }}>현재 1차 검수 대기 영상이 없습니다.</p>
        </div>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {rows.map((v) => (
            <li
              key={v.id}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: 14,
                marginBottom: 12,
                background: 'var(--surface-2)',
              }}
            >
              <div style={{ fontWeight: 800, marginBottom: 6 }}>
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
              <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                <button type="button" className="btn" onClick={() => review(v.id, 'approve')}>
                  승인 → 마스터로 전달
                </button>
                <button type="button" className="btn ghost" onClick={() => review(v.id, 'reject')}>
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
  );
}
