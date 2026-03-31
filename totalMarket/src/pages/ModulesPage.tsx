import { useEffect, useState } from 'react';
import { fetchPublic, getMacroOrigin } from '../api';

type Mod = {
  slug: string;
  name: string;
  description: string | null;
  admin_entry_url: string | null;
  ops_entry_url: string | null;
};

export function ModulesPage() {
  const [mods, setMods] = useState<Mod[]>([]);
  const [err, setErr] = useState('');
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

  return (
    <main className="main-max">
      <h1 className="section-title">판매 모듈 카탈로그</h1>
      <p style={{ color: 'var(--muted)', marginBottom: 20, maxWidth: 720 }}>
        masterAdmin에서 등록한 모듈입니다. 실제 관리·운영 화면은 권한이 있는 계정으로 각 진입 URL에서 열립니다. 웹
        루트: <code>{macro}</code>
      </p>
      {err ? <p className="err">{err}</p> : null}
      <div className="grid-modules">
        {mods.map((m) => (
          <article key={m.slug} className="mod-card">
            <span className="tag">{m.slug}</span>
            <h3>{m.name}</h3>
            <p>{m.description || '—'}</p>
            <p style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
              Admin: {absUrl(m.admin_entry_url) ? <a href={absUrl(m.admin_entry_url)!}>열기</a> : '—'} · Ops:{' '}
              {absUrl(m.ops_entry_url) ? <a href={absUrl(m.ops_entry_url)!}>열기</a> : '—'}
            </p>
          </article>
        ))}
      </div>
    </main>
  );
}
