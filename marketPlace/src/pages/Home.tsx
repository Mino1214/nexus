import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, marketPath, getMacroOrigin } from '../api';

type Me = {
  user: { id: string; market_status: string };
  pointsBalance: number;
  cashBalance: number;
};

export function Home() {
  const [me, setMe] = useState<Me | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let c = false;
    (async () => {
      try {
        const j = await api<Me>(marketPath('/user/me'));
        if (!c) setMe(j);
      } catch (e) {
        if (!c) setErr(e instanceof Error ? e.message : '오류');
      }
    })();
    return () => {
      c = true;
    };
  }, []);

  return (
    <div>
      <h1 className="page-heading">환영합니다</h1>
      <p style={{ color: 'var(--text-tertiary)', marginBottom: 20, fontSize: 14 }}>
        일반 회원용 마켓플레이스입니다. 포인트·캐쉬는 «내 지갑»에서 확인하세요. 구매한 모듈 관리 화면은 총마켓에서 발급된
        링크(또는 운영자 안내)를 따릅니다.
      </p>

      {err ? <p className="err">{err}</p> : null}

      {me ? (
        <div className="card">
          <h2 className="card-title">내 요약</h2>
          <div className="stats">
            <div className="stat">
              <div className="num">{me.user.id}</div>
              <div className="lbl">아이디 · {me.user.market_status}</div>
            </div>
            <div className="stat">
              <div className="num">{me.pointsBalance}</div>
              <div className="lbl">포인트</div>
            </div>
            <div className="stat">
              <div className="num">{me.cashBalance}</div>
              <div className="lbl">캐쉬</div>
            </div>
          </div>
          <Link to="/wallet" className="btn secondary" style={{ marginTop: 16, display: 'inline-block' }}>
            내 지갑 자세히
          </Link>
        </div>
      ) : !err ? (
        <p style={{ color: 'var(--text-tertiary)' }}>불러오는 중…</p>
      ) : null}

      <div className="card" style={{ marginTop: 16 }}>
        <h2 className="card-title">안내</h2>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          Pandora 웹 루트: <code>{getMacroOrigin()}</code>
          <br />
          모듈별 관리/운영 UI는 masterAdmin에서 고객에게 권한이 부여된 뒤 별도 경로로 열립니다.
        </p>
      </div>
    </div>
  );
}
