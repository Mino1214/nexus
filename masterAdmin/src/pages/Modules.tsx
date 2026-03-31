import { useEffect, useState } from 'react';
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
};

function assetUrl(rel: string | null | undefined): string {
  if (!rel?.trim()) return '';
  const u = rel.trim();
  if (/^https?:\/\//i.test(u)) return u;
  const base = API_BASE.replace(/\/$/, '');
  return `${base}${u.startsWith('/') ? u : `/${u}`}`;
}

export function Modules() {
  const [rows, setRows] = useState<Mod[]>([]);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [form, setForm] = useState({ slug: '', name: '', description: '', admin_entry_url: '', ops_entry_url: '' });
  const [selSlug, setSelSlug] = useState('');
  const [detail, setDetail] = useState({ detail_markdown: '', gallery_json: '' });

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
      setDetail({
        detail_markdown: m.detail_markdown || '',
        gallery_json: m.gallery_json || '',
      });
    } else {
      setDetail({ detail_markdown: '', gallery_json: '' });
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
          detail_markdown: detail.detail_markdown,
          gallery_json: detail.gallery_json.trim() || null,
        },
      });
      setMsg('상세·갤러리 JSON 저장됨');
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

  return (
    <div>
      <h1 className="page-heading">판매 모듈 카탈로그</h1>
      <p style={{ color: 'var(--text-tertiary)', fontSize: 14 }}>
        Pandora, PolyMart 등 마켓에서 파는 제품 단위입니다. 진입 주소는 <code>/admin.html</code> 처럼{' '}
        <strong>경로만</strong> 적어도 되며, 콘솔에서 <code>{getMacroOrigin()}</code> 에 붙여 엽니다. 총마켓 포털에는{' '}
        <strong>썸네일·상세·갤러리</strong>가 노출됩니다.
      </p>

      <div className="card">
        <h2>모듈 추가</h2>
        <form onSubmit={add}>
          <div className="field">
            <label>slug (영문, 예: polymart)</label>
            <input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} required />
          </div>
          <div className="field">
            <label>표시 이름</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div className="field">
            <label>설명</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="field">
            <label>관리자 경로 또는 전체 URL</label>
            <input
              value={form.admin_entry_url}
              onChange={(e) => setForm({ ...form, admin_entry_url: e.target.value })}
              placeholder="/admin.html"
            />
          </div>
          <div className="field">
            <label>운영 경로 또는 전체 URL</label>
            <input
              value={form.ops_entry_url}
              onChange={(e) => setForm({ ...form, ops_entry_url: e.target.value })}
              placeholder="/owner.html"
            />
          </div>
          {err ? <p className="err">{err}</p> : null}
          <button type="submit" className="btn">
            추가
          </button>
        </form>
      </div>

      <div className="card">
        <h2>등록 목록</h2>
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
        <h2>총마켓 포털 — 카드 썸네일 · 상세 · 갤러리</h2>
        <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 12 }}>
          갤러리는 JSON 배열입니다. 각 항목은 type: image 또는 video, url 필드를 사용합니다.
        </p>
        {msg ? <p style={{ color: 'var(--ok)', fontSize: 14 }}>{msg}</p> : null}
        <div className="field">
          <label>편집할 모듈</label>
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
                <label>카드 썸네일 이미지 업로드</label>
                <input name="thumb" type="file" accept="image/*" />
              </div>
              <button type="submit" className="btn ghost">
                썸네일 업로드
              </button>
            </form>
            <form onSubmit={savePortalContent}>
              <div className="field">
                <label>상세 설명 (여러 줄 텍스트)</label>
                <textarea
                  rows={6}
                  value={detail.detail_markdown}
                  onChange={(e) => setDetail({ ...detail, detail_markdown: e.target.value })}
                />
              </div>
              <div className="field">
                <label>갤러리 JSON</label>
                <textarea
                  rows={5}
                  value={detail.gallery_json}
                  onChange={(e) => setDetail({ ...detail, gallery_json: e.target.value })}
                  placeholder='[{"type":"image","url":"..."}]'
                />
              </div>
              <button type="submit" className="btn">
                상세·갤러리 저장
              </button>
            </form>
          </>
        ) : null}
      </div>
    </div>
  );
}
