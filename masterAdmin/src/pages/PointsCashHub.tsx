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

export function PointsCashHub() {
  const [tab, setTab] = useState<'policy' | 'videos'>('policy');
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [globalLimit, setGlobalLimit] = useState('');
  const [globalRate, setGlobalRate] = useState('');
  const [videos, setVideos] = useState<Vid[]>([]);
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

  useEffect(() => {
    (async () => {
      try {
        await loadPolicy();
        await loadVideos();
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
      </div>
      {err ? <p className="err">{err}</p> : null}
      {msg ? <p style={{ color: 'var(--ok)', fontSize: 14 }}>{msg}</p> : null}

      {tab === 'policy' ? (
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
