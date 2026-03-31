import { useGameEngine } from '../../minigame/useGameEngine';
import { RouletteCanvas } from '../../minigame/RouletteCanvas';

export function MiniGamePage() {
  const { angle, balls, lastResult } = useGameEngine();

  return (
    <>
      <div className="page-card">
        <h2>미니게임 (룰렛 + 공 떨어뜨리기)</h2>
        <p style={{ fontSize: '0.88rem', color: 'var(--muted)' }}>
          룰렛은 항상 회전합니다. 5분마다 공 3개가 자동 생성되고, gravity+bounce 물리로 떨어집니다. 마지막으로 떨어진 공의 색이
          결과가 됩니다.
        </p>
      </div>
      <RouletteCanvas angle={angle} balls={balls} lastResult={lastResult} />
    </>
  );
}
