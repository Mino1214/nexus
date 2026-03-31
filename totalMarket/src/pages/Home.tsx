import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchPublic, assetUrl } from '../api';
import { useAuth } from '../auth';

type Mod = {
  slug: string;
  name: string;
  description: string | null;
  sort_order: number;
  thumbnail_url?: string | null;
};

type PubVideo = {
  id: number;
  title: string | null;
  file_url: string;
  thumbnail_url: string | null;
  created_at: string;
};

export function Home() {
  const { authed } = useAuth();
  const [mods, setMods] = useState<Mod[]>([]);
  const [featured, setFeatured] = useState<PubVideo[]>([]);
  const [latest, setLatest] = useState<PubVideo[]>([]);
  const [err, setErr] = useState('');

  useEffect(() => {
    let c = false;
    (async () => {
      try {
        const [j, f, l] = await Promise.all([
          fetchPublic<{ modules: Mod[] }>('/catalog/modules'),
          fetchPublic<{ videos: PubVideo[] }>('/videos/featured'),
          fetchPublic<{ videos: PubVideo[] }>('/videos/latest'),
        ]);
        if (!c) {
          setMods(j.modules);
          setFeatured(f.videos);
          const featIds = new Set(f.videos.map((x) => x.id));
          setLatest(l.videos.filter((x) => !featIds.has(x.id)));
        }
      } catch (e) {
        if (!c) setErr(e instanceof Error ? e.message : '콘텐츠 로드 오류');
      }
    })();
    return () => {
      c = true;
    };
  }, []);

  const featuredMods = mods.slice(0, 4);

  return (
    <>
      <section className="hero">
        <div className="hero-inner">
          <h1>모듈을 연결하고, 포인트로 혜택을 쌓는 총마켓</h1>
          <p>
            출석·미니게임·동영상 검수 등으로 포인트를 모으고, 월 단위 한도 내에서 캐쉬로 전환할 수 있습니다. 스토어에서
            캐쉬·포인트로 구매하거나, Master에 등록한 총마켓 상품·연결 URL을 확인합니다.
          </p>
          <div className="hero-actions">
            <Link to="/modules" className="btn secondary">
              상품 둘러보기
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
            <span>· 스토어: 캐쉬 / 포인트 결제 (상품별)</span>
          </div>
        </div>
      </section>

      <main className="main-max">
        {err ? <p className="err">{err}</p> : null}

        <section className="home-video-section">
          <h2 className="section-title">추천 동영상</h2>
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginBottom: 12 }}>
            마스터가 추천으로 지정한 승인 영상입니다.
          </p>
          <div className="video-row">
            {featured.length === 0 ? (
              <p style={{ color: 'var(--muted)', padding: '8px 0' }}>아직 추천 영상이 없습니다.</p>
            ) : (
              featured.map((v) => (
                <div key={`f-${v.id}`} className="video-tile">
                  <div className="video-thumb-wrap">
                    {v.thumbnail_url ? (
                      <img src={assetUrl(v.thumbnail_url)} alt="" className="video-thumb" />
                    ) : (
                      <video className="video-thumb" src={assetUrl(v.file_url)} muted playsInline preload="metadata" />
                    )}
                  </div>
                  <div className="video-meta">
                    <span className="video-title">{v.title || `영상 #${v.id}`}</span>
                    <a href={assetUrl(v.file_url)} target="_blank" rel="noreferrer" className="video-open">
                      재생
                    </a>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="home-video-section" style={{ marginTop: 28 }}>
          <h2 className="section-title">최신 동영상</h2>
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginBottom: 12 }}>최근 승인·홈 노출 영상입니다.</p>
          <div className="video-row">
            {latest.length === 0 ? (
              <p style={{ color: 'var(--muted)', padding: '8px 0' }}>아직 영상이 없습니다.</p>
            ) : (
              latest.map((v) => (
                <div key={`l-${v.id}`} className="video-tile">
                  <div className="video-thumb-wrap">
                    {v.thumbnail_url ? (
                      <img src={assetUrl(v.thumbnail_url)} alt="" className="video-thumb" />
                    ) : (
                      <video className="video-thumb" src={assetUrl(v.file_url)} muted playsInline preload="metadata" />
                    )}
                  </div>
                  <div className="video-meta">
                    <span className="video-title">{v.title || `영상 #${v.id}`}</span>
                    <a href={assetUrl(v.file_url)} target="_blank" rel="noreferrer" className="video-open">
                      재생
                    </a>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <h2 className="section-title" style={{ marginTop: 36 }}>
          대표 상품
        </h2>
        <div className="grid-modules">
          {(featuredMods.length ? featuredMods : mods).map((m) => (
            <article key={m.slug} className="mod-card">
              {m.thumbnail_url ? (
                <div className="mod-card-thumb">
                  <img src={assetUrl(m.thumbnail_url)} alt="" />
                </div>
              ) : null}
              <span className="tag">{m.slug}</span>
              <h3>{m.name}</h3>
              <p>{m.description || '총마켓에 등록된 상품입니다.'}</p>
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
            업로드 후 1차 운영자 검수, 2차 마스터 승인 시 포인트 지급. 홈 추천·최신 노출은 마스터 설정.
          </div>
          <div className="feature-tile">
            <strong>캐쉬·포인트 스토어</strong>
            상품별로 캐쉬 전용, 포인트 전용, 둘 다 선택 가능 (마스터 설정).
          </div>
        </div>
      </main>
    </>
  );
}
