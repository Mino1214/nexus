import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchPublic } from '../api';
import { useAuth } from '../auth';

type Mod = {
  slug: string;
  name: string;
  description: string | null;
  sort_order: number;
};

export function Home() {
  const { authed } = useAuth();
  const [mods, setMods] = useState<Mod[]>([]);
  const [err, setErr] = useState('');

  useEffect(() => {
    let c = false;
    (async () => {
      try {
        const j = await fetchPublic<{ modules: Mod[] }>('/catalog/modules');
        if (!c) setMods(j.modules);
      } catch (e) {
        if (!c) setErr(e instanceof Error ? e.message : '모듈 목록 오류');
      }
    })();
    return () => {
      c = true;
    };
  }, []);

  const featured = mods.slice(0, 4);

  return (
    <>
      <section className="hero">
        <div className="hero-inner">
          <h1>모듈을 연결하고, 포인트로 혜택을 쌓는 총마켓</h1>
          <p>
            출석·미니게임·동영상 검수 등으로 포인트를 모으고, 월 단위 한도 내에서 캐쉬로 전환할 수 있습니다. 스토어에서
            캐쉬 상품을 구매하거나, 발급된 모듈별 URL로 이동해 운영합니다.
          </p>
          <div className="hero-actions">
            <Link to="/modules" className="btn secondary">
              모듈 둘러보기
            </Link>
            {authed ? (
              <Link to="/rewards" className="btn" style={{ background: '#fff', color: 'var(--primary)' }}>
                리워드 센터
              </Link>
            ) : (
              <Link to="/login" className="btn" style={{ background: '#fff', color: 'var(--primary)' }}>
                시작하기
              </Link>
            )}
          </div>
          <div className="trust-strip">
            <span>· 출석 1일 1회 (KST 00:00 기준)</span>
            <span>· 포인트 → 캐쉬 전환 (매월 1일 한도 리셋)</span>
            <span>· 동영상 업로드 후 운영·마스터 검수</span>
            <span>· 예측·베팅: 추후 연동 예정</span>
          </div>
        </div>
      </section>

      <main className="main-max">
        {err ? <p className="err">{err}</p> : null}
        <h2 className="section-title">대표 모듈</h2>
        <div className="grid-modules">
          {(featured.length ? featured : mods).map((m) => (
            <article key={m.slug} className="mod-card">
              <span className="tag">{m.slug}</span>
              <h3>{m.name}</h3>
              <p>{m.description || '총마켓 카탈로그에 등록된 모듈입니다.'}</p>
              <Link to="/modules">자세히 →</Link>
            </article>
          ))}
        </div>

        <h2 className="section-title" style={{ marginTop: 36 }}>
          서비스 구성
        </h2>
        <div className="feature-grid">
          <div className="feature-tile">
            <strong>출석 체크</strong>
            한국 시간 자정이 지나면 새 출석일이 됩니다. 연속 출석에 따른 보너스가 있습니다.
          </div>
          <div className="feature-tile">
            <strong>미니게임</strong>
            포인트 적립형 캐주얼 게임 (추후 폴리형 예측·스테이킹 구조로 확장 가능).
          </div>
          <div className="feature-tile">
            <strong>동영상 검수</strong>
            업로드 후 1차 운영자 검수, 2차 마스터 승인 시 포인트 지급.
          </div>
          <div className="feature-tile">
            <strong>캐쉬 스토어</strong>
            전환된 캐쉬로 디지털 상품·내부 상품을 구매합니다.
          </div>
        </div>
      </main>
    </>
  );
}
