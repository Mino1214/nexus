import { useEffect, useState } from 'react';
import { api, marketPath } from '../api';

type Product = {
  id: number;
  name: string;
  description: string | null;
  price_cash: number;
  price_points: number;
  payment_mode: string;
  stock: number;
  is_visible: number;
};

export function StoreProducts() {
  const [rows, setRows] = useState<Product[]>([]);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [form, setForm] = useState({
    name: '',
    description: '',
    price_cash: '0',
    price_points: '0',
    payment_mode: 'both' as 'cash_only' | 'points_only' | 'both',
    stock: '-1',
  });

  async function load() {
    try {
      const j = await api<{ products: Product[] }>(marketPath('/master/products'));
      setRows(j.products);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '오류');
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function addProduct(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setMsg('');
    try {
      await api(marketPath('/master/products'), {
        method: 'POST',
        json: {
          name: form.name,
          description: form.description || null,
          price_cash: parseInt(form.price_cash, 10),
          price_points: parseInt(form.price_points, 10),
          payment_mode: form.payment_mode,
          stock: parseInt(form.stock, 10),
        },
      });
      setMsg('상품이 추가되었습니다.');
      setForm({ name: '', description: '', price_cash: '0', price_points: '0', payment_mode: 'both', stock: '-1' });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '실패');
    }
  }

  async function patchProduct(id: number, patch: Record<string, unknown>) {
    setErr('');
    setMsg('');
    try {
      await api(marketPath(`/master/products/${id}`), { method: 'PATCH', json: patch });
      setMsg(`상품 #${id} 저장됨`);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '실패');
    }
  }

  return (
    <div>
      <h1 className="page-heading">스토어 상품 · 결제 방식</h1>
      <p style={{ color: 'var(--text-tertiary)', fontSize: 14, marginBottom: 16 }}>
        <strong>캐쉬만</strong> / <strong>포인트만</strong> / <strong>둘 다</strong>를 상품별로 선택합니다. 둘 다일 때 유저는 스토어에서 결제 수단을 고릅니다.
      </p>
      {err ? <p className="err">{err}</p> : null}
      {msg ? <p style={{ color: 'var(--ok)', fontSize: 14 }}>{msg}</p> : null}

      <div className="card">
        <h2 className="card-title">상품 추가</h2>
        <form onSubmit={addProduct}>
          <div className="field">
            <label>이름</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div className="field">
            <label>설명</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="field">
            <label>캐쉬 가격</label>
            <input value={form.price_cash} onChange={(e) => setForm({ ...form, price_cash: e.target.value })} type="number" min={0} />
          </div>
          <div className="field">
            <label>포인트 가격</label>
            <input value={form.price_points} onChange={(e) => setForm({ ...form, price_points: e.target.value })} type="number" min={0} />
          </div>
          <div className="field">
            <label>결제 방식</label>
            <select
              value={form.payment_mode}
              onChange={(e) => setForm({ ...form, payment_mode: e.target.value as typeof form.payment_mode })}
            >
              <option value="both">캐쉬·포인트 둘 다</option>
              <option value="cash_only">캐쉬만</option>
              <option value="points_only">포인트만</option>
            </select>
          </div>
          <div className="field">
            <label>재고 (-1 무제한)</label>
            <input value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} type="number" />
          </div>
          <button type="submit" className="btn">
            추가
          </button>
        </form>
      </div>

      <div className="card">
        <h2 className="card-title">등록 목록</h2>
        <div className="tbl-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>이름</th>
                <th>캐쉬</th>
                <th>포인트</th>
                <th>결제</th>
                <th>노출</th>
                <th>빠른 변경</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td>{p.id}</td>
                  <td>{p.name}</td>
                  <td>{p.price_cash}</td>
                  <td>{p.price_points ?? 0}</td>
                  <td>
                    <select
                      defaultValue={p.payment_mode || 'both'}
                      onChange={(e) => patchProduct(p.id, { payment_mode: e.target.value })}
                    >
                      <option value="both">둘 다</option>
                      <option value="cash_only">캐쉬만</option>
                      <option value="points_only">포인트만</option>
                    </select>
                  </td>
                  <td>{p.is_visible ? '예' : '아니오'}</td>
                  <td>
                    <button type="button" className="btn ghost btn-sm" onClick={() => patchProduct(p.id, { is_visible: p.is_visible ? 0 : 1 })}>
                      {p.is_visible ? '숨김' : '노출'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
