import { useEffect, useState } from 'react';
import { api, marketPath } from '../api';

type Product = {
  id: number;
  name: string;
  description: string | null;
  price_cash: number;
  stock: number;
};

export function Shop() {
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<{ id: number; product_name: string | null; total_cash: number; status: string }[]>(
    [],
  );
  const [cash, setCash] = useState<number | null>(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  async function load() {
    setErr('');
    try {
      const [p, o, m] = await Promise.all([
        api<{ products: Product[] }>(marketPath('/user/products')),
        api<{ orders: typeof orders }>(marketPath('/user/orders')),
        api<{ cashBalance: number }>(marketPath('/user/me')),
      ]);
      setProducts(p.products);
      setOrders(o.orders);
      setCash(m.cashBalance);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '로드 실패');
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function buy(id: number) {
    setMsg('');
    try {
      await api(marketPath('/user/orders'), {
        method: 'POST',
        json: { product_id: id, quantity: 1 },
      });
      setMsg('구매 완료');
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '구매 실패');
    }
  }

  return (
    <main className="main-max">
      <h1 className="section-title">캐쉬 스토어</h1>
      <p style={{ color: 'var(--muted)', marginBottom: 16 }}>
        캐쉬 잔액: <strong>{cash ?? '…'}</strong>
      </p>
      {err ? <p className="err">{err}</p> : null}
      {msg ? <p className="ok">{msg}</p> : null}

      <div className="grid-modules">
        {products.map((p) => (
          <article key={p.id} className="mod-card">
            <h3>{p.name}</h3>
            <p style={{ fontSize: '0.88rem', color: 'var(--muted)' }}>{p.description || '—'}</p>
            <p>
              <strong>{p.price_cash.toLocaleString()}</strong> 캐쉬
              {p.stock >= 0 ? ` · 재고 ${p.stock}` : ''}
            </p>
            <button type="button" className="btn" style={{ marginTop: 10 }} onClick={() => buy(p.id)}>
              구매
            </button>
          </article>
        ))}
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
              <th>금액</th>
              <th>상태</th>
            </tr>
          </thead>
          <tbody>
            {orders.slice(0, 15).map((o) => (
              <tr key={o.id}>
                <td>{o.id}</td>
                <td>{o.product_name ?? '—'}</td>
                <td>{o.total_cash}</td>
                <td>{o.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
