import { useEffect, useState } from 'react';
import { Link, useParams, Navigate } from 'react-router-dom';
import { api, getMacroOrigin, resolveModuleEntryUrl, marketPath } from '../api';

type Mod = {
  slug: string;
  name: string;
  admin_entry_url: string | null;
  ops_entry_url: string | null;
};

type View = 'admin' | 'ops';

function isView(s: string | undefined): s is View {
  return s === 'admin' || s === 'ops';
}

export function ModuleEmbed() {
  const { slug, view: viewParam } = useParams();
  const view = isView(viewParam) ? viewParam : null;
  const [mod, setMod] = useState<Mod | null | undefined>(undefined);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!slug || !view) return;
    let cancel = false;
    (async () => {
      try {
        const j = await api<{ modules: Mod[] }>(marketPath('/master/catalog/modules'));
        const m = j.modules.find((x) => x.slug === slug);
        if (!cancel) setMod(m ?? null);
      } catch (e) {
        if (!cancel) setErr(e instanceof Error ? e.message : '로드 실패');
      }
    })();
    return () => {
      cancel = true;
    };
  }, [slug, view]);

  if (!slug || !view) return <Navigate to="/modules" replace />;
  if (err) {
    return (
      <div className="embed-shell">
        <header className="embed-toolbar">
          <Link to="/modules" className="embed-back">
            ← 모듈 목록
          </Link>
        </header>
        <p className="err">{err}</p>
      </div>
    );
  }
  if (mod === undefined) {
    return (
      <div className="embed-shell embed-loading">
        <span>불러오는 중…</span>
      </div>
    );
  }
  if (!mod) {
    return (
      <div className="embed-shell">
        <header className="embed-toolbar">
          <Link to="/modules" className="embed-back">
            ← 모듈 목록
          </Link>
        </header>
        <p className="err">모듈을 찾을 수 없습니다.</p>
      </div>
    );
  }

  const rawHref = view === 'admin' ? mod.admin_entry_url : mod.ops_entry_url;
  const src = resolveModuleEntryUrl(rawHref);
  const title = view === 'admin' ? '관리자' : '운영';

  if (!src) {
    return (
      <div className="embed-shell">
        <header className="embed-toolbar">
          <Link to="/modules" className="embed-back">
            ← 모듈 목록
          </Link>
          <div className="embed-title">
            <strong>{mod.name}</strong>
            <span className="embed-meta">{title} — URL 미등록</span>
          </div>
        </header>
        <div className="embed-empty">
          <p>이 모듈에 {title} 진입 경로가 없습니다.</p>
          <p className="embed-hint">
            «판매 모듈»에서 <code>admin_entry_url</code> 또는 <code>ops_entry_url</code>을 설정하세요. 상대경로(
            <code>/admin.html</code>)만 넣어도 됩니다.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="embed-shell embed-has-frame">
      <header className="embed-toolbar">
        <Link to="/modules" className="embed-back">
          ← 모듈 목록
        </Link>
        <div className="embed-title">
          <strong>{mod.name}</strong>
          <span className="embed-meta">
            {title} · <code>{src}</code>
          </span>
        </div>
        <div className="embed-actions">
          <span className="embed-origin-hint">기준: {getMacroOrigin()}</span>
          <a className="btn secondary" href={src} target="_blank" rel="noreferrer">
            새 탭
          </a>
        </div>
      </header>
      <iframe className="embed-frame" title={`${mod.name} ${title}`} src={src} />
    </div>
  );
}
