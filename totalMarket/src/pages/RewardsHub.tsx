import { useEffect, useState } from 'react';
import { api, marketPath, getToken, API_BASE, MARKET_PREFIX } from '../api';

export function RewardsHub() {
  const [me, setMe] = useState<{ pointsBalance: number; cashBalance: number } | null>(null);
  const [conv, setConv] = useState<{
    monthlyLimit: number;
    monthlyUsed: number;
    monthlyRemaining: number;
    convertRate: number;
    kstToday: string;
  } | null>(null);
  const [att, setAtt] = useState<{ kstDate: string; checkedToday: boolean; lastStreak: number } | null>(null);
  const [pointsIn, setPointsIn] = useState('');
  const [gameScore, setGameScore] = useState('120');
  const [pred, setPred] = useState<unknown>(null);
  const [videos, setVideos] = useState<{ id: number; status: string; title: string | null }[]>([]);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  async function refresh() {
    setErr('');
    try {
      const [m, c, a, v, p] = await Promise.all([
        api<{ pointsBalance: number; cashBalance: number }>(marketPath('/user/me')).then((x) => ({
          pointsBalance: x.pointsBalance,
          cashBalance: x.cashBalance,
        })),
        api<{
          monthlyLimit: number;
          monthlyUsed: number;
          monthlyRemaining: number;
          convertRate: number;
          kstToday: string;
        }>(marketPath('/user/points/convert-summary')),
        api<{
          kstDate: string;
          checkedToday: boolean;
          lastStreak: number;
        }>(marketPath('/user/attendance/status')),
        api<{ videos: typeof videos }>(marketPath('/user/videos')),
        api<{ message?: string; enabled?: boolean }>(marketPath('/user/predictions/meta')),
      ]);
      setMe(m);
      setConv(c);
      setAtt(a);
      setVideos(v.videos);
      setPred(p);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '로드 실패');
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function doAttendance() {
    setMsg('');
    try {
      const j = await api<{ ok: boolean; pointsEarned: number; streakCount: number; kstDate: string }>(
        marketPath('/user/attendance'),
        { method: 'POST' },
      );
      setMsg(`출석 완료 (+${j.pointsEarned}P, 연속 ${j.streakCount}일, KST ${j.kstDate})`);
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '출석 실패');
    }
  }

  async function doConvert(e: React.FormEvent) {
    e.preventDefault();
    setMsg('');
    const n = parseInt(pointsIn, 10);
    if (Number.isNaN(n) || n <= 0) return;
    try {
      const j = await api<{ cashGained: number }>(marketPath('/user/points/convert'), {
        method: 'POST',
        json: { points: n },
      });
      setMsg(`캐쉬 +${j.cashGained} 전환됨`);
      setPointsIn('');
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '전환 실패');
    }
  }

  async function doMiniGame() {
    setMsg('');
    try {
      const sc = parseInt(gameScore, 10) || 0;
      const j = await api<{ pointsEarned: number }>(marketPath('/user/mini-game/play'), {
        method: 'POST',
        json: { game_type: 'portal_spin', score: sc },
      });
      setMsg(`미니게임 +${j.pointsEarned}P`);
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '실패');
    }
  }

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
    <main className="main-max">
      <h1 className="section-title">포인트 · 캐쉬 · 리워드</h1>
      <p style={{ color: 'var(--muted)', marginBottom: 20 }}>
        한국 시간(KST) 기준 출석이며, 포인트→캐쉬 전환 한도는 <strong>매월 1일 00:00 KST</strong>에 초기화됩니다.
      </p>
      {err ? <p className="err">{err}</p> : null}
      {msg ? <p className="ok">{msg}</p> : null}

      <div className="page-card">
        <h2>잔액</h2>
        {me ? (
          <p>
            포인트 <strong>{me.pointsBalance}</strong> · 캐쉬 <strong>{me.cashBalance}</strong>
          </p>
        ) : (
          <p>불러오는 중…</p>
        )}
      </div>

      <div className="page-card">
        <h2>출석 (1일 1회 · KST 자정 기준)</h2>
        {att ? (
          <>
            <p>
              오늘(KST {att.kstDate}): {att.checkedToday ? '출석 완료' : '미출석'} · 직전 연속 {att.lastStreak}일
            </p>
            <button type="button" className="btn" disabled={att.checkedToday} onClick={doAttendance}>
              {att.checkedToday ? '오늘 출석함' : '출석 체크'}
            </button>
          </>
        ) : (
          <p>…</p>
        )}
      </div>

      <div className="page-card">
        <h2>포인트 → 캐쉬 전환</h2>
        {conv ? (
          <>
            <p style={{ fontSize: '0.9rem', color: 'var(--muted)' }}>
              월 한도 {conv.monthlyLimit.toLocaleString()}P 중 사용 {conv.monthlyUsed.toLocaleString()}P · 남음{' '}
              {conv.monthlyRemaining.toLocaleString()}P · 비율 {conv.convertRate} (포인트 1당 캐쉬)
            </p>
            <p style={{ fontSize: '0.85rem' }}>KST 오늘: {conv.kstToday}</p>
            <form onSubmit={doConvert} style={{ marginTop: 12 }}>
              <div className="field">
                <label>전환할 포인트</label>
                <input value={pointsIn} onChange={(e) => setPointsIn(e.target.value)} type="number" min={1} />
              </div>
              <button type="submit" className="btn">
                전환
              </button>
            </form>
          </>
        ) : (
          <p>…</p>
        )}
      </div>

      <div className="page-card">
        <h2>미니게임 (포인트 적립)</h2>
        <p style={{ fontSize: '0.88rem', color: 'var(--muted)' }}>점수를 넣고 플레이 기록을 남깁니다. (데모)</p>
        <div className="field">
          <label>점수</label>
          <input value={gameScore} onChange={(e) => setGameScore(e.target.value)} />
        </div>
        <button type="button" className="btn outline" onClick={doMiniGame} style={{ marginTop: 8 }}>
          플레이 기록
        </button>
      </div>

      <div className="page-card">
        <h2>예측 · 베팅 (준비 중)</h2>
        {pred && typeof pred === 'object' && pred !== null && 'message' in pred ? (
          <p style={{ color: 'var(--muted)' }}>{String((pred as { message: string }).message)}</p>
        ) : null}
      </div>

      <div className="page-card">
        <h2>동영상 업로드 (검수 후 포인트)</h2>
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
    </main>
  );
}
