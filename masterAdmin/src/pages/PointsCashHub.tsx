import { useEffect, useState } from 'react';
import { api, marketPath } from '../api';

type Policy = {
  id: number;
  operator_mu_user_id: number | null;
  monthly_limit: number;
  convert_rate: number;
};

type Vid = {
  id: number;
  user_id: string;
  file_url: string;
  title: string | null;
  status: string;
  review_stage: string;
  points_earned: number;
};

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

function PortalRow({
  v,
  onSave,
}: {
  v: PortalVid;
  onSave: (
    id: number,
    patch: Partial<{ is_featured: boolean; featured_sort: number; show_on_home: boolean }>,
  ) => void;
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
          onClick={() =>
            onSave(v.id, {
              is_featured: feat,
              featured_sort: parseInt(sort, 10) || 0,
              show_on_home: home,
            })
          }
        >
          저장
        </button>
      </td>
    </tr>
  );
}

export function PointsCashHub() {
  const [tab, setTab] = useState<'policy' | 'videos' | 'portal'>('policy');
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [globalLimit, setGlobalLimit] = useState('');
  const [globalRate, setGlobalRate] = useState('');
  const [videos, setVideos] = useState<Vid[]>([]);
  const [portalVideos, setPortalVideos] = useState<PortalVid[]>([]);
  const [vPoints, setVPoints] = useState<Record<number, string>>({});
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  async function loadPolicy() {
    const j = await api<{ policies: Policy[] }>(marketPath('/master/policy'));
    setPolicies(j.policies);
    const g = j.policies.find((p) => p.operator_mu_user_id == null);
    if (g) {
      setGlobalLimit(String(g.monthly_limit));
      setGlobalRate(String(g.convert_rate));
    }
  }

  async function loadVideos() {
    const j = await api<{ videos: Vid[] }>(marketPath('/master/videos'));
    setVideos(j.videos);
  }

  async function loadPortalVideos() {
    const j = await api<{ videos: PortalVid[] }>(marketPath('/master/videos/approved-portal'));
    setPortalVideos(j.videos);
  }

  useEffect(() => {
    (async () => {
      try {
        await loadPolicy();
        await loadVideos();
        await loadPortalVideos();
      } catch (e) {
        setErr(e instanceof Error ? e.message : '로드 실패');
      }
    })();
  }, []);

  async function saveGlobalPolicy(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setMsg('');
    try {
      await api(marketPath('/master/policy'), {
        method: 'PATCH',
        json: {
          monthly_limit: parseInt(globalLimit, 10),
          convert_rate: Number(globalRate),
        },
      });
      setMsg('전역 정책 저장됨 (월 한도는 KST 매월 1일 기준 집계와 함께 적용).');
      await loadPolicy();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '저장 실패');
    }
  }

  async function patchPortal(
    id: number,
    patch: Partial<{ is_featured: boolean; featured_sort: number; show_on_home: boolean }>,
  ) {
    setErr('');
    setMsg('');
    try {
      await api(marketPath(`/master/videos/${id}/portal`), { method: 'PATCH', json: patch });
      setMsg(`영상 #${id} 포털 설정 저장`);
      await loadPortalVideos();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '실패');
    }
  }

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
      await loadVideos();
      await loadPortalVideos();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '처리 실패');
    }
  }

  return (
    <div>
      <h1 className="page-heading">포인트 · 캐쉬 · 리워드 운영</h1>
      <p style={{ color: 'var(--text-tertiary)', fontSize: 14, marginBottom: 16 }}>
        포인트→캐쉬 전환 한도는 사용자에게{' '}
        <strong>매월 1일 00:00 KST</strong>부터 새 달 한도로 계산됩니다. 동영상은 운영자 1차 통과 후{' '}
        <strong>마스터 최종 승인</strong>에서 포인트가 지급됩니다.
      </p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        <button
          type="button"
          className={tab === 'policy' ? 'btn' : 'btn ghost'}
          style={{ padding: '8px 14px', fontSize: 13 }}
          onClick={() => setTab('policy')}
        >
          전환 정책
        </button>
        <button
          type="button"
          className={tab === 'videos' ? 'btn' : 'btn ghost'}
          style={{ padding: '8px 14px', fontSize: 13 }}
          onClick={() => setTab('videos')}
        >
          동영상 검수 (마스터)
        </button>
        <button
          type="button"
          className={tab === 'portal' ? 'btn' : 'btn ghost'}
          style={{ padding: '8px 14px', fontSize: 13 }}
          onClick={() => setTab('portal')}
        >
          홈 영상 추천·노출
        </button>
      </div>
      {err ? <p className="err">{err}</p> : null}
      {msg ? <p style={{ color: 'var(--ok)', fontSize: 14 }}>{msg}</p> : null}

      {tab === 'portal' ? (
        <div className="card">
          <h2 className="card-title">승인된 동영상 — 총마켓 홈</h2>
          <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 12 }}>
            추천 행은 <strong>추천만</strong> 체크 + 정렬순(낮을수록 앞). 최신 행은 승인 영상 전체 중 홈 노출 ON인 항목입니다.
          </p>
          {portalVideos.length === 0 ? (
            <p style={{ color: 'var(--text-tertiary)' }}>승인된 영상이 없습니다. 먼저 검수 탭에서 승인하세요.</p>
          ) : (
            <div className="tbl-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>제목</th>
                    <th>추천</th>
                    <th>정렬</th>
                    <th>홈 노출</th>
                    <th>저장</th>
                  </tr>
                </thead>
                <tbody>
                  {portalVideos.map((v) => (
                    <PortalRow key={v.id} v={v} onSave={patchPortal} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : tab === 'policy' ? (
        <div className="card">
          <h2 className="card-title">전역 전환 정책</h2>
          <form onSubmit={saveGlobalPolicy} style={{ maxWidth: 420 }}>
            <div className="field">
              <label>월 포인트 전환 한도 (정수)</label>
              <input value={globalLimit} onChange={(e) => setGlobalLimit(e.target.value)} />
            </div>
            <div className="field">
              <label>전환 비율 (포인트 1당 캐쉬)</label>
              <input value={globalRate} onChange={(e) => setGlobalRate(e.target.value)} step="0.01" />
            </div>
            <button type="submit" className="btn">
              저장
            </button>
          </form>
          <h3 style={{ marginTop: 24, fontSize: 14, color: 'var(--text-tertiary)' }}>등록된 정책 행</h3>
          <div className="tbl-wrap" style={{ marginTop: 8 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>operator_mu_user_id</th>
                  <th>월한도</th>
                  <th>비율</th>
                </tr>
              </thead>
              <tbody>
                {policies.map((p) => (
                  <tr key={p.id}>
                    <td>{p.id}</td>
                    <td>{p.operator_mu_user_id ?? '전역'}</td>
                    <td>{p.monthly_limit}</td>
                    <td>{p.convert_rate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="card">
          <h2 className="card-title">마스터 검수 대기 동영상</h2>
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
                  <div style={{ fontWeight: 700 }}>
                    #{v.id} · {v.user_id} · {v.title || '제목 없음'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)', wordBreak: 'break-all' }}>
                    {v.file_url}
                  </div>
                  <div className="field" style={{ marginTop: 10 }}>
                    <label>승인 시 지급 포인트</label>
                    <input
                      style={{ maxWidth: 120 }}
                      value={vPoints[v.id] ?? '500'}
                      onChange={(e) => setVPoints((s) => ({ ...s, [v.id]: e.target.value }))}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
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
        </div>
      )}
    </div>
  );
}
