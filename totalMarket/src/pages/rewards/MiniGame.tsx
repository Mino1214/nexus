import { useEffect, useState } from 'react';
import { api, marketPath } from '../../api';

export function MiniGamePage() {
  const [me, setMe] = useState<{ pointsBalance: number } | null>(null);
  const [gameScore, setGameScore] = useState('120');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  async function refresh() {
    setErr('');
    try {
      const m = await api<{ pointsBalance: number }>(marketPath('/user/me'));
      setMe({ pointsBalance: m.pointsBalance });
    } catch (e) {
      setErr(e instanceof Error ? e.message : '로드 실패');
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

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

  return (
    <>
      {err ? <p className="err">{err}</p> : null}
      {msg ? <p className="ok">{msg}</p> : null}
      <div className="page-card">
        <h2>미니게임 (포인트 적립)</h2>
        <p style={{ fontSize: '0.88rem', color: 'var(--muted)' }}>
          점수를 넣고 플레이 기록을 남깁니다. (데모 · 추후 별도 게임 UI로 교체 가능)
        </p>
        {me ? (
          <p style={{ marginBottom: 8 }}>
            현재 포인트: <strong>{me.pointsBalance.toLocaleString()}</strong>
          </p>
        ) : null}
        <div className="field">
          <label>점수</label>
          <input value={gameScore} onChange={(e) => setGameScore(e.target.value)} />
        </div>
        <button type="button" className="btn outline" onClick={doMiniGame} style={{ marginTop: 8 }}>
          플레이 기록
        </button>
      </div>
    </>
  );
}
