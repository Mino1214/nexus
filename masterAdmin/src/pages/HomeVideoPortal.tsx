import { useEffect, useState } from 'react';
import { api, API_BASE, marketPath } from '../api';

type PortalVid = {
  id: number;
  title: string | null;
  file_url: string;
  thumbnail_url: string | null;
  is_featured: number;
  featured_sort: number;
  show_on_home: number;
  telegram: string | null;
};

function assetUrl(rel: string | null | undefined): string {
  if (!rel?.trim()) return '';
  const u = rel.trim();
  if (/^https?:\/\//i.test(u)) return u;
  const base = API_BASE.replace(/\/$/, '');
  return `${base}${u.startsWith('/') ? u : `/${u}`}`;
}

function PortalRow({
  v,
  onSave,
}: {
  v: PortalVid;
  onSave: (id: number, patch: Partial<{ is_featured: boolean; featured_sort: number; show_on_home: boolean }>) => void;
}) {
  const [feat, setFeat] = useState(!!v.is_featured);
  const [sort, setSort] = useState(String(v.featured_sort));
  const [home, setHome] = useState(!!v.show_on_home);

  useEffect(() => {
    setFeat(!!v.is_featured);
    setSort(String(v.featured_sort));
    setHome(!!v.show_on_home);
  }, [v.id, v.is_featured, v.featured_sort, v.show_on_home]);

  return (
    <tr>
      <td>{v.id}</td>
      <td>{v.title || '—'}</td>
      <td>
        <a href={assetUrl(v.file_url)} target="_blank" rel="noreferrer">
          재생
        </a>
      </td>
      <td>
        <input type="checkbox" checked={feat} onChange={(e) => setFeat(e.target.checked)} />
      </td>
      <td>
        <input type="number" value={sort} onChange={(e) => setSort(e.target.value)} style={{ width: 72 }} />
      </td>
      <td>
        <input type="checkbox" checked={home} onChange={(e) => setHome(e.target.checked)} />
      </td>
      <td>
        <button
          type="button"
          className="btn"
          style={{ padding: '6px 12px', fontSize: 12 }}
          onClick={() => onSave(v.id, { is_featured: feat, featured_sort: parseInt(sort, 10) || 0, show_on_home: home })}
        >
          저장
        </button>
      </td>
    </tr>
  );
}

export function HomeVideoPortal() {
  const [rows, setRows] = useState<PortalVid[]>([]);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  async function load() {
    const j = await api<{ videos: PortalVid[] }>(marketPath('/master/videos/approved-portal'));
    setRows(j.videos);
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

  async function patchPortal(
    id: number,
    patch: Partial<{ is_featured: boolean; featured_sort: number; show_on_home: boolean }>,
  ) {
    setErr('');
    setMsg('');
    try {
      await api(marketPath(`/master/videos/${id}/portal`), { method: 'PATCH', json: patch });
      setMsg(`영상 #${id} 포털 설정 저장`);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '실패');
    }
  }

  return (
    <div>
      <h1 className="page-heading">홈 영상 추천·노출</h1>
      <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 12 }}>
        추천 행은 <strong>추천만</strong> 체크 + 정렬순(낮을수록 앞). 최신 행은 승인 영상 중 홈 노출 ON인 항목입니다.
      </p>
      {err ? <p className="err">{err}</p> : null}
      {msg ? <p style={{ color: 'var(--ok)', fontSize: 14 }}>{msg}</p> : null}

      <div className="card">
        <h2 className="card-title">승인된 영상 목록</h2>
        {rows.length === 0 ? (
          <p style={{ color: 'var(--text-tertiary)' }}>승인된 영상이 없습니다.</p>
        ) : (
          <div className="tbl-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>제목</th>
                  <th>재생</th>
                  <th>추천</th>
                  <th>정렬</th>
                  <th>홈 노출</th>
                  <th>저장</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((v) => (
                  <PortalRow key={v.id} v={v} onSave={patchPortal} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        <button type="button" className="btn outline" onClick={() => load()}>
          새로고침
        </button>
      </div>
    </div>
  );
}
