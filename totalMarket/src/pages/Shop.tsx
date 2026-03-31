import { useEffect, useState } from 'react';
import { api, marketPath } from '../api';

type Product = {
  id: number;
  name: string;
  description: string | null;
  price_cash: number;
  price_points?: number;
  payment_mode?: string;
  stock: number;
};

export function Shop() {
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<
    { id: number; product_name: string | null; total_cash: number; total_points?: number; payment_kind?: string; status: string }[]
  >([]);
  const [cash, setCash] = useState<number | null>(null);
  const [points, setPoints] = useState<number | null>(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  async function load() {
    setErr('');
    try {
      const [p, o, m] = await Promise.all([
        api<{ products: Product[] }>(marketPath('/user/products')),
        api<{ orders: typeof orders }>(marketPath('/user/orders')),
        api<{ pointsBalance: number; cashBalance: number }>(marketPath('/user/me')),
      ]);
      setProducts(p.products);
      setOrders(o.orders);
      setCash(m.cashBalance);
      setPoints(m.pointsBalance);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '로드 실패');
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function buy(id: number, payWith: 'cash' | 'points') {
    setMsg('');
    try {
      await api(marketPath('/user/orders'), {
        method: 'POST',
        json: { product_id: id, quantity: 1, pay_with: payWith },
      });
      setMsg('구매 완료');
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '구매 실패');
    }
  }

  function modeLabel(m?: string) {
    const x = (m || 'both').trim();
    if (x === 'cash_only') return '캐쉬만';
    if (x === 'points_only') return '포인트만';
    return '캐쉬·포인트 선택';
  }

  return (
    <main className="main-max">
      <h1 className="section-title">스토어</h1>
      <p style={{ color: 'var(--muted)', marginBottom: 16 }}>
        캐쉬 <strong>{cash ?? '…'}</strong> · 포인트 <strong>{points ?? '…'}</strong>
      </p>
      {err ? <p className="err">{err}</p> : null}
      {msg ? <p className="ok">{msg}</p> : null}

      <div className="grid-modules">
        {products.map((p) => {
          const mode = (p.payment_mode || 'both').trim();
          const pp = Number(p.price_points ?? 0);
          return (
            <article key={p.id} className="mod-card">
              <h3>{p.name}</h3>
              <p style={{ fontSize: '0.88rem', color: 'var(--muted)' }}>{p.description || '—'}</p>
              <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>결제: {modeLabel(mode)}</p>
              <p>
                {mode !== 'points_only' ? (
                  <>
                    <strong>{p.price_cash.toLocaleString()}</strong> 캐쉬
                  </>
                ) : null}
                {mode === 'both' ? ' · ' : null}
                {mode !== 'cash_only' ? (
                  <>
                    <strong>{pp.toLocaleString()}</strong> P
                  </>
                ) : null}
                {p.stock >= 0 ? ` · 재고 ${p.stock}` : ''}
              </p>
              <div className="shop-actions">
                {mode !== 'points_only' ? (
                  <button type="button" className="btn" onClick={() => buy(p.id, 'cash')}>
                    캐쉬로 구매
                  </button>
                ) : null}
                {mode !== 'cash_only' ? (
                  <button type="button" className="btn outline" onClick={() => buy(p.id, 'points')}>
                    포인트로 구매
                  </button>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>

      <h2 className="section-title" style={{ marginTop: 32 }}>
        최근 주문
      </h2>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>ID</th>
              <th>상품</th>
              <th>결제</th>
              <th>금액</th>
              <th>상태</th>
            </tr>
          </thead>
          <tbody>
            {orders.slice(0, 15).map((o) => (
              <tr key={o.id}>
                <td>{o.id}</td>
                <td>{o.product_name ?? '—'}</td>
                <td>{o.payment_kind === 'points' ? '포인트' : '캐쉬'}</td>
                <td>
                  {o.payment_kind === 'points'
                    ? `${o.total_points != null ? o.total_points : '—'} P`
                    : `${o.total_cash} 캐쉬`}
                </td>
                <td>{o.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
