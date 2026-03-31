import { useEffect, useState } from 'react';
import { api, marketPath, getToken, API_BASE, MARKET_PREFIX } from '../../api';

export function VideosPage() {
  const [videos, setVideos] = useState<{ id: number; status: string; title: string | null }[]>([]);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  async function refresh() {
    setErr('');
    try {
      const v = await api<{ videos: typeof videos }>(marketPath('/user/videos'));
      setVideos(v.videos);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '로드 실패');
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function uploadVideo(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg('');
    const el = e.currentTarget.elements.namedItem('file') as HTMLInputElement;
    const file = el.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    const title = (e.currentTarget.elements.namedItem('title') as HTMLInputElement)?.value?.trim();
    if (title) fd.append('title', title);
    try {
      const t = getToken();
      const res = await fetch(`${API_BASE}${MARKET_PREFIX}/user/videos`, {
        method: 'POST',
        headers: t ? { Authorization: `Bearer ${t}` } : {},
        body: fd,
      });
      const text = await res.text();
      const data = text ? JSON.parse(text) : {};
      if (!res.ok) throw new Error(data.error || text);
      setMsg('동영상 업로드됨 (검수 대기)');
      el.value = '';
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '업로드 실패');
    }
  }

  return (
    <>
      {err ? <p className="err">{err}</p> : null}
      {msg ? <p className="ok">{msg}</p> : null}
      <div className="page-card">
        <h2>동영상 업로드 (검수 후 포인트)</h2>
        <p style={{ fontSize: '0.88rem', color: 'var(--muted)', marginBottom: 12 }}>
          운영자 1차 검수 후 마스터 최종 승인 시 포인트가 지급됩니다. 승인된 영상은 홈에 추천·최신 순으로 노출될 수 있습니다.
        </p>
        <form onSubmit={uploadVideo}>
          <div className="field">
            <label>제목 (선택)</label>
            <input name="title" />
          </div>
          <div className="field">
            <label>파일</label>
            <input name="file" type="file" accept="video/*" />
          </div>
          <button type="submit" className="btn">
            업로드
          </button>
        </form>
        <h3 style={{ marginTop: 16, fontSize: '0.95rem' }}>내 영상</h3>
        <div className="table-wrap" style={{ marginTop: 8 }}>
          <table className="data">
            <thead>
              <tr>
                <th>ID</th>
                <th>제목</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {videos.map((v) => (
                <tr key={v.id}>
                  <td>{v.id}</td>
                  <td>{v.title || '—'}</td>
                  <td>{v.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <button type="button" className="btn outline" onClick={() => refresh()}>
        새로고침
      </button>
    </>
  );
}
