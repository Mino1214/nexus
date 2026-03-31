import { useGameController } from '../../minigame3d/GameController';
import { Minigame3DScene } from '../../minigame3d/Scene';
import { useEffect, useMemo, useState } from 'react';

type WinRow = { ts: number; cycle: number; seed: number; color: string };
const HISTORY_KEY = 'totalMarket_minigame3d_history_v1';

function loadHistory(): WinRow[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const j = JSON.parse(raw) as WinRow[];
    if (!Array.isArray(j)) return [];
    return j.filter((x) => x && typeof x.ts === 'number' && typeof x.cycle === 'number' && typeof x.seed === 'number' && typeof x.color === 'string');
  } catch {
    return [];
  }
}

export function MiniGamePage() {
  const { phase, triggerStrength, releaseOpen, specialOn, cycleSeed, cycle } = useGameController();
  const [history, setHistory] = useState<WinRow[]>(() => loadHistory());

  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 1000)));
    } catch {
      /* ignore */
    }
  }, [history]);

  const historyView = useMemo(() => history.slice(0, 1000), [history]);

  return (
    <>
      <div className="page-card">
        <h2>미니게임 (WebGL · 격리 상자 에너지 구체)</h2>
        <p style={{ fontSize: '0.88rem', color: 'var(--muted)' }}>
          어두운 공간의 반투명 격리 상자 안에서 공들이 튀다가, 특정 타이밍에 상자가 열리며 “특수 에너지 구체 3개”가 탈출하는
          전시형 데모입니다.
        </p>
        <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: 6 }}>
          루프: <strong>{cycle}</strong> · 시드: <strong>{cycleSeed}</strong>
        </p>
      </div>
      <Minigame3DScene
        phase={phase}
        triggerStrength={triggerStrength}
        releaseOpen={releaseOpen}
        specialOn={specialOn}
        cycleSeed={cycleSeed}
        onWin={(color) => {
          setHistory((prev) => {
            const row: WinRow = { ts: Date.now(), cycle, seed: cycleSeed, color };
            const next = [row, ...prev];
            return next.slice(0, 1000);
          });
        }}
      />

      <div className="page-card" style={{ marginTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
          <h3 style={{ margin: 0 }}>결과 기록</h3>
          <div style={{ color: 'var(--muted)', fontSize: 12 }}>최대 1000개 · 최신순</div>
        </div>
        <div style={{ marginTop: 10, maxHeight: 320, overflow: 'auto', border: '1px solid rgba(15,76,129,0.14)', borderRadius: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ position: 'sticky', top: 0, background: '#fff' }}>
                <th style={th}>#</th>
                <th style={th}>시간</th>
                <th style={th}>루프</th>
                <th style={th}>시드</th>
                <th style={th}>WIN</th>
              </tr>
            </thead>
            <tbody>
              {historyView.length === 0 ? (
                <tr>
                  <td style={{ ...td, padding: 14 }} colSpan={5}>
                    아직 기록이 없습니다.
                  </td>
                </tr>
              ) : (
                historyView.map((r, i) => (
                  <tr key={`${r.ts}-${i}`}>
                    <td style={td}>{i + 1}</td>
                    <td style={td}>{new Date(r.ts).toLocaleString()}</td>
                    <td style={td}>{r.cycle}</td>
                    <td style={td}>{r.seed}</td>
                    <td style={td}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 10, height: 10, borderRadius: 999, background: r.color, boxShadow: `0 0 10px ${r.color}` }} />
                        <strong>{r.color}</strong>
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" className="btn outline" onClick={() => setHistory([])}>
            기록 초기화
          </button>
        </div>
      </div>
    </>
  );
}

const th: React.CSSProperties = {
  textAlign: 'left',
  fontSize: 12,
  color: 'rgba(15,23,42,0.7)',
  padding: '10px 12px',
  borderBottom: '1px solid rgba(15,76,129,0.14)',
};

const td: React.CSSProperties = {
  padding: '10px 12px',
  borderBottom: '1px solid rgba(15,76,129,0.08)',
  fontSize: 13,
};
