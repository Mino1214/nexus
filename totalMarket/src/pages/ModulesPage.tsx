import { useEffect, useState } from 'react';
import { fetchPublic, getMacroOrigin, assetUrl, API_BASE } from '../api';

type GalleryItem = { type?: string; url?: string };

type Mod = {
  slug: string;
  name: string;
  description: string | null;
  admin_entry_url: string | null;
  ops_entry_url: string | null;
  thumbnail_url?: string | null;
  detail_markdown?: string | null;
  gallery_json?: string | null;
  body_html?: string | null;
};

/** 상대 경로 /market-static/... 가 저장된 기존 HTML 보정 */
function rewriteHtmlUrls(html: string): string {
  const base = API_BASE.replace(/\/$/, '');
  return html.replace(
    /(\s(?:src|href|poster)=")(\/)market-static([^"]*)"/gi,
    (_, p, _slash, rest) => `${p}${base}/market-static${rest}"`,
  );
}

function parseGallery(raw: string | null | undefined): GalleryItem[] {
  if (!raw?.trim()) return [];
  try {
    const j = JSON.parse(raw) as unknown;
    if (!Array.isArray(j)) return [];
    return j.filter((x) => x && typeof x === 'object' && 'url' in x) as GalleryItem[];
  } catch {
    return [];
  }
}

export function ModulesPage() {
  const [mods, setMods] = useState<Mod[]>([]);
  const [err, setErr] = useState('');
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  const macro = getMacroOrigin();

  useEffect(() => {
    let c = false;
    (async () => {
      try {
        const j = await fetchPublic<{ modules: Mod[] }>('/catalog/modules');
        if (!c) setMods(j.modules);
      } catch (e) {
        if (!c) setErr(e instanceof Error ? e.message : '오류');
      }
    })();
    return () => {
      c = true;
    };
  }, []);

  function absUrl(h: string | null) {
    if (!h?.trim()) return null;
    if (/^https?:\/\//i.test(h)) return h;
    return `${macro}${h.startsWith('/') ? h : `/${h}`}`;
  }

  const openMod = openSlug ? mods.find((m) => m.slug === openSlug) : null;
  const gallery = openMod ? parseGallery(openMod.gallery_json) : [];

  return (
    <main className="main-max">
      <h1 className="section-title">총마켓 상품</h1>
      <p style={{ color: 'var(--muted)', marginBottom: 20, maxWidth: 720 }}>
        Master 총마켓에서 등록한 상품입니다. 카드를 누르면 본문·갤러리·연결 URL을 볼 수 있습니다. 웹 루트:{' '}
        <code>{macro}</code>
      </p>
      {err ? <p className="err">{err}</p> : null}
      <div className="grid-modules">
        {mods.map((m) => (
          <button
            type="button"
            key={m.slug}
            className="mod-card mod-card-click"
            onClick={() => setOpenSlug(m.slug)}
          >
            {m.thumbnail_url ? (
              <div className="mod-card-thumb">
                <img src={assetUrl(m.thumbnail_url)} alt="" />
              </div>
            ) : (
              <div className="mod-card-thumb mod-card-thumb-placeholder">상품</div>
            )}
            <span className="tag">{m.slug}</span>
            <h3>{m.name}</h3>
            <p>{m.description || '—'}</p>
            <span className="mod-card-hint">클릭하여 상세 보기</span>
          </button>
        ))}
      </div>

      {openMod ? (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mod-detail-title"
          onClick={() => setOpenSlug(null)}
        >
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="modal-close" onClick={() => setOpenSlug(null)} aria-label="닫기">
              ×
            </button>
            {openMod.thumbnail_url ? (
              <div className="modal-hero">
                <img src={assetUrl(openMod.thumbnail_url)} alt="" />
              </div>
            ) : null}
            <h2 id="mod-detail-title">{openMod.name}</h2>
            <p style={{ color: 'var(--muted)', marginBottom: 12 }}>{openMod.description || ''}</p>
            {openMod.body_html?.trim() ? (
              <div className="portal-body-html" dangerouslySetInnerHTML={{ __html: rewriteHtmlUrls(openMod.body_html) }} />
            ) : openMod.detail_markdown?.trim() ? (
              <div className="mod-detail-body">
                {openMod.detail_markdown.split('\n').map((line, i) => (
                  <p key={i}>{line}</p>
                ))}
              </div>
            ) : null}
            {gallery.length > 0 ? (
              <div className="mod-gallery">
                <h3 style={{ fontSize: '1rem', marginBottom: 8 }}>갤러리</h3>
                <div className="mod-gallery-grid">
                  {gallery.map((g, idx) => {
                    const u = g.url ? assetUrl(g.url) : '';
                    const t = (g.type || 'image').toLowerCase();
                    if (!u) return null;
                    if (t === 'video') {
                      return (
                        <video key={idx} className="mod-gallery-item" src={u} controls playsInline>
                          <track kind="captions" />
                        </video>
                      );
                    }
                    return <img key={idx} className="mod-gallery-item" src={u} alt="" />;
                  })}
                </div>
              </div>
            ) : null}
            <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginTop: 16 }}>
              Admin: {absUrl(openMod.admin_entry_url) ? <a href={absUrl(openMod.admin_entry_url)!}>열기</a> : '—'} · Ops:{' '}
              {absUrl(openMod.ops_entry_url) ? <a href={absUrl(openMod.ops_entry_url)!}>열기</a> : '—'}
            </p>
          </div>
        </div>
      ) : null}
    </main>
  );
}
