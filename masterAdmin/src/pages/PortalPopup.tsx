import { useEffect, useState } from 'react';
import { api, API_BASE, marketPath } from '../api';

type Popup = {
  id: number;
  title: string;
  body_html: string | null;
  image_url: string | null;
  link_url: string | null;
  link_text: string | null;
  start_at: string | null;
  end_at: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
};

function assetUrl(rel: string | null | undefined): string {
  if (!rel?.trim()) return '';
  const u = rel.trim();
  if (/^https?:\/\//i.test(u)) return u;
  const base = API_BASE.replace(/\/$/, '');
  return `${base}${u.startsWith('/') ? u : `/${u}`}`;
}

export function PortalPopup() {
  const [rows, setRows] = useState<Popup[]>([]);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  const [form, setForm] = useState({
    title: '',
    body_html: '',
    image_url: '',
    link_url: '',
    link_text: '자세히',
    start_at: '',
    end_at: '',
    is_active: true,
  });

  async function load() {
    const j = await api<{ popups: Popup[] }>(marketPath('/master/portal/popup'));
    setRows(j.popups);
  }

  useEffect(() => {
    (async () => {
      try {
        await load();
      } catch (e) {
        setErr(e instanceof Error ? e.message : '로드 실패');
      }
    })();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setMsg('');
    try {
      await api(marketPath('/master/portal/popup'), {
        method: 'POST',
        json: {
          title: form.title,
          body_html: form.body_html || null,
          image_url: form.image_url || null,
          link_url: form.link_url || null,
          link_text: form.link_text || null,
          start_at: form.start_at || null,
          end_at: form.end_at || null,
          is_active: form.is_active,
        },
      });
      setMsg('팝업 생성됨');
      setForm({ title: '', body_html: '', image_url: '', link_url: '', link_text: '자세히', start_at: '', end_at: '', is_active: true });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '생성 실패');
    }
  }

  async function patch(id: number, patchObj: Record<string, unknown>) {
    setErr('');
    setMsg('');
    try {
      await api(marketPath(`/master/portal/popup/${id}`), { method: 'PATCH', json: patchObj });
      setMsg(`팝업 #${id} 저장됨`);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '저장 실패');
    }
  }

  async function remove(id: number) {
    if (!confirm(`팝업 #${id} 삭제할까요?`)) return;
    setErr('');
    setMsg('');
    try {
      await api(marketPath(`/master/portal/popup/${id}`), { method: 'DELETE' });
      setMsg(`팝업 #${id} 삭제됨`);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '삭제 실패');
    }
  }

  return (
    <div>
      <h1 className="page-heading">팝업 설정</h1>
      <p style={{ color: 'var(--text-tertiary)', fontSize: 14, marginBottom: 16 }}>
        totalMarket에서 공개 API로 팝업을 불러와 노출합니다. 유저는 <strong>하루동안 보지않기</strong>로 KST 날짜 기준 숨길 수 있습니다.
      </p>
      {err ? <p className="err">{err}</p> : null}
      {msg ? <p style={{ color: 'var(--ok)', fontSize: 14 }}>{msg}</p> : null}

      <div className="card">
        <h2 className="card-title">새 팝업</h2>
        <form onSubmit={create}>
          <div className="field">
            <label>제목</label>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          </div>
          <div className="field">
            <label>본문 HTML</label>
            <textarea rows={8} value={form.body_html} onChange={(e) => setForm({ ...form, body_html: e.target.value })} />
          </div>
          <div className="field">
            <label>이미지 URL (선택)</label>
            <input value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} placeholder="/market-static/... 또는 https://..." />
          </div>
          <div className="field">
            <label>링크 URL (선택)</label>
            <input value={form.link_url} onChange={(e) => setForm({ ...form, link_url: e.target.value })} placeholder="https://..." />
          </div>
          <div className="field">
            <label>링크 버튼 텍스트 (선택)</label>
            <input value={form.link_text} onChange={(e) => setForm({ ...form, link_text: e.target.value })} />
          </div>
          <div className="field">
            <label>시작(선택, ISO 또는 yyyy-mm-dd hh:mm:ss)</label>
            <input value={form.start_at} onChange={(e) => setForm({ ...form, start_at: e.target.value })} />
          </div>
          <div className="field">
            <label>종료(선택)</label>
            <input value={form.end_at} onChange={(e) => setForm({ ...form, end_at: e.target.value })} />
          </div>
          <div className="field">
            <label>
              <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> 활성
            </label>
          </div>
          <button type="submit" className="btn">생성</button>
        </form>
      </div>

      <div className="card">
        <h2 className="card-title">최근 팝업</h2>
        {rows.length === 0 ? (
          <p style={{ color: 'var(--text-tertiary)' }}>등록된 팝업이 없습니다.</p>
        ) : (
          <div className="tbl-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>제목</th>
                  <th>활성</th>
                  <th>시작</th>
                  <th>종료</th>
                  <th>미리보기</th>
                  <th>작업</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td>{p.id}</td>
                    <td>{p.title}</td>
                    <td>
                      <button type="button" className="btn ghost btn-sm" onClick={() => patch(p.id, { is_active: !p.is_active })}>
                        {p.is_active ? 'ON' : 'OFF'}
                      </button>
                    </td>
                    <td style={{ fontSize: 12 }}>{p.start_at ?? '—'}</td>
                    <td style={{ fontSize: 12 }}>{p.end_at ?? '—'}</td>
                    <td style={{ maxWidth: 340 }}>
                      {p.image_url ? <img src={assetUrl(p.image_url)} alt="" style={{ width: 120, borderRadius: 8 }} /> : '—'}
                    </td>
                    <td>
                      <button type="button" className="btn ghost btn-sm" onClick={() => remove(p.id)}>
                        삭제
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
