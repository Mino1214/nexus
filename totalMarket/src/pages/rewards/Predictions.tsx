import { useEffect, useState } from 'react';
import { api, marketPath } from '../../api';

export function PredictionsPage() {
  const [pred, setPred] = useState<{ message?: string; enabled?: boolean } | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let c = false;
    (async () => {
      try {
        const p = await api<{ message?: string; enabled?: boolean }>(marketPath('/user/predictions/meta'));
        if (!c) setPred(p);
      } catch (e) {
        if (!c) setErr(e instanceof Error ? e.message : '로드 실패');
      }
    })();
    return () => {
      c = true;
    };
  }, []);

  return (
    <>
      {err ? <p className="err">{err}</p> : null}
      <div className="page-card">
        <h2>예측 · 베팅 (준비 중)</h2>
        <p style={{ color: 'var(--muted)', fontSize: '0.92rem' }}>
          폴리마켓형 이벤트·스테이킹·정산 구조로 확장 예정입니다. 포인트로 참여하는 미니게임/예측 시장을 연결할 수 있습니다.
        </p>
        {pred?.message ? <p style={{ marginTop: 12 }}>{pred.message}</p> : null}
        {pred && pred.enabled === false ? (
          <p style={{ marginTop: 8, fontSize: '0.88rem', color: 'var(--muted)' }}>현재 비활성</p>
        ) : null}
      </div>
    </>
  );
}
