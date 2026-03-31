import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, getMacroOrigin, getToken, API_BASE, marketPath } from '../api';

type Mod = {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  sort_order: number;
  admin_entry_url: string | null;
  ops_entry_url: string | null;
  is_active: number;
  thumbnail_url?: string | null;
  detail_markdown?: string | null;
  gallery_json?: string | null;
  body_html?: string | null;
};

type GalleryItem = { type: string; url: string };

function assetUrl(rel: string | null | undefined): string {
  if (!rel?.trim()) return '';
  const u = rel.trim();
  if (/^https?:\/\//i.test(u)) return u;
  const base = API_BASE.replace(/\/$/, '');
  return `${base}${u.startsWith('/') ? u : `/${u}`}`;
}

function parseGallery(raw: string | null | undefined): GalleryItem[] {
  if (!raw?.trim()) return [];
  try {
    const j = JSON.parse(raw) as unknown;
    if (!Array.isArray(j)) return [];
    return j
      .filter((x) => x && typeof x === 'object' && 'url' in x)
      .map((x: { type?: string; url?: string }) => ({
        type: x.type === 'video' ? 'video' : 'image',
        url: String(x.url || ''),
      }))
      .filter((x) => x.url);
  } catch {
    return [];
  }
}

export function Modules() {
  const [rows, setRows] = useState<Mod[]>([]);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [form, setForm] = useState({ slug: '', name: '', description: '', admin_entry_url: '', ops_entry_url: '' });
  const [selSlug, setSelSlug] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [detailMd, setDetailMd] = useState('');
  const [galleryList, setGalleryList] = useState<GalleryItem[]>([]);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  async function load() {
    try {
      const j = await api<{ modules: Mod[] }>(marketPath('/master/catalog/modules'));
      setRows(j.modules);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '오류');
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const m = rows.find((r) => r.slug === selSlug);
    if (m) {
      setBodyHtml(m.body_html || '');
      setDetailMd(m.detail_markdown || '');
      setGalleryList(parseGallery(m.gallery_json));
    } else {
      setBodyHtml('');
      setDetailMd('');
      setGalleryList([]);
    }
  }, [selSlug, rows]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    try {
      await api(marketPath('/master/catalog/modules'), {
        method: 'POST',
        json: {
          slug: form.slug,
          name: form.name,
          description: form.description || null,
          admin_entry_url: form.admin_entry_url || null,
          ops_entry_url: form.ops_entry_url || null,
        },
      });
      setForm({ slug: '', name: '', description: '', admin_entry_url: '', ops_entry_url: '' });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '저장 실패');
    }
  }

  async function savePortalContent(e: React.FormEvent) {
    e.preventDefault();
    if (!selSlug) return;
    setErr('');
    setMsg('');
    try {
      await api(marketPath(`/master/catalog/modules/${selSlug}`), {
        method: 'PATCH',
        json: {
          body_html: bodyHtml || null,
          detail_markdown: detailMd || null,
          gallery_json: galleryList.length ? JSON.stringify(galleryList) : null,
        },
      });
      setMsg('상품 본문·갤러리 저장됨');
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '저장 실패');
    }
  }

  async function uploadThumbnail(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selSlug) return;
    const input = e.currentTarget.elements.namedItem('thumb') as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    setErr('');
    setMsg('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const t = getToken();
      const res = await fetch(`${API_BASE}${marketPath(`/master/catalog/modules/${selSlug}/thumbnail`)}`, {
        method: 'POST',
        headers: t ? { Authorization: `Bearer ${t}` } : {},
        body: fd,
      });
      const text = await res.text();
      const data = text ? JSON.parse(text) : {};
      if (!res.ok) throw new Error(data.error || text);
      setMsg(`썸네일 저장: ${data.thumbnail_url || 'ok'}`);
      input.value = '';
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '업로드 실패');
    }
  }

  async function postAsset(file: File): Promise<{ url: string; kind: string } | null> {
    if (!selSlug) return null;
    const fd = new FormData();
    fd.append('file', file);
    const t = getToken();
    const res = await fetch(`${API_BASE}${marketPath(`/master/catalog/modules/${selSlug}/asset`)}`, {
      method: 'POST',
      headers: t ? { Authorization: `Bearer ${t}` } : {},
      body: fd,
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : {};
    if (!res.ok) throw new Error(data.error || text);
    return { url: data.url, kind: data.kind || 'file' };
  }

  function insertIntoBody(snippet: string) {
    const el = bodyRef.current;
    if (!el) {
      setBodyHtml((h) => h + snippet);
      return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const v = bodyHtml;
    const next = v.slice(0, start) + snippet + v.slice(end);
    setBodyHtml(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + snippet.length;
      el.selectionStart = el.selectionEnd = pos;
    });
  }

  async function onBodyImagePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setErr('');
    try {
      const r = await postAsset(file);
      if (!r) return;
      const full = assetUrl(r.url);
      if (r.kind === 'video') {
        insertIntoBody(
          `<p><video src="${full}" controls playsinline style="max-width:100%;border-radius:8px"></video></p>`,
        );
      } else {
        insertIntoBody(`<p><img src="${full}" alt="" style="max-width:100%;height:auto;border-radius:8px" /></p>`);
      }
      setMsg('본문에 삽입됨');
    } catch (e) {
      setErr(e instanceof Error ? e.message : '업로드 실패');
    }
  }

  async function onGalleryFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setErr('');
    try {
      const r = await postAsset(file);
      if (!r) return;
      const full = assetUrl(r.url);
      const type = r.kind === 'video' ? 'video' : 'image';
      setGalleryList((list) => [...list, { type, url: full }]);
      setMsg('갤러리에 추가됨 (저장 버튼으로 반영)');
    } catch (e) {
      setErr(e instanceof Error ? e.message : '업로드 실패');
    }
  }

  function removeGalleryItem(i: number) {
    setGalleryList((list) => list.filter((_, idx) => idx !== i));
  }

  return (
    <div>
      <h1 className="page-heading">총마켓 상품</h1>
      <p style={{ color: 'var(--text-tertiary)', fontSize: 14 }}>
        여기서 만든 상품이 <strong>totalMarket 홈·상품 목록</strong>에 카드로 노출됩니다. 카드 요약은 아래 &quot;상품 추가&quot;의
        설명 필드, 상세 팝업은 본문 HTML·갤러리·썸네일을 사용합니다. (Pandora 등 실제 모듈 연결은 관리자/운영 URL을 넣으면 됩니다.)
      </p>
      <p style={{ color: 'var(--text-tertiary)', fontSize: 13, marginBottom: 16 }}>
        웹 루트: <code>{getMacroOrigin()}</code>
      </p>

      <div className="card">
        <h2>상품 추가</h2>
        <form onSubmit={add}>
          <div className="field">
            <label>slug (영문 id)</label>
            <input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} required />
          </div>
          <div className="field">
            <label>상품명</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div className="field">
            <label>짧은 설명 (카드에 표시)</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="field">
            <label>관리자 경로 또는 URL (선택)</label>
            <input
              value={form.admin_entry_url}
              onChange={(e) => setForm({ ...form, admin_entry_url: e.target.value })}
              placeholder="/admin.html"
            />
          </div>
          <div className="field">
            <label>운영 경로 또는 URL (선택)</label>
            <input
              value={form.ops_entry_url}
              onChange={(e) => setForm({ ...form, ops_entry_url: e.target.value })}
              placeholder="/owner.html"
            />
          </div>
          {err ? <p className="err">{err}</p> : null}
          <button type="submit" className="btn">
            상품 등록
          </button>
        </form>
      </div>

      <div className="card">
        <h2>등록된 상품</h2>
        <table>
          <thead>
            <tr>
              <th>썸네일</th>
              <th>slug</th>
              <th>이름</th>
              <th>관리자</th>
              <th>운영</th>
              <th>활성</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id}>
                <td style={{ width: 72 }}>
                  {m.thumbnail_url ? (
                    <img src={assetUrl(m.thumbnail_url)} alt="" style={{ width: 64, height: 40, objectFit: 'cover', borderRadius: 6 }} />
                  ) : (
                    '—'
                  )}
                </td>
                <td>
                  <code>{m.slug}</code>
                </td>
                <td>{m.name}</td>
                <td>
                  {m.admin_entry_url ? (
                    <Link to={`/m/${m.slug}/admin`} className="link-pill">
                      콘솔에서 열기
                    </Link>
                  ) : (
                    '—'
                  )}
                </td>
                <td>
                  {m.ops_entry_url ? (
                    <Link to={`/m/${m.slug}/ops`} className="link-pill">
                      콘솔에서 열기
                    </Link>
                  ) : (
                    '—'
                  )}
                </td>
                <td>{m.is_active ? '예' : '아니오'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>상품 편집 — 썸네일 · 본문(사진/영상) · 갤러리</h2>
        <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 12 }}>
          상품을 선택한 뒤 썸네일과 본문을 채우고 저장하세요. 본문은 HTML이며, 이미지/영상 파일을 올리면 태그가 자동으로 들어갑니다.
        </p>
        {msg ? <p style={{ color: 'var(--ok)', fontSize: 14 }}>{msg}</p> : null}
        <div className="field">
          <label>편집할 상품</label>
          <select value={selSlug} onChange={(e) => setSelSlug(e.target.value)}>
            <option value="">선택…</option>
            {rows.map((m) => (
              <option key={m.slug} value={m.slug}>
                {m.slug} — {m.name}
              </option>
            ))}
          </select>
        </div>
        {selSlug ? (
          <>
            <form onSubmit={uploadThumbnail} style={{ marginBottom: 16 }}>
              <div className="field">
                <label>카드 썸네일 (이미지 파일)</label>
                <input name="thumb" type="file" accept="image/*" />
              </div>
              <button type="submit" className="btn ghost">
                썸네일 업로드
              </button>
            </form>

            <div className="field">
              <label>본문 HTML — 삽입 도구</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                <label className="btn ghost" style={{ cursor: 'pointer', padding: '6px 12px', fontSize: 13 }}>
                  본문에 이미지/영상 파일 삽입
                  <input type="file" accept="image/*,video/*" style={{ display: 'none' }} onChange={onBodyImagePick} />
                </label>
              </div>
              <textarea
                ref={bodyRef}
                rows={14}
                value={bodyHtml}
                onChange={(e) => setBodyHtml(e.target.value)}
                placeholder="<p>...</p> 형태. 위 버튼으로 업로드한 미디어가 삽입됩니다."
                style={{ fontFamily: 'ui-monospace, monospace', fontSize: 13 }}
              />
            </div>

            <div className="field">
              <label>추가 텍스트 요약 (선택, 본문 보조)</label>
              <textarea rows={3} value={detailMd} onChange={(e) => setDetailMd(e.target.value)} />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 600, fontSize: 13 }}>하단 갤러리 (이미지·영상)</label>
              <label className="btn ghost" style={{ cursor: 'pointer', padding: '6px 12px', fontSize: 13, display: 'inline-block' }}>
                파일 추가
                <input type="file" accept="image/*,video/*" style={{ display: 'none' }} onChange={onGalleryFilePick} />
              </label>
              <ul style={{ listStyle: 'none', padding: 0, marginTop: 10 }}>
                {galleryList.map((g, i) => (
                  <li
                    key={`${g.url}-${i}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: 8,
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      marginBottom: 8,
                      fontSize: 12,
                      wordBreak: 'break-all',
                    }}
                  >
                    <span style={{ fontWeight: 700 }}>{g.type}</span>
                    <span style={{ flex: 1 }}>{g.url}</span>
                    <button type="button" className="btn ghost btn-sm" onClick={() => removeGalleryItem(i)}>
                      제거
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <form onSubmit={savePortalContent}>
              <button type="submit" className="btn">
                본문·갤러리 저장
              </button>
            </form>
          </>
        ) : null}
      </div>
    </div>
  );
}
